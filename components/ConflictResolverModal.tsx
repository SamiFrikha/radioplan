
import React, { useState, useEffect, useMemo, useContext } from 'react';
import { Conflict, Doctor, ScheduleSlot, ReplacementSuggestion, SlotType, RcpAttendance } from '../types';
import { getAvailableDoctors, getAlgorithmicReplacementSuggestion, findConflictingSlot, getDoctorWorkRate } from '../services/scheduleService';
import { X, UserCheck, AlertTriangle, User, Lightbulb, Ban, RefreshCw, Lock, ArrowRight, Activity, Calendar, ShieldAlert, UserX, UserPlus, Send } from 'lucide-react';
import { AppContext } from '../App';
import { useAuth } from '../context/AuthContext';
import { Button } from '../src/components/ui/Button';
import { supabase } from '../services/supabaseClient';
import { sendReplacementRequest } from '../services/replacementService';
import { createNotification } from '../services/notificationService';

interface Props {
    slot: ScheduleSlot;
    conflict?: Conflict;
    doctors: Doctor[];
    slots: ScheduleSlot[];
    unavailabilities: any[];
    onClose: () => void;
    onResolve: (slotId: string, newDoctorId: string) => void;
    onCloseSlot: (slotId: string) => void;
}

const ConflictResolverModal: React.FC<Props> = ({ slot, conflict, doctors, slots, unavailabilities, onClose, onResolve, onCloseSlot }) => {
    const { effectiveHistory, activityDefinitions, rcpAttendance, setRcpAttendance, rcpTypes, template } = useContext(AppContext);
    const { profile, isAdmin, isDoctor } = useAuth();
    const [loading, setLoading] = useState(false);
    const [requestSent, setRequestSent] = useState(false);
    const [sendingRequestTo, setSendingRequestTo] = useState<string | null>(null);
    const [suggestions, setSuggestions] = useState<ReplacementSuggestion[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [manualDoctorId, setManualDoctorId] = useState<string>("");
    // RCP-specific mode: which of the 3 options is the user choosing?
    const [rcpMode, setRcpMode] = useState<'CHOICE' | 'REQUEST' | 'DIRECT' | null>(null);
    const [rcpDirectDoctorId, setRcpDirectDoctorId] = useState<string>("");
    const [rcpActionLoading, setRcpActionLoading] = useState(false);
    // Consultation conflict mode — mirrors rcpMode for the 3-card layout
    const [consultMode, setConsultMode] = useState<'CHOICE' | 'REQUEST' | 'DIRECT' | null>(null);

    // Is this an RCP slot? (show 3-card layout regardless of whether there's a conflict)
    const isRcpConflict = slot.type === SlotType.RCP;
    // Is this a consultation slot? (show 3-card layout regardless of whether there's a conflict)
    const isSimpleConsultConflict = slot.type === SlotType.CONSULTATION && conflict?.type !== 'DOUBLE_BOOKING';

    // Compute referent doctor IDs from the template slot (the source of truth for who should attend this RCP)
    const referentDoctorIds = useMemo(() => {
        if (slot.type !== SlotType.RCP) return new Set<string>();
        // Find the matching template slot by location + day (for recurring RCPs)
        const templateSlot = template.find(t =>
            t.type === SlotType.RCP &&
            t.location === slot.location &&
            t.day === slot.day
        );
        if (templateSlot) {
            return new Set<string>([
                ...(templateSlot.doctorIds || []),
                ...(templateSlot.secondaryDoctorIds || []),
                ...(templateSlot.defaultDoctorId ? [templateSlot.defaultDoctorId] : []),
                ...(templateSlot.backupDoctorId ? [templateSlot.backupDoctorId] : []),
            ].filter(Boolean));
        }
        // Fallback for MANUAL RCP instances: use the slot's own assigned doctors
        return new Set<string>([
            ...(slot.assignedDoctorId ? [slot.assignedDoctorId] : []),
            ...(slot.secondaryDoctorIds || []),
            ...(slot.backupDoctorId ? [slot.backupDoctorId] : []),
        ].filter(Boolean));
    }, [slot, template]);

    // Compute available doctor IDs for this slot's date/period (to show availability badge)
    const availableDoctorIds = useMemo(() => {
        if (!slot.date) return new Set<string>();
        const avail = getAvailableDoctors(doctors, slots, unavailabilities, slot.day, slot.period, slot.date, slot.type);
        return new Set(avail.map(d => d.id));
    }, [doctors, slots, unavailabilities, slot]);

    // Double Booking Logic
    const assignedDoctor = doctors.find(d => d.id === slot.assignedDoctorId);

    // Get current user's doctor ID
    const currentDoctorId = profile?.doctor_id;

    // Check if this conflict concerns the current user (doctor)
    const concernsCurrentDoctor = currentDoctorId && (
        slot.assignedDoctorId === currentDoctorId ||
        (slot.secondaryDoctorIds && slot.secondaryDoctorIds.includes(currentDoctorId)) ||
        (conflict && conflict.doctorId === currentDoctorId) ||
        (slot.type === SlotType.RCP && referentDoctorIds.has(currentDoctorId))
    );

    // Admin can always resolve, doctors can only resolve if it concerns them
    const canResolve = isAdmin || (isDoctor && concernsCurrentDoctor);
    const otherSlot = useMemo(() => {
        if (conflict?.type === 'DOUBLE_BOOKING' && assignedDoctor) {
            return findConflictingSlot(slot, slots, assignedDoctor.id);
        }
        return undefined;
    }, [conflict, slot, slots, assignedDoctor]);

    // Resolution State for Double Booking
    // 'KEEP_CURRENT' means keep doctor in current 'slot', replace in 'otherSlot'
    // 'KEEP_OTHER' means keep doctor in 'otherSlot', replace in 'current slot'
    // 'REPLACE_CURRENT' means we are just replacing the doctor in 'current slot' (default for simple conflicts)
    const [resolutionStrategy, setResolutionStrategy] = useState<'REPLACE_CURRENT' | 'KEEP_CURRENT' | 'KEEP_OTHER' | null>(null);
    const [targetSlotForReplacement, setTargetSlotForReplacement] = useState<ScheduleSlot | null>(null);

    useEffect(() => {
        // Initialize Strategy
        if (conflict?.type === 'DOUBLE_BOOKING' && otherSlot) {
            setResolutionStrategy(null); // Waiting for user choice
            setTargetSlotForReplacement(null);
        } else {
            setResolutionStrategy('REPLACE_CURRENT');
            setTargetSlotForReplacement(slot);
        }
    }, [conflict, otherSlot, slot]);

    // Trigger Suggestion Calculation when target slot changes
    useEffect(() => {
        if (!targetSlotForReplacement || !assignedDoctor) return;

        const fetchSuggestions = async () => {
            setLoading(true);
            setError(null);
            setSuggestions([]);

            try {
                const availableDocs = getAvailableDoctors(doctors, slots, unavailabilities, targetSlotForReplacement.day, targetSlotForReplacement.period, targetSlotForReplacement.date);

                // We need to exclude the currently assigned doctor (who is causing the conflict) from suggestions for this slot
                const filteredDocs = availableDocs.filter(d => d.id !== assignedDoctor.id);

                if (filteredDocs.length === 0) {
                    setError("Aucun autre médecin disponible sur ce créneau.");
                } else {
                    const smartSuggestions = getAlgorithmicReplacementSuggestion(targetSlotForReplacement, assignedDoctor, filteredDocs, slots, effectiveHistory, activityDefinitions);
                    setSuggestions(smartSuggestions);
                }
            } catch (err) {
                setError("Erreur lors du calcul des suggestions.");
            } finally {
                setLoading(false);
            }
        };

        fetchSuggestions();
    }, [targetSlotForReplacement, assignedDoctor, doctors, slots, unavailabilities, effectiveHistory]);

    // --- HANDLERS ---

    const handleKeepInSlot = (slotToKeep: ScheduleSlot, slotToReplace: ScheduleSlot, strategy: 'KEEP_CURRENT' | 'KEEP_OTHER') => {
        setResolutionStrategy(strategy);
        setTargetSlotForReplacement(slotToReplace);
    };

    const handleRequestReplacement = async (targetDoctorId: string) => {
        if (!profile) return;
        setSendingRequestTo(targetDoctorId);
        try {
            const effectiveSlot = targetSlotForReplacement ?? slot;
            const conflictDoctorId = conflict?.doctorId ?? slot.assignedDoctorId ?? '';
            const requestId = await sendReplacementRequest({
                requesterDoctorId: conflictDoctorId,
                targetDoctorId,
                slotDate: effectiveSlot.date,
                period: effectiveSlot.period,
                activityName: effectiveSlot.subType ?? effectiveSlot.location,
                slotId: effectiveSlot.id,
                slotType: effectiveSlot.type,
            });

            const { data: targetProfile } = await supabase
                .from('profiles')
                .select('id')
                .eq('doctor_id', targetDoctorId)
                .single();

            if (targetProfile) {
                const requesterDoctor = doctors.find((d: any) => d.id === conflictDoctorId);
                await createNotification({
                    user_id: targetProfile.id,
                    type: 'REPLACEMENT_REQUEST',
                    title: 'Demande de remplacement',
                    body: `Dr ${requesterDoctor?.name ?? 'Inconnu'} vous demande de le remplacer : ${effectiveSlot.subType ?? effectiveSlot.location} le ${effectiveSlot.date} (${effectiveSlot.period})`,
                    data: {
                        requestId,
                        slotId: effectiveSlot.id,
                        slotType: effectiveSlot.type,
                        requesterDoctorId: conflictDoctorId,
                        slotDate: effectiveSlot.date,
                        period: effectiveSlot.period,
                    },
                    read: false,
                });
            }

            setRequestSent(true);
        } catch (e) {
            console.error('Failed to send replacement request:', e);
        } finally {
            setSendingRequestTo(null);
        }
    };

    // --- RCP-SPECIFIC HANDLERS ---

    // 🅰️ Leave empty: mark conflicting doctor ABSENT in RCP → slot becomes unconfirmed
    // The conflict remains visible (UNAVAILABILITY conflict stays since template still lists that doctor)
    const handleRcpLeaveEmpty = async () => {
        const effectiveSlot = targetSlotForReplacement ?? slot;
        const doctorToRemove = conflict?.doctorId ?? slot.assignedDoctorId;
        if (!doctorToRemove) { onClose(); return; }
        setRcpActionLoading(true);
        try {
            const currentMap = rcpAttendance[effectiveSlot.id] || {};
            const newMap: Record<string, 'PRESENT' | 'ABSENT'> = { ...currentMap, [doctorToRemove]: 'ABSENT' };
            setRcpAttendance({ ...rcpAttendance, [effectiveSlot.id]: newMap });
            await supabase.from('rcp_attendance').upsert({
                slot_id: effectiveSlot.id,
                doctor_id: doctorToRemove,
                status: 'ABSENT',
            });
        } catch (e) {
            console.error('[RCP] handleRcpLeaveEmpty failed:', e);
        } finally {
            setRcpActionLoading(false);
        }
        onClose(); // Close modal — slot now shows "À confirmer" (unresolved but visible)
    };

    // 🅾️ Direct replacement: mark old doctor ABSENT + new doctor PRESENT
    // If the new doctor is not in the template, flag as exceptional replacement
    const handleRcpDirectReplacement = async () => {
        if (!rcpDirectDoctorId) return;
        const effectiveSlot = targetSlotForReplacement ?? slot;
        const doctorToRemove = conflict?.doctorId ?? slot.assignedDoctorId;
        const isExceptional = !effectiveSlot.doctorIds?.includes(rcpDirectDoctorId);
        setRcpActionLoading(true);
        try {
            const currentMap = rcpAttendance[effectiveSlot.id] || {};
            const newMap: Record<string, 'PRESENT' | 'ABSENT'> = { ...currentMap };
            if (doctorToRemove) newMap[doctorToRemove] = 'ABSENT';
            newMap[rcpDirectDoctorId] = 'PRESENT';
            setRcpAttendance({ ...rcpAttendance, [effectiveSlot.id]: newMap });

            const ops: Promise<any>[] = [];
            if (doctorToRemove) {
                ops.push(supabase.from('rcp_attendance').upsert({
                    slot_id: effectiveSlot.id, doctor_id: doctorToRemove, status: 'ABSENT',
                }));
            }
            ops.push(supabase.from('rcp_attendance').upsert({
                slot_id: effectiveSlot.id, doctor_id: rcpDirectDoctorId, status: 'PRESENT',
            }));
            await Promise.all(ops);

            if (isExceptional) {
                console.log(`[RCP] Remplacement exceptionnel : Dr ${rcpDirectDoctorId} hors affectation initiale`);
            }
        } catch (e) {
            console.error('[RCP] handleRcpDirectReplacement failed:', e);
        } finally {
            setRcpActionLoading(false);
        }
        onClose();
    };

    const getSlotColor = (s: ScheduleSlot) => {
        if (s.type === SlotType.RCP) return 'bg-secondary/10 border-secondary/20 text-secondary';
        if (s.type === SlotType.ACTIVITY) return 'bg-warning/10 border-warning/20 text-warning';
        return 'bg-muted border-border text-primary';
    };

    const getSlotIcon = (s: ScheduleSlot) => {
        if (s.type === SlotType.RCP) return <UserCheck className="w-4 h-4 mr-2" />;
        if (s.type === SlotType.ACTIVITY) return <Activity className="w-4 h-4 mr-2" />;
        return <Calendar className="w-4 h-4 mr-2" />;
    };

    // If the user cannot resolve this conflict, show an access denied message
    if (!canResolve) {
        return (
            <div
                className="fixed inset-0 bg-black/40 backdrop-blur-sm z-modal flex items-end md:items-center justify-center p-0 md:p-4"
                onClick={onClose}
            >
                <div
                    className="bg-surface rounded-t-modal md:rounded-modal shadow-modal border border-border/40 overflow-hidden w-full md:max-w-[680px] mx-auto max-h-[90dvh] overflow-y-auto"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="modal-title-conflict-denied"
                    onClick={e => e.stopPropagation()}
                >
                    {/* Mobile drag handle */}
                    <div className="w-10 h-1 rounded-full bg-border mx-auto mt-3 mb-1 md:hidden" aria-hidden="true" />

                    {/* Gradient header */}
                    <div className="gradient-primary px-5 py-4 flex items-center justify-between">
                        <h2 id="modal-title-conflict-denied" className="text-base font-bold text-white">
                            Accès Restreint
                        </h2>
                        <button
                            onClick={onClose}
                            aria-label="Fermer"
                            className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-colors"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="px-4 py-4">
                        <div className="mb-4 text-center">
                            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4 border border-border">
                                <ShieldAlert className="w-8 h-8 text-accent-amber" />
                            </div>
                            <h3 className="font-bold text-base text-text-base mb-2">Ce conflit ne vous concerne pas</h3>
                            <p className="text-text-muted text-sm">
                                Vous ne pouvez résoudre que les conflits qui concernent vos propres créneaux.<br />
                                Seuls les administrateurs peuvent résoudre les conflits des autres médecins.
                            </p>
                        </div>

                        {/* Show conflict info */}
                        {conflict && (
                            <div className="bg-muted p-3 rounded-card border border-border mb-4">
                                <div className="text-xs font-bold text-accent-red uppercase mb-1">Conflit</div>
                                <div className="text-sm text-text-base">{conflict.description}</div>
                            </div>
                        )}

                        {/* Show slot info */}
                        <div className="bg-muted p-3 rounded-card border border-border mb-4">
                            <div className="text-xs font-bold text-text-muted uppercase">{slot.day} {slot.period === 'Matin' ? 'Matin' : 'Après-Midi'}</div>
                            <div className="font-bold text-text-base text-sm">{slot.location}</div>
                            {assignedDoctor && (
                                <div className="text-sm text-text-muted mt-1">Médecin concerné : {assignedDoctor.name}</div>
                            )}
                        </div>
                    </div>

                    <div className="px-4 py-3 border-t border-border flex justify-end gap-2">
                        <Button variant="primary" size="md" onClick={onClose}>Fermer</Button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-modal flex items-end md:items-center justify-center p-0 md:p-4"
            onClick={onClose}
        >
            <div
                className="bg-surface rounded-t-modal md:rounded-modal shadow-modal border border-border/40 overflow-hidden w-full md:max-w-[680px] mx-auto max-h-[90dvh] overflow-y-auto flex flex-col"
                role="dialog"
                aria-modal="true"
                aria-labelledby="modal-title-conflict"
                onClick={e => e.stopPropagation()}
            >
                {/* Mobile drag handle */}
                <div className="w-10 h-1 rounded-full bg-border mx-auto mt-3 mb-1 md:hidden" aria-hidden="true" />

                {/* Gradient header */}
                <div className="gradient-primary px-5 py-4 flex items-center justify-between">
                    <h2 id="modal-title-conflict" className="text-base font-bold text-white">
                        {conflict ? 'Conflit Détecté' : 'Gérer le Créneau'}
                    </h2>
                    <button
                        onClick={onClose}
                        aria-label="Fermer"
                        className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {conflict && (
                    <div className="px-4 pt-3 pb-1">
                        <p className="text-sm text-accent-red">{conflict.description}</p>
                    </div>
                )}

                <div className="flex-1 overflow-y-auto px-4 py-4">

                    {/* ══════════════════════════════════════════════════
                        RCP CONFLICT — 3-option resolution panel
                        Shown whenever the conflicting slot IS an RCP.
                    ════════════════════════════════════════════════════ */}
                    {isRcpConflict && (
                        <div className="mb-6">
                            {/* Intro */}
                            <div className="bg-secondary/10 border border-secondary/20 rounded-xl p-4 mb-5">
                                <div className="flex items-center gap-2 mb-1">
                                    <UserCheck className="w-5 h-5 text-secondary" />
                                    <span className="font-bold text-secondary">
                                        {conflict ? 'Conflit sur une RCP' : 'Gérer la RCP'}
                                    </span>
                                </div>
                                <p className="text-sm text-secondary">
                                    {conflict
                                        ? 'Ce médecin est indisponible ou en double réservation sur une RCP confirmée. La RCP bloque la demi-journée entière. Choisissez comment résoudre ce conflit.'
                                        : 'Indiquez votre absence, demandez un remplacement, ou assignez directement un médecin pour cette RCP.'
                                    }
                                </p>
                            </div>

                            {/* Choice panel — 3 cards */}
                            {rcpMode === 'CHOICE' || rcpMode === null ? (
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-2">
                                    {/* 🅰️ Leave empty */}
                                    <button
                                        onClick={handleRcpLeaveEmpty}
                                        disabled={rcpActionLoading}
                                        className="flex flex-col items-center text-center p-4 rounded-xl border-2 border-warning/20 bg-warning/10 hover:border-warning/40 hover:bg-warning/20 transition-all disabled:opacity-50 group"
                                    >
                                        <div className="w-10 h-10 rounded-full bg-warning/10 group-hover:bg-warning/20 flex items-center justify-center mb-2">
                                            <UserX className="w-5 h-5 text-warning" />
                                        </div>
                                        <span className="font-bold text-sm text-warning-text">Laisser vide</span>
                                        <span className="text-[11px] text-warning mt-1 leading-tight">
                                            Aucun médecin assigné — la RCP reste visible comme non résolue
                                        </span>
                                    </button>

                                    {/* 🅱️ Request replacement */}
                                    <button
                                        onClick={() => setRcpMode('REQUEST')}
                                        className="flex flex-col items-center text-center p-4 rounded-xl border-2 border-border bg-muted hover:border-primary hover:bg-muted/80 transition-all group"
                                    >
                                        <div className="w-10 h-10 rounded-full bg-surface group-hover:bg-muted flex items-center justify-center mb-2 border border-border">
                                            <Send className="w-5 h-5 text-primary" />
                                        </div>
                                        <span className="font-bold text-sm text-text-base">Demander remplacement</span>
                                        <span className="text-[11px] text-text-muted mt-1 leading-tight">
                                            Envoyer une demande à un médecin — il sera marqué présent s'il accepte
                                        </span>
                                    </button>

                                    {/* 🅾️ Direct replacement */}
                                    <button
                                        onClick={() => setRcpMode('DIRECT')}
                                        className="flex flex-col items-center text-center p-4 rounded-xl border-2 border-success/20 bg-success/10 hover:border-success/40 hover:bg-success/20 transition-all group"
                                    >
                                        <div className="w-10 h-10 rounded-full bg-success/10 group-hover:bg-success/20 flex items-center justify-center mb-2">
                                            <UserPlus className="w-5 h-5 text-success" />
                                        </div>
                                        <span className="font-bold text-sm text-success-text">Remplacement direct</span>
                                        <span className="text-[11px] text-success mt-1 leading-tight">
                                            Assigner immédiatement un médecin — il est marqué présent et bloqué
                                        </span>
                                    </button>
                                </div>
                            ) : null}

                            {/* 🅱️ REQUEST mode — pick a doctor to request */}
                            {rcpMode === 'REQUEST' && (
                                <div className="animate-in fade-in slide-in-from-bottom-4 duration-200">
                                    <button onClick={() => setRcpMode(null)} className="text-xs text-text-muted hover:text-text-base mb-3 flex items-center gap-1">
                                        ← Retour
                                    </button>
                                    <h4 className="font-bold text-sm text-text-base mb-3 flex items-center gap-2">
                                        <Send className="w-4 h-4 text-primary" /> Choisir un médecin à qui demander
                                    </h4>
                                    {requestSent ? (
                                        <div className="bg-success/10 border border-success/20 rounded-lg p-3 text-sm text-success-text font-medium">
                                            ✓ Demande envoyée — le médecin recevra une notification
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            {/* Referent doctors first */}
                                            {doctors.filter(d => d.id !== assignedDoctor?.id && referentDoctorIds.has(d.id)).length > 0 && (
                                                <div className="mb-1">
                                                    <p className="text-[10px] uppercase font-bold text-success-text mb-1.5">
                                                        Médecins référents ({doctors.filter(d => d.id !== assignedDoctor?.id && referentDoctorIds.has(d.id)).length})
                                                    </p>
                                                    {doctors.filter(d => d.id !== assignedDoctor?.id && referentDoctorIds.has(d.id)).map(doc => (
                                                        <div key={doc.id} className="flex items-center justify-between p-2.5 bg-surface border border-success/20 rounded-lg hover:border-success/40 transition mb-1.5">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-sm font-medium text-text-base">{doc.name}</span>
                                                                <span className="text-[10px] bg-success/10 text-success px-2 py-0.5 rounded-full border border-success/20">Référent</span>
                                                                {availableDoctorIds.has(doc.id)
                                                                    ? <span className="text-[10px] bg-success/10 text-success px-2 py-0.5 rounded-full border border-success/20">Dispo</span>
                                                                    : <span className="text-[10px] bg-danger/10 text-danger px-2 py-0.5 rounded-full border border-danger/20">Indispo</span>
                                                                }
                                                            </div>
                                                            <button
                                                                onClick={() => handleRequestReplacement(doc.id)}
                                                                disabled={sendingRequestTo === doc.id}
                                                                className="text-xs bg-muted text-primary px-3 py-1.5 rounded-btn border border-border hover:bg-muted/80 disabled:opacity-50 font-medium transition-colors"
                                                            >
                                                                {sendingRequestTo === doc.id ? 'Envoi…' : 'Demander'}
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                            {/* Exceptional doctors */}
                                            {doctors.filter(d => d.id !== assignedDoctor?.id && !referentDoctorIds.has(d.id)).length > 0 && (
                                                <div>
                                                    <p className="text-[10px] uppercase font-bold text-warning-text mb-1.5">
                                                        Autres médecins — sélection exceptionnelle ({doctors.filter(d => d.id !== assignedDoctor?.id && !referentDoctorIds.has(d.id)).length})
                                                    </p>
                                                    {doctors.filter(d => d.id !== assignedDoctor?.id && !referentDoctorIds.has(d.id)).map(doc => (
                                                        <div key={doc.id} className="flex items-center justify-between p-2.5 bg-surface border border-warning/20 rounded-lg hover:border-warning/40 transition mb-1.5">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-sm font-medium text-text-base">{doc.name}</span>
                                                                <span className="text-[10px] bg-warning/10 text-warning px-2 py-0.5 rounded-full border border-warning/20">Exceptionnel</span>
                                                                {availableDoctorIds.has(doc.id)
                                                                    ? <span className="text-[10px] bg-success/10 text-success px-2 py-0.5 rounded-full border border-success/20">Dispo</span>
                                                                    : <span className="text-[10px] bg-danger/10 text-danger px-2 py-0.5 rounded-full border border-danger/20">Indispo</span>
                                                                }
                                                            </div>
                                                            <button
                                                                onClick={() => handleRequestReplacement(doc.id)}
                                                                disabled={sendingRequestTo === doc.id}
                                                                className="text-xs bg-muted text-primary px-3 py-1.5 rounded-btn border border-border hover:bg-muted/80 disabled:opacity-50 font-medium transition-colors"
                                                            >
                                                                {sendingRequestTo === doc.id ? 'Envoi…' : 'Demander'}
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* 🅾️ DIRECT mode — pick a doctor + confirm */}
                            {rcpMode === 'DIRECT' && (
                                <div className="animate-in fade-in slide-in-from-bottom-4 duration-200">
                                    <button onClick={() => setRcpMode(null)} className="text-xs text-text-muted hover:text-text-base mb-3 flex items-center gap-1">
                                        ← Retour
                                    </button>
                                    <h4 className="font-bold text-sm text-text-base mb-3 flex items-center gap-2">
                                        <UserPlus className="w-4 h-4 text-success" /> Choisir le médecin remplaçant
                                    </h4>
                                    <div className="space-y-1.5 mb-3 max-h-64 overflow-y-auto">
                                        {/* Referent doctors */}
                                        {doctors.filter(d => d.id !== assignedDoctor?.id && referentDoctorIds.has(d.id)).length > 0 && (
                                            <div className="mb-1">
                                                <p className="text-[10px] uppercase font-bold text-success-text mb-1">Médecins référents</p>
                                                {doctors.filter(d => d.id !== assignedDoctor?.id && referentDoctorIds.has(d.id)).map(doc => (
                                                    <div
                                                        key={doc.id}
                                                        onClick={() => setRcpDirectDoctorId(doc.id)}
                                                        className={`flex items-center justify-between p-2.5 rounded-lg border cursor-pointer transition mb-1 ${rcpDirectDoctorId === doc.id ? 'border-success bg-success/10' : 'border-success/20 bg-surface hover:border-success/40'}`}
                                                    >
                                                        <div className="flex items-center gap-2">
                                                            {rcpDirectDoctorId === doc.id && <span className="text-success font-bold">✓</span>}
                                                            <span className="text-sm font-medium text-text-base">{doc.name}</span>
                                                            <span className="text-[10px] bg-success/10 text-success px-2 py-0.5 rounded-full border border-success/20">Référent</span>
                                                            {availableDoctorIds.has(doc.id)
                                                                ? <span className="text-[10px] bg-success/10 text-success px-2 py-0.5 rounded-full border border-success/20">Dispo</span>
                                                                : <span className="text-[10px] bg-danger/10 text-danger px-2 py-0.5 rounded-full border border-danger/20">Indispo</span>
                                                            }
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        {/* Exceptional doctors */}
                                        <div>
                                            <p className="text-[10px] uppercase font-bold text-warning-text mb-1">Sélection exceptionnelle</p>
                                            {doctors.filter(d => d.id !== assignedDoctor?.id && !referentDoctorIds.has(d.id)).map(doc => (
                                                <div
                                                    key={doc.id}
                                                    onClick={() => setRcpDirectDoctorId(doc.id)}
                                                    className={`flex items-center justify-between p-2.5 rounded-lg border cursor-pointer transition mb-1 ${rcpDirectDoctorId === doc.id ? 'border-warning bg-warning/10' : 'border-warning/20 bg-surface hover:border-warning/40'}`}
                                                >
                                                    <div className="flex items-center gap-2">
                                                        {rcpDirectDoctorId === doc.id && <span className="text-warning font-bold">✓</span>}
                                                        <span className="text-sm font-medium text-text-base">{doc.name}</span>
                                                        <span className="text-[10px] bg-warning/10 text-warning px-2 py-0.5 rounded-full border border-warning/20">Exceptionnel</span>
                                                        {availableDoctorIds.has(doc.id)
                                                            ? <span className="text-[10px] bg-success/10 text-success px-2 py-0.5 rounded-full border border-success/20">Dispo</span>
                                                            : <span className="text-[10px] bg-danger/10 text-danger px-2 py-0.5 rounded-full border border-danger/20">Indispo</span>
                                                        }
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    {rcpDirectDoctorId && !referentDoctorIds.has(rcpDirectDoctorId) && (
                                        <div className="mb-3 bg-warning/10 border border-warning/20 rounded-lg p-2.5 text-xs text-warning-text">
                                            ⚠️ Ce médecin n'est pas dans l'affectation initiale de la RCP. Il sera ajouté exceptionnellement et bloqué sur cette demi-journée.
                                        </div>
                                    )}
                                    <Button
                                        variant="primary"
                                        size="md"
                                        onClick={handleRcpDirectReplacement}
                                        disabled={!rcpDirectDoctorId || rcpActionLoading}
                                        className="w-full"
                                    >
                                        {rcpActionLoading ? 'Enregistrement…' : 'Confirmer le remplacement'}
                                    </Button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ══════════════════════════════════════════════════
                        CONSULTATION / ACTIVITY CONFLICT — same 3-card layout as RCP
                        Shown for simple unavailability conflicts on non-RCP slots.
                    ════════════════════════════════════════════════════ */}
                    {isSimpleConsultConflict && (
                        <div className="mb-6">
                            {/* Intro banner — slate-blue for consultation */}
                            <div
                                className="border rounded-xl p-4 mb-5"
                                style={{ backgroundColor: 'rgba(59,111,212,0.08)', borderColor: 'rgba(59,111,212,0.25)' }}
                            >
                                <div className="flex items-center gap-2 mb-1">
                                    <Calendar className="w-5 h-5" style={{ color: '#3B6FD4' }} />
                                    <span className="font-bold" style={{ color: '#3B6FD4' }}>
                                        {conflict ? 'Conflit sur une consultation' : 'Gérer le créneau'}
                                    </span>
                                </div>
                                <p className="text-sm" style={{ color: '#3B6FD4' }}>
                                    {conflict
                                        ? 'Ce médecin est indisponible ou en double réservation sur ce créneau. Choisissez comment résoudre ce conflit.'
                                        : 'Fermez ce créneau, demandez un remplacement ou assignez directement un médecin.'
                                    }
                                </p>
                            </div>

                            {/* 3-card choice panel */}
                            {(consultMode === 'CHOICE' || consultMode === null) && (
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-2">
                                    {/* 🔴 Fermer le créneau */}
                                    <button
                                        onClick={() => { onCloseSlot(slot.id); onClose(); }}
                                        className="flex flex-col items-center text-center p-4 rounded-xl border-2 border-danger/20 bg-danger/10 hover:border-danger/40 hover:bg-danger/20 transition-all group"
                                    >
                                        <div className="w-10 h-10 rounded-full bg-danger/10 group-hover:bg-danger/20 flex items-center justify-center mb-2">
                                            <Ban className="w-5 h-5 text-danger" />
                                        </div>
                                        <span className="font-bold text-sm text-danger">Fermer le créneau</span>
                                        <span className="text-[11px] text-danger/70 mt-1 leading-tight">
                                            Marquer ce créneau comme fermé — aucun médecin ne sera assigné
                                        </span>
                                    </button>

                                    {/* ⚪ Demander remplacement */}
                                    <button
                                        onClick={() => setConsultMode('REQUEST')}
                                        className="flex flex-col items-center text-center p-4 rounded-xl border-2 border-border bg-muted hover:border-primary hover:bg-muted/80 transition-all group"
                                    >
                                        <div className="w-10 h-10 rounded-full bg-surface group-hover:bg-muted flex items-center justify-center mb-2 border border-border">
                                            <Send className="w-5 h-5 text-primary" />
                                        </div>
                                        <span className="font-bold text-sm text-text-base">Demander remplacement</span>
                                        <span className="text-[11px] text-text-muted mt-1 leading-tight">
                                            Envoyer une demande à un médecin — il sera assigné s'il accepte
                                        </span>
                                    </button>

                                    {/* 🟢 Remplacement direct */}
                                    <button
                                        onClick={() => setConsultMode('DIRECT')}
                                        className="flex flex-col items-center text-center p-4 rounded-xl border-2 border-success/20 bg-success/10 hover:border-success/40 hover:bg-success/20 transition-all group"
                                    >
                                        <div className="w-10 h-10 rounded-full bg-success/10 group-hover:bg-success/20 flex items-center justify-center mb-2">
                                            <UserPlus className="w-5 h-5 text-success" />
                                        </div>
                                        <span className="font-bold text-sm text-success-text">Remplacement direct</span>
                                        <span className="text-[11px] text-success mt-1 leading-tight">
                                            Assigner immédiatement un médecin à ce créneau
                                        </span>
                                    </button>
                                </div>
                            )}

                            {/* REQUEST sub-screen */}
                            {consultMode === 'REQUEST' && (
                                <div className="animate-in fade-in slide-in-from-bottom-4 duration-200">
                                    <button onClick={() => setConsultMode(null)} className="text-xs text-text-muted hover:text-text-base mb-3 flex items-center gap-1">
                                        ← Retour
                                    </button>
                                    <h4 className="font-bold text-sm text-text-base mb-3 flex items-center gap-2">
                                        <Send className="w-4 h-4 text-primary" /> Choisir un médecin à qui demander
                                    </h4>
                                    {requestSent ? (
                                        <div className="bg-success/10 border border-success/20 rounded-lg p-3 text-sm text-success-text font-medium">
                                            ✓ Demande envoyée — le médecin recevra une notification
                                        </div>
                                    ) : (
                                        <div className="space-y-1.5 max-h-72 overflow-y-auto">
                                            {doctors.filter(d => d.id !== assignedDoctor?.id).map(doc => (
                                                <div key={doc.id} className="flex items-center justify-between p-2.5 bg-surface border border-border rounded-lg hover:border-primary/30 transition mb-1">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm font-medium text-text-base">{doc.name}</span>
                                                        {availableDoctorIds.has(doc.id)
                                                            ? <span className="text-[10px] bg-success/10 text-success px-2 py-0.5 rounded-full border border-success/20">Disponible</span>
                                                            : <span className="text-[10px] bg-danger/10 text-danger px-2 py-0.5 rounded-full border border-danger/20">Indispo</span>
                                                        }
                                                    </div>
                                                    <button
                                                        onClick={() => handleRequestReplacement(doc.id)}
                                                        disabled={sendingRequestTo === doc.id}
                                                        className="text-xs bg-muted text-primary px-3 py-1.5 rounded-btn border border-border hover:bg-muted/80 disabled:opacity-50 font-medium transition-colors"
                                                    >
                                                        {sendingRequestTo === doc.id ? 'Envoi…' : 'Demander'}
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* DIRECT sub-screen */}
                            {consultMode === 'DIRECT' && (
                                <div className="animate-in fade-in slide-in-from-bottom-4 duration-200">
                                    <button onClick={() => setConsultMode(null)} className="text-xs text-text-muted hover:text-text-base mb-3 flex items-center gap-1">
                                        ← Retour
                                    </button>
                                    <h4 className="font-bold text-sm text-text-base mb-3 flex items-center gap-2">
                                        <UserPlus className="w-4 h-4 text-success" /> Choisir le médecin remplaçant
                                    </h4>
                                    <div className="space-y-1.5 mb-3 max-h-64 overflow-y-auto">
                                        {doctors.filter(d => d.id !== assignedDoctor?.id).map(doc => (
                                            <div
                                                key={doc.id}
                                                onClick={() => setManualDoctorId(doc.id)}
                                                className={`flex items-center justify-between p-2.5 rounded-lg border cursor-pointer transition mb-1 ${manualDoctorId === doc.id ? 'border-success bg-success/10' : 'border-border bg-surface hover:border-primary/30'}`}
                                            >
                                                <div className="flex items-center gap-2">
                                                    {manualDoctorId === doc.id && <span className="text-success font-bold">✓</span>}
                                                    <span className="text-sm font-medium text-text-base">{doc.name}</span>
                                                    {availableDoctorIds.has(doc.id)
                                                        ? <span className="text-[10px] bg-success/10 text-success px-2 py-0.5 rounded-full border border-success/20">Disponible</span>
                                                        : <span className="text-[10px] bg-danger/10 text-danger px-2 py-0.5 rounded-full border border-danger/20">Indispo</span>
                                                    }
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <Button
                                        variant="primary"
                                        size="md"
                                        onClick={() => {
                                            if (manualDoctorId && targetSlotForReplacement) {
                                                onResolve(targetSlotForReplacement.id, manualDoctorId);
                                                onClose();
                                            }
                                        }}
                                        disabled={!manualDoctorId}
                                        className="w-full"
                                    >
                                        Confirmer le remplacement
                                    </Button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* --- DOUBLE BOOKING DECISION UI (non-RCP) --- */}
                    {!isRcpConflict && conflict?.type === 'DOUBLE_BOOKING' && otherSlot && assignedDoctor && (
                        <div className="mb-8">
                            <h3 className="text-md font-bold text-text-base mb-4 text-center">
                                {assignedDoctor.name} est assigné à deux activités simultanément. Que souhaitez-vous faire ?
                            </h3>

                            {/* RCP Specific Warning */}
                            {(slot.type === SlotType.RCP || otherSlot.type === SlotType.RCP) && (
                                <div className="mb-4 bg-secondary/10 p-3 rounded-lg border border-secondary/20 flex items-center justify-center text-sm text-secondary font-medium">
                                    <UserCheck className="w-4 h-4 mr-2" />
                                    Attention : La présence à une RCP est prioritaire si elle a été confirmée.
                                </div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative">
                                {/* LEFT OPTION (Current Slot) */}
                                <div
                                    onClick={() => handleKeepInSlot(slot, otherSlot, 'KEEP_CURRENT')}
                                    className={`relative border-2 rounded-xl p-5 cursor-pointer transition-all hover:scale-[1.02] ${resolutionStrategy === 'KEEP_CURRENT' ? 'border-success bg-success/10 shadow-md' : 'border-border hover:border-text-muted'}`}
                                >
                                    <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-surface px-3 py-1 text-xs font-bold text-text-muted rounded-full border border-border">OPTION 1</div>
                                    <div className="flex items-center justify-between mb-3">
                                        <span className={`text-xs font-bold px-2 py-1 rounded border flex items-center ${getSlotColor(slot)}`}>
                                            {getSlotIcon(slot)}
                                            {slot.type}
                                        </span>
                                        {resolutionStrategy === 'KEEP_CURRENT' && <div className="w-6 h-6 bg-success rounded-full flex items-center justify-center text-white"><UserCheck className="w-4 h-4" /></div>}
                                    </div>
                                    <h4 className="font-bold text-lg text-text-base mb-1">{slot.location}</h4>
                                    <p className="text-sm text-text-muted mb-4">{slot.subType}</p>

                                    <button className={`w-full py-2 rounded-btn font-bold text-sm ${resolutionStrategy === 'KEEP_CURRENT' ? 'bg-success text-white' : 'bg-muted text-text-muted'}`}>
                                        Maintenir ici
                                    </button>
                                    <div className="mt-2 text-xs text-center text-text-muted">
                                        (Remplacer pour {otherSlot.location})
                                    </div>
                                </div>

                                {/* VS Badge */}
                                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10 bg-surface rounded-full p-2 shadow border border-border font-bold text-text-muted text-xs">VS</div>

                                {/* RIGHT OPTION (Other Slot) */}
                                <div
                                    onClick={() => handleKeepInSlot(otherSlot, slot, 'KEEP_OTHER')}
                                    className={`relative border-2 rounded-xl p-5 cursor-pointer transition-all hover:scale-[1.02] ${resolutionStrategy === 'KEEP_OTHER' ? 'border-success bg-success/10 shadow-md' : 'border-border hover:border-text-muted'}`}
                                >
                                    <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-surface px-3 py-1 text-xs font-bold text-text-muted rounded-full border border-border">OPTION 2</div>
                                    <div className="flex items-center justify-between mb-3">
                                        <span className={`text-xs font-bold px-2 py-1 rounded border flex items-center ${getSlotColor(otherSlot)}`}>
                                            {getSlotIcon(otherSlot)}
                                            {otherSlot.type}
                                        </span>
                                        {resolutionStrategy === 'KEEP_OTHER' && <div className="w-6 h-6 bg-success rounded-full flex items-center justify-center text-white"><UserCheck className="w-4 h-4" /></div>}
                                    </div>
                                    <h4 className="font-bold text-lg text-text-base mb-1">{otherSlot.location}</h4>
                                    <p className="text-sm text-text-muted mb-4">{otherSlot.subType}</p>

                                    <button className={`w-full py-2 rounded-btn font-bold text-sm ${resolutionStrategy === 'KEEP_OTHER' ? 'bg-success text-white' : 'bg-muted text-text-muted'}`}>
                                        Maintenir ici
                                    </button>
                                    <div className="mt-2 text-xs text-center text-text-muted">
                                        (Remplacer pour {slot.location})
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* --- REPLACEMENT SUGGESTIONS (double-booking only — simple conflicts use 3-card UI above) --- */}
                    {!isRcpConflict && !isSimpleConsultConflict && resolutionStrategy && targetSlotForReplacement && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-md font-bold text-text-base flex items-center">
                                    <RefreshCw className="w-5 h-5 mr-2 text-primary" />
                                    Trouver un remplaçant pour : <span className="ml-2 bg-muted px-2 py-1 rounded-badge border border-border">{targetSlotForReplacement.location}</span>
                                </h3>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                                {/* ALGO SUGGESTIONS */}
                                <div className="bg-muted p-4 rounded-card border border-border">
                                    <h4 className="text-xs font-bold text-text-muted uppercase mb-3 flex items-center">
                                        <Lightbulb className="w-4 h-4 mr-1 text-yellow-500" /> Suggestions IA / Algorithme
                                    </h4>

                                    {loading ? (
                                        <div className="flex justify-center py-10">
                                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                                        </div>
                                    ) : error ? (
                                        <div className="text-center py-4 text-warning text-sm bg-warning/10 rounded border border-warning/20">
                                            {error}
                                        </div>
                                    ) : suggestions.length === 0 ? (
                                        <div className="text-center py-4 text-text-muted text-sm">
                                            Aucune suggestion automatique trouvée.
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {suggestions.map((sugg) => {
                                                const doc = doctors.find(d => d.id === sugg.suggestedDoctorId);
                                                if (!doc) return null;
                                                return (
                                                    <div key={sugg.suggestedDoctorId} className="bg-surface rounded-card border border-border/50 hover:border-primary/30 hover:shadow-card transition-all p-3 mb-2">
                                                        <div className="flex justify-between items-start mb-1">
                                                            <div className="flex items-center">
                                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold mr-3 ${doc.color}`}>
                                                                    {doc.name.substring(0, 2)}
                                                                </div>
                                                                <div>
                                                                    <div className="text-sm font-bold text-text-base">{doc.name}</div>
                                                                    <div className="text-xs text-text-muted">{doc.specialty.join(', ')}</div>
                                                                </div>
                                                            </div>
                                                            <span className="inline-flex items-center px-2 py-1 rounded text-xs font-bold bg-success/10 text-success">
                                                                {sugg.score}%
                                                            </span>
                                                        </div>
                                                        <p className="text-xs text-text-muted mb-2 italic pl-11">
                                                            "{sugg.reasoning}"
                                                        </p>
                                                        <div className="flex gap-2 mt-2">
                                                            <Button
                                                                variant="primary"
                                                                size="sm"
                                                                onClick={() => onResolve(targetSlotForReplacement.id, doc.id)}
                                                            >
                                                                Choisir
                                                            </Button>
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => handleRequestReplacement(doc.id)}
                                                                disabled={sendingRequestTo === doc.id || requestSent}
                                                            >
                                                                {sendingRequestTo === doc.id ? 'Envoi...' : 'Demander remplacement'}
                                                            </Button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                    {requestSent && (
                                        <p className="text-sm text-success font-medium text-center py-2">
                                            ✓ Demande envoyée — le médecin recevra une notification
                                        </p>
                                    )}
                                </div>

                                {/* MANUAL & ACTIONS */}
                                <div className="flex flex-col space-y-4">
                                    <div className="bg-surface p-4 rounded-card border border-border shadow-card flex-1">
                                        <h4 className="text-xs font-bold text-text-muted uppercase mb-3 flex items-center">
                                            <User className="w-4 h-4 mr-1 text-text-muted" /> Sélection Manuelle
                                        </h4>
                                        <p className="text-xs text-text-muted mb-4">Si les suggestions ne conviennent pas, choisissez un médecin dans la liste complète.</p>

                                        <div className="space-y-3">
                                            <select
                                                className="w-full text-sm border-border rounded-btn shadow-sm focus:border-primary focus:ring-1 focus:ring-primary p-2.5"
                                                value={manualDoctorId}
                                                onChange={(e) => setManualDoctorId(e.target.value)}
                                            >
                                                <option value="">-- Choisir un médecin (trié par charge) --</option>
                                                {doctors
                                                    .filter(d => d.id !== assignedDoctor?.id)
                                                    .map(doc => {
                                                        // Calculate weighted load for sorting
                                                        const rate = getDoctorWorkRate(doc);
                                                        let historyTotal = 0;
                                                        activityDefinitions.forEach(act => {
                                                            historyTotal += effectiveHistory[doc.id]?.[act.id] || 0;
                                                        });
                                                        const currentShifts = slots.filter(s => s.assignedDoctorId === doc.id).length;
                                                        const weightedScore = (historyTotal + currentShifts) / rate;
                                                        const hasMatchingSpecialty = assignedDoctor && doc.specialty.some(s => assignedDoctor.specialty.includes(s));
                                                        return { doc, weightedScore, hasMatchingSpecialty };
                                                    })
                                                    .sort((a, b) => {
                                                        // Sort by: matching specialty first, then by lowest weighted score
                                                        if (a.hasMatchingSpecialty && !b.hasMatchingSpecialty) return -1;
                                                        if (!a.hasMatchingSpecialty && b.hasMatchingSpecialty) return 1;
                                                        return a.weightedScore - b.weightedScore;
                                                    })
                                                    .map(({ doc, weightedScore, hasMatchingSpecialty }) => (
                                                        <option key={doc.id} value={doc.id}>
                                                            {hasMatchingSpecialty ? '⭐ ' : ''}{doc.name} ({doc.specialty.join(', ') || 'Général'}) - Charge: {weightedScore.toFixed(1)}
                                                        </option>
                                                    ))
                                                }
                                            </select>
                                            <Button
                                                variant="primary"
                                                size="md"
                                                disabled={!manualDoctorId}
                                                onClick={() => onResolve(targetSlotForReplacement.id, manualDoctorId)}
                                                className="w-full"
                                            >
                                                Valider le choix manuel
                                            </Button>
                                        </div>
                                    </div>

                                    <div className="bg-muted p-4 rounded-card border border-border">
                                        <h4 className="text-xs font-bold text-text-muted uppercase mb-3 flex items-center">
                                            <Ban className="w-4 h-4 mr-1 text-accent-red" /> Actions sur le créneau
                                        </h4>
                                        <div className="grid grid-cols-2 gap-3">
                                            <button
                                                onClick={() => onCloseSlot(targetSlotForReplacement.id)}
                                                className="flex items-center justify-center px-4 py-2 border border-border bg-surface text-text-muted rounded-btn hover:bg-danger/10 hover:text-danger hover:border-danger/20 text-xs font-bold transition-colors"
                                            >
                                                Fermer le créneau
                                            </button>
                                            <button
                                                onClick={() => onResolve(targetSlotForReplacement.id, "")}
                                                className="flex items-center justify-center px-4 py-2 border border-border bg-surface text-text-muted rounded-btn hover:bg-warning/10 hover:text-warning hover:border-warning/20 text-xs font-bold transition-colors"
                                            >
                                                Laisser vide
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {!conflict && !slot.isClosed && (
                        // Simple Management View (No Conflict) — show close slot option matching RCP card style
                        <div className="mt-4">
                            <p className="text-sm text-text-muted mb-4">Gérez ce créneau normalement. Utilisez les suggestions ci-dessus ou fermez le créneau.</p>
                            <div className="grid grid-cols-1 gap-3">
                                <button
                                    onClick={() => onCloseSlot(slot.id)}
                                    className="flex flex-col items-center text-center p-4 rounded-xl border-2 border-danger/20 bg-danger/10 hover:border-danger/40 hover:bg-danger/20 transition-all group"
                                >
                                    <div className="w-10 h-10 rounded-full bg-danger/10 group-hover:bg-danger/20 flex items-center justify-center mb-2">
                                        <Ban className="w-5 h-5 text-danger" />
                                    </div>
                                    <span className="font-bold text-sm text-danger">Fermer le créneau</span>
                                    <span className="text-[11px] text-danger/70 mt-1 leading-tight">
                                        Marquer ce créneau comme fermé — aucun médecin ne sera assigné
                                    </span>
                                </button>
                            </div>
                        </div>
                    )}

                </div>
            </div>
        </div>
    );
};

export default ConflictResolverModal;

import React, { useState, useEffect, useMemo, useContext } from 'react';
import { Conflict, Doctor, ScheduleSlot, ReplacementSuggestion, SlotType, RcpAttendance } from '../types';
import { getAvailableDoctors, getAlgorithmicReplacementSuggestion, findConflictingSlot, getDoctorWorkRate } from '../services/scheduleService';
import { X, UserCheck, AlertTriangle, User, Lightbulb, Ban, RefreshCw, Lock, ArrowRight, Activity, Calendar, ShieldAlert, UserX, UserPlus, Send } from 'lucide-react';
import { AppContext } from '../App';
import { useAuth } from '../context/AuthContext';
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
    const { effectiveHistory, activityDefinitions, rcpAttendance, setRcpAttendance } = useContext(AppContext);
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

    // Is this an RCP conflict? (doctor is absent/double-booked on an RCP slot)
    const isRcpConflict = slot.type === SlotType.RCP && !!conflict;

    // Double Booking Logic
    const assignedDoctor = doctors.find(d => d.id === slot.assignedDoctorId);

    // Get current user's doctor ID
    const currentDoctorId = profile?.doctor_id;

    // Check if this conflict concerns the current user (doctor)
    // A conflict concerns a doctor if they are the assigned doctor or the conflict's doctorId matches
    const concernsCurrentDoctor = currentDoctorId && (
        slot.assignedDoctorId === currentDoctorId ||
        (slot.secondaryDoctorIds && slot.secondaryDoctorIds.includes(currentDoctorId)) ||
        (conflict && conflict.doctorId === currentDoctorId)
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
                    data: { requestId, slotId: effectiveSlot.id },
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
        if (s.type === SlotType.RCP) return 'bg-purple-100 border-purple-200 text-purple-800';
        if (s.type === SlotType.ACTIVITY) return 'bg-orange-100 border-orange-200 text-orange-800';
        return 'bg-blue-50 border-blue-200 text-blue-800';
    };

    const getSlotIcon = (s: ScheduleSlot) => {
        if (s.type === SlotType.RCP) return <UserCheck className="w-4 h-4 mr-2" />;
        if (s.type === SlotType.ACTIVITY) return <Activity className="w-4 h-4 mr-2" />;
        return <Calendar className="w-4 h-4 mr-2" />;
    };

    // If the user cannot resolve this conflict, show an access denied message
    if (!canResolve) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
                    {/* HEADER */}
                    <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-orange-50">
                        <div className="flex items-center space-x-2">
                            <ShieldAlert className="w-5 h-5 text-orange-600" />
                            <h2 className="font-bold text-lg text-orange-800">Accès Restreint</h2>
                        </div>
                        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 rounded-full hover:bg-black/5 p-2 transition-colors">
                            <X className="w-6 h-6" />
                        </button>
                    </div>

                    <div className="p-6">
                        <div className="mb-4 text-center">
                            <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                <ShieldAlert className="w-8 h-8 text-orange-600" />
                            </div>
                            <h3 className="font-bold text-lg text-slate-800 mb-2">Ce conflit ne vous concerne pas</h3>
                            <p className="text-slate-600 text-sm">
                                Vous ne pouvez résoudre que les conflits qui concernent vos propres créneaux.<br />
                                Seuls les administrateurs peuvent résoudre les conflits des autres médecins.
                            </p>
                        </div>

                        {/* Show conflict info */}
                        {conflict && (
                            <div className="bg-red-50 p-3 rounded-lg border border-red-200 mb-4">
                                <div className="text-xs font-bold text-red-500 uppercase mb-1">Conflit</div>
                                <div className="text-sm text-red-700">{conflict.description}</div>
                            </div>
                        )}

                        {/* Show slot info */}
                        <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 mb-4">
                            <div className="text-xs font-bold text-slate-500 uppercase">{slot.day} {slot.period === 'Matin' ? 'Matin' : 'Après-Midi'}</div>
                            <div className="font-bold text-slate-800 text-sm">{slot.location}</div>
                            {assignedDoctor && (
                                <div className="text-sm text-slate-600 mt-1">Médecin concerné : {assignedDoctor.name}</div>
                            )}
                        </div>

                        <button
                            onClick={onClose}
                            className="w-full py-2.5 bg-slate-800 text-white rounded-lg text-sm font-bold hover:bg-slate-700 transition-colors"
                        >
                            Fermer
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">

                {/* HEADER */}
                <div className={`p-5 border-b border-slate-100 flex justify-between items-center ${conflict ? 'bg-red-50' : 'bg-slate-50'}`}>
                    <div className="flex items-center space-x-3">
                        {conflict ? (
                            <div className="flex items-center">
                                <div className="p-2 bg-red-100 rounded-full mr-3">
                                    <AlertTriangle className="w-6 h-6 text-red-600" />
                                </div>
                                <div>
                                    <h2 className="font-bold text-xl text-red-800">Conflit Détecté</h2>
                                    <p className="text-sm text-red-600">{conflict.description}</p>
                                </div>
                            </div>
                        ) : (
                            <>
                                <UserCheck className="w-5 h-5 text-blue-600" />
                                <h2 className="font-bold text-lg text-slate-800">Gérer le Créneau</h2>
                            </>
                        )}
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 rounded-full hover:bg-black/5 p-2 transition-colors">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6">

                    {/* ══════════════════════════════════════════════════
                        RCP CONFLICT — 3-option resolution panel
                        Shown whenever the conflicting slot IS an RCP.
                    ════════════════════════════════════════════════════ */}
                    {isRcpConflict && (
                        <div className="mb-6">
                            {/* Intro */}
                            <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 mb-5">
                                <div className="flex items-center gap-2 mb-1">
                                    <UserCheck className="w-5 h-5 text-purple-600" />
                                    <span className="font-bold text-purple-800">Conflit sur une RCP</span>
                                </div>
                                <p className="text-sm text-purple-700">
                                    Ce médecin est indisponible ou en double réservation sur une RCP confirmée.
                                    La RCP bloque la demi-journée entière. Choisissez comment résoudre ce conflit.
                                </p>
                            </div>

                            {/* Choice panel — 3 cards */}
                            {rcpMode === 'CHOICE' || rcpMode === null ? (
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-2">
                                    {/* 🅰️ Leave empty */}
                                    <button
                                        onClick={handleRcpLeaveEmpty}
                                        disabled={rcpActionLoading}
                                        className="flex flex-col items-center text-center p-4 rounded-xl border-2 border-orange-200 bg-orange-50 hover:border-orange-400 hover:bg-orange-100 transition-all disabled:opacity-50 group"
                                    >
                                        <div className="w-10 h-10 rounded-full bg-orange-100 group-hover:bg-orange-200 flex items-center justify-center mb-2">
                                            <UserX className="w-5 h-5 text-orange-600" />
                                        </div>
                                        <span className="font-bold text-sm text-orange-800">Laisser vide</span>
                                        <span className="text-[11px] text-orange-600 mt-1 leading-tight">
                                            Aucun médecin assigné — la RCP reste visible comme non résolue
                                        </span>
                                    </button>

                                    {/* 🅱️ Request replacement */}
                                    <button
                                        onClick={() => setRcpMode('REQUEST')}
                                        className="flex flex-col items-center text-center p-4 rounded-xl border-2 border-blue-200 bg-blue-50 hover:border-blue-400 hover:bg-blue-100 transition-all group"
                                    >
                                        <div className="w-10 h-10 rounded-full bg-blue-100 group-hover:bg-blue-200 flex items-center justify-center mb-2">
                                            <Send className="w-5 h-5 text-blue-600" />
                                        </div>
                                        <span className="font-bold text-sm text-blue-800">Demander remplacement</span>
                                        <span className="text-[11px] text-blue-600 mt-1 leading-tight">
                                            Envoyer une demande à un médecin — il sera marqué présent s'il accepte
                                        </span>
                                    </button>

                                    {/* 🅾️ Direct replacement */}
                                    <button
                                        onClick={() => setRcpMode('DIRECT')}
                                        className="flex flex-col items-center text-center p-4 rounded-xl border-2 border-green-200 bg-green-50 hover:border-green-400 hover:bg-green-100 transition-all group"
                                    >
                                        <div className="w-10 h-10 rounded-full bg-green-100 group-hover:bg-green-200 flex items-center justify-center mb-2">
                                            <UserPlus className="w-5 h-5 text-green-600" />
                                        </div>
                                        <span className="font-bold text-sm text-green-800">Remplacement direct</span>
                                        <span className="text-[11px] text-green-600 mt-1 leading-tight">
                                            Assigner immédiatement un médecin — il est marqué présent et bloqué
                                        </span>
                                    </button>
                                </div>
                            ) : null}

                            {/* 🅱️ REQUEST mode — pick a doctor to request */}
                            {rcpMode === 'REQUEST' && (
                                <div className="animate-in fade-in slide-in-from-bottom-4 duration-200">
                                    <button onClick={() => setRcpMode(null)} className="text-xs text-slate-500 hover:text-slate-700 mb-3 flex items-center gap-1">
                                        ← Retour
                                    </button>
                                    <h4 className="font-bold text-sm text-slate-700 mb-3 flex items-center gap-2">
                                        <Send className="w-4 h-4 text-blue-600" /> Choisir un médecin à qui demander
                                    </h4>
                                    {requestSent ? (
                                        <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700 font-medium">
                                            ✓ Demande envoyée — le médecin recevra une notification
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            {doctors.filter(d => d.id !== assignedDoctor?.id).map(doc => (
                                                <div key={doc.id} className="flex items-center justify-between p-2.5 bg-white border border-slate-200 rounded-lg hover:border-blue-300 transition">
                                                    <span className="text-sm font-medium text-slate-700">{doc.name}</span>
                                                    {/* flag exceptional */}
                                                    {!slot.doctorIds?.includes(doc.id) && (
                                                        <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full border border-amber-200 mr-2">Exceptionnel</span>
                                                    )}
                                                    <button
                                                        onClick={() => handleRequestReplacement(doc.id)}
                                                        disabled={sendingRequestTo === doc.id}
                                                        className="text-xs bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg hover:bg-blue-200 disabled:opacity-50 font-medium"
                                                    >
                                                        {sendingRequestTo === doc.id ? 'Envoi…' : 'Demander'}
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* 🅾️ DIRECT mode — pick a doctor + confirm */}
                            {rcpMode === 'DIRECT' && (
                                <div className="animate-in fade-in slide-in-from-bottom-4 duration-200">
                                    <button onClick={() => setRcpMode(null)} className="text-xs text-slate-500 hover:text-slate-700 mb-3 flex items-center gap-1">
                                        ← Retour
                                    </button>
                                    <h4 className="font-bold text-sm text-slate-700 mb-3 flex items-center gap-2">
                                        <UserPlus className="w-4 h-4 text-green-600" /> Choisir le médecin remplaçant
                                    </h4>
                                    <select
                                        className="w-full text-sm border-slate-300 rounded-lg shadow-sm focus:border-green-500 focus:ring-1 focus:ring-green-500 p-2.5 mb-3"
                                        value={rcpDirectDoctorId}
                                        onChange={e => setRcpDirectDoctorId(e.target.value)}
                                    >
                                        <option value="">-- Choisir un médecin --</option>
                                        {doctors.filter(d => d.id !== assignedDoctor?.id).map(doc => {
                                            const exceptional = !slot.doctorIds?.includes(doc.id);
                                            return (
                                                <option key={doc.id} value={doc.id}>
                                                    {exceptional ? '⚠️ ' : '✓ '}{doc.name}{exceptional ? ' (remplacement exceptionnel)' : ''}
                                                </option>
                                            );
                                        })}
                                    </select>
                                    {rcpDirectDoctorId && !slot.doctorIds?.includes(rcpDirectDoctorId) && (
                                        <div className="mb-3 bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-xs text-amber-800">
                                            ⚠️ Ce médecin n'est pas dans l'affectation initiale de la RCP. Il sera ajouté exceptionnellement et bloqué sur cette demi-journée.
                                        </div>
                                    )}
                                    <button
                                        onClick={handleRcpDirectReplacement}
                                        disabled={!rcpDirectDoctorId || rcpActionLoading}
                                        className="w-full py-2.5 bg-green-600 text-white rounded-lg text-sm font-bold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    >
                                        {rcpActionLoading ? 'Enregistrement…' : 'Confirmer le remplacement'}
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* --- DOUBLE BOOKING DECISION UI (non-RCP) --- */}
                    {!isRcpConflict && conflict?.type === 'DOUBLE_BOOKING' && otherSlot && assignedDoctor && (
                        <div className="mb-8">
                            <h3 className="text-md font-bold text-slate-700 mb-4 text-center">
                                {assignedDoctor.name} est assigné à deux activités simultanément. Que souhaitez-vous faire ?
                            </h3>

                            {/* RCP Specific Warning */}
                            {(slot.type === SlotType.RCP || otherSlot.type === SlotType.RCP) && (
                                <div className="mb-4 bg-purple-50 p-3 rounded-lg border border-purple-200 flex items-center justify-center text-sm text-purple-800 font-medium">
                                    <UserCheck className="w-4 h-4 mr-2" />
                                    Attention : La présence à une RCP est prioritaire si elle a été confirmée.
                                </div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative">
                                {/* LEFT OPTION (Current Slot) */}
                                <div
                                    onClick={() => handleKeepInSlot(slot, otherSlot, 'KEEP_CURRENT')}
                                    className={`relative border-2 rounded-xl p-5 cursor-pointer transition-all hover:scale-[1.02] ${resolutionStrategy === 'KEEP_CURRENT' ? 'border-green-500 bg-green-50 shadow-md' : 'border-slate-200 hover:border-slate-300'}`}
                                >
                                    <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-white px-3 py-1 text-xs font-bold text-slate-500 rounded-full border">OPTION 1</div>
                                    <div className="flex items-center justify-between mb-3">
                                        <span className={`text-xs font-bold px-2 py-1 rounded border flex items-center ${getSlotColor(slot)}`}>
                                            {getSlotIcon(slot)}
                                            {slot.type}
                                        </span>
                                        {resolutionStrategy === 'KEEP_CURRENT' && <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center text-white"><UserCheck className="w-4 h-4" /></div>}
                                    </div>
                                    <h4 className="font-bold text-lg text-slate-800 mb-1">{slot.location}</h4>
                                    <p className="text-sm text-slate-500 mb-4">{slot.subType}</p>

                                    <button className={`w-full py-2 rounded-lg font-bold text-sm ${resolutionStrategy === 'KEEP_CURRENT' ? 'bg-green-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                                        Maintenir ici
                                    </button>
                                    <div className="mt-2 text-xs text-center text-slate-500">
                                        (Remplacer pour {otherSlot.location})
                                    </div>
                                </div>

                                {/* VS Badge */}
                                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10 bg-white rounded-full p-2 shadow border font-bold text-slate-400 text-xs">VS</div>

                                {/* RIGHT OPTION (Other Slot) */}
                                <div
                                    onClick={() => handleKeepInSlot(otherSlot, slot, 'KEEP_OTHER')}
                                    className={`relative border-2 rounded-xl p-5 cursor-pointer transition-all hover:scale-[1.02] ${resolutionStrategy === 'KEEP_OTHER' ? 'border-green-500 bg-green-50 shadow-md' : 'border-slate-200 hover:border-slate-300'}`}
                                >
                                    <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-white px-3 py-1 text-xs font-bold text-slate-500 rounded-full border">OPTION 2</div>
                                    <div className="flex items-center justify-between mb-3">
                                        <span className={`text-xs font-bold px-2 py-1 rounded border flex items-center ${getSlotColor(otherSlot)}`}>
                                            {getSlotIcon(otherSlot)}
                                            {otherSlot.type}
                                        </span>
                                        {resolutionStrategy === 'KEEP_OTHER' && <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center text-white"><UserCheck className="w-4 h-4" /></div>}
                                    </div>
                                    <h4 className="font-bold text-lg text-slate-800 mb-1">{otherSlot.location}</h4>
                                    <p className="text-sm text-slate-500 mb-4">{otherSlot.subType}</p>

                                    <button className={`w-full py-2 rounded-lg font-bold text-sm ${resolutionStrategy === 'KEEP_OTHER' ? 'bg-green-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                                        Maintenir ici
                                    </button>
                                    <div className="mt-2 text-xs text-center text-slate-500">
                                        (Remplacer pour {slot.location})
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* --- REPLACEMENT SUGGESTIONS (non-RCP only) --- */}
                    {!isRcpConflict && resolutionStrategy && targetSlotForReplacement && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-md font-bold text-slate-800 flex items-center">
                                    <RefreshCw className="w-5 h-5 mr-2 text-blue-600" />
                                    Trouver un remplaçant pour : <span className="ml-2 bg-slate-100 px-2 py-1 rounded border border-slate-200">{targetSlotForReplacement.location}</span>
                                </h3>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                                {/* ALGO SUGGESTIONS */}
                                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                                    <h4 className="text-xs font-bold text-slate-400 uppercase mb-3 flex items-center">
                                        <Lightbulb className="w-4 h-4 mr-1 text-yellow-500" /> Suggestions IA / Algorithme
                                    </h4>

                                    {loading ? (
                                        <div className="flex justify-center py-10">
                                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                                        </div>
                                    ) : error ? (
                                        <div className="text-center py-4 text-orange-500 text-sm bg-orange-50 rounded border border-orange-100">
                                            {error}
                                        </div>
                                    ) : suggestions.length === 0 ? (
                                        <div className="text-center py-4 text-slate-400 text-sm">
                                            Aucune suggestion automatique trouvée.
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {suggestions.map((sugg) => {
                                                const doc = doctors.find(d => d.id === sugg.suggestedDoctorId);
                                                if (!doc) return null;
                                                return (
                                                    <div key={sugg.suggestedDoctorId} className="border border-white bg-white rounded-lg p-3 hover:border-blue-300 shadow-sm transition-all group">
                                                        <div className="flex justify-between items-start mb-2">
                                                            <div className="flex items-center">
                                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold mr-3 ${doc.color}`}>
                                                                    {doc.name.substring(0, 2)}
                                                                </div>
                                                                <div>
                                                                    <div className="font-bold text-slate-800 text-sm">{doc.name}</div>
                                                                    <div className="text-xs text-slate-500">{doc.specialty.join(', ')}</div>
                                                                </div>
                                                            </div>
                                                            <span className="inline-flex items-center px-2 py-1 rounded text-xs font-bold bg-green-100 text-green-800 border border-green-200">
                                                                {sugg.score}%
                                                            </span>
                                                        </div>
                                                        <p className="text-xs text-slate-500 mb-3 italic pl-11">
                                                            "{sugg.reasoning}"
                                                        </p>
                                                        <div className="flex gap-2">
                                                            <button
                                                                onClick={() => onResolve(targetSlotForReplacement.id, doc.id)}
                                                                className="flex-1 py-2 bg-slate-100 text-slate-700 hover:bg-blue-600 hover:text-white rounded-lg text-sm font-bold transition-colors flex items-center justify-center"
                                                            >
                                                                Choisir {doc.name}
                                                            </button>
                                                            <button
                                                                onClick={() => handleRequestReplacement(doc.id)}
                                                                disabled={sendingRequestTo === doc.id || requestSent}
                                                                className="text-xs bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg hover:bg-blue-200 disabled:opacity-50"
                                                            >
                                                                {sendingRequestTo === doc.id ? 'Envoi...' : 'Demander remplacement'}
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                    {requestSent && (
                                        <p className="text-sm text-green-600 font-medium text-center py-2">
                                            ✓ Demande envoyée — le médecin recevra une notification
                                        </p>
                                    )}
                                </div>

                                {/* MANUAL & ACTIONS */}
                                <div className="flex flex-col space-y-4">
                                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex-1">
                                        <h4 className="text-xs font-bold text-slate-400 uppercase mb-3 flex items-center">
                                            <User className="w-4 h-4 mr-1 text-slate-500" /> Sélection Manuelle
                                        </h4>
                                        <p className="text-xs text-slate-500 mb-4">Si les suggestions ne conviennent pas, choisissez un médecin dans la liste complète.</p>

                                        <div className="space-y-3">
                                            <select
                                                className="w-full text-sm border-slate-300 rounded-lg shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 p-2.5"
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
                                            <button
                                                disabled={!manualDoctorId}
                                                onClick={() => onResolve(targetSlotForReplacement.id, manualDoctorId)}
                                                className="w-full py-2.5 bg-slate-800 text-white rounded-lg text-sm font-bold hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-md transition-all"
                                            >
                                                Valider le choix manuel
                                            </button>
                                        </div>
                                    </div>

                                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                                        <h4 className="text-xs font-bold text-slate-400 uppercase mb-3 flex items-center">
                                            <Ban className="w-4 h-4 mr-1 text-red-500" /> Actions sur le créneau
                                        </h4>
                                        <div className="grid grid-cols-2 gap-3">
                                            <button
                                                onClick={() => onCloseSlot(targetSlotForReplacement.id)}
                                                className="flex items-center justify-center px-4 py-2 border border-slate-300 bg-white text-slate-600 rounded-lg hover:bg-red-50 hover:text-red-600 hover:border-red-200 text-xs font-bold transition-colors"
                                            >
                                                Fermer le créneau
                                            </button>
                                            <button
                                                onClick={() => onResolve(targetSlotForReplacement.id, "")}
                                                className="flex items-center justify-center px-4 py-2 border border-slate-300 bg-white text-slate-600 rounded-lg hover:bg-orange-50 hover:text-orange-600 hover:border-orange-200 text-xs font-bold transition-colors"
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
                        // Simple Management View (No Conflict)
                        <div className="mt-4">
                            <p className="text-sm text-slate-500 mb-4">Gérez ce créneau normalement. Utilisez les suggestions ci-dessus ou fermez le créneau.</p>
                        </div>
                    )}

                </div>
            </div>
        </div>
    );
};

export default ConflictResolverModal;
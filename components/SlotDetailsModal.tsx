
import React, { useState, useEffect } from 'react';
import { Conflict, Doctor, ScheduleSlot, ReplacementSuggestion, SlotType } from '../types';
import { getAvailableDoctors, getAlgorithmicReplacementSuggestion } from '../services/scheduleService';
import { X, Calculator, UserCheck, AlertTriangle, User, Lightbulb, Ban, RefreshCw, Lock, ShieldAlert } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Button } from '../src/components/ui/Button';

interface Props {
    slot: ScheduleSlot;
    conflict?: Conflict; // Optional, slot might not have conflict
    doctors: Doctor[];
    slots: ScheduleSlot[];
    unavailabilities: any[];
    onClose: () => void;
    onResolve: (slotId: string, newDoctorId: string) => void;
    onCloseSlot: (slotId: string) => void; // Action to "Close" the slot
}

const SlotDetailsModal: React.FC<Props> = ({ slot, conflict, doctors, slots, unavailabilities, onClose, onResolve, onCloseSlot }) => {
    const { profile, isAdmin, isDoctor } = useAuth();
    const [loading, setLoading] = useState(false);
    const [suggestions, setSuggestions] = useState<ReplacementSuggestion[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [manualDoctorId, setManualDoctorId] = useState<string>("");

    const assignedDoctor = doctors.find(d => d.id === slot.assignedDoctorId);

    // Get current user's doctor ID
    const currentDoctorId = profile?.doctor_id;

    // Check if this conflict/slot concerns the current user (doctor)
    // A conflict concerns a doctor if they are the assigned doctor or in secondary doctors
    const concernsCurrentDoctor = currentDoctorId && (
        slot.assignedDoctorId === currentDoctorId ||
        (slot.secondaryDoctorIds && slot.secondaryDoctorIds.includes(currentDoctorId))
    );

    // Admin can always resolve, doctors can only resolve if it concerns them
    // Also allow for consultation boxes that the doctor owns
    const canResolve = isAdmin || (isDoctor && concernsCurrentDoctor);

    useEffect(() => {
        // Only run algos if there is a conflict or if we want to suggest replacements for an open slot
        const fetchSuggestions = async () => {
            // Use the currently assigned doctor as "unavailable" reference if valid, else use a dummy
            const refDoctor = assignedDoctor || doctors[0];
            if (!refDoctor) return;

            setLoading(true);
            setError(null);

            try {
                const availableDocs = getAvailableDoctors(doctors, slots, unavailabilities, slot.day, slot.period, slot.date);

                if (availableDocs.length === 0) {
                    setError("Aucun médecin disponible sur ce créneau.");
                } else {
                    const smartSuggestions = getAlgorithmicReplacementSuggestion(slot, refDoctor, availableDocs, slots);
                    setSuggestions(smartSuggestions);
                }
            } catch (err) {
                setError("Erreur lors du calcul des suggestions.");
            } finally {
                setLoading(false);
            }
        };

        fetchSuggestions();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [slot]);

    // If the user cannot resolve this conflict, show an access denied message
    if (!canResolve) {
        return (
            <div
                className="fixed inset-0 bg-black/40 backdrop-blur-sm z-modal flex items-end md:items-center justify-center p-0 md:p-4"
                onClick={onClose}
            >
                <div
                    className="bg-surface rounded-t-modal md:rounded-modal shadow-modal border border-border/40 overflow-hidden w-full md:max-w-[540px] mx-auto max-h-[90dvh] overflow-y-auto"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="modal-title-slot-denied"
                    onClick={e => e.stopPropagation()}
                >
                    {/* Mobile drag handle */}
                    <div className="w-10 h-1 rounded-full bg-border mx-auto mt-3 mb-1 md:hidden" aria-hidden="true" />

                    {/* Gradient header */}
                    <div className="gradient-primary px-5 py-4 flex items-center justify-between">
                        <h2 id="modal-title-slot-denied" className="text-base font-bold text-white">
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
                            <h3 className="font-bold text-base text-text-base mb-2">Ce créneau ne vous concerne pas</h3>
                            <p className="text-text-muted text-sm">
                                Vous ne pouvez modifier que les créneaux qui vous sont assignés.<br />
                                Seuls les administrateurs peuvent modifier les créneaux des autres médecins.
                            </p>
                        </div>

                        {/* Show slot info */}
                        <div className="bg-muted p-3 rounded-card border border-border mb-4">
                            <div className="text-xs font-bold text-text-muted uppercase">{slot.day} {slot.period === 'Matin' ? 'Matin' : 'Après-Midi'}</div>
                            <div className="font-bold text-text-base text-sm">{slot.location}</div>
                            {assignedDoctor && (
                                <div className="text-sm text-text-muted mt-1">Assigné à : {assignedDoctor.name}</div>
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
                className="bg-surface rounded-t-modal md:rounded-modal shadow-modal border border-border/40 overflow-hidden w-full md:max-w-[540px] mx-auto max-h-[90dvh] overflow-y-auto"
                role="dialog"
                aria-modal="true"
                aria-labelledby="modal-title-slot"
                onClick={e => e.stopPropagation()}
            >
                {/* Mobile drag handle */}
                <div className="w-10 h-1 rounded-full bg-border mx-auto mt-3 mb-1 md:hidden" aria-hidden="true" />

                {/* Gradient header */}
                <div className="gradient-primary px-5 py-4 flex items-center justify-between">
                    <h2 id="modal-title-slot" className="text-base font-bold text-white">
                        {conflict ? 'Conflit détecté' : 'Gérer le Créneau'}
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

                    {/* SLOT INFO */}
                    <div className="mb-6 flex items-center justify-between bg-muted p-3 rounded-card border border-border">
                        <div>
                            <div className="text-xs font-bold text-text-muted uppercase">{slot.day} {slot.period === 'Matin' ? 'Matin' : 'Après-Midi'}</div>
                            <div className="font-bold text-text-base text-sm">{slot.location} {slot.subType && slot.subType !== slot.location ? `(${slot.subType})` : ''}</div>
                        </div>
                        {slot.isClosed ? (
                            <span className="px-2 py-1 bg-border text-text-muted text-xs font-bold rounded-badge flex items-center">
                                <Lock className="w-3 h-3 mr-1" /> Fermé
                            </span>
                        ) : (
                            <div className="text-right">
                                <div className="text-xs text-text-muted">Actuellement :</div>
                                <div className={`font-bold ${assignedDoctor ? 'text-primary' : 'text-text-muted'}`}>
                                    {assignedDoctor ? assignedDoctor.name : 'Non assigné'}
                                </div>
                            </div>
                        )}
                    </div>

                    {conflict && (
                        <div className="mb-6">
                            <p className="text-sm text-text-muted mb-1 font-bold">Nature du conflit :</p>
                            <p className="font-medium text-red-700 bg-red-50 p-3 rounded-card border border-red-100 text-sm">
                                {conflict.description}
                            </p>
                        </div>
                    )}

                    {/* ACTIONS BAR */}
                    <div className="grid grid-cols-2 gap-3 mb-6">
                        {!slot.isClosed ? (
                            <button
                                onClick={() => onCloseSlot(slot.id)}
                                className="flex items-center justify-center px-4 py-2 border border-border text-text-muted rounded-btn hover:bg-muted hover:text-text-base text-sm font-medium transition-colors"
                            >
                                <Ban className="w-4 h-4 mr-2" />
                                Fermer le créneau
                            </button>
                        ) : (
                            <button
                                onClick={() => onResolve(slot.id, "")} // "" triggers removal of override
                                className="flex items-center justify-center px-4 py-2 border border-border text-primary rounded-btn hover:bg-muted text-sm font-medium transition-colors"
                            >
                                <Lock className="w-4 h-4 mr-2" />
                                Réouvrir
                            </button>
                        )}

                        {slot.isLocked && !slot.isClosed && (
                            <button
                                onClick={() => onResolve(slot.id, "")}
                                className="flex items-center justify-center px-4 py-2 border border-border text-text-muted rounded-btn hover:bg-muted text-sm font-medium transition-colors"
                            >
                                <RefreshCw className="w-4 h-4 mr-2" />
                                Reset (Auto)
                            </button>
                        )}
                    </div>

                    {/* ALGORITHMIC SUGGESTIONS */}
                    {!slot.isClosed && (
                        <>
                            <h3 className="text-sm font-semibold text-text-base uppercase tracking-wider mb-3 flex items-center">
                                <Lightbulb className="w-4 h-4 mr-2 text-yellow-500" />
                                Suggestions Intelligentes
                            </h3>

                            {loading && (
                                <div className="flex justify-center py-8">
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                                </div>
                            )}

                            {!loading && error && (
                                <div className="text-center py-2 text-orange-500 text-sm mb-4 bg-orange-50 rounded-card">
                                    {error}
                                </div>
                            )}

                            {!loading && !error && suggestions.length > 0 && (
                                <div className="space-y-3 mb-6">
                                    {suggestions.map((sugg) => {
                                        const doc = doctors.find(d => d.id === sugg.suggestedDoctorId);
                                        if (!doc) return null;
                                        return (
                                            <div key={sugg.suggestedDoctorId} className="border border-border rounded-card p-3 hover:border-primary transition-colors bg-surface">
                                                <div className="flex justify-between items-start mb-1">
                                                    <div className="flex items-center">
                                                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold mr-2 ${doc.color}`}>
                                                            {doc.name.substring(0, 2)}
                                                        </div>
                                                        <span className="font-bold text-text-base text-sm">{doc.name}</span>
                                                    </div>
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded-badge text-[10px] font-medium bg-green-100 text-green-800">
                                                        {sugg.score}% Match
                                                    </span>
                                                </div>
                                                <p className="text-xs text-text-muted mb-2 italic">
                                                    "{sugg.reasoning}"
                                                </p>
                                                <button
                                                    onClick={() => onResolve(slot.id, doc.id)}
                                                    className="w-full py-1.5 px-3 bg-muted text-primary hover:bg-muted/80 border border-border rounded-btn text-xs font-bold transition-colors"
                                                >
                                                    Affecter {doc.name}
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* MANUAL SELECTION */}
                            <div className="border-t border-border pt-4">
                                <h3 className="text-sm font-semibold text-text-base uppercase tracking-wider mb-3 flex items-center">
                                    <User className="w-4 h-4 mr-2 text-text-muted" />
                                    Sélection Manuelle
                                </h3>
                                <div className="flex gap-2">
                                    <select
                                        className="flex-1 text-sm border-border rounded-btn shadow-sm focus:border-primary focus:ring-1 focus:ring-primary"
                                        value={manualDoctorId}
                                        onChange={(e) => setManualDoctorId(e.target.value)}
                                    >
                                        <option value="">-- Choisir un médecin --</option>
                                        {doctors.map(d => (
                                            <option key={d.id} value={d.id}>{d.name}</option>
                                        ))}
                                    </select>
                                    <Button
                                        variant="primary"
                                        size="sm"
                                        disabled={!manualDoctorId}
                                        onClick={() => onResolve(slot.id, manualDoctorId)}
                                    >
                                        Valider
                                    </Button>
                                </div>
                            </div>
                        </>
                    )}

                </div>
            </div>
        </div>
    );
};

export default SlotDetailsModal;

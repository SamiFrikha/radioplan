import React, { useState, useEffect } from 'react';
import { Doctor, RcpException, ScheduleSlot, SlotType } from '../types';
import { Calendar, Clock, Users, X, AlertTriangle, RotateCcw, Save } from 'lucide-react';

interface Props {
    slot: ScheduleSlot;
    doctors: Doctor[];
    existingException?: RcpException;
    onSave: (exception: RcpException) => void;
    onClose: () => void;
    onRemoveException: () => void;
}

const RcpExceptionModal: React.FC<Props> = ({ slot, doctors, existingException, onSave, onClose, onRemoveException }) => {
    // Initialize with existing exception values if available
    const [newDate, setNewDate] = useState<string>(existingException?.newDate || slot.date);
    const [newTime, setNewTime] = useState<string>(existingException?.newTime || slot.time || "");
    const [isCancelled, setIsCancelled] = useState<boolean>(existingException?.isCancelled || false);
    const [customDoctorIds, setCustomDoctorIds] = useState<string[]>([]);

    useEffect(() => {
        // Initialize doctors from exception or current slot assignment
        if (existingException?.customDoctorIds && existingException.customDoctorIds.length > 0) {
            setCustomDoctorIds(existingException.customDoctorIds);
        } else {
            const currentIds = [slot.assignedDoctorId, ...(slot.secondaryDoctorIds || [])].filter(Boolean) as string[];
            setCustomDoctorIds(currentIds);
        }
    }, [slot, existingException]);

    const handleSave = () => {
        // Determine the template ID (remove date suffix from slot ID)
        // Slot ID format: "rcp_id-YYYY-MM-DD"
        const parts = slot.id.split('-');
        // Reconstruct template ID (everything before the date part)
        // Assuming date is always YYYY-MM-DD at the end (3 parts)
        const datePartLength = 3;
        const templateId = parts.slice(0, parts.length - datePartLength).join('-');
        // The "originalDate" is crucial. If this slot was ALREADY moved, we need the ORIGINAL original date.
        // However, in this simplified flow, the slot passed from the calendar IS the visualized slot.
        // If it's a moved slot, finding the original rule is tricky without context.
        // Strategy: We rely on the fact that the Configuration Calendar generates slots with IDs containing the CURRENT date.
        // BUT for exceptions, we need the ORIGINAL date to map it back.
        // Wait, generateScheduleForWeek assigns ID as `templateId-standardDate`.
        // Even if moved, the ID contains the ORIGINAL standard date.
        // So we can extract the original date from the ID!

        const originalDate = parts.slice(parts.length - datePartLength).join('-');

        const exception: RcpException = {
            rcpTemplateId: templateId,
            originalDate: originalDate,
            newDate: newDate !== originalDate ? newDate : undefined,
            newTime: newTime !== slot.time ? newTime : undefined,
            isCancelled: isCancelled,
            customDoctorIds: customDoctorIds // We always save this if edited, logic could be smarter to check diff
        };

        onSave(exception);
    };

    const toggleDoctor = (docId: string) => {
        if (customDoctorIds.includes(docId)) {
            setCustomDoctorIds(customDoctorIds.filter(id => id !== docId));
        } else {
            setCustomDoctorIds([...customDoctorIds, docId]);
        }
    };

    return (
        <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-modal flex items-end md:items-center justify-center p-0 md:p-4"
            onClick={onClose}
        >
            <div
                className="bg-surface rounded-t-[16px] md:rounded-card shadow-modal w-full md:max-w-[540px] mx-auto max-h-[90dvh] overflow-y-auto"
                role="dialog"
                aria-modal="true"
                aria-labelledby="modal-title-rcp"
                onClick={e => e.stopPropagation()}
            >
                <div className="w-8 h-1 bg-border rounded-full mx-auto mt-3 mb-1 md:hidden" aria-hidden="true" />

                {/* HEADER */}
                <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                    <h2 id="modal-title-rcp" className="font-heading font-semibold text-base text-text-base flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-purple-600" aria-hidden="true" />
                        Modifier l'occurrence RCP
                    </h2>
                    <button
                        onClick={onClose}
                        aria-label="Fermer"
                        className="w-11 h-11 flex items-center justify-center rounded-btn hover:bg-muted -mr-2 text-text-muted hover:text-text-base"
                    >
                        <X className="w-5 h-5" aria-hidden="true" />
                    </button>
                </div>

                <div className="px-4 py-4 space-y-6">

                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="font-bold text-text-base text-lg">{slot.subType || slot.location}</h3>
                            <p className="text-sm text-text-muted">Date originale : {slot.id.split('-').slice(-3).reverse().join('/')}</p>
                        </div>
                        {existingException && (
                            <button
                                onClick={onRemoveException}
                                className="text-xs flex items-center text-text-muted hover:text-accent-red border border-border px-2 py-1 rounded-btn hover:bg-red-50 transition-colors"
                            >
                                <RotateCcw className="w-3 h-3 mr-1" /> Rétablir par défaut
                            </button>
                        )}
                    </div>

                    {/* CANCELLATION TOGGLE */}
                    <div
                        className={`p-4 rounded-card border flex items-center justify-between cursor-pointer transition-colors ${isCancelled ? 'bg-red-50 border-red-200' : 'bg-muted border-border'}`}
                        onClick={() => setIsCancelled(!isCancelled)}
                    >
                        <div className="flex items-center">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center mr-3 ${isCancelled ? 'bg-red-100 text-accent-red' : 'bg-surface text-text-muted border border-border'}`}>
                                <AlertTriangle className="w-5 h-5" />
                            </div>
                            <div>
                                <div className={`font-bold ${isCancelled ? 'text-red-800' : 'text-text-base'}`}>Annuler cette séance</div>
                                <div className="text-xs text-text-muted">La séance n'apparaîtra plus dans le planning.</div>
                            </div>
                        </div>
                        <div className={`w-12 h-6 rounded-full p-1 transition-colors ${isCancelled ? 'bg-accent-red' : 'bg-border'}`}>
                            <div className={`bg-surface w-4 h-4 rounded-full shadow-sm transform transition-transform ${isCancelled ? 'translate-x-6' : 'translate-x-0'}`} />
                        </div>
                    </div>

                    {!isCancelled && (
                        <>
                            {/* DATE & TIME */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-text-muted mb-1">Date exceptionnelle</label>
                                    <div className="flex items-center bg-muted border border-border rounded-btn p-2">
                                        <Calendar className="w-4 h-4 text-text-muted mr-2" />
                                        <input
                                            type="date"
                                            value={newDate}
                                            onChange={(e) => setNewDate(e.target.value)}
                                            className="bg-transparent w-full text-sm font-medium outline-none text-text-base"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-text-muted mb-1">Horaire exceptionnel</label>
                                    <div className="flex items-center bg-muted border border-border rounded-btn p-2">
                                        <Clock className="w-4 h-4 text-text-muted mr-2" />
                                        <input
                                            type="time"
                                            value={newTime}
                                            onChange={(e) => setNewTime(e.target.value)}
                                            className="bg-transparent w-full text-sm font-medium outline-none text-text-base"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* PARTICIPANTS */}
                            <div>
                                <label className="block text-xs font-bold text-text-muted mb-2 flex items-center">
                                    <Users className="w-3 h-3 mr-1" /> Participants (Exceptionnel)
                                </label>
                                <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto border border-border rounded-card p-2 bg-muted">
                                    {doctors.map(doc => (
                                        <div
                                            key={doc.id}
                                            onClick={() => toggleDoctor(doc.id)}
                                            className={`flex items-center p-2 rounded-btn cursor-pointer transition-colors ${customDoctorIds.includes(doc.id) ? 'bg-purple-100 border border-purple-200' : 'bg-surface border border-transparent hover:border-border'}`}
                                        >
                                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold mr-2 ${doc.color} ${!customDoctorIds.includes(doc.id) && 'opacity-50'}`}>
                                                {doc.name.substring(0, 2)}
                                            </div>
                                            <span className={`text-xs ${customDoctorIds.includes(doc.id) ? 'font-bold text-purple-900' : 'text-text-muted'}`}>{doc.name}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}

                </div>

                <div className="px-4 py-3 border-t border-border flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 text-text-muted hover:text-text-base text-sm font-medium">Annuler</button>
                    <button
                        onClick={handleSave}
                        className="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-btn shadow text-sm font-bold flex items-center"
                    >
                        <Save className="w-4 h-4 mr-2" />
                        Appliquer l'exception
                    </button>
                </div>

            </div>
        </div>
    );
};

export default RcpExceptionModal;

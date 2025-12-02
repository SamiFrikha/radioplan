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
  const [newDate, setNewDate] = useState<string>(slot.date);
  const [newTime, setNewTime] = useState<string>(slot.time || "");
  const [isCancelled, setIsCancelled] = useState<boolean>(existingException?.isCancelled || false);
  const [customDoctorIds, setCustomDoctorIds] = useState<string[]>([]);

  useEffect(() => {
      // Initialize doctors from current slot assignment
      const currentIds = [slot.assignedDoctorId, ...(slot.secondaryDoctorIds || [])].filter(Boolean) as string[];
      setCustomDoctorIds(currentIds);
  }, [slot]);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* HEADER */}
        <div className="bg-purple-600 p-4 flex justify-between items-center text-white">
            <h2 className="font-bold text-lg flex items-center">
                <Calendar className="w-5 h-5 mr-2" />
                Modifier l'occurrence RCP
            </h2>
            <button onClick={onClose} className="hover:bg-purple-700 p-1 rounded-full"><X className="w-5 h-5"/></button>
        </div>

        <div className="p-6 space-y-6">
            
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="font-bold text-slate-800 text-lg">{slot.subType || slot.location}</h3>
                    <p className="text-sm text-slate-500">Date originale : {slot.id.split('-').slice(-3).reverse().join('/')}</p>
                </div>
                {existingException && (
                    <button 
                        onClick={onRemoveException}
                        className="text-xs flex items-center text-slate-500 hover:text-red-600 border border-slate-200 px-2 py-1 rounded hover:bg-red-50 transition-colors"
                    >
                        <RotateCcw className="w-3 h-3 mr-1" /> Rétablir par défaut
                    </button>
                )}
            </div>

            {/* CANCELLATION TOGGLE */}
            <div className={`p-4 rounded-lg border flex items-center justify-between cursor-pointer transition-colors ${isCancelled ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'}`} onClick={() => setIsCancelled(!isCancelled)}>
                <div className="flex items-center">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center mr-3 ${isCancelled ? 'bg-red-100 text-red-600' : 'bg-white text-slate-400 border'}`}>
                        <AlertTriangle className="w-5 h-5" />
                    </div>
                    <div>
                        <div className={`font-bold ${isCancelled ? 'text-red-800' : 'text-slate-700'}`}>Annuler cette séance</div>
                        <div className="text-xs text-slate-500">La séance n'apparaîtra plus dans le planning.</div>
                    </div>
                </div>
                <div className={`w-12 h-6 rounded-full p-1 transition-colors ${isCancelled ? 'bg-red-500' : 'bg-slate-300'}`}>
                    <div className={`bg-white w-4 h-4 rounded-full shadow-sm transform transition-transform ${isCancelled ? 'translate-x-6' : 'translate-x-0'}`} />
                </div>
            </div>

            {!isCancelled && (
                <>
                    {/* DATE & TIME */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">Date exceptionnelle</label>
                            <div className="flex items-center bg-slate-50 border border-slate-200 rounded p-2">
                                <Calendar className="w-4 h-4 text-slate-400 mr-2" />
                                <input 
                                    type="date" 
                                    value={newDate}
                                    onChange={(e) => setNewDate(e.target.value)}
                                    className="bg-transparent w-full text-sm font-medium outline-none text-slate-700"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">Horaire exceptionnel</label>
                            <div className="flex items-center bg-slate-50 border border-slate-200 rounded p-2">
                                <Clock className="w-4 h-4 text-slate-400 mr-2" />
                                <input 
                                    type="time" 
                                    value={newTime}
                                    onChange={(e) => setNewTime(e.target.value)}
                                    className="bg-transparent w-full text-sm font-medium outline-none text-slate-700"
                                />
                            </div>
                        </div>
                    </div>

                    {/* PARTICIPANTS */}
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-2 flex items-center">
                            <Users className="w-3 h-3 mr-1" /> Participants (Exceptionnel)
                        </label>
                        <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto border rounded p-2 bg-slate-50">
                            {doctors.map(doc => (
                                <div 
                                    key={doc.id} 
                                    onClick={() => toggleDoctor(doc.id)}
                                    className={`flex items-center p-2 rounded cursor-pointer transition-colors ${customDoctorIds.includes(doc.id) ? 'bg-purple-100 border border-purple-200' : 'bg-white border border-transparent hover:border-slate-200'}`}
                                >
                                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold mr-2 ${doc.color} ${!customDoctorIds.includes(doc.id) && 'opacity-50'}`}>
                                        {doc.name.substring(0,2)}
                                    </div>
                                    <span className={`text-xs ${customDoctorIds.includes(doc.id) ? 'font-bold text-purple-900' : 'text-slate-600'}`}>{doc.name}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </>
            )}

        </div>

        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end space-x-3">
            <button onClick={onClose} className="px-4 py-2 text-slate-600 hover:text-slate-800 text-sm font-medium">Annuler</button>
            <button 
                onClick={handleSave}
                className="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg shadow text-sm font-bold flex items-center"
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
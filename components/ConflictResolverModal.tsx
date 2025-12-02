
import React, { useState, useEffect, useMemo, useContext } from 'react';
import { Conflict, Doctor, ScheduleSlot, ReplacementSuggestion, SlotType } from '../types';
import { getAvailableDoctors, getAlgorithmicReplacementSuggestion, findConflictingSlot } from '../services/scheduleService';
import { X, UserCheck, AlertTriangle, User, Lightbulb, Ban, RefreshCw, Lock, ArrowRight, Activity, Calendar } from 'lucide-react';
import { AppContext } from '../App';

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
  const { shiftHistory } = useContext(AppContext);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<ReplacementSuggestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [manualDoctorId, setManualDoctorId] = useState<string>("");
  
  // Double Booking Logic
  const assignedDoctor = doctors.find(d => d.id === slot.assignedDoctorId);
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
                  const smartSuggestions = getAlgorithmicReplacementSuggestion(targetSlotForReplacement, assignedDoctor, filteredDocs, slots, shiftHistory);
                  setSuggestions(smartSuggestions);
              }
          } catch (err) {
              setError("Erreur lors du calcul des suggestions.");
          } finally {
              setLoading(false);
          }
      };

      fetchSuggestions();
  }, [targetSlotForReplacement, assignedDoctor, doctors, slots, unavailabilities, shiftHistory]);

  // --- HANDLERS ---
  
  const handleKeepInSlot = (slotToKeep: ScheduleSlot, slotToReplace: ScheduleSlot, strategy: 'KEEP_CURRENT' | 'KEEP_OTHER') => {
      setResolutionStrategy(strategy);
      setTargetSlotForReplacement(slotToReplace);
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
            
            {/* --- DOUBLE BOOKING DECISION UI --- */}
            {conflict?.type === 'DOUBLE_BOOKING' && otherSlot && assignedDoctor && (
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
                                {resolutionStrategy === 'KEEP_CURRENT' && <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center text-white"><UserCheck className="w-4 h-4"/></div>}
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
                                {resolutionStrategy === 'KEEP_OTHER' && <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center text-white"><UserCheck className="w-4 h-4"/></div>}
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
            
            {/* --- REPLACEMENT SUGGESTIONS --- */}
            {resolutionStrategy && targetSlotForReplacement && (
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
                                                <button
                                                    onClick={() => onResolve(targetSlotForReplacement.id, doc.id)}
                                                    className="w-full py-2 bg-slate-100 text-slate-700 hover:bg-blue-600 hover:text-white rounded-lg text-sm font-bold transition-colors flex items-center justify-center"
                                                >
                                                    Choisir {doc.name}
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
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
                                        <option value="">-- Choisir un médecin --</option>
                                        {doctors.filter(d => d.id !== assignedDoctor?.id).map(d => (
                                            <option key={d.id} value={d.id}>{d.name}</option>
                                        ))}
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
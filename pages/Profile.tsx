import React, { useContext, useState, useEffect } from 'react';
import { AppContext } from '../App';
import { 
    Calendar, Save, Trash2, ArrowRight, UserCheck, Lock, Plus, 
    UserPlus, Ban, Briefcase, Edit, Bell, ChevronLeft, ChevronRight, 
    CheckCircle2, XCircle, AlertTriangle, Clock, RotateCcw, Settings, 
    Users, Palette, AlertOctagon, Shield, Key
} from 'lucide-react';
import { DayOfWeek, SlotType, Doctor, ScheduleTemplateSlot, RcpAttendance, Period, RcpManualInstance, UserRole } from '../types';
import { getDateForDayOfWeek, isFrenchHoliday } from '../services/scheduleService';

// --- HELPER: Count Notifications ---
const countPendingNotifications = (
    doctor: Doctor, 
    template: ScheduleTemplateSlot[], 
    rcpAttendance: RcpAttendance
): number => {
    let pendingCount = 0;
    const today = new Date();
    const currentMonday = new Date(today);
    const day = currentMonday.getDay();
    const diff = currentMonday.getDate() - day + (day === 0 ? -6 : 1);
    currentMonday.setDate(diff);
    currentMonday.setHours(0,0,0,0);

    const targetMonday = new Date(currentMonday);
    targetMonday.setDate(targetMonday.getDate() + 7); // Next Week

    template.forEach(t => {
        if (t.type === 'RCP') {
            const isInvolved = 
                (t.doctorIds && t.doctorIds.includes(doctor.id)) ||
                (t.defaultDoctorId === doctor.id) ||
                (t.secondaryDoctorIds && t.secondaryDoctorIds.includes(doctor.id)) ||
                (t.backupDoctorId === doctor.id);

            if (isInvolved) {
                const slotDate = getDateForDayOfWeek(targetMonday, t.day);
                const generatedId = `${t.id}-${slotDate}`;
                const decision = rcpAttendance[generatedId]?.[doctor.id];
                if (!decision) pendingCount++;
            }
        }
    });
    return pendingCount;
};

// --- PREDEFINED COLORS FOR NEW DOCTORS ---
const DOCTOR_COLORS = [
    { label: 'Bleu', class: 'bg-blue-100 text-blue-800' },
    { label: 'Vert', class: 'bg-green-100 text-green-800' },
    { label: 'Rouge', class: 'bg-red-100 text-red-800' },
    { label: 'Jaune', class: 'bg-yellow-100 text-yellow-800' },
    { label: 'Violet', class: 'bg-purple-100 text-purple-800' },
    { label: 'Indigo', class: 'bg-indigo-100 text-indigo-800' },
    { label: 'Rose', class: 'bg-pink-100 text-pink-800' },
    { label: 'Orange', class: 'bg-orange-100 text-orange-800' },
    { label: 'Gris', class: 'bg-slate-200 text-slate-800' },
    { label: 'Cyan', class: 'bg-cyan-100 text-cyan-800' },
];

const Profile: React.FC = () => {
  const { 
      unavailabilities, 
      addUnavailability, 
      removeUnavailability, 
      currentUser, 
      setCurrentUser, 
      doctors, 
      addDoctor, 
      updateDoctor, 
      removeDoctor,
      activityDefinitions,
      template,
      rcpTypes, 
      rcpAttendance,
      setRcpAttendance,
      rcpExceptions,
      addRcpException,
      removeRcpException,
      roles 
  } = useContext(AppContext);
  
  // --- TABS STATE ---
  const [activeTab, setActiveTab] = useState<'LOGIN' | 'MANAGE'>('LOGIN');

  // --- ABSENCE FORM STATE ---
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [absencePeriod, setAbsencePeriod] = useState<'ALL_DAY' | Period>('ALL_DAY');
  const [reason, setReason] = useState('CONGRES');
  const [customReason, setCustomReason] = useState("");

  // --- ADD DOCTOR FORM STATE ---
  const [newDocName, setNewDocName] = useState("");
  const [newDocSpecialty, setNewDocSpecialty] = useState("");
  const [newDocColor, setNewDocColor] = useState(DOCTOR_COLORS[0].class);
  const [newDocRole, setNewDocRole] = useState<string>(''); // Default empty
  const [newDocPassword, setNewDocPassword] = useState("");

  // --- EDIT PROFILE (SELF) STATE ---
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editName, setEditName] = useState("");
  const [editSpecialty, setEditSpecialty] = useState("");

  // --- EDIT DOCTOR (ADMIN) STATE ---
  const [editingDoctor, setEditingDoctor] = useState<Doctor | null>(null);
  const [editDocName, setEditDocName] = useState("");
  const [editDocSpecialty, setEditDocSpecialty] = useState("");
  const [editDocColor, setEditDocColor] = useState("");
  const [editDocRole, setEditDocRole] = useState<string>('DOCTOR');
  const [editDocPassword, setEditDocPassword] = useState("");

  // --- NOTIFICATIONS STATE ---
  const [notifWeekOffset, setNotifWeekOffset] = useState(0); 

  // --- EXCEPTION MODAL STATE ---
  const [exceptionTarget, setExceptionTarget] = useState<{templateId: string, date: string} | null>(null);
  const [exceptionNewDate, setExceptionNewDate] = useState("");

  // --- DELETE CONFIRMATION MODAL STATE ---
  const [doctorToDelete, setDoctorToDelete] = useState<{id: string, name: string} | null>(null);

  useEffect(() => {
      if(currentUser) {
          setEditName(currentUser.name);
          setEditSpecialty((currentUser.specialty || []).join(', '));
          setNotifWeekOffset(0);
      }
      // Set default role if available
      if (roles.length > 0 && !newDocRole) {
          setNewDocRole(roles[0].id);
      }
  }, [currentUser, roles]);

  const handleCreateDoctor = (e: React.FormEvent) => {
      e.preventDefault();
      if(newDocName.trim()) {
          const formattedName = newDocName.trim().startsWith('Dr') || newDocName.trim().startsWith('Pr') 
                                ? newDocName.trim() 
                                : `Dr ${newDocName.trim()}`;
          
          addDoctor({
              id: `doc_${Date.now()}`,
              name: formattedName,
              specialty: newDocSpecialty.split(',').map(s => s.trim()).filter(Boolean),
              color: newDocColor,
              role: newDocRole,
              email: `${formattedName.replace(/\s+/g, '.').toLowerCase()}@hopital.fr`, 
              password: newDocPassword, // Save Password
              excludedDays: [],
              excludedActivities: [],
              excludedSlotTypes: [],
              tempsDeTravail: 1.0
          });
          setNewDocName("");
          setNewDocSpecialty("");
          setNewDocPassword("");
          // Reset role to default if possible
          setNewDocRole(roles[0]?.id || 'DOCTOR');
      }
  }

  const handleOpenEditDoctor = (doc: Doctor) => {
      setEditingDoctor(doc);
      setEditDocName(doc.name);
      setEditDocSpecialty((doc.specialty || []).join(', '));
      setEditDocColor(doc.color || 'bg-slate-200 text-slate-800');
      setEditDocRole(doc.role);
      setEditDocPassword(doc.password || "");
  };

  const handleSaveEditedDoctor = () => {
      if (editingDoctor && editDocName.trim()) {
          updateDoctor({
              ...editingDoctor,
              name: editDocName,
              specialty: editDocSpecialty.split(',').map(s => s.trim()).filter(Boolean),
              color: editDocColor,
              role: editDocRole,
              password: editDocPassword // Update password
          });
          setEditingDoctor(null);
      }
  };

  const handleRequestDelete = (e: React.MouseEvent, doc: Doctor) => {
      e.preventDefault();
      e.stopPropagation();
      setDoctorToDelete({ id: doc.id, name: doc.name });
  };

  const confirmDeleteDoctor = () => {
      if (doctorToDelete) {
          removeDoctor(doctorToDelete.id);
          setDoctorToDelete(null);
      }
  };

  const cancelDeleteDoctor = () => {
      setDoctorToDelete(null);
  };

  const handleSaveProfile = () => {
      if(currentUser && editName.trim()) {
          const specs = editSpecialty.split(',').map(s => s.trim()).filter(Boolean);
          updateDoctor({
              ...currentUser,
              name: editName,
              specialty: specs
          });
          setIsEditingProfile(false);
      }
  }

  const handleAddUnavailability = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    addUnavailability({
        id: Date.now().toString(),
        doctorId: currentUser.id,
        startDate: startDate,
        endDate: endDate,
        period: absencePeriod,
        reason: reason === 'AUTRE' ? customReason : reason,
    });
    setCustomReason("");
  };

  const toggleDayExclusion = (day: DayOfWeek) => {
      if(!currentUser) return;
      // SAFE CHECK: ensure array exists
      const currentExclusions = currentUser.excludedDays || [];
      let newExclusions = currentExclusions.includes(day)
          ? currentExclusions.filter(d => d !== day)
          : [...currentExclusions, day];
      updateDoctor({...currentUser, excludedDays: newExclusions});
      setCurrentUser({...currentUser, excludedDays: newExclusions});
  }

  const toggleActivityExclusion = (actId: string) => {
      if(!currentUser) return;
      // SAFE CHECK: ensure array exists
      const currentExclusions = currentUser.excludedActivities || [];
      let newExclusions = currentExclusions.includes(actId)
          ? currentExclusions.filter(a => a !== actId)
          : [...currentExclusions, actId];
      updateDoctor({...currentUser, excludedActivities: newExclusions});
      setCurrentUser({...currentUser, excludedActivities: newExclusions});
  }

  const toggleSlotTypeExclusion = (type: SlotType) => {
      if(!currentUser) return;
      // SAFE CHECK: ensure array exists
      const currentExclusions = currentUser.excludedSlotTypes || [];
      let newExclusions = currentExclusions.includes(type)
          ? currentExclusions.filter(t => t !== type)
          : [...currentExclusions, type];
      updateDoctor({...currentUser, excludedSlotTypes: newExclusions});
      setCurrentUser({...currentUser, excludedSlotTypes: newExclusions});
  }

  const getUpcomingRcps = () => {
      if (!currentUser) return [];

      const today = new Date();
      const currentMonday = new Date(today);
      const day = currentMonday.getDay();
      const diff = currentMonday.getDate() - day + (day === 0 ? -6 : 1);
      currentMonday.setDate(diff);
      currentMonday.setHours(0,0,0,0);
      
      const targetMonday = new Date(currentMonday);
      targetMonday.setDate(targetMonday.getDate() + (notifWeekOffset * 7));

      const relevantTemplates = template.filter(t => 
          t.type === SlotType.RCP && (
              (t.doctorIds && t.doctorIds.includes(currentUser.id)) ||
              (t.defaultDoctorId === currentUser.id) ||
              (t.secondaryDoctorIds && t.secondaryDoctorIds.includes(currentUser.id)) ||
              (t.backupDoctorId === currentUser.id)
          )
      );

      const standardRcps = relevantTemplates.map(t => {
          const slotDate = getDateForDayOfWeek(targetMonday, t.day);
          const exception = rcpExceptions.find(ex => ex.rcpTemplateId === t.id && ex.originalDate === slotDate);
          
          const displayDate = exception?.newDate || slotDate;
          const displayTime = exception?.newTime || t.time || 'N/A';
          const holiday = isFrenchHoliday(displayDate);
          
          const generatedId = `${t.id}-${slotDate}`;
          const currentMap = rcpAttendance[generatedId] || {};
          const myStatus = currentMap[currentUser.id];

          const colleaguesStatus = Object.keys(currentMap)
             .filter(dId => dId !== currentUser.id)
             .map(dId => {
                 const dName = doctors.find(d => d.id === dId)?.name || 'Inconnu';
                 const status = currentMap[dId];
                 return { name: dName, status };
             });

          return {
              template: t,
              date: displayDate,
              time: displayTime,
              originalDate: slotDate,
              generatedId,
              myStatus,
              colleaguesStatus,
              holiday,
              isMoved: !!exception?.newDate,
              isTimeChanged: !!exception?.newTime,
              isCancelled: exception?.isCancelled,
              isManual: false
          };
      });

      const targetWeekEnd = new Date(targetMonday);
      targetWeekEnd.setDate(targetWeekEnd.getDate() + 6);
      const startStr = targetMonday.toISOString().split('T')[0];
      const endStr = targetWeekEnd.toISOString().split('T')[0];

      const manualRcps = rcpTypes
        .filter(r => r.frequency === 'MANUAL' && r.manualInstances)
        .flatMap(r => r.manualInstances!.map(i => ({...i, rcpName: r.name, rcpId: r.id})))
        .filter(inst => {
            if (inst.date < startStr || inst.date > endStr) return false;
            // SAFE CHECK: doctorIds might be null in DB
            const doctorIds = inst.doctorIds || [];
            return doctorIds.includes(currentUser.id) || inst.backupDoctorId === currentUser.id;
        })
        .map(inst => {
             const generatedId = `manual-rcp-${inst.rcpId}-${inst.id}`;
             const holiday = isFrenchHoliday(inst.date);
             const currentMap = rcpAttendance[generatedId] || {};
             const myStatus = currentMap[currentUser.id];
             
             const colleaguesStatus = Object.keys(currentMap)
             .filter(dId => dId !== currentUser.id)
             .map(dId => {
                 const dName = doctors.find(d => d.id === dId)?.name || 'Inconnu';
                 const status = currentMap[dId];
                 return { name: dName, status };
             });

             const mockTemplate: any = {
                 id: inst.rcpId,
                 location: inst.rcpName,
                 day: 'MANUAL' as any,
                 backupDoctorId: inst.backupDoctorId
             };

             return {
                  template: mockTemplate,
                  date: inst.date,
                  time: inst.time,
                  originalDate: inst.date,
                  generatedId,
                  myStatus,
                  colleaguesStatus,
                  holiday,
                  isMoved: false,
                  isTimeChanged: false,
                  isCancelled: false,
                  isManual: true
             };
        });


      return [...standardRcps, ...manualRcps].sort((a,b) => (a?.date || '').localeCompare(b?.date || ''));
  };

  const handleAttendanceToggle = (slotId: string, status: 'PRESENT' | 'ABSENT') => {
      if (!currentUser) return;
      const currentMap = rcpAttendance[slotId] || {};
      const newMap = { ...currentMap, [currentUser.id]: status };
      setRcpAttendance({ ...rcpAttendance, [slotId]: newMap });
  };

  const handleClearDecision = (slotId: string) => {
      if (!currentUser) return;
      const currentMap = rcpAttendance[slotId] || {};
      const newMap = { ...currentMap };
      delete newMap[currentUser.id];
      setRcpAttendance({ ...rcpAttendance, [slotId]: newMap });
  };

  const handleCancelRcp = (templateId: string, date: string) => {
      if (window.confirm("Annuler cette RCP pour cette date ?")) {
          addRcpException({ rcpTemplateId: templateId, originalDate: date, isCancelled: true });
      }
  }

  const handleRestoreRcp = (templateId: string, date: string) => {
      removeRcpException(templateId, date);
  }

  const handleMoveRcp = () => {
      if (!exceptionTarget || !exceptionNewDate) return;
      addRcpException({
          rcpTemplateId: exceptionTarget.templateId,
          originalDate: exceptionTarget.date,
          newDate: exceptionNewDate,
      });
      setExceptionTarget(null);
      setExceptionNewDate("");
  }

  const getNotificationWeekLabel = () => {
      const today = new Date();
      const currentMonday = new Date(today);
      const day = currentMonday.getDay();
      const diff = currentMonday.getDate() - day + (day === 0 ? -6 : 1);
      currentMonday.setDate(diff);
      
      const targetMonday = new Date(currentMonday);
      targetMonday.setDate(targetMonday.getDate() + (notifWeekOffset * 7));
      
      if (notifWeekOffset === 0) return "Cette Semaine";
      if (notifWeekOffset === 1) return "Semaine Prochaine";
      return `Semaine du ${targetMonday.getDate()}/${targetMonday.getMonth()+1}`;
  };

  // Only the Manage Team View has significant changes to include Password
  if (!currentUser) {
      return (
          <div className="flex flex-col h-full items-center justify-center p-4">
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl border border-slate-200 overflow-hidden flex flex-col min-h-[500px]">
                  
                  {/* TABS HEADER */}
                  <div className="flex border-b border-slate-200">
                      <button 
                          onClick={() => setActiveTab('LOGIN')}
                          className={`flex-1 py-4 text-sm font-bold flex items-center justify-center transition-colors ${activeTab === 'LOGIN' ? 'bg-white text-blue-600 border-b-2 border-blue-600' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}
                      >
                          <UserCheck className="w-4 h-4 mr-2" />
                          Connexion
                      </button>
                      <button 
                          onClick={() => setActiveTab('MANAGE')}
                          className={`flex-1 py-4 text-sm font-bold flex items-center justify-center transition-colors ${activeTab === 'MANAGE' ? 'bg-white text-purple-600 border-b-2 border-purple-600' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}
                      >
                          <Users className="w-4 h-4 mr-2" />
                          Gestion Équipe
                      </button>
                  </div>

                  <div className="p-6 flex-1 overflow-y-auto relative">
                      
                      {/* --- TAB: LOGIN --- */}
                      {activeTab === 'LOGIN' && (
                          <div className="space-y-4">
                             <div className="text-center text-slate-500 py-10">
                                  <p className="mb-2">Veuillez utiliser la page de connexion principale.</p>
                                  <a href="#/login" className="text-blue-600 font-bold hover:underline">Aller à la page Login</a>
                              </div>
                          </div>
                      )}

                      {/* --- TAB: MANAGE (CRUD) --- */}
                      {activeTab === 'MANAGE' && (
                          <div className="space-y-6">
                              
                              {/* ADD FORM */}
                              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                                  <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center">
                                      <UserPlus className="w-4 h-4 mr-2" /> Ajouter un médecin
                                  </h3>
                                  <form onSubmit={handleCreateDoctor} className="space-y-3">
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                          <input 
                                              type="text" 
                                              placeholder="Nom (ex: CHEN)"
                                              className="border rounded p-2 text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                                              value={newDocName}
                                              onChange={e => setNewDocName(e.target.value)}
                                              required
                                          />
                                          <input 
                                              type="text" 
                                              placeholder="Spécialités (ex: Sein, Uro)"
                                              className="border rounded p-2 text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                                              value={newDocSpecialty}
                                              onChange={e => setNewDocSpecialty(e.target.value)}
                                          />
                                      </div>
                                      
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                          <div>
                                              <label className="text-xs font-bold text-slate-500 mb-1 block">Rôle</label>
                                              <select 
                                                value={newDocRole}
                                                onChange={e => setNewDocRole(e.target.value)}
                                                className="w-full border rounded p-2 text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                                              >
                                                  {roles.map(r => (
                                                      <option key={r.id} value={r.id}>{r.name}</option>
                                                  ))}
                                              </select>
                                          </div>
                                          <div>
                                                <label className="text-xs font-bold text-slate-500 mb-1 block">Couleur</label>
                                                <div className="flex flex-wrap gap-2">
                                                    {DOCTOR_COLORS.map((col, idx) => (
                                                        <button
                                                            key={idx}
                                                            type="button"
                                                            onClick={() => setNewDocColor(col.class)}
                                                            className={`w-6 h-6 rounded-full border-2 ${col.class} ${newDocColor === col.class ? 'border-slate-600 scale-110 shadow-md' : 'border-white'}`}
                                                            title={col.label}
                                                        />
                                                    ))}
                                                </div>
                                          </div>
                                      </div>

                                      {/* PASSWORD FIELD */}
                                      <div>
                                          <label className="text-xs font-bold text-slate-500 mb-1 block">Mot de passe initial</label>
                                          <input 
                                              type="text" 
                                              placeholder="Mot de passe..."
                                              className="w-full border rounded p-2 text-sm focus:ring-2 focus:ring-purple-500 outline-none font-mono"
                                              value={newDocPassword}
                                              onChange={e => setNewDocPassword(e.target.value)}
                                              required
                                          />
                                          <p className="text-[10px] text-slate-400 mt-1">Le médecin pourra l'utiliser pour se connecter.</p>
                                      </div>

                                      <button type="submit" className="w-full bg-purple-600 text-white py-2 rounded-lg text-sm font-bold hover:bg-purple-700 shadow-sm">
                                          Créer le profil
                                      </button>
                                  </form>
                              </div>

                              {/* LIST FOR MANAGEMENT */}
                              <div>
                                  <h3 className="text-sm font-bold text-slate-700 mb-3">Effectifs Actuels ({doctors.length})</h3>
                                  <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                                      {doctors.map(doc => (
                                          <div key={doc.id} className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-lg shadow-sm">
                                              <div className="flex items-center">
                                                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold mr-3 ${doc.color || 'bg-slate-200'}`}>
                                                      {doc.name.substring(0,2)}
                                                  </div>
                                                  <div>
                                                      <div className="text-sm font-bold text-slate-800 flex items-center">
                                                          {doc.name}
                                                          {doc.role === 'ADMIN' && <Shield className="w-3 h-3 text-purple-600 ml-1" />}
                                                      </div>
                                                      <div className="text-xs text-slate-500">
                                                          {/* SHOW ROLE NAME, NOT ID */}
                                                          {roles.find(r => r.id === doc.role)?.name || doc.role}
                                                      </div>
                                                  </div>
                                              </div>
                                              <div className="flex items-center space-x-1">
                                                  <button
                                                      onClick={() => handleOpenEditDoctor(doc)}
                                                      className="text-slate-400 hover:text-blue-600 hover:bg-blue-50 p-2 rounded transition-colors"
                                                      title="Modifier"
                                                  >
                                                      <Edit className="w-4 h-4" />
                                                  </button>
                                                  <button 
                                                      type="button"
                                                      onClick={(e) => handleRequestDelete(e, doc)}
                                                      className="text-slate-400 hover:text-red-600 hover:bg-red-50 p-2 rounded transition-colors cursor-pointer"
                                                      title="Supprimer définitivement"
                                                  >
                                                      <Trash2 className="w-4 h-4" />
                                                  </button>
                                              </div>
                                          </div>
                                      ))}
                                      {doctors.length === 0 && (
                                          <div className="text-center text-slate-400 text-xs py-4">
                                              Aucun médecin. Ajoutez-en un ci-dessus.
                                          </div>
                                      )}
                                  </div>
                              </div>
                          </div>
                      )}
                  </div>
                  
                  {/* EDIT DOCTOR MODAL */}
                  {editingDoctor && (
                      <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 border border-slate-200 animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
                                <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center">
                                    <Settings className="w-5 h-5 mr-2 text-slate-600" />
                                    Modifier le profil
                                </h3>
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Nom</label>
                                        <input 
                                            type="text" 
                                            value={editDocName}
                                            onChange={(e) => setEditDocName(e.target.value)}
                                            className="w-full border rounded p-2 text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Spécialités</label>
                                        <input 
                                            type="text" 
                                            value={editDocSpecialty}
                                            onChange={(e) => setEditDocSpecialty(e.target.value)}
                                            className="w-full border rounded p-2 text-sm"
                                        />
                                    </div>
                                    
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Rôle Système</label>
                                        <select 
                                            value={editDocRole}
                                            onChange={(e) => setEditDocRole(e.target.value)}
                                            className="w-full border rounded p-2 text-sm bg-slate-50"
                                        >
                                            {roles.map(r => (
                                                <option key={r.id} value={r.id}>{r.name}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Nouveau Mot de passe</label>
                                        <div className="flex items-center">
                                            <Key className="w-4 h-4 text-slate-400 mr-2" />
                                            <input 
                                                type="text" 
                                                value={editDocPassword}
                                                onChange={(e) => setEditDocPassword(e.target.value)}
                                                placeholder="Laisser vide pour ne pas changer"
                                                className="w-full border rounded p-2 text-sm font-mono"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Couleur</label>
                                        <div className="flex flex-wrap gap-2">
                                            {DOCTOR_COLORS.map((col, idx) => (
                                                <button
                                                    key={idx}
                                                    type="button"
                                                    onClick={() => setEditDocColor(col.class)}
                                                    className={`w-6 h-6 rounded-full border-2 ${col.class} ${editDocColor === col.class ? 'border-slate-600 scale-110 shadow-md' : 'border-white'}`}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex justify-end space-x-3 mt-6">
                                    <button onClick={() => setEditingDoctor(null)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded">Annuler</button>
                                    <button onClick={handleSaveEditedDoctor} className="px-4 py-2 bg-blue-600 text-white rounded font-bold hover:bg-blue-700 shadow">Enregistrer</button>
                                </div>
                          </div>
                      </div>
                  )}

                  {/* DELETE CONFIRMATION MODAL */}
                  {doctorToDelete && (
                      <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 border border-red-100 animate-in fade-in zoom-in-95 duration-200">
                              <div className="flex flex-col items-center text-center mb-6">
                                  <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-3">
                                      <AlertOctagon className="w-6 h-6 text-red-600" />
                                  </div>
                                  <h3 className="text-lg font-bold text-slate-900">Supprimer le médecin ?</h3>
                                  <p className="text-sm text-slate-500 mt-2">
                                      Vous êtes sur le point de supprimer <strong className="text-slate-800">{doctorToDelete.name}</strong>.
                                  </p>
                                  <p className="text-xs text-red-500 mt-2 bg-red-50 p-2 rounded border border-red-100">
                                      Cette action est irréversible. Toutes les affectations (planning, historique, règles) seront perdues.
                                  </p>
                              </div>
                              <div className="flex space-x-3">
                                  <button 
                                      onClick={cancelDeleteDoctor}
                                      className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg font-medium hover:bg-slate-50"
                                  >
                                      Annuler
                                  </button>
                                  <button 
                                      onClick={confirmDeleteDoctor}
                                      className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 shadow-md"
                                  >
                                      Confirmer
                                  </button>
                              </div>
                          </div>
                      </div>
                  )}

              </div>
          </div>
      )
  }

  // --- VIEW: LOGGED IN PROFILE DASHBOARD ---
  // (Existing content for logged in user remains unchanged)
  const myAbsences = unavailabilities.filter(u => u.doctorId === currentUser.id);
  const upcomingRcps = getUpcomingRcps();

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-20">
      
      {/* HEADER CARD */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-8 text-white flex items-center justify-between">
            <div className="flex items-center w-full">
                <div className={`w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold shadow-lg mr-6 border-4 border-white/20 ${currentUser.color || 'bg-slate-600'}`}>
                    {currentUser.name.substring(0,2)}
                </div>
                <div className="flex-1">
                    {isEditingProfile ? (
                        <div className="space-y-2 max-w-sm bg-white/10 p-3 rounded-lg backdrop-blur-sm">
                            <input 
                                type="text" 
                                className="w-full text-slate-900 px-2 py-1 rounded text-sm font-bold"
                                value={editName}
                                onChange={e => setEditName(e.target.value)}
                            />
                            <input 
                                type="text" 
                                className="w-full text-slate-900 px-2 py-1 rounded text-xs"
                                value={editSpecialty}
                                onChange={e => setEditSpecialty(e.target.value)}
                                placeholder="Spécialités..."
                            />
                            <div className="flex space-x-2 mt-2">
                                <button onClick={handleSaveProfile} className="bg-green-500 hover:bg-green-600 px-3 py-1 rounded text-xs font-bold text-white shadow">Enregistrer</button>
                                <button onClick={() => setIsEditingProfile(false)} className="bg-white/20 hover:bg-white/30 px-3 py-1 rounded text-xs text-white">Annuler</button>
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="flex items-center space-x-2">
                                <h1 className="text-2xl font-bold">{currentUser.name}</h1>
                                <button onClick={() => setIsEditingProfile(true)} className="text-white/70 hover:text-white bg-white/10 hover:bg-white/20 p-1 rounded transition-colors">
                                    <Edit className="w-4 h-4" />
                                </button>
                            </div>
                            <p className="text-blue-100 mt-1 flex items-center">
                                <Briefcase className="w-3 h-3 mr-1 opacity-70"/> 
                                {(currentUser.specialty || []).join(' • ')}
                            </p>
                            <div className="mt-3 inline-flex items-center bg-green-400/20 text-green-100 border border-green-400/30 px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider">
                                <UserCheck className="w-3 h-3 mr-1" /> Connecté
                            </div>
                        </>
                    )}
                </div>
            </div>
            <button onClick={() => setCurrentUser(null)} className="text-white bg-white/20 hover:bg-white/30 px-4 py-2 rounded text-sm shrink-0 ml-4 font-medium backdrop-blur-sm border border-white/10">
                Déconnexion
            </button>
        </div>
        
        {/* RCP NOTIFICATIONS AREA */}
        <div className="bg-yellow-50 border-b border-yellow-100 p-6">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-yellow-800 flex items-center">
                    <Bell className="w-5 h-5 mr-2" />
                    Mes RCPs ({upcomingRcps.length})
                </h3>
                <div className="flex items-center space-x-2 bg-white rounded-lg p-1 border border-yellow-200 shadow-sm">
                    <button onClick={() => setNotifWeekOffset(Math.max(0, notifWeekOffset - 1))} className="p-1 hover:bg-slate-100 rounded">
                        <ChevronLeft className="w-4 h-4 text-slate-600" />
                    </button>
                    <span className="text-sm font-bold text-slate-700 min-w-[140px] text-center select-none">
                        {getNotificationWeekLabel()}
                    </span>
                    <button onClick={() => setNotifWeekOffset(notifWeekOffset + 1)} className="p-1 hover:bg-slate-100 rounded">
                        <ChevronRight className="w-4 h-4 text-slate-600" />
                    </button>
                </div>
            </div>
            
            {upcomingRcps.length === 0 ? (
                <div className="text-sm text-slate-500 italic bg-white p-4 rounded border border-slate-200 text-center">
                    Rien à signaler pour cette période.
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {upcomingRcps.map((item: any) => {
                         // ... (Existing RCP rendering logic) ...
                         // Copy pasting existing logic to ensure complete file content
                         const isBackup = item.template.backupDoctorId === currentUser.id;
                         const myStatus = item.myStatus;

                        if (item.isCancelled) {
                             return (
                                <div key={item.generatedId} className="border rounded-lg p-3 bg-gray-100 border-gray-200 opacity-70 relative">
                                    <div className="text-xs font-bold text-gray-500 uppercase flex items-center line-through">
                                        {item.isManual ? 'MANUEL' : item.template.day} {item.date.split('-').slice(1).reverse().join('/')}
                                    </div>
                                    <div className="font-bold text-gray-600 text-sm mb-2 line-through">{item.template.location}</div>
                                    <div className="absolute top-2 right-2 text-[10px] bg-red-100 text-red-600 font-bold px-1.5 py-0.5 rounded">ANNULÉ</div>
                                    {!item.isManual && (
                                        <button 
                                            onClick={() => handleRestoreRcp(item.template.id, item.originalDate)}
                                            className="w-full mt-2 text-xs bg-white border border-gray-300 rounded py-1 hover:bg-gray-50 flex items-center justify-center text-gray-600"
                                        >
                                            <RotateCcw className="w-3 h-3 mr-1" /> Restaurer
                                        </button>
                                    )}
                                </div>
                             )
                        }

                        return (
                            <div key={item.generatedId} className={`border rounded-lg p-3 transition-all ${myStatus === 'PRESENT' ? 'bg-green-50 border-green-200 ring-1 ring-green-200' : myStatus === 'ABSENT' ? 'bg-red-50 border-red-200 opacity-80' : 'bg-white border-slate-200 shadow-sm'}`}>
                                <div className="flex justify-between items-start mb-2">
                                    <div className="text-xs font-bold text-slate-500 uppercase flex flex-col">
                                        <div>
                                            {item.isManual ? '' : item.template.day} {item.date.split('-').slice(1).reverse().join('/')}
                                        </div>
                                        <div className="flex items-center text-[10px] text-slate-400 mt-0.5">
                                            <Clock className="w-3 h-3 mr-1"/> {item.time}
                                        </div>
                                        {item.holiday && <span className="mt-1 text-pink-500 flex items-center"><AlertTriangle className="w-3 h-3 mr-1" /> Férié</span>}
                                        {item.isMoved && <span className="mt-1 text-blue-500 flex items-center"><Clock className="w-3 h-3 mr-1" /> Déplacé</span>}
                                    </div>
                                    {isBackup && (
                                        <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded font-bold border border-indigo-200">Backup</span>
                                    )}
                                </div>
                                <div className="font-bold text-slate-800 text-sm mb-3">{item.template.location}</div>
                                
                                {!item.isManual && (item.holiday || item.isMoved) && (
                                    <div className="mb-3 flex space-x-2">
                                        <button 
                                            onClick={() => setExceptionTarget({ templateId: item.template.id, date: item.originalDate })}
                                            className="flex-1 bg-blue-50 text-blue-600 hover:bg-blue-100 px-2 py-1 rounded text-[10px] font-bold border border-blue-200"
                                        >
                                            {item.isMoved ? 'Re-déplacer' : 'Déplacer'}
                                        </button>
                                        <button 
                                            onClick={() => handleCancelRcp(item.template.id, item.originalDate)}
                                            className="flex-1 bg-red-50 text-red-600 hover:bg-red-100 px-2 py-1 rounded text-[10px] font-bold border border-red-200"
                                        >
                                            Annuler
                                        </button>
                                    </div>
                                )}

                                {item.colleaguesStatus.length > 0 && (
                                    <div className="text-xs space-y-1 mb-3 bg-slate-50/50 p-2 rounded border border-slate-100">
                                        {item.colleaguesStatus.map((c: any, i: number) => (
                                            <div key={i} className="flex justify-between">
                                                <span className="text-slate-600 font-medium">{c.name}</span>
                                                <span className={`font-bold ${c.status === 'PRESENT' ? 'text-green-600' : c.status === 'ABSENT' ? 'text-red-500' : 'text-slate-400'}`}>
                                                    {c.status === 'PRESENT' ? 'Présent' : c.status === 'ABSENT' ? 'Absent' : '?'}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                <div className="flex items-center space-x-2">
                                    <button 
                                        onClick={() => handleAttendanceToggle(item.generatedId, 'PRESENT')}
                                        className={`flex-1 py-1.5 text-xs font-bold rounded flex items-center justify-center transition-colors ${myStatus === 'PRESENT' ? 'bg-green-600 text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-green-100 hover:text-green-700'}`}
                                    >
                                        <CheckCircle2 className="w-3 h-3 mr-1" /> Présent
                                    </button>
                                    <button 
                                        onClick={() => handleAttendanceToggle(item.generatedId, 'ABSENT')}
                                        className={`flex-1 py-1.5 text-xs font-bold rounded flex items-center justify-center transition-colors ${myStatus === 'ABSENT' ? 'bg-red-600 text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-red-100 hover:text-red-700'}`}
                                    >
                                        <XCircle className="w-3 h-3 mr-1" /> Absent
                                    </button>
                                </div>
                                {myStatus && (
                                    <div className="text-center mt-1">
                                         <button onClick={() => handleClearDecision(item.generatedId)} className="text-[10px] text-slate-400 hover:text-slate-600 underline">Annuler mon choix</button>
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
      </div>
      
      {/* EXCEPTION MODAL */}
      {exceptionTarget && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm">
              <div className="bg-white p-6 rounded-xl shadow-2xl w-80 transform scale-100 transition-transform">
                  <h3 className="font-bold text-lg mb-4 text-slate-800">Déplacer la RCP</h3>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Nouvelle Date</label>
                  <input 
                      type="date" 
                      className="w-full border rounded p-2 mb-4 focus:ring-2 focus:ring-blue-500 outline-none"
                      value={exceptionNewDate}
                      onChange={e => setExceptionNewDate(e.target.value)}
                  />
                  <div className="flex justify-end space-x-2">
                      <button onClick={() => setExceptionTarget(null)} className="text-slate-600 hover:bg-slate-100 px-3 py-1 rounded text-sm">Annuler</button>
                      <button onClick={handleMoveRcp} disabled={!exceptionNewDate} className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm font-bold shadow hover:bg-blue-700 disabled:opacity-50">Confirmer</button>
                  </div>
              </div>
          </div>
      )}

      {/* BOTTOM SECTION: ABSENCES & PREFERENCES */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* ABSENCES (No changes) */}
            <div>
                <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center">
                    <Calendar className="w-5 h-5 mr-2 text-blue-500" />
                    Déclarer une absence
                </h2>
                <form onSubmit={handleAddUnavailability} className="bg-white p-5 rounded-xl border border-slate-200 mb-6 space-y-4 shadow-sm">
                   {/* ... Form inputs ... */}
                   <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">Du</label>
                            <input 
                                type="date" 
                                required
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="w-full rounded border-slate-300 text-sm p-2 border focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">Au</label>
                            <input 
                                type="date" 
                                required
                                value={endDate}
                                min={startDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className="w-full rounded border-slate-300 text-sm p-2 border focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">Période</label>
                        <select 
                            value={absencePeriod}
                            onChange={(e) => setAbsencePeriod(e.target.value as any)}
                            className="w-full rounded border-slate-300 text-sm p-2 border focus:ring-2 focus:ring-blue-500 outline-none"
                        >
                            <option value="ALL_DAY">Journée entière</option>
                            <option value={Period.MORNING}>Matin uniquement</option>
                            <option value={Period.AFTERNOON}>Après-midi uniquement</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">Motif</label>
                        <select 
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            className="w-full rounded border-slate-300 text-sm p-2 border focus:ring-2 focus:ring-blue-500 outline-none"
                        >
                            <option value="CONGRES">Congrès</option>
                            <option value="VACANCES">Vacances</option>
                            <option value="MALADIE">Maladie</option>
                            <option value="FORMATION">Formation</option>
                            <option value="AUTRE">Autre (préciser)</option>
                        </select>
                    </div>
                    {reason === 'AUTRE' && (
                        <input 
                            type="text" 
                            placeholder="Précisez..." 
                            className="w-full rounded border border-slate-300 text-sm p-2 focus:ring-2 focus:ring-blue-500 outline-none"
                            value={customReason}
                            onChange={e => setCustomReason(e.target.value)}
                            required
                        />
                    )}
                    <button type="submit" className="w-full bg-blue-600 text-white px-4 py-2.5 rounded-lg hover:bg-blue-700 flex items-center justify-center text-sm font-bold shadow-sm transition-colors">
                        <Save className="w-4 h-4 mr-2" />
                        Ajouter l'absence
                    </button>
                </form>

                <h3 className="text-sm font-bold text-slate-800 mb-2 pl-1">Historique des absences</h3>
                <ul className="divide-y divide-slate-100 bg-white border border-slate-200 rounded-lg max-h-60 overflow-y-auto shadow-sm">
                    {myAbsences.length === 0 ? (
                        <li className="p-4 text-slate-500 italic text-sm text-center">Aucune absence déclarée.</li>
                    ) : (
                        myAbsences.map(abs => (
                            <li key={abs.id} className="p-3 flex justify-between items-center hover:bg-slate-50 transition-colors">
                                <div className="text-sm">
                                    <div className="font-bold text-slate-700 flex items-center">
                                        {abs.reason}
                                        {abs.period && abs.period !== 'ALL_DAY' && (
                                            <span className="ml-2 text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded uppercase font-bold">
                                                {abs.period === Period.MORNING ? 'Matin' : 'A.Midi'}
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-xs text-slate-500 mt-0.5 flex items-center">
                                        <Calendar className="w-3 h-3 mr-1 opacity-50"/>
                                        {abs.startDate} <span className="mx-1">→</span> {abs.endDate}
                                    </div>
                                </div>
                                <button onClick={() => removeUnavailability(abs.id)} className="text-slate-300 hover:text-red-500 p-2 rounded-full hover:bg-red-50 transition-colors">
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </li>
                        ))
                    )}
                </ul>
            </div>

            {/* PREFERENCES (No changes) */}
            <div>
                 <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center">
                    <Briefcase className="w-5 h-5 mr-2 text-purple-500" />
                    Mes Préférences & Exclusions
                </h2>
                {/* ... Exclusions UI ... */}
                <div className="bg-white p-5 rounded-xl border border-slate-200 mb-4 shadow-sm">
                    <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center">
                        <Ban className="w-4 h-4 mr-2 text-red-500" />
                        Jours non travaillés (ex: 80%)
                    </h3>
                    <div className="flex flex-wrap gap-2">
                        {Object.values(DayOfWeek).map(day => (
                            <button
                                key={day}
                                onClick={() => toggleDayExclusion(day)}
                                className={`px-3 py-1.5 text-xs rounded-lg border transition-all ${
                                    (currentUser.excludedDays || []).includes(day)
                                    ? 'bg-red-100 text-red-800 border-red-200 font-bold shadow-inner'
                                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                                }`}
                            >
                                {day}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="bg-white p-5 rounded-xl border border-slate-200 mb-4 shadow-sm">
                     <h3 className="text-sm font-bold text-slate-700 mb-2 flex items-center">
                        <Ban className="w-4 h-4 mr-2 text-orange-500" />
                        Type de Créneau Exclu (Suggestions)
                    </h3>
                    <div className="flex flex-wrap gap-2">
                        <button 
                            onClick={() => toggleSlotTypeExclusion(SlotType.CONSULTATION)}
                             className={`px-3 py-1.5 text-xs rounded-lg border transition-all ${
                                    (currentUser.excludedSlotTypes || []).includes(SlotType.CONSULTATION)
                                    ? 'bg-orange-100 text-orange-800 border-orange-200 font-bold shadow-inner'
                                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                                }`}
                        >
                            Consultations
                        </button>
                        <button 
                            onClick={() => toggleSlotTypeExclusion(SlotType.RCP)}
                             className={`px-3 py-1.5 text-xs rounded-lg border transition-all ${
                                    (currentUser.excludedSlotTypes || []).includes(SlotType.RCP)
                                    ? 'bg-orange-100 text-orange-800 border-orange-200 font-bold shadow-inner'
                                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                                }`}
                        >
                            RCP
                        </button>
                    </div>
                </div>

                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                    <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center">
                        <Ban className="w-4 h-4 mr-2 text-slate-500" />
                        Activités Exclues
                    </h3>
                    <div className="space-y-2">
                        {activityDefinitions.map(act => (
                            <div key={act.id} className="flex items-center p-2 hover:bg-slate-50 rounded cursor-pointer" onClick={() => toggleActivityExclusion(act.id)}>
                                <div className={`w-4 h-4 rounded border flex items-center justify-center mr-3 transition-colors ${ (currentUser.excludedActivities || []).includes(act.id) ? 'bg-red-500 border-red-500' : 'border-slate-300 bg-white'}`}>
                                    {(currentUser.excludedActivities || []).includes(act.id) && <Ban className="w-3 h-3 text-white" />}
                                </div>
                                <span className={`text-sm ${(currentUser.excludedActivities || []).includes(act.id) ? 'text-red-700 font-medium line-through decoration-red-300' : 'text-slate-700'}`}>
                                    {act.name}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
      </div>
    </div>
  );
};

export default Profile;
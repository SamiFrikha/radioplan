import React, { useContext, useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppContext } from '../App';
import { useAuth } from '../context/AuthContext';
import {
    Calendar, Save, Trash2, UserCheck,
    Briefcase, Edit, Bell, ChevronLeft, ChevronRight,
    CheckCircle2, XCircle, AlertTriangle, Clock, RotateCcw,
    Plus, Loader2, Tag
} from 'lucide-react';
import { SlotType, Doctor, Period, Specialty } from '../types';
import { getDateForDayOfWeek, isFrenchHoliday } from '../services/scheduleService';
import { supabase } from '../services/supabaseClient';

const Profile: React.FC = () => {
    const {
        unavailabilities,
        addUnavailability,
        removeUnavailability,
        doctors,
        updateDoctor,
        activityDefinitions,
        template,
        rcpTypes,
        rcpAttendance,
        setRcpAttendance,
        rcpExceptions,
        addRcpException,
        removeRcpException,
        profileRcpWeekOffset,
        setProfileRcpWeekOffset
    } = useContext(AppContext);

    const { profile, loading: authLoading } = useAuth();
    const navigate = useNavigate();

    // Find the doctor linked to the current user
    const [currentDoctor, setCurrentDoctor] = useState<Doctor | null>(null);
    const [loadingDoctor, setLoadingDoctor] = useState(true);

    // Form states
    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
    const [absencePeriod, setAbsencePeriod] = useState<'ALL_DAY' | Period>('ALL_DAY');
    const [reason, setReason] = useState('CONGRES');
    const [customReason, setCustomReason] = useState("");

    // Edit profile state
    const [isEditingProfile, setIsEditingProfile] = useState(false);
    const [editName, setEditName] = useState("");
    const [editSpecialties, setEditSpecialties] = useState<string[]>([]);
    const [availableSpecialties, setAvailableSpecialties] = useState<Specialty[]>([]);

    // RCP Week navigation - use context to survive re-renders
    const notifWeekOffset = profileRcpWeekOffset;
    const setNotifWeekOffset = setProfileRcpWeekOffset;

    // Load doctor profile based on auth profile
    useEffect(() => {
        const loadDoctorProfile = async () => {
            if (!profile) {
                setLoadingDoctor(false);
                return;
            }

            // If profile has doctor_id, find the doctor
            if (profile.doctor_id) {
                // First try from local doctors array
                const localDoc = doctors.find(d => d.id === profile.doctor_id);
                if (localDoc) {
                    setCurrentDoctor(localDoc);
                    setEditName(localDoc.name);
                    setEditSpecialties(localDoc.specialty || []);
                } else {
                    // Fetch from database
                    const { data } = await supabase
                        .from('doctors')
                        .select('*')
                        .eq('id', profile.doctor_id)
                        .single();

                    if (data) {
                        const doc: Doctor = {
                            id: data.id,
                            name: data.name,
                            color: data.color,
                            specialty: data.specialty || [],
                            excludedDays: data.excluded_days || [],
                            excludedActivities: data.excluded_activities || [],
                            excludedSlotTypes: data.excluded_slot_types || []
                        };
                        setCurrentDoctor(doc);
                        setEditName(doc.name);
                        setEditSpecialties(doc.specialty || []);
                    }
                }
            }
            setLoadingDoctor(false);
        };

        loadDoctorProfile();
    }, [profile, doctors]);

    // Load available specialties
    useEffect(() => {
        const loadSpecialties = async () => {
            const { data } = await supabase
                .from('specialties')
                .select('*')
                .order('name');
            if (data) {
                setAvailableSpecialties(data);
            }
        };
        loadSpecialties();
    }, []);

    // Update currentDoctor when doctors array changes
    useEffect(() => {
        if (currentDoctor && profile?.doctor_id) {
            const updatedDoc = doctors.find(d => d.id === profile.doctor_id);
            if (updatedDoc) {
                setCurrentDoctor(updatedDoc);
            }
        }
    }, [doctors, profile?.doctor_id]);

    // RCP Helper Functions
    const getUpcomingRcps = () => {
        if (!currentDoctor) return [];

        const today = new Date();
        const currentMonday = new Date(today);
        const day = currentMonday.getDay();
        const diff = currentMonday.getDate() - day + (day === 0 ? -6 : 1);
        currentMonday.setDate(diff);
        currentMonday.setHours(0, 0, 0, 0);

        const targetMonday = new Date(currentMonday);
        targetMonday.setDate(targetMonday.getDate() + (notifWeekOffset * 7));

        const relevantTemplates = template.filter(t =>
            t.type === SlotType.RCP && (
                (t.doctorIds && t.doctorIds.includes(currentDoctor.id)) ||
                (t.defaultDoctorId === currentDoctor.id) ||
                (t.secondaryDoctorIds && t.secondaryDoctorIds.includes(currentDoctor.id)) ||
                (t.backupDoctorId === currentDoctor.id)
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
            const myStatus = currentMap[currentDoctor.id];

            // Get all assigned doctors for this RCP (from template) - deduplicated
            const allAssignedDoctorIds = [...new Set([
                t.defaultDoctorId,
                ...(t.secondaryDoctorIds || []),
                ...(t.doctorIds || []),
                t.backupDoctorId
            ].filter(Boolean).filter(id => id !== currentDoctor.id))] as string[];

            // Build colleagues status including those who haven't responded yet
            const colleaguesStatus = allAssignedDoctorIds.map(dId => {
                const doctor = doctors.find(d => d.id === dId);
                return {
                    id: dId,
                    name: doctor?.name || 'Inconnu',
                    status: currentMap[dId] || null // null = no response yet
                };
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

        // Manual RCPs
        const targetWeekEnd = new Date(targetMonday);
        targetWeekEnd.setDate(targetWeekEnd.getDate() + 6);
        const startStr = targetMonday.toISOString().split('T')[0];
        const endStr = targetWeekEnd.toISOString().split('T')[0];

        const manualRcps = rcpTypes
            .filter(r => r.frequency === 'MANUAL' && r.manualInstances)
            .flatMap(r => r.manualInstances!.map(i => ({ ...i, rcpName: r.name, rcpId: r.id })))
            .filter(inst => {
                if (inst.date < startStr || inst.date > endStr) return false;
                return inst.doctorIds.includes(currentDoctor.id) || inst.backupDoctorId === currentDoctor.id;
            })
            .map(inst => {
                const generatedId = `manual-rcp-${inst.rcpId}-${inst.id}`;
                const holiday = isFrenchHoliday(inst.date);
                const currentMap = rcpAttendance[generatedId] || {};
                const myStatus = currentMap[currentDoctor.id];

                // Get all assigned doctors for this manual RCP - deduplicated
                const allAssignedDoctorIds = [...new Set([
                    ...(inst.doctorIds || []),
                    inst.backupDoctorId
                ].filter(Boolean).filter(id => id !== currentDoctor.id))] as string[];

                // Build colleagues status including those who haven't responded yet
                const colleaguesStatus = allAssignedDoctorIds.map(dId => {
                    const doctor = doctors.find(d => d.id === dId);
                    return {
                        id: dId,
                        name: doctor?.name || 'Inconnu',
                        status: currentMap[dId] || null // null = no response yet
                    };
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

        return [...standardRcps, ...manualRcps].sort((a, b) => (a?.date || '').localeCompare(b?.date || ''));
    };

    const handleAttendanceToggle = async (slotId: string, status: 'PRESENT' | 'ABSENT') => {
        if (!currentDoctor) return;
        const currentMap = rcpAttendance[slotId] || {};
        const newMap = { ...currentMap, [currentDoctor.id]: status };

        // Update local state immediately for responsiveness
        setRcpAttendance({ ...rcpAttendance, [slotId]: newMap });

        // Persist to database
        try {
            const { error } = await supabase
                .from('rcp_attendance')
                .upsert({
                    slot_id: slotId,
                    doctor_id: currentDoctor.id,
                    status: status
                }, { onConflict: 'slot_id, doctor_id' });

            if (error) {
                console.error('Error saving attendance:', error);
            } else {
                console.log('✅ Attendance saved:', slotId, status);
            }
        } catch (err) {
            console.error('Error saving attendance:', err);
        }
    };

    const handleClearDecision = async (slotId: string) => {
        if (!currentDoctor) return;
        const currentMap = rcpAttendance[slotId] || {};
        const newMap = { ...currentMap };
        delete newMap[currentDoctor.id];

        // Update local state immediately
        setRcpAttendance({ ...rcpAttendance, [slotId]: newMap });

        // Delete from database
        try {
            const { error } = await supabase
                .from('rcp_attendance')
                .delete()
                .match({ slot_id: slotId, doctor_id: currentDoctor.id });

            if (error) {
                console.error('Error deleting attendance:', error);
            } else {
                console.log('✅ Attendance cleared:', slotId);
            }
        } catch (err) {
            console.error('Error deleting attendance:', err);
        }
    };

    const handleSaveProfile = async () => {
        if (currentDoctor && editName.trim()) {
            const updatedDoc = {
                ...currentDoctor,
                name: editName,
                specialty: editSpecialties
            };
            updateDoctor(updatedDoc);
            setCurrentDoctor(updatedDoc);
            setIsEditingProfile(false);
        }
    };

    const handleAddUnavailability = (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentDoctor) return;

        // Confirmation dialog
        const confirmMessage = `⚠️ ATTENTION\n\nVous êtes sur le point de déclarer une absence du ${startDate} au ${endDate}.\n\nCette action est définitive et ne peut pas être annulée par vous-même. Seul un administrateur peut modifier ou supprimer cette indisponibilité.\n\nÊtes-vous sûr de vouloir continuer ?`;

        if (!window.confirm(confirmMessage)) {
            return;
        }

        addUnavailability({
            id: Date.now().toString(),
            doctorId: currentDoctor.id,
            startDate,
            endDate,
            period: absencePeriod,
            reason: reason === 'AUTRE' ? customReason : reason,
        });
        setCustomReason("");

        // Reset form after adding
        setStartDate(new Date().toISOString().split('T')[0]);
        setEndDate(new Date().toISOString().split('T')[0]);
        setAbsencePeriod('ALL_DAY');
        setReason('CONGRES');
    };

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
        return `Semaine du ${targetMonday.getDate()}/${targetMonday.getMonth() + 1}`;
    };

    // Calculate unconfirmed RCPs for current week AND next week (not just displayed week)
    const getUnconfirmedRcpNotifications = () => {
        if (!currentDoctor) return { count: 0, thisWeek: 0, nextWeek: 0 };

        const today = new Date();
        const currentMonday = new Date(today);
        const day = currentMonday.getDay();
        const diff = currentMonday.getDate() - day + (day === 0 ? -6 : 1);
        currentMonday.setDate(diff);
        currentMonday.setHours(0, 0, 0, 0);

        let thisWeekUnconfirmed = 0;
        let nextWeekUnconfirmed = 0;

        // Check this week (offset 0) and next week (offset 1)
        for (const weekOffset of [0, 1]) {
            const targetMonday = new Date(currentMonday);
            targetMonday.setDate(targetMonday.getDate() + (weekOffset * 7));

            const relevantTemplates = template.filter(t =>
                t.type === SlotType.RCP && (
                    (t.doctorIds && t.doctorIds.includes(currentDoctor.id)) ||
                    (t.defaultDoctorId === currentDoctor.id) ||
                    (t.secondaryDoctorIds && t.secondaryDoctorIds.includes(currentDoctor.id)) ||
                    (t.backupDoctorId === currentDoctor.id)
                )
            );

            for (const t of relevantTemplates) {
                const slotDate = getDateForDayOfWeek(targetMonday, t.day);
                const exception = rcpExceptions.find(ex => ex.rcpTemplateId === t.id && ex.originalDate === slotDate);
                if (exception?.isCancelled) continue;

                const generatedId = `${t.id}-${slotDate}`;
                const currentMap = rcpAttendance[generatedId] || {};
                const myStatus = currentMap[currentDoctor.id];

                if (!myStatus) {
                    if (weekOffset === 0) thisWeekUnconfirmed++;
                    else nextWeekUnconfirmed++;
                }
            }

            // Manual RCPs
            const targetWeekEnd = new Date(targetMonday);
            targetWeekEnd.setDate(targetWeekEnd.getDate() + 6);
            const startStr = targetMonday.toISOString().split('T')[0];
            const endStr = targetWeekEnd.toISOString().split('T')[0];

            const manualRcps = rcpTypes
                .filter(r => r.frequency === 'MANUAL' && r.manualInstances)
                .flatMap(r => r.manualInstances!.map(i => ({ ...i, rcpName: r.name, rcpId: r.id })))
                .filter(inst => {
                    if (inst.date < startStr || inst.date > endStr) return false;
                    return inst.doctorIds.includes(currentDoctor.id) || inst.backupDoctorId === currentDoctor.id;
                });

            for (const inst of manualRcps) {
                const generatedId = `manual-rcp-${inst.rcpId}-${inst.id}`;
                const currentMap = rcpAttendance[generatedId] || {};
                const myStatus = currentMap[currentDoctor.id];

                if (!myStatus) {
                    if (weekOffset === 0) thisWeekUnconfirmed++;
                    else nextWeekUnconfirmed++;
                }
            }
        }

        return {
            count: thisWeekUnconfirmed + nextWeekUnconfirmed,
            thisWeek: thisWeekUnconfirmed,
            nextWeek: nextWeekUnconfirmed
        };
    };

    const notifications = getUnconfirmedRcpNotifications();

    // Loading state
    if (authLoading || loadingDoctor) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
        );
    }

    // Not logged in
    if (!profile) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] p-6">
                <div className="text-center bg-white p-8 rounded-xl shadow-lg border border-slate-200 max-w-md">
                    <UserCheck className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                    <h2 className="text-xl font-bold text-slate-800 mb-2">Connexion requise</h2>
                    <p className="text-slate-500 mb-6">Veuillez vous connecter pour accéder à votre profil.</p>
                    <button
                        onClick={() => navigate('/login')}
                        className="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors"
                    >
                        Se connecter
                    </button>
                </div>
            </div>
        );
    }

    // No doctor profile linked
    if (!currentDoctor) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] p-6">
                <div className="text-center bg-white p-8 rounded-xl shadow-lg border border-slate-200 max-w-md">
                    <AlertTriangle className="w-16 h-16 text-yellow-500 mx-auto mb-4" />
                    <h2 className="text-xl font-bold text-slate-800 mb-2">Profil médecin non configuré</h2>
                    <p className="text-slate-500 mb-4">
                        Votre compte n'est pas encore lié à un profil médecin.
                        Contactez un administrateur pour configurer votre profil.
                    </p>
                    <p className="text-sm text-slate-400">
                        Connecté en tant que : <strong>{profile.email}</strong>
                    </p>
                </div>
            </div>
        );
    }

    // Main profile view
    const myAbsences = unavailabilities.filter(u => u.doctorId === currentDoctor.id);
    const upcomingRcps = getUpcomingRcps();

    return (
        <div className="max-w-5xl mx-auto space-y-6 pb-20 p-4">

            {/* HEADER CARD */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-8 text-white">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center">
                            <div
                                className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold shadow-lg mr-6 border-4 border-white/20"
                                style={{ backgroundColor: currentDoctor.color || '#3B82F6' }}
                            >
                                {currentDoctor.name.substring(0, 2)}
                            </div>
                            <div>
                                {isEditingProfile ? (
                                    <div className="space-y-3 bg-white/10 p-4 rounded-lg backdrop-blur-sm">
                                        <div>
                                            <label className="text-xs text-blue-200 mb-1 block">Nom</label>
                                            <input
                                                type="text"
                                                className="w-full text-slate-900 px-3 py-2 rounded text-sm font-bold"
                                                value={editName}
                                                onChange={e => setEditName(e.target.value)}
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs text-blue-200 mb-1 block flex items-center">
                                                <Tag className="w-3 h-3 mr-1" /> Spécialités
                                            </label>
                                            {availableSpecialties.length === 0 ? (
                                                <p className="text-xs text-blue-200 italic">Aucune spécialité disponible</p>
                                            ) : (
                                                <div className="flex flex-wrap gap-2">
                                                    {availableSpecialties.map(spec => {
                                                        const isSelected = editSpecialties.includes(spec.name);
                                                        return (
                                                            <button
                                                                key={spec.id}
                                                                type="button"
                                                                onClick={() => {
                                                                    if (isSelected) {
                                                                        setEditSpecialties(editSpecialties.filter(s => s !== spec.name));
                                                                    } else {
                                                                        setEditSpecialties([...editSpecialties, spec.name]);
                                                                    }
                                                                }}
                                                                className={`px-2 py-1 rounded-full text-xs font-medium border transition-all ${isSelected
                                                                    ? 'text-white border-transparent shadow-sm'
                                                                    : 'bg-white/20 text-white border-white/30 hover:bg-white/30'
                                                                    }`}
                                                                style={isSelected ? { backgroundColor: spec.color } : {}}
                                                            >
                                                                {isSelected && '✓ '}{spec.name}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex space-x-2 mt-2">
                                            <button onClick={handleSaveProfile} className="bg-green-500 hover:bg-green-600 px-3 py-1 rounded text-xs font-bold text-white shadow">Enregistrer</button>
                                            <button onClick={() => setIsEditingProfile(false)} className="bg-white/20 hover:bg-white/30 px-3 py-1 rounded text-xs text-white">Annuler</button>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <div className="flex items-center space-x-2">
                                            <h1 className="text-2xl font-bold">{currentDoctor.name}</h1>
                                            <button onClick={() => setIsEditingProfile(true)} className="text-white/70 hover:text-white bg-white/10 hover:bg-white/20 p-1 rounded">
                                                <Edit className="w-4 h-4" />
                                            </button>
                                        </div>
                                        <p className="text-blue-100 mt-1 flex items-center">
                                            <Briefcase className="w-3 h-3 mr-1 opacity-70" />
                                            {currentDoctor.specialty?.join(' • ') || 'Généraliste'}
                                        </p>
                                        <div className="mt-3 inline-flex items-center bg-green-400/20 text-green-100 border border-green-400/30 px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider">
                                            <UserCheck className="w-3 h-3 mr-1" /> Connecté
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                        <div className="text-right text-sm text-blue-100">
                            <div>{profile.email}</div>
                            <div className="text-xs mt-1 opacity-75">{profile.role_name || profile.role}</div>
                        </div>
                    </div>
                </div>

                {/* RCP NOTIFICATIONS */}
                <div className="bg-yellow-50 border-b border-yellow-100 p-6">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center">
                            <h3 className="text-lg font-bold text-yellow-800 flex items-center">
                                <Bell className="w-5 h-5 mr-2" />
                                Mes RCPs ({upcomingRcps.length})
                            </h3>
                            {notifications.count > 0 && (
                                <div className="ml-3 flex items-center bg-red-500 text-white px-2 py-0.5 rounded-full text-xs font-bold animate-pulse">
                                    <span className="mr-1">🔔</span>
                                    {notifications.count} à confirmer
                                    {notifications.thisWeek > 0 && notifications.nextWeek > 0 && (
                                        <span className="ml-1 opacity-75">
                                            ({notifications.thisWeek} cette sem. + {notifications.nextWeek} proch.)
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>
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
                            Aucune RCP prévue pour cette période.
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {upcomingRcps.map((item: any) => {
                                const isBackup = item.template.backupDoctorId === currentDoctor.id;

                                // Calculate the actual day name from the display date (not template day)
                                const displayDateObj = new Date(item.date + 'T00:00:00');
                                const dayNames = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
                                const actualDayName = dayNames[displayDateObj.getDay()];

                                // For normal RCPs, use template.day; for moved RCPs, use calculated day
                                const displayDay = item.isMoved ? actualDayName : (item.isManual ? '' : item.template.day);

                                if (item.isCancelled) {
                                    return (
                                        <div key={item.generatedId} className="border rounded-lg p-3 bg-gray-100 border-gray-200 opacity-70 relative">
                                            <div className="text-xs font-bold text-gray-500 uppercase line-through">
                                                {displayDay} {item.date.split('-').slice(1).reverse().join('/')}
                                            </div>
                                            <div className="font-bold text-gray-600 text-sm mb-2 line-through">{item.template.location}</div>
                                            <div className="absolute top-2 right-2 text-[10px] bg-red-100 text-red-600 font-bold px-1.5 py-0.5 rounded">ANNULÉ</div>
                                        </div>
                                    );
                                }

                                return (
                                    <div key={item.generatedId} className={`border rounded-lg p-3 transition-all relative ${item.isMoved ? 'ring-2 ring-orange-300' : ''} ${item.myStatus === 'PRESENT' ? 'bg-green-50 border-green-200' : item.myStatus === 'ABSENT' ? 'bg-red-50 border-red-200 opacity-80' : 'bg-white border-slate-200 shadow-sm'}`}>
                                        {/* Notification pastille - shows for current and next week when no choice made */}
                                        {!item.myStatus && (notifWeekOffset === 0 || notifWeekOffset === 1) && (
                                            <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full animate-pulse flex items-center justify-center shadow-lg" title={notifWeekOffset === 0 ? "Confirmation requise cette semaine" : "Confirmation requise pour semaine prochaine"}>
                                                <span className="text-[8px] text-white font-bold">!</span>
                                            </div>
                                        )}

                                        {/* Badge for exceptionally moved RCP */}
                                        {item.isMoved && (
                                            <div className="absolute top-2 right-2 text-[9px] bg-orange-100 text-orange-700 font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5 animate-pulse">
                                                <span>⚡</span> DÉPLACÉ
                                            </div>
                                        )}

                                        <div className="flex justify-between items-start mb-2">
                                            <div className="text-xs font-bold text-slate-500 uppercase">
                                                {displayDay} {item.date.split('-').slice(1).reverse().join('/')}
                                                {/* Show original date if moved */}
                                                {item.isMoved && item.originalDate && (
                                                    <div className="text-[9px] text-orange-600 font-normal normal-case mt-0.5">
                                                        (initialement le {item.originalDate.split('-').slice(1).reverse().join('/')})
                                                    </div>
                                                )}
                                                <div className="flex items-center text-[10px] text-slate-400 mt-0.5">
                                                    <Clock className="w-3 h-3 mr-1" /> {item.time}
                                                    {item.isTimeChanged && (
                                                        <span className="ml-1 text-orange-600 font-medium">(modifié)</span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                {isBackup && (
                                                    <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded font-bold">Backup</span>
                                                )}
                                                {item.myStatus === 'PRESENT' && (
                                                    <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-bold">✓</span>
                                                )}
                                                {item.myStatus === 'ABSENT' && (
                                                    <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-bold">✗</span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="font-bold text-slate-800 text-sm mb-3">{item.template.location}</div>

                                        <div className="flex items-center space-x-2">
                                            <button
                                                onClick={() => handleAttendanceToggle(item.generatedId, 'PRESENT')}
                                                className={`flex-1 py-1.5 text-xs font-bold rounded flex items-center justify-center transition-colors ${item.myStatus === 'PRESENT' ? 'bg-green-600 text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-green-100'}`}
                                            >
                                                <CheckCircle2 className="w-3 h-3 mr-1" /> Présent
                                            </button>
                                            <button
                                                onClick={() => handleAttendanceToggle(item.generatedId, 'ABSENT')}
                                                className={`flex-1 py-1.5 text-xs font-bold rounded flex items-center justify-center transition-colors ${item.myStatus === 'ABSENT' ? 'bg-red-600 text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-red-100'}`}
                                            >
                                                <XCircle className="w-3 h-3 mr-1" /> Absent
                                            </button>
                                        </div>
                                        {item.myStatus && (
                                            <div className="text-center mt-1">
                                                <button onClick={() => handleClearDecision(item.generatedId)} className="text-[10px] text-slate-400 hover:text-slate-600 underline">
                                                    Annuler mon choix
                                                </button>
                                            </div>
                                        )}

                                        {/* Colleagues attendance status */}
                                        {item.colleaguesStatus && item.colleaguesStatus.length > 0 && (
                                            <div className="mt-3 pt-2 border-t border-slate-100">
                                                <div className="text-[10px] font-bold text-slate-400 uppercase mb-1.5">Autres participants</div>
                                                <div className="flex flex-wrap gap-1">
                                                    {item.colleaguesStatus.map((colleague: any) => (
                                                        <span
                                                            key={colleague.id || colleague.name}
                                                            className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${colleague.status === 'PRESENT'
                                                                ? 'bg-green-100 text-green-700'
                                                                : colleague.status === 'ABSENT'
                                                                    ? 'bg-red-100 text-red-700'
                                                                    : 'bg-slate-100 text-slate-500'
                                                                }`}
                                                            title={colleague.status === 'PRESENT' ? 'Présent' : colleague.status === 'ABSENT' ? 'Absent' : 'Pas encore répondu'}
                                                        >
                                                            {colleague.status === 'PRESENT' && '✓ '}
                                                            {colleague.status === 'ABSENT' && '✗ '}
                                                            {!colleague.status && '? '}
                                                            {colleague.name}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* BOTTOM SECTION: ABSENCES & PREFERENCES */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

                {/* ABSENCES */}
                <div>
                    <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center">
                        <Calendar className="w-5 h-5 mr-2 text-blue-500" />
                        Déclarer une absence
                    </h2>

                    <form onSubmit={handleAddUnavailability} className="bg-white p-5 rounded-xl border border-slate-200 mb-6 space-y-4 shadow-sm">
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
                        <button type="submit" className="w-full bg-blue-600 text-white px-4 py-2.5 rounded-lg hover:bg-blue-700 flex items-center justify-center text-sm font-bold shadow-sm">
                            <Save className="w-4 h-4 mr-2" />
                            Ajouter l'absence
                        </button>
                    </form>

                    <h3 className="text-sm font-bold text-slate-800 mb-2 pl-1 flex items-center">
                        Historique des absences
                        <span className="ml-2 text-[10px] text-slate-400 font-normal">(lecture seule)</span>
                    </h3>
                    <ul className="divide-y divide-slate-100 bg-white border border-slate-200 rounded-lg max-h-60 overflow-y-auto shadow-sm">
                        {myAbsences.length === 0 ? (
                            <li className="p-4 text-slate-500 italic text-sm text-center">Aucune absence déclarée.</li>
                        ) : (
                            myAbsences.map(abs => (
                                <li key={abs.id} className="p-3 flex justify-between items-center hover:bg-slate-50">
                                    <div className="text-sm flex-1">
                                        <div className="font-bold text-slate-700">{abs.reason}</div>
                                        <div className="text-xs text-slate-500 mt-0.5">
                                            {abs.startDate} → {abs.endDate}
                                            {abs.period && abs.period !== 'ALL_DAY' && (
                                                <span className="ml-2 text-[10px] bg-slate-100 text-slate-500 px-1 rounded">
                                                    {abs.period === Period.MORNING ? 'Matin' : 'Après-midi'}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    {/* No delete button - only admin can delete */}
                                    <div className="text-slate-300 p-2" title="Contactez un administrateur pour modifier">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                        </svg>
                                    </div>
                                </li>
                            ))
                        )}
                    </ul>
                    <p className="text-[10px] text-slate-400 mt-2 pl-1 italic">
                        Pour modifier ou supprimer une absence, contactez un administrateur.
                    </p>
                </div>

                {/* Preferences & Exclusions - Read Only Display */}
                <div>
                    <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center">
                        <Briefcase className="w-5 h-5 mr-2 text-purple-500" />
                        Mes Préférences & Exclusions
                    </h2>

                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
                        {/* Demi-journées non travaillées (récurrentes) */}
                        <div>
                            <h3 className="text-sm font-bold text-slate-700 mb-2 flex items-center">
                                <Calendar className="w-4 h-4 mr-2 text-red-500" />
                                Demi-journées non travaillées (récurrentes)
                            </h3>
                            {/* Show excludedHalfDays if present, otherwise fallback to excludedDays */}
                            {(currentDoctor as any).excludedHalfDays && (currentDoctor as any).excludedHalfDays.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                    {(currentDoctor as any).excludedHalfDays.map((excl: any, idx: number) => (
                                        <span key={idx} className={`px-2 py-1 text-xs rounded font-medium ${excl.period === Period.MORNING
                                                ? 'bg-orange-100 text-orange-800'
                                                : 'bg-blue-100 text-blue-800'
                                            }`}>
                                            {excl.day.substring(0, 3)} {excl.period === Period.MORNING ? 'matin' : 'ap-m.'}
                                        </span>
                                    ))}
                                </div>
                            ) : currentDoctor.excludedDays && currentDoctor.excludedDays.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                    {currentDoctor.excludedDays.map(day => (
                                        <span key={day} className="px-2 py-1 text-xs rounded bg-red-100 text-red-800 font-medium">
                                            {day} (journée entière)
                                        </span>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm text-slate-400 italic">Aucune demi-journée exclue</p>
                            )}
                        </div>


                        {/* Activités exclues */}
                        <div>
                            <h3 className="text-sm font-bold text-slate-700 mb-2 flex items-center">
                                <AlertTriangle className="w-4 h-4 mr-2 text-slate-500" />
                                Activités exclues
                            </h3>
                            {currentDoctor.excludedActivities && currentDoctor.excludedActivities.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                    {currentDoctor.excludedActivities.map(actId => {
                                        const activity = activityDefinitions.find(a => a.id === actId);
                                        return (
                                            <span key={actId} className="px-2 py-1 text-xs rounded bg-slate-100 text-slate-600 font-medium line-through">
                                                {activity?.name || actId}
                                            </span>
                                        );
                                    })}
                                </div>
                            ) : (
                                <p className="text-sm text-slate-400 italic">Aucune activité exclue</p>
                            )}
                        </div>

                        {/* Types de créneaux exclus */}
                        <div>
                            <h3 className="text-sm font-bold text-slate-700 mb-2 flex items-center">
                                <AlertTriangle className="w-4 h-4 mr-2 text-orange-500" />
                                Types de créneaux exclus
                            </h3>
                            {currentDoctor.excludedSlotTypes && currentDoctor.excludedSlotTypes.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                    {currentDoctor.excludedSlotTypes.map(type => (
                                        <span key={type} className="px-2 py-1 text-xs rounded bg-orange-100 text-orange-800 font-medium">
                                            {type === SlotType.CONSULTATION ? 'Consultation' :
                                                type === SlotType.RCP ? 'RCP' :
                                                    type === SlotType.ACTIVITY ? 'Activité' : type}
                                        </span>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm text-slate-400 italic">Aucun type exclu</p>
                            )}
                        </div>

                        <p className="text-xs text-slate-400 pt-2 border-t border-slate-100">
                            Ces paramètres sont gérés par l'administrateur. Contactez votre responsable pour toute modification.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Profile;

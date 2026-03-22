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
import { resolveReplacementRequest, acceptAndAssignReplacement } from '../services/replacementService';
import { useNotificationPreferences, ALL_NOTIFICATION_TYPES, NOTIFICATION_TYPE_LABELS } from '../hooks/useNotificationPreferences';
import { createNotification } from '../services/notificationService';
import { SlotType, Doctor, Period, Specialty, Conflict, ScheduleSlot } from '../types';
import { getDateForDayOfWeek, isFrenchHoliday, generateScheduleForWeek, detectConflicts } from '../services/scheduleService';
import { supabase } from '../services/supabaseClient';
import { useNotifications } from '../context/NotificationContext';
import { usePushNotifications } from '../hooks/usePushNotifications';
import AbsenceConflictsModal from '../components/AbsenceConflictsModal';
import ConflictResolverModal from '../components/ConflictResolverModal';

const NOTIF_ICON: Record<string, string> = {
    RCP_AUTO_ASSIGNED: '🎲', RCP_SLOT_FILLED: '✅', RCP_REMINDER_24H: '⏰',
    RCP_REMINDER_12H: '⚠️', RCP_UNASSIGNED_ALERT: '🚨',
    REPLACEMENT_REQUEST: '🔄', REPLACEMENT_ACCEPTED: '✅', REPLACEMENT_REJECTED: '❌',
};

const NotificationSection: React.FC<{
    notifications: any[];
    unreadCount: number;
    markRead: (id: string) => Promise<void>;
    markAllRead: () => Promise<void>;
    clearAll: () => Promise<void>;
    loading: boolean;
    currentDoctorName?: string;
    userId?: string;
    currentDoctorId?: string;
    // Called after ACCEPTED — caller owns AppContext update (mirrors ConflictResolverModal)
    onAccepted?: (slotId: string, acceptorDoctorId: string, requesterDoctorId: string, slotType: string) => void;
}> = ({ notifications, unreadCount, markRead, markAllRead, clearAll, loading, currentDoctorName, userId, currentDoctorId, onAccepted }) => {
    const [resolvedMap, setResolvedMap] = useState<Record<string, 'ACCEPTED' | 'REJECTED'>>({});
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [clearing, setClearing] = useState(false);
    const { permission, isStandalone, subscribe, loading: pushLoading, error: pushError } = usePushNotifications(userId);
    const { isEnabled, toggle, loading: prefsLoading } = useNotificationPreferences(userId);

    const handleReplacement = async (n: any, status: 'ACCEPTED' | 'REJECTED') => {
        const requestId = n.data?.requestId as string | undefined;
        const slotId = n.data?.slotId as string | undefined;
        const slotType = n.data?.slotType as string | undefined;
        if (!requestId) return;
        setActionLoading(requestId);
        try {
            // Always resolve the request first (gets us requesterDoctorId)
            const resolved = await resolveReplacementRequest(requestId, status);

            if (status === 'ACCEPTED' && slotId && currentDoctorId) {
                // Delegate AppContext + DB assignment to the parent — same logic
                // as ConflictResolverModal's handleRcpDirectReplacement / handleResolve
                onAccepted?.(slotId, currentDoctorId, resolved.requesterDoctorId, slotType ?? '');
            }

            // Notify the original requester of the outcome
            const { data: requesterProfile } = await supabase
                .from('profiles').select('id').eq('doctor_id', resolved.requesterDoctorId).single();
            if (requesterProfile) {
                await createNotification({
                    user_id: requesterProfile.id,
                    type: status === 'ACCEPTED' ? 'REPLACEMENT_ACCEPTED' : 'REPLACEMENT_REJECTED',
                    title: status === 'ACCEPTED' ? 'Remplacement accepté ✅' : 'Remplacement refusé ❌',
                    body: `${currentDoctorName ? `Dr. ${currentDoctorName} a ` : ''}${status === 'ACCEPTED' ? 'accepté' : 'refusé'} votre demande de remplacement pour le ${resolved.slotDate} (${resolved.period}).`,
                    data: { requestId, slotId: resolved.slotId },
                    read: false,
                });
            }
            // Stamp the notification with resolution so it survives page refresh
            await supabase.from('notifications')
                .update({ data: { requestId, slotId: resolved.slotId, slotType, resolution: status }, read: true })
                .eq('id', n.id);
            setResolvedMap(prev => ({ ...prev, [n.id]: status }));
        } catch (e) {
            console.error(e);
        } finally {
            setActionLoading(null);
        }
    };

    const REPLACEMENT_TYPES = ['REPLACEMENT_REQUEST', 'REPLACEMENT_ACCEPTED', 'REPLACEMENT_REJECTED'];
    const filteredNotifications = notifications.filter((n: any) => REPLACEMENT_TYPES.includes(n.type));
    const filteredUnreadCount = filteredNotifications.filter((n: any) => !n.read).length;

    return (
        <div className="space-y-3">
            {/* Push notification subscription */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm text-slate-600 min-w-0">
                <span className="text-base flex-shrink-0">
                  {permission === 'granted' ? '🔔' : '🔕'}
                </span>
                <span className="truncate">Notifications push</span>
              </div>
              <div className="flex-shrink-0">
                {permission === 'not-standalone' && (
                  <span className="text-xs text-amber-600 text-right block max-w-[160px]">
                    Installez l'app sur votre écran d'accueil pour activer
                  </span>
                )}
                {permission === 'unsupported' && (
                  <span className="text-xs text-slate-400">Non supporté</span>
                )}
                {permission === 'default' && (
                  <button
                    onClick={subscribe}
                    disabled={pushLoading}
                    className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {pushLoading ? 'Activation...' : 'Activer'}
                  </button>
                )}
                {permission === 'granted' && (
                  <span className="text-xs text-green-600 font-medium">Activées ✓</span>
                )}
                {permission === 'denied' && (
                  <span className="text-xs text-red-500 text-right block max-w-[160px]">
                    Bloquées — vérifiez les paramètres du navigateur
                  </span>
                )}
              </div>
            </div>
            {pushError && (
              <p className="text-xs text-red-500">{pushError}</p>
            )}

            {/* Per-type notification preferences — only visible when push is granted */}
            {permission === 'granted' && (
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2.5">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Types de notifications push
                </p>
                {ALL_NOTIFICATION_TYPES.map(type => (
                  <div key={type} className="flex items-center justify-between gap-3">
                    <span className="text-sm text-slate-700">{NOTIFICATION_TYPE_LABELS[type]}</span>
                    <button
                      disabled={prefsLoading}
                      onClick={() => toggle(type)}
                      aria-label={`${isEnabled(type) ? 'Désactiver' : 'Activer'} ${NOTIFICATION_TYPE_LABELS[type]}`}
                      className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50
                        ${isEnabled(type) ? 'bg-blue-600' : 'bg-slate-300'}`}
                    >
                      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform
                        ${isEnabled(type) ? 'translate-x-4' : 'translate-x-0.5'}`} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-700 flex items-center gap-2">
                    Mes notifications
                    {filteredUnreadCount > 0 && (
                        <span className="bg-red-500 text-white text-xs rounded-full px-2 py-0.5">{filteredUnreadCount}</span>
                    )}
                </h2>
                <div className="flex items-center gap-3">
                    {filteredUnreadCount > 0 && (
                        <button onClick={markAllRead} className="text-sm text-blue-600 hover:underline">Tout marquer lu</button>
                    )}
                    {filteredNotifications.length > 0 && (
                        <button
                            onClick={async () => { setClearing(true); try { await clearAll(); } finally { setClearing(false); } }}
                            disabled={clearing}
                            className="text-sm text-red-500 hover:text-red-700 flex items-center gap-1 disabled:opacity-50">
                            <Trash2 className="w-3.5 h-3.5" /> Vider
                        </button>
                    )}
                </div>
            </div>

            {loading && <p className="text-sm text-gray-400 py-6 text-center">Chargement...</p>}
            {!loading && filteredNotifications.length === 0 && (
                <p className="text-sm text-gray-400 py-6 text-center">Aucune notification de remplacement</p>
            )}

            <div className="space-y-2">
                {filteredNotifications.map((n: any) => {
                    const icon = NOTIF_ICON[n.type] ?? '🔔';
                    const requestId = n.data?.requestId as string | undefined;
                    const resolution = resolvedMap[n.id];
                    return (
                        <div key={n.id}
                            onClick={() => !requestId && markRead(n.id)}
                            className={`rounded-xl p-3.5 border transition-colors
                                ${n.read ? 'bg-white border-gray-200' : 'bg-blue-50 border-blue-200'}
                                ${!requestId ? 'cursor-pointer hover:bg-gray-50' : ''}`}
                        >
                            <div className="flex items-start gap-2">
                                <span className="text-base mt-0.5 shrink-0">{icon}</span>
                                {!n.read && <span className="w-2 h-2 bg-blue-500 rounded-full mt-1.5 shrink-0" />}
                                <div className="flex-1">
                                    <p className={`text-sm ${n.read ? 'text-gray-700' : 'font-semibold text-gray-800'}`}>{n.title}</p>
                                    <p className="text-xs text-gray-500 mt-0.5">{n.body}</p>
                                    <p className="text-xs text-gray-400 mt-1">{new Date(n.created_at).toLocaleString('fr-FR')}</p>
                                    {n.type === 'REPLACEMENT_REQUEST' && requestId && (
                                        (resolution || n.data?.resolution) ? (
                                            <div className={`mt-2 text-xs px-3 py-1.5 rounded-lg font-medium inline-flex items-center gap-1 ${(resolution || n.data?.resolution) === 'ACCEPTED' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                {(resolution || n.data?.resolution) === 'ACCEPTED' ? '✅ Vous avez accepté ce remplacement' : '❌ Vous avez refusé ce remplacement'}
                                            </div>
                                        ) : (
                                            <div className="flex gap-2 mt-2">
                                                <button onClick={(e) => { e.stopPropagation(); handleReplacement(n, 'ACCEPTED'); }}
                                                    disabled={actionLoading === requestId}
                                                    className="text-xs bg-green-100 text-green-700 px-3 py-1.5 rounded-full hover:bg-green-200 disabled:opacity-50 font-medium">
                                                    Accepter
                                                </button>
                                                <button onClick={(e) => { e.stopPropagation(); handleReplacement(n, 'REJECTED'); }}
                                                    disabled={actionLoading === requestId}
                                                    className="text-xs bg-red-100 text-red-700 px-3 py-1.5 rounded-full hover:bg-red-200 disabled:opacity-50 font-medium">
                                                    Refuser
                                                </button>
                                            </div>
                                        )
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

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
        setProfileRcpWeekOffset,
        shiftHistory,
        effectiveHistory,
        updateSchedule,
        schedule,
        manualOverrides,
        setManualOverrides,
    } = useContext(AppContext);

    const { profile, loading: authLoading } = useAuth();
    const { notifications, unreadCount, markRead, markAllRead, clearAll, loading: notifLoading } = useNotifications();
    const navigate = useNavigate();

    // Tab state for bottom section
    const [activeTab, setActiveTab] = useState<'notifications' | 'absences' | 'preferences' | 'rcp' | 'conflits'>('rcp');

    // Find the doctor linked to the current user
    const [currentDoctor, setCurrentDoctor] = useState<Doctor | null>(null);
    const [loadingDoctor, setLoadingDoctor] = useState(true);

    // Form states
    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
    const [absencePeriod, setAbsencePeriod] = useState<'ALL_DAY' | Period>('ALL_DAY');
    const [reason, setReason] = useState('CONGRES');
    const [customReason, setCustomReason] = useState("");

    // Absence conflict resolution modal
    const [absenceConflictModal, setAbsenceConflictModal] = useState<{
        startDate: string;
        endDate: string;
        period: 'ALL_DAY' | Period;
    } | null>(null);

    // Conflicts tab state
    const [conflictsWeekOffset, setConflictsWeekOffset] = useState(0);
    const [conflictModalSlot, setConflictModalSlot] = useState<ScheduleSlot | null>(null);
    const [conflictModalConflict, setConflictModalConflict] = useState<Conflict | null>(null);

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

    // Conflicts tab: generate schedule and detect conflicts for the current doctor's week
    const conflictsWeekSchedule = useMemo(() => {
        if (!currentDoctor) return [];

        const weekStart = new Date();
        const day = weekStart.getDay();
        weekStart.setDate(weekStart.getDate() - day + (day === 0 ? -6 : 1) + (conflictsWeekOffset * 7));
        weekStart.setHours(0, 0, 0, 0);

        return generateScheduleForWeek(
            weekStart, template, unavailabilities, doctors,
            activityDefinitions, rcpTypes, false, {},
            rcpAttendance, rcpExceptions
        );
    }, [currentDoctor, conflictsWeekOffset, template, unavailabilities, doctors, activityDefinitions, rcpTypes, rcpAttendance, rcpExceptions]);

    const profileConflicts = useMemo(() => {
        if (!currentDoctor || conflictsWeekSchedule.length === 0) return [];

        const allConflicts = detectConflicts(conflictsWeekSchedule, unavailabilities, doctors, activityDefinitions);
        return allConflicts.filter(c => c.doctorId === currentDoctor.id);
    }, [currentDoctor, conflictsWeekSchedule, unavailabilities, doctors, activityDefinitions]);

    const getConflictsWeekLabel = () => {
        const today = new Date();
        const currentMonday = new Date(today);
        const day = currentMonday.getDay();
        const diff = currentMonday.getDate() - day + (day === 0 ? -6 : 1);
        currentMonday.setDate(diff);

        const targetMonday = new Date(currentMonday);
        targetMonday.setDate(targetMonday.getDate() + (conflictsWeekOffset * 7));

        if (conflictsWeekOffset === 0) return "Cette Semaine";
        if (conflictsWeekOffset === 1) return "Semaine Prochaine";
        return `Semaine du ${targetMonday.getDate()}/${targetMonday.getMonth() + 1}`;
    };

    const handleConflictResolve = (slotId: string, newDoctorId: string) => {
        const newOverrides = { ...manualOverrides, [slotId]: newDoctorId };
        setManualOverrides(newOverrides);
        setConflictModalSlot(null);
        setConflictModalConflict(null);
    };

    const handleConflictCloseSlot = (slotId: string) => {
        const newOverrides = { ...manualOverrides, [slotId]: '__CLOSED__' };
        setManualOverrides(newOverrides);
        setConflictModalSlot(null);
        setConflictModalConflict(null);
    };

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
                isManual: false,
                isExceptional: false
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
                    isManual: true,
                    isExceptional: false
                };
            });

        // Exceptional RCPs: doctor is PRESENT in rcpAttendance but NOT in any template assignment
        const exceptionalRcps: typeof standardRcps = [];
        template
            .filter(t => t.type === SlotType.RCP)
            .filter(t => {
                // Skip templates where doctor is already assigned (handled by standardRcps)
                const isAssigned = (t.doctorIds && t.doctorIds.includes(currentDoctor.id)) ||
                    t.defaultDoctorId === currentDoctor.id ||
                    (t.secondaryDoctorIds && t.secondaryDoctorIds.includes(currentDoctor.id)) ||
                    t.backupDoctorId === currentDoctor.id;
                return !isAssigned;
            })
            .forEach(t => {
                const slotDate = getDateForDayOfWeek(targetMonday, t.day);
                const generatedId = `${t.id}-${slotDate}`;
                const currentMap = rcpAttendance[generatedId] || {};

                // Only include if doctor has PRESENT status (exceptional replacement)
                if (currentMap[currentDoctor.id] !== 'PRESENT') return;

                const exception = rcpExceptions.find(ex => ex.rcpTemplateId === t.id && ex.originalDate === slotDate);
                const displayDate = exception?.newDate || slotDate;
                const displayTime = exception?.newTime || t.time || 'N/A';
                const holiday = isFrenchHoliday(displayDate);
                const myStatus = currentMap[currentDoctor.id];

                const allAssignedDoctorIds = [...new Set(
                    Object.keys(currentMap).filter(id => currentMap[id] === 'PRESENT' && id !== currentDoctor.id)
                )];

                const colleaguesStatus = allAssignedDoctorIds.map(dId => {
                    const doctor = doctors.find(d => d.id === dId);
                    return { id: dId, name: doctor?.name || 'Inconnu', status: currentMap[dId] || null };
                });

                exceptionalRcps.push({
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
                    isManual: false,
                    isExceptional: true  // Flag for UI badge
                });
            });

        return [...standardRcps, ...manualRcps, ...exceptionalRcps].sort((a, b) => (a?.date || '').localeCompare(b?.date || ''));
    };

    // Derive lock status from existing rcpAttendance (no new state needed)
    const getRcpLockInfo = (slotKey: string): { lockedByDoctorId: string | null } => {
        const slotAttendance = rcpAttendance[slotKey] ?? {};
        const lockedByDoctorId =
            Object.entries(slotAttendance).find(([, status]) => status === 'PRESENT')?.[0] ?? null;
        return { lockedByDoctorId };
    };

    const handleAttendanceToggle = async (slotId: string, status: 'PRESENT' | 'ABSENT') => {
        if (!currentDoctor) return;
        // Block PRÉSENT if slot is already locked by someone else
        const { lockedByDoctorId } = getRcpLockInfo(slotId);
        if (status === 'PRESENT' && lockedByDoctorId && lockedByDoctorId !== currentDoctor.id) {
            return; // slot locked by someone else
        }
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

        // Save dates before resetting form
        const savedStartDate = startDate;
        const savedEndDate = endDate;
        const savedPeriod = absencePeriod;

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

        // Show conflict resolution modal for impacted slots
        setAbsenceConflictModal({
            startDate: savedStartDate,
            endDate: savedEndDate,
            period: savedPeriod,
        });
    };

    const handleAbsenceConflictResolve = (slotId: string, newDoctorId: string) => {
        const updatedSchedule = schedule.map(s =>
            s.id === slotId ? { ...s, assignedDoctorId: newDoctorId } : s
        );
        updateSchedule(updatedSchedule);
    };

    const handleAbsenceConflictClose = (slotId: string) => {
        const updatedSchedule = schedule.map(s =>
            s.id === slotId ? { ...s, isClosed: true, assignedDoctorId: null } : s
        );
        updateSchedule(updatedSchedule);
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

    const rcpNotifications = getUnconfirmedRcpNotifications();

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
        <div className="max-w-5xl mx-auto space-y-3 md:space-y-6 pb-20 p-1 md:p-4">

            {/* HEADER CARD */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-4 md:p-8 text-white">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                        <div className="flex items-center">
                            <div
                                className="w-12 h-12 md:w-20 md:h-20 rounded-full flex items-center justify-center text-lg md:text-2xl font-bold shadow-lg mr-3 md:mr-6 border-4 border-white/20"
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
                                            <h1 className="text-lg md:text-2xl font-bold">{currentDoctor.name}</h1>
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
                        <div className="text-right text-xs md:text-sm text-blue-100">
                            <div>{profile.email}</div>
                            <div className="text-xs mt-1 opacity-75">{profile.role_name || profile.role}</div>
                        </div>
                    </div>
                </div>

            </div>

            {/* BOTTOM SECTION: TABS */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                {/* Tab Navigation */}
                <div className="flex border-b border-slate-200">
                    <button
                        onClick={() => setActiveTab('rcp')}
                        className={`flex-1 py-3 text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${activeTab === 'rcp' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        <CheckCircle2 className="w-4 h-4" />
                        RCP
                    </button>
                    <button
                        onClick={() => setActiveTab('notifications')}
                        className={`flex-1 py-3 text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${activeTab === 'notifications' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        <Bell className="w-4 h-4" />
                        Notifications
                        {unreadCount > 0 && (
                            <span className="bg-red-500 text-white text-[10px] rounded-full px-1.5 py-0.5 leading-none">
                                {unreadCount}
                            </span>
                        )}
                    </button>
                    <button
                        onClick={() => setActiveTab('absences')}
                        className={`flex-1 py-3 text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${activeTab === 'absences' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        <Calendar className="w-4 h-4" />
                        Absences
                    </button>
                    <button
                        onClick={() => setActiveTab('preferences')}
                        className={`flex-1 py-3 text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${activeTab === 'preferences' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        <Briefcase className="w-4 h-4" />
                        Préférences
                    </button>
                    <button
                        onClick={() => setActiveTab('conflits')}
                        className={`flex-1 py-3 text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${activeTab === 'conflits' ? 'border-b-2 border-red-600 text-red-600' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        <AlertTriangle className="w-4 h-4" />
                        Conflits
                        {profileConflicts.length > 0 && (
                            <span className="bg-red-500 text-white text-[10px] rounded-full px-1.5 py-0.5 leading-none">
                                {profileConflicts.length}
                            </span>
                        )}
                    </button>
                </div>

                {/* Tab Content */}
                <div className="p-4 md:p-6">
                    {activeTab === 'notifications' && (
                        <NotificationSection
                            notifications={notifications}
                            unreadCount={unreadCount}
                            markRead={markRead}
                            markAllRead={markAllRead}
                            clearAll={clearAll}
                            loading={notifLoading}
                            currentDoctorName={doctors.find(d => d.id === profile?.doctor_id)?.name}
                            userId={profile?.id}
                            currentDoctorId={profile?.doctor_id ?? undefined}
                            onAccepted={async (slotId, acceptorId, requesterId, slotType) => {
                                if (slotType === 'RCP') {
                                    // Mirror handleRcpDirectReplacement in ConflictResolverModal:
                                    // mark requester ABSENT + acceptor PRESENT
                                    const currentMap = rcpAttendance[slotId] ?? {};
                                    const newMap = {
                                        ...currentMap,
                                        [requesterId]: 'ABSENT' as const,
                                        [acceptorId]:  'PRESENT' as const,
                                    };
                                    setRcpAttendance({ ...rcpAttendance, [slotId]: newMap });
                                    await Promise.all([
                                        supabase.from('rcp_attendance').upsert(
                                            { slot_id: slotId, doctor_id: requesterId, status: 'ABSENT' },
                                            { onConflict: 'slot_id,doctor_id' }
                                        ),
                                        supabase.from('rcp_attendance').upsert(
                                            { slot_id: slotId, doctor_id: acceptorId, status: 'PRESENT' },
                                            { onConflict: 'slot_id,doctor_id' }
                                        ),
                                    ]);
                                } else {
                                    // Mirror handleResolve in Dashboard:
                                    // setManualOverrides wrapper updates AppContext + persists to DB
                                    setManualOverrides({ ...manualOverrides, [slotId]: acceptorId });
                                }
                            }}
                        />
                    )}

                    {activeTab === 'absences' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8">

                {/* ABSENCES */}
                <div>
                    <h2 className="text-sm md:text-lg font-bold text-slate-800 mb-3 md:mb-4 flex items-center">
                        <Calendar className="w-4 h-4 md:w-5 md:h-5 mr-1.5 md:mr-2 text-blue-500" />
                        Déclarer une absence
                    </h2>

                    <form onSubmit={handleAddUnavailability} className="bg-white p-3 md:p-5 rounded-xl border border-slate-200 mb-4 md:mb-6 space-y-3 md:space-y-4 shadow-sm">
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

            </div>
        )}

                    {activeTab === 'rcp' && (
                        <div>
                            {/* Week navigation */}
                            <div className="flex items-center justify-between mb-4">
                                <button onClick={() => setNotifWeekOffset(notifWeekOffset - 1)} className="p-1 hover:bg-slate-100 rounded-lg">
                                    <ChevronLeft className="w-5 h-5 text-slate-600" />
                                </button>
                                <span className="text-sm font-semibold text-slate-700">{getNotificationWeekLabel()}</span>
                                <button onClick={() => setNotifWeekOffset(notifWeekOffset + 1)} className="p-1 hover:bg-slate-100 rounded-lg">
                                    <ChevronRight className="w-5 h-5 text-slate-600" />
                                </button>
                            </div>

                            {upcomingRcps.length === 0 ? (
                                <p className="text-center text-slate-400 py-8 text-sm italic">Aucun RCP cette semaine</p>
                            ) : (
                                <div className="space-y-3">
                                    {upcomingRcps.map((rcp, idx) => {
                                        const { lockedByDoctorId } = getRcpLockInfo(rcp.generatedId);
                                        const lockedByOther = lockedByDoctorId && lockedByDoctorId !== currentDoctor!.id;
                                        const lockedDoctor = lockedByOther ? doctors.find(d => d.id === lockedByDoctorId) : null;
                                        return (
                                            <div key={idx} className={`border rounded-xl p-4 ${rcp.isCancelled ? 'opacity-50 bg-slate-50' : 'bg-white border-slate-200'}`}>
                                                {/* Header */}
                                                <div className="flex items-start justify-between gap-2">
                                                    <div className="flex-1">
                                                        <p className="font-semibold text-slate-800 text-sm">
                                                            {rcp.template.location || rcp.template.id}
                                                            {rcp.isExceptional && (
                                                                <span className="ml-2 text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full border border-amber-200 font-bold">
                                                                    Exceptionnel
                                                                </span>
                                                            )}
                                                        </p>
                                                        <p className="text-xs text-slate-500 mt-0.5">
                                                            {new Date(rcp.date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long' })}
                                                            {rcp.time !== 'N/A' && ` · ${rcp.time}`}
                                                        </p>
                                                    </div>
                                                    <div className="flex flex-wrap gap-1 justify-end shrink-0">
                                                        {rcp.isCancelled && <span className="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium">Annulé</span>}
                                                        {rcp.isMoved && <span className="text-[10px] bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-medium">Déplacé</span>}
                                                        {rcp.holiday && <span className="text-[10px] bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">Férié</span>}
                                                    </div>
                                                </div>

                                                {!rcp.isCancelled && (
                                                    <>
                                                        {/* Lock: confirmed by colleague */}
                                                        {lockedByOther && (
                                                            <div className="mt-2 text-xs text-blue-600 bg-blue-50 rounded-lg px-3 py-1.5 flex items-center gap-1.5">
                                                                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                                                Confirmé par {lockedDoctor?.name || 'un collègue'}
                                                            </div>
                                                        )}

                                                        {/* My decision + action buttons */}
                                                        <div className="mt-3 flex items-center gap-2 flex-wrap">
                                                            {rcp.myStatus === 'PRESENT' && (
                                                                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                                                                    <CheckCircle2 className="w-3 h-3" /> Présent
                                                                </span>
                                                            )}
                                                            {rcp.myStatus === 'ABSENT' && (
                                                                <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                                                                    <XCircle className="w-3 h-3" /> Absent
                                                                </span>
                                                            )}
                                                            <div className="flex gap-2 ml-auto">
                                                                {!lockedByOther && (
                                                                    <button
                                                                        onClick={() => handleAttendanceToggle(rcp.generatedId, 'PRESENT')}
                                                                        disabled={rcp.myStatus === 'PRESENT'}
                                                                        className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${rcp.myStatus === 'PRESENT' ? 'bg-green-600 text-white cursor-default' : 'bg-slate-100 text-slate-700 hover:bg-green-50 hover:text-green-700'}`}
                                                                    >
                                                                        Présent
                                                                    </button>
                                                                )}
                                                                <button
                                                                    onClick={() => handleAttendanceToggle(rcp.generatedId, 'ABSENT')}
                                                                    disabled={rcp.myStatus === 'ABSENT'}
                                                                    className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${rcp.myStatus === 'ABSENT' ? 'bg-red-500 text-white cursor-default' : 'bg-slate-100 text-slate-700 hover:bg-red-50 hover:text-red-600'}`}
                                                                >
                                                                    Absent
                                                                </button>
                                                                {rcp.myStatus && (
                                                                    <button onClick={() => handleClearDecision(rcp.generatedId)}
                                                                        className="text-xs px-2 py-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100" title="Réinitialiser">
                                                                        <RotateCcw className="w-3.5 h-3.5" />
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>

                                                        {/* Colleagues */}
                                                        {rcp.colleaguesStatus.length > 0 && (
                                                            <div className="mt-3 pt-3 border-t border-slate-100">
                                                                <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-1.5">Collègues</p>
                                                                <div className="flex flex-wrap gap-1.5">
                                                                    {rcp.colleaguesStatus.map((col: any) => (
                                                                        <span key={col.id} className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${col.status === 'PRESENT' ? 'bg-green-100 text-green-700' : col.status === 'ABSENT' ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-500'}`}>
                                                                            {col.name}{col.status === 'PRESENT' ? ' ✓' : col.status === 'ABSENT' ? ' ✗' : ' ?'}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'preferences' && (
                        <div>
                            <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center">
                                <Briefcase className="w-5 h-5 mr-2 text-purple-500" />
                                Mes Préférences & Exclusions
                            </h2>
                            <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
                                {/* Demi-journées non travaillées (récurrentes) */}
                                <div>
                                    <h3 className="text-sm font-bold text-slate-700 mb-2 flex items-center">
                                        <Calendar className="w-4 h-4 mr-2 text-red-500" />
                                        Demi-journées non travaillées (récurrentes)
                                    </h3>
                                    {(currentDoctor as any).excludedHalfDays && (currentDoctor as any).excludedHalfDays.length > 0 ? (
                                        <div className="flex flex-wrap gap-1">
                                            {(currentDoctor as any).excludedHalfDays.map((excl: any, idx: number) => (
                                                <span key={idx} className={`px-2 py-1 text-xs rounded font-medium ${excl.period === Period.MORNING ? 'bg-orange-100 text-orange-800' : 'bg-blue-100 text-blue-800'}`}>
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
                                                    {type === SlotType.CONSULTATION ? 'Consultation' : type === SlotType.RCP ? 'RCP' : type === SlotType.ACTIVITY ? 'Activité' : type}
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
                    )}
                    {activeTab === 'conflits' && (
                        <div>
                            {/* Week navigation */}
                            <div className="flex items-center justify-between mb-4">
                                <button onClick={() => setConflictsWeekOffset(prev => prev - 1)} className="p-2 hover:bg-slate-100 rounded-lg transition">
                                    <ChevronLeft className="w-5 h-5 text-slate-600" />
                                </button>
                                <div className="text-center">
                                    <h3 className="font-bold text-slate-800">{getConflictsWeekLabel()}</h3>
                                    <p className="text-xs text-slate-500">{profileConflicts.length} conflit{profileConflicts.length !== 1 ? 's' : ''}</p>
                                </div>
                                <button onClick={() => setConflictsWeekOffset(prev => prev + 1)} className="p-2 hover:bg-slate-100 rounded-lg transition">
                                    <ChevronRight className="w-5 h-5 text-slate-600" />
                                </button>
                            </div>

                            {/* Conflict list */}
                            {profileConflicts.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                                    <CheckCircle2 className="w-10 h-10 mb-3 text-green-400" />
                                    <span className="text-sm font-medium">Aucun conflit sur cette semaine</span>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {profileConflicts.map(conflict => {
                                        const slot = conflictsWeekSchedule.find(s => s.id === conflict.slotId);
                                        if (!slot) return null;

                                        return (
                                            <div
                                                key={conflict.id}
                                                onClick={() => {
                                                    setConflictModalSlot(slot);
                                                    setConflictModalConflict(conflict);
                                                }}
                                                className="p-3 bg-white border border-red-100 rounded-lg shadow-sm hover:border-red-300 hover:shadow-md transition-all cursor-pointer relative group"
                                            >
                                                <div className="flex justify-between items-start mb-1">
                                                    <span className="text-[10px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full border border-red-100 uppercase">
                                                        {conflict.type === 'DOUBLE_BOOKING' ? 'Double Réservation' : conflict.type === 'COMPETENCE_MISMATCH' ? 'Compétence' : 'Indisponibilité'}
                                                    </span>
                                                    <span className="text-[10px] text-slate-500 font-mono flex items-center gap-1">
                                                        {slot.date
                                                            ? new Date(slot.date + 'T12:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
                                                            : slot.day?.substring(0, 3)
                                                        }
                                                        {' · '}{slot.period === Period.MORNING ? 'Matin' : 'Après-midi'}
                                                    </span>
                                                </div>
                                                <p className="text-sm font-medium text-slate-700 mt-2">{slot.location || slot.subType}</p>
                                                <p className="text-xs text-slate-500 mt-1">{conflict.description}</p>
                                                <div className="absolute right-2 bottom-2 text-xs text-blue-600 font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                                                    Résoudre →
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        {absenceConflictModal && currentDoctor && (
            <AbsenceConflictsModal
                doctorId={currentDoctor.id}
                doctorName={currentDoctor.name}
                startDate={absenceConflictModal.startDate}
                endDate={absenceConflictModal.endDate}
                period={absenceConflictModal.period}
                doctors={doctors}
                template={template}
                unavailabilities={unavailabilities}
                activityDefinitions={activityDefinitions}
                shiftHistory={effectiveHistory}
                rcpTypes={rcpTypes}
                rcpAttendance={rcpAttendance}
                rcpExceptions={rcpExceptions}
                onResolve={handleAbsenceConflictResolve}
                onCloseSlot={handleAbsenceConflictClose}
                onDismiss={() => setAbsenceConflictModal(null)}
            />
        )}
        {conflictModalSlot && (
            <ConflictResolverModal
                slot={conflictModalSlot}
                conflict={conflictModalConflict || undefined}
                doctors={doctors}
                slots={conflictsWeekSchedule}
                unavailabilities={unavailabilities}
                onClose={() => { setConflictModalSlot(null); setConflictModalConflict(null); }}
                onResolve={handleConflictResolve}
                onCloseSlot={handleConflictCloseSlot}
            />
        )}
        </div>
    );
};

export default Profile;

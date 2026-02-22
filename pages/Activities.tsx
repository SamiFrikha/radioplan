import React, { useContext, useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { AppContext } from '../App';
import { useAuth } from '../context/AuthContext';
import { DayOfWeek, Period, SlotType, Conflict, ScheduleSlot, Doctor, ActivityDefinition } from '../types';
import { Activity, Plus, Settings, User, Wand2, ChevronLeft, ChevronRight, Calendar, LayoutGrid, AlertTriangle, Minimize2, Maximize2, Printer, Loader2, X, FileText, Trash2, Edit, Save, Layers, Lock, CheckCircle, Shield, History, Clock, UserCircle, ChevronDown } from 'lucide-react';
import { generateMonthSchedule, getDateForDayOfWeek, generateScheduleForWeek, detectConflicts, getDoctorWorkRate, computeHistoryFromDate, isFrenchHoliday } from '../services/scheduleService';
import ConflictResolverModal from '../components/ConflictResolverModal';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { activityLogService, ActivityLogEntry } from '../services/activityLogService';

// Predefined equity groups
const EQUITY_GROUPS = [
    { id: 'unity_astreinte', name: 'Unity + Astreinte', color: 'bg-orange-100 text-orange-800' },
    { id: 'workflow', name: 'Supervision Workflow', color: 'bg-emerald-100 text-emerald-800' },
    { id: 'custom', name: 'Équité indépendante', color: 'bg-purple-100 text-purple-800' }
];

const Activities: React.FC = () => {
    const {
        activityDefinitions,
        addActivityDefinition,
        updateActivityDefinition,
        removeActivityDefinition,
        doctors,
        template,
        unavailabilities,
        shiftHistory,
        rcpTypes,
        manualOverrides,
        setManualOverrides,
        rcpAttendance,
        rcpExceptions,
        activitiesStartDate,
        validatedWeeks,
        validateWeek,
        unvalidateWeek,
        activitiesWeekOffset,
        setActivitiesWeekOffset,
        activitiesActiveTab,
        setActivitiesActiveTab
    } = useContext(AppContext);

    const { profile } = useAuth();
    const isAdmin = profile?.role === 'Admin' || profile?.role_name === 'Admin';

    // --- ACTIVITY LOG STATE ---
    const [showLogPanel, setShowLogPanel] = useState(false);
    const [logEntries, setLogEntries] = useState<ActivityLogEntry[]>([]);
    const [logFilter, setLogFilter] = useState<'ALL' | 'WEEK'>('ALL');
    const [isLoadingLogs, setIsLoadingLogs] = useState(false);

    // Get the user's display name for logs
    const getUserDisplayName = useCallback(() => {
        if (!profile) return 'Utilisateur inconnu';
        if (profile.doctor_id) {
            const doc = doctors.find(d => d.id === profile.doctor_id);
            if (doc) return doc.name;
        }
        return profile.email || 'Utilisateur';
    }, [profile, doctors]);

    // Use context weekOffset (survives re-renders caused by parent state changes)
    const weekOffset = activitiesWeekOffset;
    const setWeekOffset = setActivitiesWeekOffset;

    // DEBUG: Log when weekOffset changes
    console.log('🔵 Activities render - weekOffset:', weekOffset);

    // Compute currentWeekStart from offset - stable reference
    const currentWeekStart = useMemo(() => {
        const d = new Date();
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        d.setDate(diff + (weekOffset * 7));
        d.setHours(0, 0, 0, 0);
        console.log('🔵 Computed currentWeekStart:', d.toISOString().split('T')[0], 'from offset:', weekOffset);
        return d;
    }, [weekOffset]);

    // Check if current week is validated (locked)
    const currentWeekKey = currentWeekStart.toISOString().split('T')[0];
    const isCurrentWeekValidated = validatedWeeks?.includes(currentWeekKey) || false;

    // Helper to add a log entry (defined after currentWeekKey)
    const addLog = useCallback(async (action: string, description: string, opts?: { activityName?: string; doctorName?: string; details?: string }) => {
        if (!profile) return;
        await activityLogService.addLog({
            userId: profile.id,
            userEmail: profile.email,
            userName: getUserDisplayName(),
            action,
            description,
            weekKey: currentWeekKey,
            activityName: opts?.activityName,
            doctorName: opts?.doctorName,
            details: opts?.details
        });
    }, [profile, getUserDisplayName, currentWeekKey]);

    // Load logs when panel opens
    const loadLogs = useCallback(async () => {
        setIsLoadingLogs(true);
        try {
            const weekFilter = logFilter === 'WEEK' ? currentWeekKey : undefined;
            const entries = await activityLogService.getLogs(weekFilter, 200);
            setLogEntries(entries);
        } catch (err) {
            console.error('Failed to load logs:', err);
        } finally {
            setIsLoadingLogs(false);
        }
    }, [logFilter, currentWeekKey]);

    useEffect(() => {
        if (showLogPanel) {
            loadLogs();
        }
    }, [showLogPanel, loadLogs]);

    // Check if we can navigate to previous week (must not go before start date's week)
    const canNavigatePrevious = useMemo(() => {
        if (!activitiesStartDate) return true;
        // Get the Monday of the start date's week
        const startDate = new Date(activitiesStartDate);
        const startDay = startDate.getDay();
        const startMonday = new Date(startDate);
        startMonday.setDate(startDate.getDate() - startDay + (startDay === 0 ? -6 : 1));
        startMonday.setHours(0, 0, 0, 0);

        // Get the previous week's Monday
        const prevWeek = new Date(currentWeekStart);
        prevWeek.setDate(prevWeek.getDate() - 7);

        // Allow navigation if previous week is >= start week
        return prevWeek >= startMonday;
    }, [activitiesStartDate, currentWeekStart]);

    // Compute Effective History Locally for Screen Stats if date is set
    // Note: The App Context `schedule` already uses the effective history for generation,
    // but for the "Stats Table" we need to calculate the "Total" which might differ from `shiftHistory` if date is set.

    // COMPLETE History = TOTAL of ALL saved assignments (for displaying cumulative stats)
    // This does NOT change based on which week is displayed!
    // If activitiesStartDate is set, count from that date. Otherwise, count from far past (full history)
    const completeHistory = useMemo(() => {
        const farFuture = new Date();
        farFuture.setFullYear(farFuture.getFullYear() + 5);

        // Use activitiesStartDate if set, otherwise use a date far in the past (2020-01-01)
        const startDate = activitiesStartDate || '2020-01-01';

        return computeHistoryFromDate(
            startDate,
            farFuture, // Count ALL saved overrides
            template,
            unavailabilities,
            doctors,
            activityDefinitions,
            rcpTypes,
            manualOverrides
        );
    }, [activitiesStartDate, template, unavailabilities, doctors, activityDefinitions, rcpTypes, manualOverrides]);

    // For auto-fill algorithm: history UP TO current week only
    // If activitiesStartDate is set, count from that date. Otherwise, count from far past.
    const effectiveHistory = useMemo(() => {
        // Use activitiesStartDate if set, otherwise use a date far in the past (2020-01-01)
        const startDate = activitiesStartDate || '2020-01-01';

        return computeHistoryFromDate(
            startDate,
            currentWeekStart,
            template,
            unavailabilities,
            doctors,
            activityDefinitions,
            rcpTypes,
            manualOverrides
        );
    }, [activitiesStartDate, currentWeekStart, template, unavailabilities, doctors, activityDefinitions, rcpTypes, manualOverrides]);


    // Check if current week is in the past
    const isWeekInPast = useMemo(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        // Get end of the current viewing week (Friday)
        const weekEnd = new Date(currentWeekStart);
        weekEnd.setDate(weekEnd.getDate() + 4); // Friday
        weekEnd.setHours(23, 59, 59, 999);
        return weekEnd < today;
    }, [currentWeekStart]);

    // State to control when auto-fill should run (only when explicitly triggered)
    const [autoFillTriggered, setAutoFillTriggered] = useState(false);

    // Reset trigger when week changes
    useEffect(() => {
        setAutoFillTriggered(false);
    }, [currentWeekStart]);

    // Local Schedule Generation (using the global effective logic passed via props implicitly or explicitly here)
    // Actually, we should use the same logic as App.tsx to ensure consistency in what is displayed vs calculated.
    const schedule = useMemo(() => {
        // Don't auto-fill by default - only apply saved overrides
        const generated = generateScheduleForWeek(
            currentWeekStart,
            template,
            unavailabilities,
            doctors,
            activityDefinitions,
            rcpTypes,
            false, // Never auto-fill here - we apply saved overrides instead
            effectiveHistory,
            rcpAttendance,
            rcpExceptions
        );
        return generated.map(slot => {
            const overrideValue = manualOverrides[slot.id];
            if (overrideValue) {
                if (overrideValue === '__CLOSED__') {
                    return { ...slot, assignedDoctorId: null, isLocked: true, isClosed: true };
                } else {
                    // Check if it's an auto choice (prefixed with 'auto:')
                    const isAuto = overrideValue.startsWith('auto:');
                    const doctorId = isAuto ? overrideValue.substring(5) : overrideValue;
                    return { ...slot, assignedDoctorId: doctorId, isLocked: true, isAutoAssigned: isAuto };
                }
            }
            return slot;
        });
    }, [currentWeekStart, template, unavailabilities, doctors, activityDefinitions, rcpTypes, effectiveHistory, rcpAttendance, rcpExceptions, manualOverrides, isWeekInPast]);

    // Handler to trigger auto-fill and SAVE results
    const handleRecalculateAuto = () => {
        console.log('🟢 handleRecalculateAuto CALLED - weekOffset before:', weekOffset);

        if (isWeekInPast) {
            alert('Impossible de recalculer les semaines passées.');
            return;
        }

        // Store current week to prevent reset
        const savedWeekStart = new Date(currentWeekStart);

        // Get current activity's equity group to filter
        const currentEquityGroup = currentActivity?.equityGroup || 'unity_astreinte';

        // Generate schedule with auto-fill
        const generated = generateScheduleForWeek(
            savedWeekStart,
            template,
            unavailabilities,
            doctors,
            activityDefinitions,
            rcpTypes,
            true, // Force auto-fill
            effectiveHistory,
            rcpAttendance,
            rcpExceptions
        );

        // Save the auto-generated assignments as manual overrides for persistence
        // ONLY for activities matching the current equity group (workflow OR unity+astreinte)
        const newOverrides = { ...manualOverrides };
        generated.forEach(slot => {
            if (slot.type === SlotType.ACTIVITY && slot.assignedDoctorId && slot.activityId) {
                // Check if this slot belongs to the current equity group
                const slotActivity = activityDefinitions.find(a => a.id === slot.activityId);
                const slotEquityGroup = slotActivity?.equityGroup || 'unity_astreinte';

                // Only update if matching the current tab's equity group
                if (slotEquityGroup === currentEquityGroup) {
                    const existingValue = manualOverrides[slot.id];
                    if (!existingValue || existingValue.startsWith('auto:')) {
                        newOverrides[slot.id] = 'auto:' + slot.assignedDoctorId;
                    }
                }
            }
        });

        console.log('🟢 About to call setManualOverrides - weekOffset is:', weekOffset);
        console.log('🎯 Recalcul pour groupe:', currentEquityGroup);
        setManualOverrides(newOverrides);
        setAutoFillTriggered(true);

        // Log the auto-recalculate action
        const groupName = currentEquityGroup === 'workflow' ? 'Supervision Workflow' : 'Unity + Astreinte';
        addLog('AUTO_RECALCULATE', `Recalcul automatique du groupe "${groupName}"`, {
            activityName: groupName,
            details: JSON.stringify({ equityGroup: currentEquityGroup })
        });

        console.log('✅ Auto-calcul effectué pour groupe', currentEquityGroup, '- weekOffset should still be:', weekOffset);
    };

    // Handler to clear all choices for current week - ONLY for current equity group
    const handleClearAllChoices = () => {
        // Get current activity's equity group
        const currentEquityGroup = currentActivity?.equityGroup || 'unity_astreinte';
        const groupName = currentEquityGroup === 'workflow' ? 'Supervision Workflow' : 'Unity + Astreinte';

        if (!confirm(`Êtes-vous sûr de vouloir effacer tous les choix de ${groupName} pour cette semaine ?`)) return;

        // Get slot IDs ONLY for activities matching the current equity group
        const weekSlotIds = schedule
            .filter(s => {
                if (s.type !== SlotType.ACTIVITY) return false;
                const slotActivity = activityDefinitions.find(a => a.id === s.activityId);
                const slotEquityGroup = slotActivity?.equityGroup || 'unity_astreinte';
                return slotEquityGroup === currentEquityGroup;
            })
            .map(s => s.id);

        // Remove these from overrides
        const newOverrides = { ...manualOverrides };
        weekSlotIds.forEach(id => {
            delete newOverrides[id];
        });

        setManualOverrides(newOverrides);
        setAutoFillTriggered(false);

        // Log the clear action
        addLog('CLEAR_CHOICES', `Tous les choix de "${groupName}" effacés (${weekSlotIds.length} créneaux)`, {
            activityName: groupName,
            details: JSON.stringify({ slotsCleared: weekSlotIds.length })
        });

        console.log('🗑️ Choix effacés pour groupe:', currentEquityGroup, '- slots:', weekSlotIds.length);
    };

    const conflicts = useMemo(() => {
        return detectConflicts(schedule, unavailabilities, doctors, activityDefinitions);
    }, [schedule, unavailabilities, doctors, activityDefinitions]);


    // Use context-based activeTabId to prevent reset on state changes
    const activeTabId = activitiesActiveTab || activityDefinitions[0]?.id || "";
    const setActiveTabId = (id: string) => setActivitiesActiveTab(id);
    const [showSettings, setShowSettings] = useState(false);
    const [newActName, setNewActName] = useState("");
    const [newActType, setNewActType] = useState<'HALF_DAY' | 'WEEKLY'>('HALF_DAY');
    const [newActEquityGroup, setNewActEquityGroup] = useState<string>('custom');
    const [viewMode, setViewMode] = useState<'WEEK' | 'MONTH'>('WEEK');

    // Weekly Assignment Mode Toggle (Auto vs Manual)
    const [weeklyAssignmentMode, setWeeklyAssignmentMode] = useState<'AUTO' | 'MANUAL'>('AUTO');

    // Length Controls
    const [choiceSectionExpanded, setChoiceSectionExpanded] = useState(true);
    const [statsSectionExpanded, setStatsSectionExpanded] = useState(true);
    const [conflictsSectionExpanded, setConflictsSectionExpanded] = useState(false); // Collapsed by default to save space

    // Modal State
    const [selectedConflict, setSelectedConflict] = useState<Conflict | null>(null);
    const [selectedSlot, setSelectedSlot] = useState<ScheduleSlot | null>(null);

    // Activity Edit State
    const [editingActivityId, setEditingActivityId] = useState<string | null>(null);
    const [editActivityName, setEditActivityName] = useState('');
    const [editActivityEquityGroup, setEditActivityEquityGroup] = useState<string>('custom');
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

    // PDF Report State
    const [showPdfModal, setShowPdfModal] = useState(false);
    const [pdfStartDate, setPdfStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [pdfEndDate, setPdfEndDate] = useState(() => {
        const d = new Date();
        d.setMonth(d.getMonth() + 1);
        return d.toISOString().split('T')[0];
    });
    const [isGeneratingStatsPdf, setIsGeneratingStatsPdf] = useState(false);

    const days = Object.values(DayOfWeek);
    const currentActivity = activityDefinitions.find(a => a.id === activeTabId);
    const isWorkflowTab = currentActivity?.equityGroup === 'workflow';

    // Get unique equity groups from activities
    const equityGroups = useMemo(() => {
        const groups = new Map<string, ActivityDefinition[]>();
        activityDefinitions.forEach(act => {
            const grp = act.equityGroup || 'custom';
            if (!groups.has(grp)) groups.set(grp, []);
            groups.get(grp)!.push(act);
        });
        return groups;
    }, [activityDefinitions]);

    // Month Generation Logic - MUST apply the same overrides as week view
    const monthSchedule = useMemo(() => {
        if (viewMode === 'WEEK') return [];
        const startOfMonth = new Date(currentWeekStart.getFullYear(), currentWeekStart.getMonth(), 1);
        // Adjust to start on a Monday for cleaner grid
        const day = startOfMonth.getDay();
        const diff = startOfMonth.getDate() - day + (day === 0 ? -6 : 1);
        const startOfGrid = new Date(startOfMonth);
        startOfGrid.setDate(diff);

        const generated = generateMonthSchedule(
            startOfGrid,
            template,
            unavailabilities,
            doctors,
            activityDefinitions,
            rcpTypes,
            effectiveHistory,
            {} // No auto-fill - use overrides instead
        );

        // Apply the same overrides as week view
        return generated.map(slot => {
            const overrideValue = manualOverrides[slot.id];
            if (overrideValue) {
                if (overrideValue === '__CLOSED__') {
                    return { ...slot, assignedDoctorId: null, isLocked: true, isClosed: true };
                } else {
                    const isAuto = overrideValue.startsWith('auto:');
                    const doctorId = isAuto ? overrideValue.substring(5) : overrideValue;
                    return { ...slot, assignedDoctorId: doctorId, isLocked: true, isAutoAssigned: isAuto };
                }
            }
            return slot; // No override = no assignment (leave empty)
        });
    }, [viewMode, currentWeekStart, template, unavailabilities, doctors, activityDefinitions, rcpTypes, effectiveHistory, manualOverrides]);

    // Activity Specific Conflicts
    const activityConflicts = useMemo(() => {
        // Find all slots belonging to the current activity tab
        const activitySlotIds = schedule.filter(s => s.activityId === activeTabId).map(s => s.id);

        return conflicts.filter(c => activitySlotIds.includes(c.slotId));
    }, [conflicts, schedule, activeTabId]);

    const handleCreateActivity = (e: React.FormEvent) => {
        e.preventDefault();
        if (newActName.trim()) {
            const groupLabel = EQUITY_GROUPS.find(g => g.id === newActEquityGroup)?.name || newActEquityGroup;
            addActivityDefinition({
                id: `act_${Date.now()}`,
                name: newActName,
                granularity: newActType,
                allowDoubleBooking: false,
                color: 'bg-gray-100 text-gray-800',
                equityGroup: newActEquityGroup
            });
            addLog('CREATE_ACTIVITY', `Nouvelle activité créée : "${newActName}" (${newActType === 'WEEKLY' ? 'Semaine' : 'Demi-journée'}, Groupe: ${groupLabel})`, {
                activityName: newActName,
                details: JSON.stringify({ type: newActType, equityGroup: newActEquityGroup })
            });
            setNewActName("");
            setNewActEquityGroup('custom');
            setShowSettings(false);
        }
    }

    const handleDeleteActivity = (id: string) => {
        if (deleteConfirmId === id) {
            const act = activityDefinitions.find(a => a.id === id);
            removeActivityDefinition(id);
            setDeleteConfirmId(null);
            addLog('DELETE_ACTIVITY', `Activité supprimée : "${act?.name || id}"`, {
                activityName: act?.name
            });
            // Switch tab if current activity was deleted
            if (activeTabId === id) {
                const remaining = activityDefinitions.filter(a => a.id !== id);
                setActiveTabId(remaining[0]?.id || '');
            }
        } else {
            setDeleteConfirmId(id);
            // Auto-reset after 3 seconds
            setTimeout(() => setDeleteConfirmId(null), 3000);
        }
    }

    const handleEditActivity = (act: ActivityDefinition) => {
        setEditingActivityId(act.id);
        setEditActivityName(act.name);
        setEditActivityEquityGroup(act.equityGroup || 'custom');
    }

    const handleSaveActivityEdit = () => {
        if (!editingActivityId || !editActivityName.trim()) return;
        const act = activityDefinitions.find(a => a.id === editingActivityId);
        if (act) {
            const changes: string[] = [];
            if (act.name !== editActivityName.trim()) changes.push(`nom: "${act.name}" → "${editActivityName.trim()}"`);
            if (act.equityGroup !== editActivityEquityGroup) {
                const oldGroup = EQUITY_GROUPS.find(g => g.id === act.equityGroup)?.name || act.equityGroup;
                const newGroup = EQUITY_GROUPS.find(g => g.id === editActivityEquityGroup)?.name || editActivityEquityGroup;
                changes.push(`groupe: "${oldGroup}" → "${newGroup}"`);
            }
            updateActivityDefinition({
                ...act,
                name: editActivityName.trim(),
                equityGroup: editActivityEquityGroup
            });
            if (changes.length > 0) {
                addLog('EDIT_ACTIVITY', `Activité modifiée : ${changes.join(', ')}`, {
                    activityName: editActivityName.trim(),
                    details: JSON.stringify({ oldName: act.name, newName: editActivityName.trim(), oldGroup: act.equityGroup, newGroup: editActivityEquityGroup })
                });
            }
        }
        setEditingActivityId(null);
    }

    // Handle Manual Assignment with Persistence (Single Slot)
    const handleManualAssign = (slotId: string, doctorId: string) => {
        const newOverrides = { ...manualOverrides };
        const slot = schedule.find(s => s.id === slotId);
        const actDef = slot?.activityId ? activityDefinitions.find(a => a.id === slot.activityId) : null;

        if (doctorId === "") {
            // Revert to Auto (Delete override)
            delete newOverrides[slotId];
            const prevDoc = doctors.find(d => d.id === slot?.assignedDoctorId);
            addLog('MANUAL_ASSIGN', `Assignation retirée${actDef ? ` pour "${actDef.name}"` : ''} (${slot?.day} ${slot?.period})`, {
                activityName: actDef?.name,
                doctorName: prevDoc?.name,
                details: JSON.stringify({ slotId, day: slot?.day, period: slot?.period, action: 'removed' })
            });
        } else {
            // Set Override
            newOverrides[slotId] = doctorId;
            const doc = doctors.find(d => d.id === doctorId);
            addLog('MANUAL_ASSIGN', `${doc?.name || 'Médecin'} assigné manuellement${actDef ? ` à "${actDef.name}"` : ''} (${slot?.day} ${slot?.period})`, {
                activityName: actDef?.name,
                doctorName: doc?.name,
                details: JSON.stringify({ slotId, doctorId, day: slot?.day, period: slot?.period })
            });
        }

        setManualOverrides(newOverrides);
        setSelectedConflict(null);
        setSelectedSlot(null);
    }

    // Handle Batch Assignment for Weekly Activity
    const handleWeeklyAssign = (doctorId: string) => {
        const weekSlots = schedule.filter(s => s.activityId === activeTabId);
        const newOverrides = { ...manualOverrides };

        weekSlots.forEach(s => {
            if (doctorId === "") {
                delete newOverrides[s.id];
            } else {
                newOverrides[s.id] = doctorId;
            }
        });

        setManualOverrides(newOverrides);
        const doc = doctors.find(d => d.id === doctorId);
        if (doctorId !== "") {
            setWeeklyAssignmentMode('MANUAL');
            addLog('WEEKLY_ASSIGN', `${doc?.name || 'Médecin'} assigné pour toute la semaine à "${currentActivity?.name || 'Activité'}"`, {
                activityName: currentActivity?.name,
                doctorName: doc?.name
            });
        } else {
            setWeeklyAssignmentMode('AUTO');
            addLog('WEEKLY_ASSIGN', `Assignation semaine retirée pour "${currentActivity?.name || 'Activité'}"`, {
                activityName: currentActivity?.name
            });
        }
    }

    const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedDate = new Date(e.target.value);
        const day = selectedDate.getDay();
        const diff = selectedDate.getDate() - day + (day === 0 ? -6 : 1);
        selectedDate.setDate(diff);
        selectedDate.setHours(0, 0, 0, 0);

        // Block navigation before start date's week
        if (activitiesStartDate) {
            // Get the Monday of the start date's week
            const startDateObj = new Date(activitiesStartDate);
            const startDay = startDateObj.getDay();
            const startMonday = new Date(startDateObj);
            startMonday.setDate(startDateObj.getDate() - startDay + (startDay === 0 ? -6 : 1));
            startMonday.setHours(0, 0, 0, 0);

            if (selectedDate < startMonday) {
                alert(`Navigation impossible: La date sélectionnée est antérieure à la semaine de début des activités (semaine du ${startMonday.toLocaleDateString('fr-FR')})`);
                return;
            }
        }

        // Calculate offset from current week to selected week
        const today = new Date();
        const todayDay = today.getDay();
        const todayMonday = new Date(today);
        todayMonday.setDate(today.getDate() - todayDay + (todayDay === 0 ? -6 : 1));
        todayMonday.setHours(0, 0, 0, 0);

        const diffMs = selectedDate.getTime() - todayMonday.getTime();
        const newOffset = Math.round(diffMs / (7 * 24 * 60 * 60 * 1000));
        setWeekOffset(newOffset);
    }

    const handleWeekChange = (direction: 'prev' | 'next') => {
        if (viewMode === 'WEEK') {
            const newOffset = weekOffset + (direction === 'next' ? 1 : -1);

            // Block navigation before start date's week
            if (direction === 'prev' && activitiesStartDate) {
                const today = new Date();
                const todayDay = today.getDay();
                const todayMonday = new Date(today);
                todayMonday.setDate(today.getDate() - todayDay + (todayDay === 0 ? -6 : 1));
                todayMonday.setHours(0, 0, 0, 0);

                const newDate = new Date(todayMonday);
                newDate.setDate(newDate.getDate() + (newOffset * 7));

                // Get the Monday of the start date's week
                const startDateObj = new Date(activitiesStartDate);
                const startDay = startDateObj.getDay();
                const startMonday = new Date(startDateObj);
                startMonday.setDate(startDateObj.getDate() - startDay + (startDay === 0 ? -6 : 1));
                startMonday.setHours(0, 0, 0, 0);

                if (newDate < startMonday) {
                    return; // Silent block
                }
            }

            setWeekOffset(newOffset);
        } else {
            // Month mode - change by 4 weeks
            const newOffset = weekOffset + (direction === 'next' ? 4 : -4);
            setWeekOffset(newOffset);
        }
    };

    // Week Validation Handler - Saves all current assignments as manual overrides
    const handleValidateWeek = () => {
        if (!isAdmin) return;

        if (isCurrentWeekValidated) {
            if (window.confirm('⚠️ Déverrouiller cette semaine ?\n\nLes affectations pourront être modifiées par l\'algorithme automatique.\n\n⚠️ Attention: Les affectations verrouillées resteront, mais de nouvelles peuvent être générées automatiquement.')) {
                unvalidateWeek(currentWeekKey);
                addLog('UNVALIDATE_WEEK', `Semaine déverrouillée`, {
                    details: JSON.stringify({ weekKey: currentWeekKey })
                });
            }
        } else {
            // Count activity slots for this week
            const activitySlots = schedule.filter(s => s.type === SlotType.ACTIVITY && s.activityId);
            const assignedCount = activitySlots.filter(s => s.assignedDoctorId).length;

            if (window.confirm(`✅ Valider cette semaine ?\n\n📋 ${assignedCount} affectations d'activités seront verrouillées.\n\nCes choix (automatiques ou manuels) seront sauvegardés définitivement et ne changeront plus.\n\nConfirmer la validation ?`)) {

                // Save ALL current activity assignments - preserving auto/manual status
                const newOverrides = { ...manualOverrides };

                activitySlots.forEach(slot => {
                    if (slot.assignedDoctorId) {
                        const existingOverride = manualOverrides[slot.id];
                        if (existingOverride && existingOverride !== '__CLOSED__') {
                            newOverrides[slot.id] = existingOverride;
                        } else if (slot.isAutoAssigned) {
                            newOverrides[slot.id] = `auto:${slot.assignedDoctorId}`;
                        } else {
                            newOverrides[slot.id] = slot.assignedDoctorId;
                        }
                    }
                });

                setManualOverrides(newOverrides);
                validateWeek(currentWeekKey);

                // Log with assignment details
                const assignmentDetails = activitySlots
                    .filter(s => s.assignedDoctorId)
                    .map(s => {
                        const doc = doctors.find(d => d.id === s.assignedDoctorId);
                        const act = activityDefinitions.find(a => a.id === s.activityId);
                        return `${act?.name}: ${doc?.name} (${s.day} ${s.period})`;
                    });
                addLog('VALIDATE_WEEK', `Semaine validée et verrouillée (${assignedCount} affectations)`, {
                    details: JSON.stringify({ assignedCount, assignments: assignmentDetails.slice(0, 20) })
                });
            }
        }
    };

    const handleAlertClick = (conflict: Conflict) => {
        const slot = schedule.find(s => s.id === conflict.slotId);
        if (slot) {
            setSelectedSlot(slot);
            setSelectedConflict(conflict);
        }
    }

    const handleCloseSlot = (slotId: string) => {
        setManualOverrides({ ...manualOverrides, [slotId]: '__CLOSED__' });
        setSelectedConflict(null);
        setSelectedSlot(null);
    }

    // --- REPORT GENERATION LOGIC ---
    // NOTE: This function calculates points for ANY period, including periods BEFORE activitiesStartDate
    // This allows viewing historical data in reports even after changing the equity start date
    const generateReportData = (start: string, end: string) => {
        const stats: Record<string, { unity: number, astreinte: number, workflow: number, weighted: number }> = {};

        // Get activity IDs by equity group
        const unityActivityIds = activityDefinitions
            .filter(a => a.equityGroup === 'unity_astreinte' && !a.name.toLowerCase().includes('astreinte'))
            .map(a => a.id);
        const astreinteActivityIds = activityDefinitions
            .filter(a => a.equityGroup === 'unity_astreinte' && a.name.toLowerCase().includes('astreinte'))
            .map(a => a.id);
        const workflowActivityIds = activityDefinitions
            .filter(a => a.equityGroup === 'workflow')
            .map(a => a.id);

        doctors.forEach(d => {
            stats[d.id] = {
                unity: 0,
                astreinte: 0,
                workflow: 0,
                weighted: 0
            };
        });

        const startDate = new Date(start);
        const endDate = new Date(end);
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);

        // Calculate history for the SPECIFIC period requested (independent of activitiesStartDate)
        // This uses computeHistoryFromDate with the report's start date, NOT activitiesStartDate
        const periodHistory = computeHistoryFromDate(
            start, // Use the report's start date, not activitiesStartDate
            endDate,
            template,
            unavailabilities,
            doctors,
            activityDefinitions,
            rcpTypes,
            manualOverrides
        );

        // Count from computed period history
        doctors.forEach(d => {
            const history = periodHistory[d.id];
            if (history) {
                unityActivityIds.forEach(actId => {
                    stats[d.id].unity += history[actId] || 0;
                });
                astreinteActivityIds.forEach(actId => {
                    stats[d.id].astreinte += history[actId] || 0;
                });
                workflowActivityIds.forEach(actId => {
                    stats[d.id].workflow += history[actId] || 0;
                });
            }
        });

        // Calc Weighted
        doctors.forEach(d => {
            const rate = getDoctorWorkRate(d);
            stats[d.id].weighted = (stats[d.id].unity + stats[d.id].astreinte) / rate;
        });

        return stats;
    };

    const handleDownloadReport = async () => {
        try {
            setIsGeneratingStatsPdf(true);
            const reportStats = generateReportData(pdfStartDate, pdfEndDate);

            // Generate assignments summary for the period
            const assignmentsSummary: Record<string, { doctor: string, count: number }[]> = {};
            activityDefinitions.forEach(act => {
                assignmentsSummary[act.id] = [];
            });

            // Calculate assignments per activity per doctor
            const startDate = new Date(pdfStartDate);
            const endDate = new Date(pdfEndDate);
            let currentDate = new Date(startDate);

            while (currentDate <= endDate) {
                const weekSlots = generateScheduleForWeek(
                    new Date(currentDate),
                    template,
                    unavailabilities,
                    doctors,
                    activityDefinitions,
                    rcpTypes,
                    true,
                    effectiveHistory,
                    {},
                    []
                );

                weekSlots.forEach(slot => {
                    if (slot.assignedDoctorId && slot.activityId) {
                        const slotDate = new Date(slot.date);
                        if (slotDate >= startDate && slotDate <= endDate) {
                            const doc = doctors.find(d => d.id === slot.assignedDoctorId);
                            if (doc && assignmentsSummary[slot.activityId]) {
                                const existing = assignmentsSummary[slot.activityId].find(a => a.doctor === doc.name);
                                if (existing) {
                                    existing.count++;
                                } else {
                                    assignmentsSummary[slot.activityId].push({ doctor: doc.name, count: 1 });
                                }
                            }
                        }
                    }
                });

                currentDate.setDate(currentDate.getDate() + 7);
            }

            // Render a temporary hidden container
            const reportContainer = document.createElement('div');
            reportContainer.style.width = '1200px';
            reportContainer.style.padding = '40px';
            reportContainer.style.background = 'white';
            reportContainer.style.position = 'absolute';
            reportContainer.style.top = '-9999px';

            // SORTING
            const doctorsByWeighted = [...doctors].sort((a, b) => reportStats[a.id].weighted - reportStats[b.id].weighted);
            const doctorsByWorkflow = [...doctors].sort((a, b) => reportStats[a.id].workflow - reportStats[b.id].workflow);

            // Determine if this report is for a period BEFORE the equity start date
            const isHistoricalReport = activitiesStartDate && new Date(pdfStartDate) < new Date(activitiesStartDate);

            // Build HTML
            let html = `
            <div style="font-family: sans-serif; color: #1e293b;">
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #cbd5e1; padding-bottom: 20px; margin-bottom: 30px;">
                    <div>
                        <h1 style="font-size: 24px; font-weight: bold; margin: 0; color: #0f172a;">📊 Rapport d'Équité par Période</h1>
                        <p style="color: #64748b; margin: 5px 0 0 0;">Du <strong>${new Date(pdfStartDate).toLocaleDateString('fr-FR')}</strong> au <strong>${new Date(pdfEndDate).toLocaleDateString('fr-FR')}</strong></p>
                        ${isHistoricalReport
                    ? `<p style="color: #f59e0b; margin: 5px 0 0 0; font-size: 12px;">⚠️ <strong>Rapport historique</strong> - Période antérieure à la date de début de comptage d'équité (${new Date(activitiesStartDate!).toLocaleDateString('fr-FR')})</p>
                               <p style="color: #64748b; margin: 3px 0 0 0; font-size: 11px; font-style: italic;">Ces points ne sont pas pris en compte dans le calcul d'équité actuel.</p>`
                    : (activitiesStartDate
                        ? `<p style="color: #3b82f6; margin: 5px 0 0 0; font-size: 12px;">📅 Date de début de comptage d'équité : ${new Date(activitiesStartDate).toLocaleDateString('fr-FR')}</p>`
                        : '')
                }
                    </div>
                    <div style="text-align: right;">
                        <div style="font-size: 12px; color: #94a3b8;">Généré le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}</div>
                        <div style="font-size: 14px; font-weight: bold; color: #3b82f6;">RadioPlan AI</div>
                    </div>
                </div>

                <h2 style="font-size: 18px; color: #ea580c; border-bottom: 2px solid #fdba74; padding-bottom: 5px; margin-top: 20px; margin-bottom: 10px;">1. Points d'Équité : Unity & Astreinte</h2>
                <p style="font-size: 11px; color: #64748b; margin-bottom: 10px;">Points accumulés sur la période sélectionnée. Score pondéré = (Unity + Astreinte) / Taux de travail.</p>
                <table style="width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 30px;">
                    <thead>
                        <tr style="background-color: #fff7ed; border-bottom: 2px solid #fed7aa;">
                            <th style="padding: 10px; text-align: left; color: #9a3412;">Médecin</th>
                            <th style="padding: 10px; text-align: center; color: #9a3412;">Taux</th>
                            <th style="padding: 10px; text-align: center; color: #ea580c;">Unity</th>
                            <th style="padding: 10px; text-align: center; color: #dc2626;">Astreinte</th>
                            <th style="padding: 10px; text-align: center; color: #2563eb; font-weight: bold;">Score Pondéré</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

            doctorsByWeighted.forEach(d => {
                const s = reportStats[d.id];
                const rate = getDoctorWorkRate(d);
                html += `
                <tr style="border-bottom: 1px solid #e2e8f0;">
                    <td style="padding: 8px; font-weight: bold; color: #334155;">${d.name}</td>
                    <td style="padding: 8px; text-align: center; color: #64748b;">${Math.round(rate * 100)}%</td>
                    <td style="padding: 8px; text-align: center; font-weight: bold; color: #ea580c; background-color: #fff7ed;">${s.unity}</td>
                    <td style="padding: 8px; text-align: center; font-weight: bold; color: #dc2626; background-color: #fef2f2;">${s.astreinte}</td>
                    <td style="padding: 8px; text-align: center; font-weight: bold; color: #2563eb; background-color: #eff6ff; font-size: 14px;">${s.weighted.toFixed(1)}</td>
                </tr>
            `;
            });

            html += `
                    </tbody>
                </table>

                <h2 style="font-size: 18px; color: #059669; border-bottom: 2px solid #6ee7b7; padding-bottom: 5px; margin-top: 20px; margin-bottom: 10px;">2. Points d'Équité : Workflow</h2>
                <table style="width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 30px;">
                    <thead>
                        <tr style="background-color: #ecfdf5; border-bottom: 2px solid #6ee7b7;">
                            <th style="padding: 10px; text-align: left; color: #065f46;">Médecin</th>
                            <th style="padding: 10px; text-align: center; color: #065f46;">Semaines Workflow</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

            doctorsByWorkflow.forEach(d => {
                const s = reportStats[d.id];
                html += `
                <tr style="border-bottom: 1px solid #e2e8f0;">
                    <td style="padding: 8px; font-weight: bold; color: #334155;">${d.name}</td>
                    <td style="padding: 8px; text-align: center; font-weight: bold; color: #059669; font-size: 14px;">${s.workflow}</td>
                </tr>
            `;
            });

            html += `
                    </tbody>
                </table>

                <h2 style="font-size: 18px; color: #7c3aed; border-bottom: 2px solid #c4b5fd; padding-bottom: 5px; margin-top: 20px; margin-bottom: 10px;">3. Détail des Affectations par Activité</h2>
            `;

            // Add activity summaries
            activityDefinitions.forEach(act => {
                const assignments = assignmentsSummary[act.id] || [];
                assignments.sort((a, b) => b.count - a.count);

                if (assignments.length > 0) {
                    html += `
                    <div style="margin-bottom: 15px; padding: 10px; background-color: #faf5ff; border-radius: 8px; border: 1px solid #e9d5ff;">
                        <h4 style="margin: 0 0 8px 0; color: #7c3aed; font-size: 13px;">${act.name}</h4>
                        <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                    `;
                    assignments.forEach(a => {
                        html += `<span style="background-color: white; padding: 4px 8px; border-radius: 4px; font-size: 11px; border: 1px solid #e9d5ff;">${a.doctor}: <strong>${a.count}</strong></span>`;
                    });
                    html += `
                        </div>
                    </div>
                    `;
                }
            });

            html += `
                <div style="margin-top: 30px; padding: 15px; background-color: #f1f5f9; border-radius: 8px; font-size: 11px; color: #64748b;">
                    <p style="margin: 0;"><strong>Note :</strong> Les points sont calculés uniquement sur la période sélectionnée.</p>
                    <p style="margin: 5px 0 0 0;">Le score pondéré permet de comparer équitablement les médecins à temps partiel.</p>
                </div>
            </div>
        `;

            reportContainer.innerHTML = html;
            document.body.appendChild(reportContainer);

            const canvas = await html2canvas(reportContainer, { scale: 2 });
            document.body.removeChild(reportContainer);

            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF('p', 'mm', 'a4');
            const imgProps = pdf.getImageProperties(imgData);
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

            pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
            pdf.save(`Rapport_Équité_${pdfStartDate}_${pdfEndDate}.pdf`);
            setShowPdfModal(false);

        } catch (e) {
            console.error(e);
            alert("Erreur lors de la génération du rapport.");
        } finally {
            setIsGeneratingStatsPdf(false);
        }
    }

    // --- DOWNLOAD CURRENT VIEW AS PDF ---
    const handleDownloadCurrentView = async () => {
        try {
            setIsGeneratingStatsPdf(true);

            // Get current view data
            const currentStats = calculateScreenStats();
            const weekLabel = viewMode === 'WEEK'
                ? `Semaine du ${currentWeekStart.toLocaleDateString('fr-FR')}`
                : currentWeekStart.toLocaleString('fr-FR', { month: 'long', year: 'numeric' });

            // Get activity slots for current activity
            const sourceSchedule = viewMode === 'WEEK' ? schedule : monthSchedule;
            const activitySlots = sourceSchedule.filter(s => s.activityId === activeTabId);

            // Render a temporary hidden container
            const reportContainer = document.createElement('div');
            reportContainer.style.width = '1200px';
            reportContainer.style.padding = '40px';
            reportContainer.style.background = 'white';
            reportContainer.style.position = 'absolute';
            reportContainer.style.top = '-9999px';

            // Build activity assignments table
            let activityAssignmentsHtml = '';
            days.forEach(day => {
                [Period.MORNING, Period.AFTERNOON].forEach(period => {
                    const slot = activitySlots.find(s => s.day === day && s.period === period);
                    if (slot) {
                        const doc = doctors.find(d => d.id === slot.assignedDoctorId);
                        activityAssignmentsHtml += `
                            <tr style="border-bottom: 1px solid #e2e8f0;">
                                <td style="padding: 8px; color: #334155;">${day}</td>
                                <td style="padding: 8px; color: #64748b;">${period === Period.MORNING ? 'Matin' : 'Après-midi'}</td>
                                <td style="padding: 8px; font-weight: bold; color: ${doc ? '#059669' : '#dc2626'};">
                                    ${doc ? doc.name : 'Non assigné'}
                                    ${slot.isLocked ? ' 🔒' : ''}
                                </td>
                            </tr>
                        `;
                    }
                });
            });

            // Sort doctors by weighted score
            const doctorsByWeighted = [...doctors].sort((a, b) => currentStats[a.id].weighted - currentStats[b.id].weighted);

            let html = `
            <div style="font-family: sans-serif; color: #1e293b;">
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #cbd5e1; padding-bottom: 20px; margin-bottom: 30px;">
                    <div>
                        <h1 style="font-size: 24px; font-weight: bold; margin: 0; color: #0f172a;">📋 Rapport d'Activité - Vue Actuelle</h1>
                        <p style="color: #64748b; margin: 5px 0 0 0;"><strong>${weekLabel}</strong></p>
                        ${currentActivity ? `<p style="color: #3b82f6; margin: 5px 0 0 0; font-weight: bold;">Activité: ${currentActivity.name}</p>` : ''}
                    </div>
                    <div style="text-align: right;">
                        <div style="font-size: 12px; color: #94a3b8;">Généré le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}</div>
                        <div style="font-size: 14px; font-weight: bold; color: #3b82f6;">RadioPlan AI</div>
                        ${isCurrentWeekValidated ? '<div style="background-color: #dcfce7; color: #166534; padding: 4px 8px; border-radius: 4px; font-size: 11px; margin-top: 5px;">✅ SEMAINE VALIDÉE</div>' : ''}
                    </div>
                </div>

                <h2 style="font-size: 18px; color: #2563eb; border-bottom: 2px solid #93c5fd; padding-bottom: 5px; margin-top: 20px; margin-bottom: 10px;">1. Affectations de la ${viewMode === 'WEEK' ? 'semaine' : 'période'}</h2>
                <table style="width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 30px;">
                    <thead>
                        <tr style="background-color: #eff6ff; border-bottom: 2px solid #93c5fd;">
                            <th style="padding: 10px; text-align: left; color: #1e40af;">Jour</th>
                            <th style="padding: 10px; text-align: left; color: #1e40af;">Période</th>
                            <th style="padding: 10px; text-align: left; color: #1e40af;">Médecin assigné</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${activityAssignmentsHtml || '<tr><td colspan="3" style="padding: 8px; color: #94a3b8; text-align: center;">Aucune affectation</td></tr>'}
                    </tbody>
                </table>

                <h2 style="font-size: 18px; color: #ea580c; border-bottom: 2px solid #fdba74; padding-bottom: 5px; margin-top: 20px; margin-bottom: 10px;">2. Points d'Équité Actuels ${activitiesStartDate ? `<span style="font-size: 12px; font-weight: normal; color: #3b82f6;">(depuis le ${new Date(activitiesStartDate).toLocaleDateString('fr-FR')})</span>` : ''}</h2>
                <table style="width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 30px;">
                    <thead>
                        <tr style="background-color: #fff7ed; border-bottom: 2px solid #fed7aa;">
                            <th style="padding: 10px; text-align: left; color: #9a3412;">Médecin</th>
                            <th style="padding: 10px; text-align: center; color: #9a3412;">Taux</th>
                            <th style="padding: 10px; text-align: center; color: #ea580c;">Cumul U+A</th>
                            <th style="padding: 10px; text-align: center; color: #059669;">Workflow</th>
                            <th style="padding: 10px; text-align: center; color: #2563eb; font-weight: bold;">Score Pondéré</th>
                        </tr>
                    </thead>
                    <tbody>
            `;

            doctorsByWeighted.forEach(d => {
                const s = currentStats[d.id];
                const rate = getDoctorWorkRate(d);
                html += `
                    <tr style="border-bottom: 1px solid #e2e8f0;">
                        <td style="padding: 8px; font-weight: bold; color: #334155;">${d.name}</td>
                        <td style="padding: 8px; text-align: center; color: #64748b;">${Math.round(rate * 100)}%</td>
                        <td style="padding: 8px; text-align: center; font-weight: bold; color: #ea580c; background-color: #fff7ed;">${s.unityTotal + s.astreinteTotal}</td>
                        <td style="padding: 8px; text-align: center; font-weight: bold; color: #059669; background-color: #ecfdf5;">${s.workflowTotal}</td>
                        <td style="padding: 8px; text-align: center; font-weight: bold; color: #2563eb; background-color: #eff6ff; font-size: 14px;">${s.weighted.toFixed(1)}</td>
                    </tr>
                `;
            });

            html += `
                    </tbody>
                </table>

                <div style="margin-top: 30px; padding: 15px; background-color: #f1f5f9; border-radius: 8px; font-size: 11px; color: #64748b;">
                    <p style="margin: 0;"><strong>Note :</strong> Ce rapport reflète l'état actuel des affectations et des points d'équité à la date de génération.</p>
                    ${activitiesStartDate ? `<p style="margin: 5px 0 0 0;">📅 Calcul d'équité depuis le ${new Date(activitiesStartDate).toLocaleDateString('fr-FR')}</p>` : ''}
                </div>
            </div>
            `;

            reportContainer.innerHTML = html;
            document.body.appendChild(reportContainer);

            const canvas = await html2canvas(reportContainer, { scale: 2 });
            document.body.removeChild(reportContainer);

            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF('p', 'mm', 'a4');
            const imgProps = pdf.getImageProperties(imgData);
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

            pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
            pdf.save(`Activités_${currentActivity?.name || 'Rapport'}_${currentWeekStart.toISOString().split('T')[0]}.pdf`);

        } catch (e) {
            console.error(e);
            alert("Erreur lors de la génération du rapport.");
        } finally {
            setIsGeneratingStatsPdf(false);
        }
    }

    // --- CURRENT VIEW STATS (For Screen) ---
    // LOGIC:
    // - "Sem./Mois" = Points UNIQUEMENT de la période affichée (slots visibles à l'écran)
    // - "Total" = TOTAL de TOUTES les assignations sauvegardées (ne change pas en naviguant)
    const calculateScreenStats = () => {
        const stats: Record<string, {
            unityWeek: number, unityTotal: number,
            astreinteWeek: number, astreinteTotal: number,
            workflowWeek: number, workflowTotal: number,
            weighted: number,
            rate: number
        }> = {};

        const sourceSchedule = viewMode === 'WEEK' ? schedule : monthSchedule;

        doctors.forEach(d => {
            // === 1. UNITY ===
            const unityActs = activityDefinitions.filter(a => a.equityGroup === 'unity_astreinte' && !a.name.toLowerCase().includes('astreinte'));
            const unityIds = unityActs.map(a => a.id);

            // Points cette période (slots affichés à l'écran)
            let periodUnity = 0;
            unityIds.forEach(actId => {
                periodUnity += sourceSchedule.filter(s => s.assignedDoctorId === d.id && s.activityId === actId).length;
            });

            // TOTAL = completeHistory (toutes les assignations sauvegardées)
            let totalUnity = 0;
            unityIds.forEach(actId => {
                totalUnity += completeHistory[d.id]?.[actId] || 0;
            });

            // === 2. ASTREINTE ===
            const astreinteActs = activityDefinitions.filter(a => a.equityGroup === 'unity_astreinte' && a.name.toLowerCase().includes('astreinte'));
            const astreinteIds = astreinteActs.map(a => a.id);

            let periodAstreinte = 0;
            astreinteIds.forEach(actId => {
                periodAstreinte += sourceSchedule.filter(s => s.assignedDoctorId === d.id && s.activityId === actId).length;
            });

            let totalAstreinte = 0;
            astreinteIds.forEach(actId => {
                totalAstreinte += completeHistory[d.id]?.[actId] || 0;
            });

            // === 3. WORKFLOW - Compté en SEMAINES (1 point = 1 semaine assignée) ===
            const workflowActs = activityDefinitions.filter(a => a.equityGroup === 'workflow');
            const workflowIds = workflowActs.map(a => a.id);

            const workflowSlots = sourceSchedule.filter(s => s.assignedDoctorId === d.id && workflowIds.includes(s.activityId || ''));
            const uniqueWeeks = new Set<string>();
            workflowSlots.forEach(s => {
                if (!s.date) return;
                const date = new Date(s.date);
                const monday = new Date(date);
                const day = monday.getDay();
                monday.setDate(monday.getDate() - day + (day === 0 ? -6 : 1));
                uniqueWeeks.add(monday.toISOString().split('T')[0]);
            });
            const periodWorkflow = uniqueWeeks.size;

            // Total workflow from completeHistory
            let totalWorkflow = 0;
            workflowIds.forEach(actId => {
                totalWorkflow += completeHistory[d.id]?.[actId] || 0;
            });

            const rate = getDoctorWorkRate(d);

            // Score pondéré basé sur le TOTAL complet
            const totalPoints = totalUnity + totalAstreinte;
            const weighted = totalPoints / rate;

            stats[d.id] = {
                unityWeek: periodUnity,
                unityTotal: totalUnity,
                astreinteWeek: periodAstreinte,
                astreinteTotal: totalAstreinte,
                workflowWeek: periodWorkflow,
                workflowTotal: totalWorkflow,
                weighted: weighted,
                rate: rate
            };
        });

        return stats;
    };
    const screenStats = calculateScreenStats();

    const renderSlot = (day: DayOfWeek, period: Period, weekDate?: Date) => {
        const dateStr = weekDate
            ? weekDate.toISOString().split('T')[0]
            : getDateForDayOfWeek(currentWeekStart, day);

        const holiday = isFrenchHoliday(dateStr);
        if (holiday) {
            return (
                <div className="h-full w-full bg-pink-50 flex items-center justify-center border border-pink-200 flex-col opacity-80 min-h-[60px]">
                    <span className="text-[10px] text-pink-400 font-bold uppercase tracking-wider">Férié</span>
                    <span className="text-[9px] text-pink-300 text-center px-1 leading-tight">{holiday.name}</span>
                </div>
            )
        }

        const sourceSchedule = viewMode === 'WEEK' ? schedule : monthSchedule;

        // Find the generated slot for this activity
        const slot = sourceSchedule.find(s =>
            s.date === dateStr &&
            s.period === period &&
            s.activityId === activeTabId
        );

        if (!slot) return <div className="text-xs text-slate-300 p-2">--</div>;

        const doc = doctors.find(d => d.id === slot.assignedDoctorId);

        // Check for conflict on this specific slot
        const hasConflict = conflicts.some(c => c.slotId === slot.id);

        // In month view, simplify display
        if (viewMode === 'MONTH') {
            return (
                <div className={`text-[10px] p-1 border rounded truncate min-h-[1.5rem] flex items-center ${hasConflict ? 'bg-red-50 border-red-300' : 'bg-slate-50'}`}>
                    {doc ? (
                        <span className={`font-bold ${hasConflict ? 'text-red-700' : 'text-slate-700'}`}>{doc.name}</span>
                    ) : <span className="text-slate-300">--</span>}
                </div>
            )
        }

        // Determine styling based on auto vs manual
        const isAuto = slot.isAutoAssigned;
        const borderColor = hasConflict ? 'border-red-400 bg-red-50' :
            slot.isLocked ? (isAuto ? 'border-green-400 bg-green-50' : 'border-blue-400 bg-blue-50') : 'border-dashed border-slate-300';
        const textColor = hasConflict ? 'text-red-800' :
            slot.isLocked ? (isAuto ? 'text-green-800' : 'text-blue-800') : 'text-slate-700';

        return (
            <div className={`p-2 rounded border h-full flex flex-col justify-center min-h-[60px] relative ${borderColor}`}>
                {hasConflict && (
                    <div className="absolute top-1 right-1 text-red-500 animate-pulse">
                        <AlertTriangle className="w-3 h-3" />
                    </div>
                )}

                {/* Show auto/manual badge */}
                {slot.isLocked && doc && (
                    <div className="absolute top-1 left-1">
                        {isAuto ? (
                            <span className="text-[8px] bg-green-200 text-green-700 px-1 rounded font-bold">AUTO</span>
                        ) : (
                            <span className="text-[8px] bg-blue-200 text-blue-700 px-1 rounded font-bold">MANUEL</span>
                        )}
                    </div>
                )}

                {/* Admin can change assignments, others just see the result */}
                {isAdmin && !isCurrentWeekValidated ? (
                    <select
                        className={`w-full text-xs bg-transparent outline-none font-medium cursor-pointer ${textColor}`}
                        value={slot.isLocked ? slot.assignedDoctorId || "" : ""}
                        onChange={(e) => handleManualAssign(slot.id, e.target.value)}
                    >
                        <option value="">-- Choisir --</option>
                        {doctors.map(d => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                    </select>
                ) : (
                    /* Non-admin or validated week: show assignment as read-only */
                    <div className={`text-xs font-medium text-center ${textColor}`}>
                        {doc ? doc.name : <span className="text-slate-400 italic">Non assigné</span>}
                        {isCurrentWeekValidated && <Lock className="w-3 h-3 inline ml-1 text-green-600" />}
                    </div>
                )}
            </div>
        )
    };

    const renderMonthGrid = () => {
        const startOfMonth = new Date(currentWeekStart.getFullYear(), currentWeekStart.getMonth(), 1);
        const day = startOfMonth.getDay();
        const diff = startOfMonth.getDate() - day + (day === 0 ? -6 : 1);
        const startOfGrid = new Date(startOfMonth);
        startOfGrid.setDate(diff);

        const gridWeeks = [];
        let currentDay = new Date(startOfGrid);

        for (let w = 0; w < 5; w++) {
            const weekDays = [];
            for (let d = 0; d < 5; d++) { // Mon-Fri
                weekDays.push(new Date(currentDay));
                currentDay.setDate(currentDay.getDate() + 1);
            }
            currentDay.setDate(currentDay.getDate() + 2); // Skip Sat/Sun
            gridWeeks.push(weekDays);
        }

        return (
            <div className="space-y-4">
                <div className="grid grid-cols-5 gap-2 font-bold text-center text-slate-600 mb-2">
                    {days.map(d => <div key={d}>{d}</div>)}
                </div>
                {gridWeeks.map((weekDays, i) => (
                    <div key={i} className="grid grid-cols-5 gap-2 border-b pb-4">
                        {weekDays.map(date => (
                            <div key={date.toISOString()} className="border rounded p-2 bg-white min-h-[100px] flex flex-col">
                                <div className="text-xs font-bold text-slate-400 mb-1 border-b border-slate-100 pb-1">{date.getDate()}</div>
                                <div className="flex-1 flex flex-col justify-center space-y-2">
                                    <div className="flex items-start text-[10px] text-slate-500">
                                        <span className="w-6 text-[9px] uppercase font-bold pt-1">Mat</span>
                                        <div className="flex-1 min-w-0">
                                            {renderSlot(DayOfWeek.MONDAY, Period.MORNING, date)}
                                        </div>
                                    </div>
                                    <div className="flex items-start text-[10px] text-slate-500">
                                        <span className="w-6 text-[9px] uppercase font-bold pt-1">ApM</span>
                                        <div className="flex-1 min-w-0">
                                            {renderSlot(DayOfWeek.MONDAY, Period.AFTERNOON, date)}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ))}
            </div>
        )
    }

    return (
        <div className="h-full flex flex-col space-y-3 md:space-y-4">
            <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                    <h1 className="text-lg md:text-2xl font-bold text-slate-800 flex items-center">
                        <Activity className="w-5 h-5 md:w-6 md:h-6 mr-2 md:mr-3 text-orange-600" />
                        <span className="hidden sm:inline">Activités & Astreintes</span>
                        <span className="sm:hidden">Activités</span>
                    </h1>
                </div>

                <div className="flex flex-wrap items-center gap-2">

                    {/* View Toggle */}
                    <div className="flex bg-slate-200 p-1 rounded-lg">
                        <button
                            onClick={() => setViewMode('WEEK')}
                            className={`px-2 md:px-3 py-1 text-xs font-bold rounded ${viewMode === 'WEEK' ? 'bg-white shadow text-slate-800' : 'text-slate-500'}`}
                        >
                            Semaine
                        </button>
                        <button
                            onClick={() => setViewMode('MONTH')}
                            className={`px-2 md:px-3 py-1 text-xs font-bold rounded ${viewMode === 'MONTH' ? 'bg-white shadow text-slate-800' : 'text-slate-500'}`}
                        >
                            Mois
                        </button>
                    </div>

                    <div className="flex items-center bg-white rounded-lg shadow-sm border border-slate-200 p-1">
                        <button
                            onClick={() => handleWeekChange('prev')}
                            disabled={!canNavigatePrevious}
                            className={`p-1 rounded ${canNavigatePrevious ? 'hover:bg-slate-100' : 'opacity-30 cursor-not-allowed'}`}
                            title={!canNavigatePrevious ? 'Date minimum atteinte' : 'Semaine précédente'}
                        >
                            <ChevronLeft className="w-4 h-4 md:w-5 md:h-5 text-slate-600" />
                        </button>

                        {viewMode === 'WEEK' ? (
                            <input
                                type="date"
                                className="border-none text-slate-700 font-medium text-xs md:text-sm focus:ring-0 bg-transparent mx-1 w-28 md:w-32"
                                value={`${currentWeekStart.getFullYear()}-${String(currentWeekStart.getMonth() + 1).padStart(2, '0')}-${String(currentWeekStart.getDate()).padStart(2, '0')}`}
                                onChange={handleDateChange}
                                min={activitiesStartDate || undefined}
                            />
                        ) : (
                            <span className="px-2 md:px-4 text-xs md:text-sm font-bold text-slate-700 capitalize w-24 md:w-32 text-center">
                                {currentWeekStart.toLocaleString('default', { month: 'long', year: 'numeric' })}
                            </span>
                        )}

                        <button onClick={() => handleWeekChange('next')} className="p-1 hover:bg-slate-100 rounded">
                            <ChevronRight className="w-4 h-4 md:w-5 md:h-5 text-slate-600" />
                        </button>
                    </div>

                    {/* Week Validation Status & Button (Admin Only) */}
                    {isAdmin && viewMode === 'WEEK' && (
                        <button
                            onClick={handleValidateWeek}
                            className={`flex items-center px-2 md:px-3 py-1.5 md:py-2 rounded text-xs md:text-sm font-bold transition-all ${isCurrentWeekValidated
                                ? 'bg-green-100 text-green-700 border border-green-300 hover:bg-green-200'
                                : 'bg-orange-100 text-orange-700 border border-orange-300 hover:bg-orange-200'
                                }`}
                            title={isCurrentWeekValidated ? 'Semaine validée - Cliquer pour déverrouiller' : 'Cliquer pour valider cette semaine'}
                        >
                            {isCurrentWeekValidated ? (
                                <>
                                    <Lock className="w-4 h-4 md:mr-2" />
                                    <span className="hidden md:inline">Semaine verrouillée</span>
                                </>
                            ) : (
                                <>
                                    <CheckCircle className="w-4 h-4 md:mr-2" />
                                    <span className="hidden md:inline">Valider la semaine</span>
                                </>
                            )}
                        </button>
                    )}

                    {/* Show validation badge for non-admins */}
                    {!isAdmin && isCurrentWeekValidated && viewMode === 'WEEK' && (
                        <div className="flex items-center px-2 md:px-3 py-1.5 md:py-2 bg-green-50 text-green-700 rounded text-xs md:text-sm font-medium border border-green-200">
                            <Lock className="w-4 h-4 md:mr-2" />
                            <span className="hidden md:inline">Semaine validée</span>
                        </div>
                    )}

                    {/* Recalculate Auto Button (Admin Only) */}
                    {isAdmin && viewMode === 'WEEK' && !isCurrentWeekValidated && !isWeekInPast && (
                        <button
                            onClick={handleRecalculateAuto}
                            className={`flex items-center px-2 md:px-3 py-1.5 md:py-2 rounded text-xs md:text-sm font-bold transition-all ${autoFillTriggered
                                ? 'bg-green-100 text-green-700 border border-green-300'
                                : 'bg-blue-100 text-blue-700 border border-blue-300 hover:bg-blue-200'}`}
                            title="Recalculer les affectations automatiques pour cette semaine"
                        >
                            <Wand2 className="w-4 h-4 md:mr-2" />
                            <span className="hidden md:inline">{autoFillTriggered ? 'Auto calculé ✓' : 'Recalculer Auto'}</span>
                        </button>
                    )}

                    {/* Clear All Choices Button (Admin Only) */}
                    {isAdmin && viewMode === 'WEEK' && !isCurrentWeekValidated && !isWeekInPast && (
                        <button
                            onClick={handleClearAllChoices}
                            className="flex items-center px-2 md:px-3 py-1.5 md:py-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded text-xs md:text-sm font-medium transition-all"
                            title="Effacer tous les choix de cette semaine"
                        >
                            <Trash2 className="w-4 h-4 md:mr-1" />
                            <span className="hidden md:inline">Effacer</span>
                        </button>
                    )}

                    {/* Activity Log History Button */}
                    <button
                        onClick={() => setShowLogPanel(!showLogPanel)}
                        className={`flex items-center px-2 md:px-3 py-1.5 md:py-2 rounded text-xs md:text-sm font-medium transition-all ${showLogPanel ? 'bg-violet-100 text-violet-700 border border-violet-300' : 'bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200'}`}
                        title="Historique des modifications"
                    >
                        <History className="w-4 h-4 md:mr-2" />
                        <span className="hidden md:inline">Historique</span>
                    </button>

                    {isAdmin && (
                        <button
                            onClick={() => setShowSettings(!showSettings)}
                            className="flex items-center px-2 md:px-3 py-1.5 md:py-2 bg-slate-200 hover:bg-slate-300 rounded text-slate-700 text-xs md:text-sm font-medium"
                        >
                            <Settings className="w-4 h-4 md:mr-2" />
                            <span className="hidden md:inline">Gérer</span>
                        </button>
                    )}
                </div>
            </div>

            {showSettings && (
                <div className="bg-white p-3 md:p-4 rounded-lg shadow border border-slate-200 mb-3 md:mb-4 animate-in fade-in slide-in-from-top-2 space-y-3 md:space-y-4">
                    {/* Create New Activity */}
                    <div>
                        <h3 className="font-bold text-xs md:text-sm mb-2 md:mb-3 flex items-center">
                            <Plus className="w-4 h-4 mr-2 text-blue-600" /> Créer une nouvelle activité
                        </h3>
                        <form onSubmit={handleCreateActivity} className="flex flex-col sm:flex-row flex-wrap gap-2 md:gap-4 sm:items-end">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">Nom</label>
                                <input
                                    type="text"
                                    value={newActName}
                                    onChange={e => setNewActName(e.target.value)}
                                    className="border rounded px-2 py-1 text-sm"
                                    placeholder="Ex: Consult Douleur"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">Rythme</label>
                                <select
                                    value={newActType}
                                    onChange={e => setNewActType(e.target.value as any)}
                                    className="border rounded px-2 py-1 text-sm"
                                >
                                    <option value="HALF_DAY">Demi-journée</option>
                                    <option value="WEEKLY">Semaine entière</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">Groupe d'Équité</label>
                                <select
                                    value={newActEquityGroup}
                                    onChange={e => setNewActEquityGroup(e.target.value)}
                                    className="border rounded px-2 py-1 text-sm"
                                >
                                    {EQUITY_GROUPS.map(g => (
                                        <option key={g.id} value={g.id}>{g.name}</option>
                                    ))}
                                </select>
                            </div>
                            <button type="submit" className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm flex items-center font-bold hover:bg-blue-700 transition-colors">
                                <Plus className="w-4 h-4 mr-1" /> Ajouter
                            </button>
                        </form>
                    </div>

                    {/* Activity List */}
                    <div className="border-t pt-4">
                        <h3 className="font-bold text-sm mb-3 flex items-center">
                            <Layers className="w-4 h-4 mr-2 text-purple-600" /> Gérer les activités existantes
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {activityDefinitions.map(act => {
                                const isEditing = editingActivityId === act.id;
                                const isConfirmDelete = deleteConfirmId === act.id;
                                const equityGrp = EQUITY_GROUPS.find(g => g.id === (act.equityGroup || 'custom'));

                                return (
                                    <div key={act.id} className={`p-3 border rounded-lg ${isEditing ? 'bg-blue-50 border-blue-300' : 'bg-slate-50'}`}>
                                        {isEditing ? (
                                            <div className="space-y-2">
                                                <input
                                                    type="text"
                                                    value={editActivityName}
                                                    onChange={e => setEditActivityName(e.target.value)}
                                                    className="w-full border rounded px-2 py-1 text-sm"
                                                    autoFocus
                                                />
                                                <select
                                                    value={editActivityEquityGroup}
                                                    onChange={e => setEditActivityEquityGroup(e.target.value)}
                                                    className="w-full border rounded px-2 py-1 text-sm"
                                                >
                                                    {EQUITY_GROUPS.map(g => (
                                                        <option key={g.id} value={g.id}>{g.name}</option>
                                                    ))}
                                                </select>
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={handleSaveActivityEdit}
                                                        className="flex-1 bg-green-600 text-white px-2 py-1 rounded text-xs font-bold hover:bg-green-700"
                                                    >
                                                        <Save className="w-3 h-3 inline mr-1" /> Sauver
                                                    </button>
                                                    <button
                                                        onClick={() => setEditingActivityId(null)}
                                                        className="flex-1 bg-slate-300 text-slate-700 px-2 py-1 rounded text-xs"
                                                    >
                                                        Annuler
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div>
                                                <div className="flex justify-between items-start mb-2">
                                                    <div>
                                                        <div className="font-bold text-sm text-slate-800">{act.name}</div>
                                                        <div className="flex items-center gap-2 mt-1">
                                                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${equityGrp?.color || 'bg-gray-100 text-gray-600'}`}>
                                                                {equityGrp?.name || 'Aucun groupe'}
                                                            </span>
                                                            <span className="text-[10px] text-slate-400">
                                                                {act.granularity === 'WEEKLY' ? 'Hebdo' : '½ jour'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    {act.isSystem && (
                                                        <span className="text-[9px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded font-bold uppercase">Système</span>
                                                    )}
                                                </div>
                                                <div className="flex gap-2 mt-2">
                                                    <button
                                                        onClick={() => handleEditActivity(act)}
                                                        className="flex-1 text-xs text-blue-600 hover:bg-blue-100 px-2 py-1 rounded flex items-center justify-center"
                                                    >
                                                        <Edit className="w-3 h-3 mr-1" /> Modifier
                                                    </button>
                                                    {!act.isSystem && (
                                                        <button
                                                            onClick={() => handleDeleteActivity(act.id)}
                                                            className={`flex-1 text-xs px-2 py-1 rounded flex items-center justify-center transition-colors ${isConfirmDelete
                                                                ? 'bg-red-600 text-white font-bold'
                                                                : 'text-red-600 hover:bg-red-100'
                                                                }`}
                                                        >
                                                            <Trash2 className="w-3 h-3 mr-1" />
                                                            {isConfirmDelete ? 'Confirmer ?' : 'Supprimer'}
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* TABS */}
            <div className="flex gap-1 md:gap-2 border-b border-slate-200 pb-1 overflow-x-auto shrink-0 -mx-0.5 px-0.5">
                {activityDefinitions.map(act => {
                    const equityGrp = EQUITY_GROUPS.find(g => g.id === (act.equityGroup || 'custom'));
                    return (
                        <button
                            key={act.id}
                            onClick={() => setActiveTabId(act.id)}
                            className={`px-2 md:px-4 py-1.5 md:py-2 text-[11px] md:text-sm font-medium rounded-t-lg transition-colors border-t border-l border-r whitespace-nowrap flex-shrink-0 ${activeTabId === act.id
                                ? 'bg-white border-slate-300 text-blue-700 -mb-px'
                                : 'bg-slate-50 border-transparent text-slate-500 hover:bg-slate-100'
                                }`}
                        >
                            <span>{act.name}</span>
                            {equityGrp && equityGrp.id !== 'custom' && (
                                <span className={`ml-1 md:ml-2 text-[9px] px-1 py-0.5 rounded ${equityGrp.color}`}>
                                    {equityGrp.id === 'unity_astreinte' ? '⚡' : '🔄'}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* CONTENT */}
            <div className="flex-1 bg-white border border-slate-300 rounded-b-lg p-2 md:p-4 shadow-sm overflow-auto min-h-0">
                {viewMode === 'MONTH' ? (
                    renderMonthGrid()
                ) : currentActivity?.granularity === 'WEEKLY' ? (
                    // Weekly Single Assign View
                    <div className="flex flex-col items-center">
                        <div className="w-full flex justify-end mb-2">
                            <button onClick={() => setChoiceSectionExpanded(!choiceSectionExpanded)} className="text-slate-400 hover:text-slate-600">
                                {choiceSectionExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                            </button>
                        </div>

                        {choiceSectionExpanded && (
                            <div className="bg-slate-50 p-3 md:p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center justify-center max-w-md w-full transition-all">

                                <div className="flex items-center space-x-4 mb-6 bg-white p-2 rounded-lg border border-slate-200">
                                    <button
                                        onClick={() => setWeeklyAssignmentMode('AUTO')}
                                        disabled={isWeekInPast}
                                        className={`px-4 py-2 text-sm font-bold rounded transition-colors ${weeklyAssignmentMode === 'AUTO' && !isWeekInPast ? 'bg-blue-100 text-blue-800' : 'text-slate-500 hover:bg-slate-50'} ${isWeekInPast ? 'opacity-50 cursor-not-allowed' : ''}`}
                                        title={isWeekInPast ? 'Le choix auto est désactivé pour les semaines passées' : ''}
                                    >
                                        <Wand2 className="w-4 h-4 inline-block mr-1" /> Auto / IA
                                    </button>
                                    <button
                                        onClick={() => setWeeklyAssignmentMode('MANUAL')}
                                        className={`px-4 py-2 text-sm font-bold rounded transition-colors ${weeklyAssignmentMode === 'MANUAL' || isWeekInPast ? 'bg-blue-100 text-blue-800' : 'text-slate-500 hover:bg-slate-50'}`}
                                    >
                                        <User className="w-4 h-4 inline-block mr-1" /> Manuel
                                    </button>
                                </div>
                                {isWeekInPast && (
                                    <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700 flex items-center">
                                        <AlertTriangle className="w-4 h-4 mr-2 flex-shrink-0" />
                                        <span>Cette semaine est passée. Seul le mode manuel est autorisé pour éviter de modifier l'historique.</span>
                                    </div>
                                )}

                                <h3 className="text-lg font-bold text-slate-800 mb-4">Responsable de la Semaine</h3>
                                <div className="w-full">
                                    {/* We use the first generated slot for this activity to control the logic */}
                                    {(() => {
                                        const sampleSlot = schedule.find(s => s.activityId === activeTabId);
                                        if (!sampleSlot) return <div>Pas de créneau généré.</div>;

                                        return (
                                            <select
                                                className={`w-full p-3 border rounded-lg text-lg text-center font-bold outline-none ring-2 ${sampleSlot.isLocked ? 'ring-blue-500 bg-white text-blue-800' : 'ring-transparent bg-slate-100 text-slate-500'}`}
                                                value={sampleSlot.isLocked ? sampleSlot.assignedDoctorId || "" : ""}
                                                onChange={(e) => handleWeeklyAssign(e.target.value)}
                                            >
                                                <option value="">-- {weeklyAssignmentMode === 'AUTO' ? 'Calcul Automatique' : 'Sélectionner'} --</option>
                                                {doctors.map(d => (
                                                    <option key={d.id} value={d.id}>{d.name}</option>
                                                ))}
                                            </select>
                                        )
                                    })()}
                                </div>

                                <div className="mt-4 text-sm text-slate-500 text-center">
                                    {weeklyAssignmentMode === 'AUTO' ? (
                                        <p className="flex items-center justify-center text-green-600 font-medium">
                                            <Wand2 className="w-4 h-4 mr-1" />
                                            L'algorithme choisit automatiquement en équilibrant sur l'année.
                                        </p>
                                    ) : (
                                        <p className="text-blue-600">
                                            Vous avez la main. Cette affectation s'appliquera à toute la semaine et bloquera les choix auto.
                                        </p>
                                    )}

                                    {(() => {
                                        const sampleSlot = schedule.find(s => s.activityId === activeTabId);
                                        if (sampleSlot && !sampleSlot.isLocked && sampleSlot.assignedDoctorId) {
                                            const doc = doctors.find(d => d.id === sampleSlot.assignedDoctorId);
                                            return (
                                                <div className="mt-2 text-slate-400 font-bold text-xs">
                                                    (Actuellement assigné : {doc?.name})
                                                </div>
                                            )
                                        }
                                    })()}
                                </div>

                                {/* Explicit AUTO trigger */}
                                {weeklyAssignmentMode === 'AUTO' && (
                                    <div className="mt-2">
                                        <button
                                            onClick={() => handleWeeklyAssign("")} // Clear Overrides
                                            className="text-xs underline text-slate-400 hover:text-blue-600"
                                        >
                                            Forcer le recalcul Auto
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                ) : (
                    // Standard Weekly Grid
                    <div className="min-w-[450px] md:min-w-[700px]">
                        <table className="w-full border-collapse table-fixed">
                            <thead>
                                <tr>
                                    <th className="p-1 md:p-2 border bg-slate-100 text-[9px] md:text-xs font-bold text-slate-500 uppercase w-12 md:w-24">
                                        <span className="hidden md:inline">P&eacute;riode</span>
                                        <span className="md:hidden">P&eacute;r.</span>
                                    </th>
                                    {days.map(d => {
                                        const date = getDateForDayOfWeek(currentWeekStart, d);
                                        const [year, month, day] = date.split('-');
                                        return (
                                            <th key={d} className="p-1 md:p-2 border bg-slate-50 text-[10px] md:text-sm font-bold text-slate-700">
                                                <span className="md:hidden">{d.substring(0, 3)}</span>
                                                <span className="hidden md:inline">{d}</span>
                                                <span className="block text-[8px] md:text-xs font-normal text-slate-500">{day}/{month}</span>
                                            </th>
                                        )
                                    })}
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td className="p-1 md:p-2 border bg-slate-50 text-[9px] md:text-xs font-bold text-center align-middle">
                                        <span className="hidden md:inline">Matin</span>
                                        <span className="md:hidden">AM</span>
                                    </td>
                                    {days.map(d => (
                                        <td key={`m-${d}`} className="p-0.5 md:p-2 border align-top h-auto">
                                            {renderSlot(d, Period.MORNING)}
                                        </td>
                                    ))}
                                </tr>
                                <tr>
                                    <td className="p-1 md:p-2 border bg-slate-50 text-[9px] md:text-xs font-bold text-center align-middle">
                                        <span className="hidden md:inline">Apr&egrave;s-midi</span>
                                        <span className="md:hidden">PM</span>
                                    </td>
                                    {days.map(d => (
                                        <td key={`am-${d}`} className="p-0.5 md:p-2 border align-top h-auto">
                                            {renderSlot(d, Period.AFTERNOON)}
                                        </td>
                                    ))}
                                </tr>
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* COMPREHENSIVE ALERTS SECTION - COLLAPSIBLE */}
            <div className="bg-red-50 rounded-lg border border-red-100 p-4 mt-4 shrink-0 shadow-sm">
                <h3
                    className="font-bold text-red-800 text-sm flex items-center justify-between cursor-pointer"
                    onClick={() => setConflictsSectionExpanded(!conflictsSectionExpanded)}
                >
                    <span className="flex items-center">
                        <AlertTriangle className="w-5 h-5 mr-2 text-red-600" />
                        Conflits Détectés ({currentActivity?.name})
                    </span>
                    <div className="flex items-center gap-2">
                        <span className="text-xs bg-red-200 text-red-800 px-2 py-0.5 rounded-full">{activityConflicts.length}</span>
                        {conflictsSectionExpanded ? <Minimize2 className="w-4 h-4 text-red-400" /> : <Maximize2 className="w-4 h-4 text-red-400" />}
                    </div>
                </h3>
                {conflictsSectionExpanded && (
                    <div className="space-y-2 max-h-64 overflow-y-auto pr-1 mt-3">
                        {activityConflicts.length === 0 ? (
                            <div className="flex flex-col items-center justify-center p-4 text-slate-500 italic">
                                <span className="text-sm">Aucun conflit avec d'autres activités ou RCP pour le moment.</span>
                                <span className="text-xs opacity-70 mt-1">L'application détecte en temps réel les chevauchements avec les Postes, RCP confirmées et autres activités.</span>
                            </div>
                        ) : (
                            activityConflicts.map(conf => {
                                const doc = doctors.find(d => d.id === conf.doctorId);
                                const slot = schedule.find(s => s.id === conf.slotId);
                                return (
                                    <div
                                        key={conf.id}
                                        onClick={() => handleAlertClick(conf)}
                                        className="group flex items-start bg-white p-3 rounded-lg border border-red-200 shadow-sm hover:shadow-md hover:border-red-400 cursor-pointer transition-all"
                                    >
                                        <div className="mr-3 mt-0.5">
                                            <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center text-red-600">
                                                <AlertTriangle className="w-4 h-4" />
                                            </div>
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex justify-between items-start">
                                                <span className="font-bold text-red-700 text-sm">
                                                    {conf.type === 'DOUBLE_BOOKING' ? 'DOUBLE RÉSERVATION' : conf.type}
                                                </span>
                                                <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-mono">
                                                    {slot?.day} {slot?.period === 'Matin' ? 'AM' : 'PM'}
                                                </span>
                                            </div>
                                            <div className="text-xs text-slate-700 mt-1">
                                                <span className="font-bold">{doc?.name}</span> : {conf.description}
                                            </div>
                                            <div className="mt-2 opacity-0 group-hover:opacity-100 transition-opacity flex justify-end">
                                                <span className="text-xs font-bold text-blue-600 flex items-center">
                                                    Résoudre <ChevronRight className="w-3 h-3 ml-1" />
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                )
                            })
                        )}
                    </div>
                )}
            </div>

            {/* STATS TABLE with Global Equity */}
            <div className="bg-white rounded-lg shadow border border-slate-200 p-2 md:p-4 mt-3 md:mt-4 shrink-0 transition-all overflow-x-auto">
                <div className="flex justify-between items-center mb-3">
                    <h3 className="font-bold text-slate-800 text-sm flex items-center cursor-pointer" onClick={() => setStatsSectionExpanded(!statsSectionExpanded)}>
                        <span className="flex items-center">
                            <Layers className="w-4 h-4 mr-2 text-purple-600" />
                            Équité & Répartition par Groupe
                        </span>
                        <div className="ml-3 flex items-center space-x-2">
                            {currentActivity?.equityGroup && (
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${EQUITY_GROUPS.find(g => g.id === currentActivity.equityGroup)?.color || 'bg-gray-100'
                                    }`}>
                                    {EQUITY_GROUPS.find(g => g.id === currentActivity.equityGroup)?.name || currentActivity.equityGroup}
                                </span>
                            )}
                            {activitiesStartDate && (
                                <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold">
                                    Depuis {new Date(activitiesStartDate).toLocaleDateString()}
                                </span>
                            )}
                            {statsSectionExpanded ? <Minimize2 className="w-4 h-4 text-slate-400" /> : <Maximize2 className="w-4 h-4 text-slate-400" />}
                        </div>
                    </h3>

                    {statsSectionExpanded && (
                        <div className="flex items-center gap-2">
                            <button
                                onClick={handleDownloadCurrentView}
                                disabled={isGeneratingStatsPdf}
                                className="text-xs bg-blue-100 hover:bg-blue-200 text-blue-700 px-3 py-1.5 rounded flex items-center transition-colors disabled:opacity-50"
                                title="Télécharger un snapshot de la vue actuelle"
                            >
                                {isGeneratingStatsPdf ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <FileText className="w-3 h-3 mr-1" />}
                                Vue actuelle
                            </button>
                            <button
                                onClick={() => setShowPdfModal(true)}
                                className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded flex items-center transition-colors"
                            >
                                <Printer className="w-3 h-3 mr-1" />
                                Rapport période
                            </button>
                        </div>
                    )}
                </div>

                {statsSectionExpanded && (
                    <div className="space-y-6">
                        {/* Show equity table based on current activity's equity group */}

                        {/* UNITY + ASTREINTE GROUP */}
                        {(currentActivity?.equityGroup === 'unity_astreinte' || !currentActivity?.equityGroup) && !isWorkflowTab && (
                            <div>
                                <h4 className="text-xs font-bold text-orange-600 uppercase mb-2 border-b border-orange-200 pb-1 flex items-center justify-between">
                                    <span>Équité : Groupe Unity + Astreinte</span>
                                    <span className="text-[10px] normal-case font-normal text-slate-500">
                                        Activités regroupées : {
                                            activityDefinitions
                                                .filter(a => a.equityGroup === 'unity_astreinte')
                                                .map(a => a.name)
                                                .join(', ') || 'Astreinte, Unity'
                                        }
                                    </span>
                                </h4>
                                <div className="overflow-x-auto max-h-48 transition-all">
                                    <table className="min-w-full text-xs text-left">
                                        <thead className="bg-orange-50 border-b sticky top-0 z-10">
                                            <tr>
                                                <th className="p-2 font-bold text-slate-600">Médecin</th>
                                                <th className="p-2 font-bold text-slate-500">Taux</th>
                                                <th className="p-2 font-bold text-orange-500" title="Points UNIQUEMENT dans la période affichée (Sem./Mois)">Sem./Mois</th>
                                                <th className="p-2 font-bold text-orange-700" title={activitiesStartDate ? `Points total depuis le ${new Date(activitiesStartDate).toLocaleDateString('fr-FR')}` : 'Points total (historique complet)'}>
                                                    Total U+A
                                                    {activitiesStartDate && (
                                                        <span className="block text-[8px] font-normal text-orange-500">depuis le {new Date(activitiesStartDate).toLocaleDateString('fr-FR')}</span>
                                                    )}
                                                </th>
                                                <th className="p-2 font-bold text-blue-600" title="Score pondéré = Total / Taux">Score Pondéré</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {[...doctors].sort((a, b) => {
                                                const scoreA = screenStats[a.id]?.weighted || 0;
                                                const scoreB = screenStats[b.id]?.weighted || 0;
                                                return scoreA - scoreB;
                                            }).map(d => {
                                                const stats = screenStats[d.id];
                                                const weekTotal = (stats?.unityWeek || 0) + (stats?.astreinteWeek || 0);
                                                const cumulTotal = (stats?.unityTotal || 0) + (stats?.astreinteTotal || 0);

                                                return (
                                                    <tr key={d.id} className="border-b hover:bg-slate-50">
                                                        <td className="p-2 font-medium text-slate-700 flex items-center">
                                                            <div className={`w-5 h-5 rounded-full mr-2 ${d.color} flex items-center justify-center text-[8px]`}>
                                                                {d.name.substring(0, 2)}
                                                            </div>
                                                            {d.name}
                                                        </td>
                                                        <td className="p-2 text-slate-500">
                                                            {Math.round((stats?.rate || 1) * 100)}%
                                                        </td>
                                                        <td className="p-2 text-orange-500 bg-orange-50/30">
                                                            {weekTotal}
                                                        </td>
                                                        <td className="p-2 font-bold text-orange-700 bg-orange-50/50">
                                                            {cumulTotal}
                                                        </td>
                                                        <td className="p-2 font-bold text-blue-600">
                                                            {(stats?.weighted || 0).toFixed(1)}
                                                        </td>
                                                    </tr>
                                                )
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* WORKFLOW GROUP */}
                        {(currentActivity?.equityGroup === 'workflow' || isWorkflowTab) && (
                            <div>
                                <h4 className="text-xs font-bold text-emerald-600 uppercase mb-2 border-b border-emerald-200 pb-1 flex items-center justify-between">
                                    <span>Équité : Supervision Workflow</span>
                                    <span className="text-[10px] normal-case font-normal text-slate-500">
                                        Activités regroupées : {
                                            activityDefinitions
                                                .filter(a => a.equityGroup === 'workflow')
                                                .map(a => a.name)
                                                .join(', ') || 'Supervision Workflow'
                                        }
                                    </span>
                                </h4>
                                <div className="overflow-x-auto max-h-48 transition-all">
                                    <table className="min-w-full text-xs text-left">
                                        <thead className="bg-emerald-50 border-b sticky top-0 z-10">
                                            <tr>
                                                <th className="p-2 font-bold text-slate-600">Médecin</th>
                                                <th className="p-2 font-bold text-slate-500">Taux</th>
                                                <th className="p-2 font-bold text-emerald-500" title="Cette semaine">Sem.</th>
                                                <th className="p-2 font-bold text-emerald-700" title={activitiesStartDate ? `Cumul depuis le ${new Date(activitiesStartDate).toLocaleDateString('fr-FR')}` : 'Cumul total'}>
                                                    Cumul
                                                    {activitiesStartDate && (
                                                        <span className="block text-[8px] font-normal text-emerald-500">depuis le {new Date(activitiesStartDate).toLocaleDateString('fr-FR')}</span>
                                                    )}
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {[...doctors].sort((a, b) => {
                                                const wfA = screenStats[a.id]?.workflowTotal || 0;
                                                const wfB = screenStats[b.id]?.workflowTotal || 0;
                                                return wfA - wfB;
                                            }).map(d => {
                                                const stats = screenStats[d.id];
                                                return (
                                                    <tr key={d.id} className="border-b hover:bg-slate-50">
                                                        <td className="p-2 font-medium text-slate-700 flex items-center">
                                                            <div className={`w-5 h-5 rounded-full mr-2 ${d.color} flex items-center justify-center text-[8px]`}>
                                                                {d.name.substring(0, 2)}
                                                            </div>
                                                            {d.name}
                                                        </td>
                                                        <td className="p-2 text-slate-500">
                                                            {Math.round((stats?.rate || 1) * 100)}%
                                                        </td>
                                                        <td className="p-2 text-emerald-500 bg-emerald-50/30">
                                                            {stats?.workflowWeek || 0}
                                                        </td>
                                                        <td className="p-2 font-bold text-emerald-700 bg-emerald-50/50">
                                                            {stats?.workflowTotal || 0}
                                                        </td>
                                                    </tr>
                                                )
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* CUSTOM/INDEPENDENT GROUP - Show activity-specific counts */}
                        {currentActivity?.equityGroup === 'custom' && (
                            <div>
                                <h4 className="text-xs font-bold text-purple-600 uppercase mb-2 border-b border-purple-200 pb-1 flex items-center justify-between">
                                    <span>Équité : {currentActivity.name} (Indépendante)</span>
                                    <span className="text-[10px] normal-case font-normal text-slate-500">
                                        Cette activité est comptabilisée séparément
                                    </span>
                                </h4>
                                <div className="overflow-x-auto max-h-48 transition-all">
                                    <table className="min-w-full text-xs text-left">
                                        <thead className="bg-purple-50 border-b sticky top-0 z-10">
                                            <tr>
                                                <th className="p-2 font-bold text-slate-600">Médecin</th>
                                                <th className="p-2 font-bold text-slate-500">Taux Travail</th>
                                                <th className="p-2 font-bold text-purple-600">{currentActivity.name} (Total)</th>
                                                <th className="p-2 font-bold text-purple-800">Score Pondéré</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {[...doctors].sort((a, b) => {
                                                // Count activity assignments for this specific activity
                                                const sourceSchedule = viewMode === 'WEEK' ? schedule : monthSchedule;
                                                const countA = sourceSchedule.filter(s => s.assignedDoctorId === a.id && s.activityId === activeTabId).length;
                                                const countB = sourceSchedule.filter(s => s.assignedDoctorId === b.id && s.activityId === activeTabId).length;
                                                const rateA = getDoctorWorkRate(a);
                                                const rateB = getDoctorWorkRate(b);
                                                return (countA / rateA) - (countB / rateB);
                                            }).map(d => {
                                                const sourceSchedule = viewMode === 'WEEK' ? schedule : monthSchedule;
                                                const count = sourceSchedule.filter(s => s.assignedDoctorId === d.id && s.activityId === activeTabId).length;
                                                const historyCount = effectiveHistory[d.id]?.[activeTabId] || 0;
                                                const total = count + historyCount;
                                                const rate = getDoctorWorkRate(d);
                                                const weighted = total / rate;

                                                return (
                                                    <tr key={d.id} className="border-b hover:bg-slate-50">
                                                        <td className="p-2 font-medium text-slate-700 flex items-center">
                                                            <div className={`w-5 h-5 rounded-full mr-2 ${d.color} flex items-center justify-center text-[8px]`}>
                                                                {d.name.substring(0, 2)}
                                                            </div>
                                                            {d.name}
                                                        </td>
                                                        <td className="p-2 text-slate-500">
                                                            {Math.round(rate * 100)}%
                                                        </td>
                                                        <td className="p-2 font-bold text-purple-600 bg-purple-50/30">
                                                            {total}
                                                        </td>
                                                        <td className="p-2 font-bold text-purple-800">
                                                            {weighted.toFixed(1)}
                                                        </td>
                                                    </tr>
                                                )
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* PDF DATE RANGE MODAL */}
            {showPdfModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-bold text-slate-800 flex items-center">
                                <FileText className="w-5 h-5 mr-2 text-blue-600" />
                                Générer Rapport PDF
                            </h3>
                            <button onClick={() => setShowPdfModal(false)} className="text-slate-400 hover:text-slate-600">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="space-y-4 mb-6">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">Date de début</label>
                                <input
                                    type="date"
                                    className="w-full border rounded p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                    value={pdfStartDate}
                                    onChange={e => setPdfStartDate(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">Date de fin</label>
                                <input
                                    type="date"
                                    className="w-full border rounded p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                    value={pdfEndDate}
                                    min={pdfStartDate}
                                    onChange={e => setPdfEndDate(e.target.value)}
                                />
                            </div>
                            <div className="text-xs text-slate-500 bg-slate-50 p-3 rounded italic">
                                Le rapport calculera les statistiques consolidées (Unity, Astreinte, Supervision) sur cette période précise.
                            </div>
                        </div>

                        <button
                            onClick={handleDownloadReport}
                            disabled={isGeneratingStatsPdf}
                            className="w-full py-2.5 bg-blue-600 text-white rounded-lg font-bold text-sm hover:bg-blue-700 flex items-center justify-center disabled:opacity-50 transition-all shadow-md"
                        >
                            {isGeneratingStatsPdf ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Printer className="w-4 h-4 mr-2" />}
                            {isGeneratingStatsPdf ? 'Génération...' : 'Télécharger le Rapport'}
                        </button>
                    </div>
                </div>
            )}

            {selectedSlot && (
                <ConflictResolverModal
                    slot={selectedSlot}
                    conflict={selectedConflict || undefined}
                    doctors={doctors}
                    slots={schedule}
                    unavailabilities={unavailabilities}
                    onClose={() => { setSelectedSlot(null); setSelectedConflict(null); }}
                    onResolve={handleManualAssign}
                    onCloseSlot={handleCloseSlot}
                />
            )}

            {/* ======= ACTIVITY LOG SLIDING PANEL ======= */}
            {showLogPanel && (
                <>
                    {/* Backdrop */}
                    <div
                        className="fixed inset-0 bg-black/20 z-40 transition-opacity"
                        onClick={() => setShowLogPanel(false)}
                    />
                    {/* Sliding Panel */}
                    <div className="fixed top-0 right-0 h-full w-[420px] max-w-[90vw] bg-white shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-300 border-l border-slate-200">
                        {/* Panel Header */}
                        <div className="p-4 border-b border-slate-200 bg-gradient-to-r from-violet-50 to-indigo-50 flex-shrink-0">
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center">
                                    <div className="w-9 h-9 rounded-lg bg-violet-100 flex items-center justify-center mr-3">
                                        <History className="w-5 h-5 text-violet-600" />
                                    </div>
                                    <div>
                                        <h2 className="font-bold text-slate-800 text-lg">Historique</h2>
                                        <p className="text-xs text-slate-500">Modifications des activités</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setShowLogPanel(false)}
                                    className="p-2 hover:bg-slate-200 rounded-lg transition-colors"
                                >
                                    <X className="w-5 h-5 text-slate-500" />
                                </button>
                            </div>
                            {/* Filter Tabs */}
                            <div className="flex bg-white/80 p-1 rounded-lg border border-slate-200">
                                <button
                                    onClick={() => setLogFilter('ALL')}
                                    className={`flex-1 py-1.5 text-xs font-bold rounded transition-all ${logFilter === 'ALL' ? 'bg-violet-100 text-violet-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    Toutes les semaines
                                </button>
                                <button
                                    onClick={() => setLogFilter('WEEK')}
                                    className={`flex-1 py-1.5 text-xs font-bold rounded transition-all ${logFilter === 'WEEK' ? 'bg-violet-100 text-violet-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    Semaine actuelle
                                </button>
                            </div>
                        </div>

                        {/* Panel Content */}
                        <div className="flex-1 overflow-y-auto p-4">
                            {isLoadingLogs ? (
                                <div className="flex flex-col items-center justify-center h-40 text-slate-400">
                                    <Loader2 className="w-8 h-8 animate-spin mb-3 text-violet-400" />
                                    <span className="text-sm">Chargement...</span>
                                </div>
                            ) : logEntries.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-40 text-slate-400">
                                    <History className="w-12 h-12 mb-3 opacity-30" />
                                    <span className="text-sm font-medium">Aucune modification enregistrée</span>
                                    <span className="text-xs mt-1">Les modifications apparaîtront ici</span>
                                </div>
                            ) : (
                                <div className="space-y-1">
                                    {(() => {
                                        // Group logs by date
                                        const grouped = new Map<string, ActivityLogEntry[]>();
                                        logEntries.forEach(entry => {
                                            const dateKey = new Date(entry.timestamp).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
                                            if (!grouped.has(dateKey)) grouped.set(dateKey, []);
                                            grouped.get(dateKey)!.push(entry);
                                        });

                                        return Array.from(grouped.entries()).map(([dateLabel, entries]) => (
                                            <div key={dateLabel} className="mb-4">
                                                <div className="sticky top-0 bg-white/95 backdrop-blur-sm py-2 z-10">
                                                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider capitalize">{dateLabel}</span>
                                                </div>
                                                <div className="space-y-2 relative">
                                                    {/* Timeline line */}
                                                    <div className="absolute left-[15px] top-2 bottom-2 w-px bg-slate-200" />
                                                    {entries.map(entry => {
                                                        // Action icon & color
                                                        let iconColor = 'bg-slate-100 text-slate-500';
                                                        let actionLabel = entry.action;
                                                        if (entry.action === 'MANUAL_ASSIGN') { iconColor = 'bg-blue-100 text-blue-600'; actionLabel = 'Assignation manuelle'; }
                                                        else if (entry.action === 'AUTO_RECALCULATE') { iconColor = 'bg-cyan-100 text-cyan-600'; actionLabel = 'Recalcul auto'; }
                                                        else if (entry.action === 'VALIDATE_WEEK') { iconColor = 'bg-green-100 text-green-600'; actionLabel = 'Validation semaine'; }
                                                        else if (entry.action === 'UNVALIDATE_WEEK') { iconColor = 'bg-orange-100 text-orange-600'; actionLabel = 'Déverrouillage'; }
                                                        else if (entry.action === 'CLEAR_CHOICES') { iconColor = 'bg-red-100 text-red-600'; actionLabel = 'Choix effacés'; }
                                                        else if (entry.action === 'WEEKLY_ASSIGN') { iconColor = 'bg-indigo-100 text-indigo-600'; actionLabel = 'Assignation semaine'; }
                                                        else if (entry.action === 'CREATE_ACTIVITY') { iconColor = 'bg-emerald-100 text-emerald-600'; actionLabel = 'Création activité'; }
                                                        else if (entry.action === 'DELETE_ACTIVITY') { iconColor = 'bg-rose-100 text-rose-600'; actionLabel = 'Suppression activité'; }
                                                        else if (entry.action === 'EDIT_ACTIVITY') { iconColor = 'bg-amber-100 text-amber-600'; actionLabel = 'Modification activité'; }

                                                        const time = new Date(entry.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

                                                        return (
                                                            <div key={entry.id} className="relative pl-9 group">
                                                                {/* Timeline dot */}
                                                                <div className={`absolute left-[10px] top-3 w-[11px] h-[11px] rounded-full border-2 border-white shadow-sm ${iconColor.split(' ')[0]}`} />

                                                                <div className="bg-white border border-slate-100 rounded-lg p-3 hover:border-slate-200 hover:shadow-sm transition-all">
                                                                    {/* Header: Action badge + Time */}
                                                                    <div className="flex items-center justify-between mb-1.5">
                                                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${iconColor}`}>
                                                                            {actionLabel}
                                                                        </span>
                                                                        <span className="text-[10px] text-slate-400 font-mono flex items-center">
                                                                            <Clock className="w-3 h-3 mr-1" />{time}
                                                                        </span>
                                                                    </div>

                                                                    {/* Description */}
                                                                    <p className="text-sm text-slate-700 leading-snug">{entry.description}</p>

                                                                    {/* Week badge */}
                                                                    {entry.weekKey && (
                                                                        <div className="mt-2 flex items-center text-[10px] text-slate-400">
                                                                            <Calendar className="w-3 h-3 mr-1" />
                                                                            Sem. du {new Date(entry.weekKey).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                                                                        </div>
                                                                    )}

                                                                    {/* User info */}
                                                                    <div className="mt-2 flex items-center text-[10px] text-slate-400 border-t border-slate-50 pt-2">
                                                                        <UserCircle className="w-3.5 h-3.5 mr-1 text-violet-400" />
                                                                        <span className="font-medium text-violet-500">{entry.userName}</span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        ));
                                    })()}
                                </div>
                            )}
                        </div>

                        {/* Panel Footer */}
                        <div className="p-3 border-t border-slate-200 bg-slate-50 flex-shrink-0">
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] text-slate-400">
                                    {logEntries.length} modification{logEntries.length !== 1 ? 's' : ''}
                                </span>
                                <button
                                    onClick={loadLogs}
                                    className="text-[10px] text-violet-600 hover:text-violet-700 font-bold flex items-center"
                                >
                                    <History className="w-3 h-3 mr-1" />
                                    Actualiser
                                </button>
                            </div>
                        </div>
                    </div>
                </>
            )}

        </div>
    );
};

export default Activities;
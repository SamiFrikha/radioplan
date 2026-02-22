
import React, { useContext, useState, useMemo } from 'react';
import { AppContext } from '../App';
import StatCard from '../components/StatCard';
import ConflictResolverModal from '../components/ConflictResolverModal';
import RcpExceptionModal from '../components/RcpExceptionModal';
import { Users, AlertTriangle, Calendar, Activity, Clock, ChevronLeft, ChevronRight, LayoutList, LayoutGrid, UserX, CalendarDays, UserMinus, CalendarX2, MapPin } from 'lucide-react';
import { DayOfWeek, Period, SlotType, Doctor, ScheduleSlot, Conflict, RcpException } from '../types';
import { getDateForDayOfWeek, isDateInRange, generateScheduleForWeek, detectConflicts, isFrenchHoliday, getFrenchHolidays } from '../services/scheduleService';
import { getDoctorHexColor } from '../components/DoctorBadge';

const Dashboard: React.FC = () => {
    const {
        doctors,
        unavailabilities,
        template,
        activityDefinitions,
        rcpTypes,
        effectiveHistory, // Use effectiveHistory for equity calculations
        rcpAttendance,
        rcpExceptions,
        manualOverrides,
        setManualOverrides,
        dashboardViewMode,
        setDashboardViewMode,
        dashboardWeekOffset,
        setDashboardWeekOffset,
        addRcpException,
        validatedWeeks
    } = useContext(AppContext);

    // Compute week start from offset (stored in context to survive re-renders)
    const currentWeekStart = useMemo(() => {
        const d = new Date();
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        d.setDate(diff + (dashboardWeekOffset * 7));
        d.setHours(0, 0, 0, 0);
        return d;
    }, [dashboardWeekOffset]);

    // Use context state for viewMode (survives re-renders)
    const viewMode = dashboardViewMode;
    const setViewMode = setDashboardViewMode;

    // Persist selectedDate in sessionStorage
    const [selectedDate, setSelectedDateState] = useState<Date>(() => {
        const saved = sessionStorage.getItem('dashboard_selectedDate');
        return saved ? new Date(saved) : new Date();
    });

    const setSelectedDate = (date: Date) => {
        sessionStorage.setItem('dashboard_selectedDate', date.toISOString());
        setSelectedDateState(date);
    };

    // Resolver Modal State
    const [selectedConflict, setSelectedConflict] = useState<Conflict | null>(null);
    const [selectedSlot, setSelectedSlot] = useState<ScheduleSlot | null>(null);

    // RCP Exception Modal (for moving RCPs from holidays)
    const [rcpExceptionSlot, setRcpExceptionSlot] = useState<ScheduleSlot | null>(null);

    // Check if current dashboard week is validated/locked in Activities page
    const currentWeekKey = currentWeekStart.toISOString().split('T')[0];
    const isCurrentWeekValidated = validatedWeeks?.includes(currentWeekKey) || false;

    // Generate Local Schedule based on Local Week
    // Dashboard does NOT auto-fill activities - it uses manual overrides only
    const schedule = useMemo(() => {
        const generated = generateScheduleForWeek(
            currentWeekStart,
            template,
            unavailabilities,
            doctors,
            activityDefinitions,
            rcpTypes,
            false, // Do NOT auto-calculate activities in Dashboard - use overrides only
            effectiveHistory,
            rcpAttendance,
            rcpExceptions
        );
        // Apply Overrides Locally
        return generated.map(slot => {
            const overrideValue = manualOverrides[slot.id];
            if (overrideValue) {
                if (overrideValue === '__CLOSED__') {
                    return { ...slot, assignedDoctorId: null, isLocked: true, isClosed: true };
                } else {
                    // Handle 'auto:' prefix - extract actual doctor ID
                    const isAuto = overrideValue.startsWith('auto:');
                    const doctorId = isAuto ? overrideValue.substring(5) : overrideValue;
                    return { ...slot, assignedDoctorId: doctorId, isLocked: true, isAutoAssigned: isAuto };
                }
            }
            // If week is NOT validated, clear activity assignments so they don't show in Dashboard
            if (!isCurrentWeekValidated && slot.type === SlotType.ACTIVITY) {
                return { ...slot, assignedDoctorId: null };
            }
            return slot;
        });
    }, [currentWeekStart, template, unavailabilities, doctors, activityDefinitions, rcpTypes, effectiveHistory, rcpAttendance, rcpExceptions, manualOverrides, isCurrentWeekValidated]);

    const conflicts = useMemo(() => {
        return detectConflicts(schedule, unavailabilities, doctors, activityDefinitions);
    }, [schedule, unavailabilities, doctors, activityDefinitions]);

    // Detect RCPs falling on holidays in the current month AND next month (based on selected date)
    const rcpsOnHolidays = useMemo(() => {
        // Use the selected date as reference point
        const referenceDate = selectedDate;
        const currentMonth = referenceDate.getMonth();
        const currentYear = referenceDate.getFullYear();

        // Calculate next month
        const nextMonth = currentMonth === 11 ? 0 : currentMonth + 1;
        const nextMonthYear = currentMonth === 11 ? currentYear + 1 : currentYear;

        // Track unique RCPs by a unique key (to avoid duplicates)
        const rcpMap = new Map<string, { slot: ScheduleSlot; holiday: { date: string; name: string }; weekStart: Date }>();

        // Get start of current month (Monday of the first week)
        let weekStart = new Date(currentYear, currentMonth, 1);
        const weekDay = weekStart.getDay();
        weekStart.setDate(weekStart.getDate() - weekDay + (weekDay === 0 ? -6 : 1)); // Get Monday of first week

        // End of next month (last day)
        const periodEnd = new Date(nextMonthYear, nextMonth + 1, 0); // Last day of next month

        // Loop through all weeks that overlap with current and next month
        let loops = 0;
        const maxLoops = 10; // ~2.5 months max

        while (loops < maxLoops && weekStart <= periodEnd) {
            const weekSlots = generateScheduleForWeek(
                new Date(weekStart), // Create new Date to avoid mutation issues
                template,
                unavailabilities,
                doctors,
                activityDefinitions,
                rcpTypes,
                false,
                {},
                rcpAttendance,
                rcpExceptions
            );

            // Find RCP slots that fall on holidays and are in the target months
            weekSlots
                .filter(slot => slot.type === SlotType.RCP && !slot.isCancelled)
                .forEach(slot => {
                    const slotDate = new Date(slot.date);
                    const slotMonth = slotDate.getMonth();
                    const slotYear = slotDate.getFullYear();

                    // Include slots in current month OR next month
                    const isInCurrentMonth = slotMonth === currentMonth && slotYear === currentYear;
                    const isInNextMonth = slotMonth === nextMonth && slotYear === nextMonthYear;

                    if (isInCurrentMonth || isInNextMonth) {
                        const holiday = isFrenchHoliday(slot.date);
                        if (holiday) {
                            // Check if there's already an exception that moves this RCP to a different date
                            const hasMovedException = rcpExceptions.some(ex =>
                                ex.originalDate === slot.date &&
                                ex.newDate && ex.newDate !== slot.date
                            );

                            if (!hasMovedException) {
                                // Use slot.id + date as unique key to avoid duplicates
                                const uniqueKey = `${slot.id}`;
                                if (!rcpMap.has(uniqueKey)) {
                                    rcpMap.set(uniqueKey, {
                                        slot,
                                        holiday,
                                        weekStart: new Date(weekStart)
                                    });
                                }
                            }
                        }
                    }
                });

            weekStart.setDate(weekStart.getDate() + 7);
            loops++;
        }

        // Convert Map to array and sort by date
        const result = Array.from(rcpMap.values());
        result.sort((a, b) => a.slot.date.localeCompare(b.slot.date));

        return result;
    }, [selectedDate, template, unavailabilities, doctors, activityDefinitions, rcpTypes, rcpAttendance, rcpExceptions]);


    // Helpers for navigation
    const handleTimeChange = (direction: 'prev' | 'next') => {
        const newDate = new Date(selectedDate);
        if (viewMode === 'DAY') {
            newDate.setDate(newDate.getDate() + (direction === 'next' ? 1 : -1));
            // Skip weekends
            if (newDate.getDay() === 0) newDate.setDate(newDate.getDate() + (direction === 'next' ? 1 : -2)); // Skip Sun
            if (newDate.getDay() === 6) newDate.setDate(newDate.getDate() + (direction === 'next' ? 2 : -1)); // Skip Sat
        } else {
            newDate.setDate(newDate.getDate() + (direction === 'next' ? 7 : -7));
        }
        setSelectedDate(newDate);

        // If we move weeks, update the offset
        if (viewMode === 'WEEK' || (viewMode === 'DAY' && getWeekNumber(newDate) !== getWeekNumber(currentWeekStart))) {
            // Calculate the offset from today's week
            const today = new Date();
            const todayDay = today.getDay();
            const todayDiff = today.getDate() - todayDay + (todayDay === 0 ? -6 : 1);
            const todayMonday = new Date(today);
            todayMonday.setDate(todayDiff);
            todayMonday.setHours(0, 0, 0, 0);

            const day = newDate.getDay();
            const diff = newDate.getDate() - day + (day === 0 ? -6 : 1);
            const newMonday = new Date(newDate);
            newMonday.setDate(diff);
            newMonday.setHours(0, 0, 0, 0);

            // Calculate week difference
            const weekDiff = Math.round((newMonday.getTime() - todayMonday.getTime()) / (7 * 24 * 60 * 60 * 1000));
            setDashboardWeekOffset(weekDiff);
        }
    };

    const getWeekNumber = (d: Date) => {
        const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
        const dayNum = date.getUTCDay() || 7;
        date.setUTCDate(date.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
        return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    };

    const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const d = new Date(e.target.value);
        setSelectedDate(d);

        // Calculate the offset from today's week
        const today = new Date();
        const todayDay = today.getDay();
        const todayDiff = today.getDate() - todayDay + (todayDay === 0 ? -6 : 1);
        const todayMonday = new Date(today);
        todayMonday.setDate(todayDiff);
        todayMonday.setHours(0, 0, 0, 0);

        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        const newMonday = new Date(d);
        newMonday.setDate(diff);
        newMonday.setHours(0, 0, 0, 0);

        const weekDiff = Math.round((newMonday.getTime() - todayMonday.getTime()) / (7 * 24 * 60 * 60 * 1000));
        setDashboardWeekOffset(weekDiff);
    }

    // --- STATS CALCULATION ---
    const stats = useMemo(() => {
        let filteredSlots = [];
        const dateStr = selectedDate.toISOString().split('T')[0];

        if (viewMode === 'DAY') {
            filteredSlots = schedule.filter(s => s.date === dateStr);
        } else {
            const startOfWeek = new Date(currentWeekStart);
            const endOfWeek = new Date(currentWeekStart);
            endOfWeek.setDate(endOfWeek.getDate() + 5);

            filteredSlots = schedule.filter(s => {
                const d = new Date(s.date);
                return d >= startOfWeek && d < endOfWeek;
            });
        }

        // 1. PRESENT DOCTORS CALCULATION
        // Calculate how many doctors are available (not absent ALL_DAY)
        let presentDoctorsCount = 0;
        if (viewMode === 'DAY') {
            presentDoctorsCount = doctors.filter(d => {
                const isAbsentAllDay = unavailabilities.some(u =>
                    u.doctorId === d.id &&
                    isDateInRange(dateStr, u.startDate, u.endDate) &&
                    (!u.period || u.period === 'ALL_DAY')
                );
                return !isAbsentAllDay;
            }).length;
        } else {
            // In Week view, count doctors who are available for at least part of the week (not absent M-F)
            const weekStartStr = currentWeekStart.toISOString().split('T')[0];
            const weekEnd = new Date(currentWeekStart);
            weekEnd.setDate(weekEnd.getDate() + 4);
            const weekEndStr = weekEnd.toISOString().split('T')[0];

            presentDoctorsCount = doctors.filter(d => {
                const absentWholeWeek = unavailabilities.some(u =>
                    u.doctorId === d.id &&
                    u.startDate <= weekStartStr && u.endDate >= weekEndStr &&
                    (!u.period || u.period === 'ALL_DAY')
                );
                return !absentWholeWeek;
            }).length;
        }

        const totalActivities = filteredSlots.filter(s => s.assignedDoctorId).length;
        const totalSlots = filteredSlots.length;
        const filledSlots = filteredSlots.filter(s => s.assignedDoctorId).length;
        const occupancy = totalSlots > 0 ? Math.round((filledSlots / totalSlots) * 100) : 0;

        let relevantConflicts = [];
        if (viewMode === 'DAY') {
            relevantConflicts = conflicts.filter(c => {
                const slot = schedule.find(s => s.id === c.slotId);
                return slot && slot.date === dateStr;
            });
        } else {
            relevantConflicts = conflicts;
        }

        let absentees = [];
        if (viewMode === 'DAY') {
            absentees = unavailabilities.filter(u => isDateInRange(dateStr, u.startDate, u.endDate));
        } else {
            const weekEnd = new Date(currentWeekStart);
            weekEnd.setDate(weekEnd.getDate() + 4);
            const weekStartStr = currentWeekStart.toISOString().split('T')[0];
            const weekEndStr = weekEnd.toISOString().split('T')[0];

            absentees = unavailabilities.filter(u => {
                return (u.startDate <= weekEndStr && u.endDate >= weekStartStr);
            });
        }

        return {
            presentDoctorsCount,
            totalActivities,
            occupancy,
            conflictCount: relevantConflicts.length,
            filteredConflicts: relevantConflicts,
            absentees
        };
    }, [schedule, viewMode, selectedDate, conflicts, currentWeekStart, unavailabilities, doctors]);

    // --- RESOLUTION HANDLERS ---
    const handleResolve = (slotId: string, newDoctorId: string) => {
        const newOverrides = { ...manualOverrides };

        if (newDoctorId === "") {
            delete newOverrides[slotId];
        } else {
            newOverrides[slotId] = newDoctorId;
        }
        setManualOverrides(newOverrides);

        // Auto-close modal after resolution
        setSelectedConflict(null);
        setSelectedSlot(null);
    };

    const handleCloseSlot = (slotId: string) => {
        setManualOverrides({ ...manualOverrides, [slotId]: '__CLOSED__' });
        setSelectedConflict(null);
        setSelectedSlot(null);
    }

    const handleAlertClick = (conflict: Conflict) => {
        const slot = schedule.find(s => s.id === conflict.slotId);
        if (slot) {
            setSelectedSlot(slot);
            setSelectedConflict(conflict);
        }
    }


    // --- RENDER HELPERS ---
    const renderDayView = () => {
        const dateStr = selectedDate.toISOString().split('T')[0];
        const daySlots = schedule.filter(s => s.date === dateStr);

        const morningSlots = daySlots.filter(s => s.period === Period.MORNING);
        const afternoonSlots = daySlots.filter(s => s.period === Period.AFTERNOON);

        const renderSlotList = (slots: typeof daySlots) => (
            <div className="space-y-2">
                {slots.length === 0 ? <p className="text-sm text-slate-400 italic">Aucune activité prévue.</p> :
                    slots.map(s => {
                        const doc = doctors.find(d => d.id === s.assignedDoctorId);
                        const isRcpUnconfirmed = s.type === SlotType.RCP && s.isUnconfirmed;

                        // Determine border color based on activity type
                        let borderColor = '#e2e8f0';
                        if (s.type === SlotType.RCP) {
                            borderColor = '#a855f7'; // purple
                        } else if (s.type === SlotType.CONSULTATION) {
                            borderColor = '#3b82f6'; // blue
                        } else if (s.type === SlotType.ACTIVITY) {
                            const subTypeLower = (s.subType || s.location || '').toLowerCase();
                            if (subTypeLower.includes('astreinte')) {
                                borderColor = '#ef4444'; // red
                            } else if (subTypeLower.includes('unity')) {
                                borderColor = '#f97316'; // orange
                            } else if (subTypeLower.includes('workflow') || subTypeLower.includes('supervision')) {
                                borderColor = '#10b981'; // emerald
                            }
                        }

                        return (
                            <div key={s.id} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg border" style={{ borderLeftWidth: '4px', borderLeftColor: borderColor }}>
                                <div className="flex items-center flex-1 min-w-0">
                                    {isRcpUnconfirmed ? (
                                        <div className="flex flex-col">
                                            <span className="text-[10px] text-yellow-700 bg-yellow-100 px-1 rounded font-bold mb-1 w-fit">⚠️ À confirmer</span>
                                            <div className="text-[9px] text-slate-400 uppercase font-bold mb-0.5">Référents :</div>
                                            <div className="text-xs text-slate-500 italic">
                                                {[s.assignedDoctorId, ...(s.secondaryDoctorIds || [])].map(id => doctors.find(d => d.id === id)?.name).filter(Boolean).join(', ')}
                                            </div>
                                        </div>
                                    ) : s.type === SlotType.RCP ? (
                                        // RCP confirmée - afficher les participants confirmés
                                        <div className="flex flex-col">
                                            <span className="text-[10px] text-green-700 bg-green-100 px-1 rounded font-bold mb-1 w-fit">✓ Confirmée</span>
                                            <div className="text-[9px] text-green-600 uppercase font-bold mb-0.5">Présent(s) :</div>
                                            <div className="flex flex-wrap gap-1">
                                                {[s.assignedDoctorId, ...(s.secondaryDoctorIds || [])].filter(Boolean).map(id => {
                                                    const d = doctors.find(doc => doc.id === id);
                                                    if (!d) return null;
                                                    return (
                                                        <div key={id} className="flex items-center bg-white px-1.5 py-0.5 rounded border border-green-300">
                                                            <div
                                                                className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold mr-1 text-white"
                                                                style={{ backgroundColor: getDoctorHexColor(d.color) }}
                                                            >
                                                                {d.name.substring(0, 2)}
                                                            </div>
                                                            <span className="text-xs font-bold text-green-800">{d.name}</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            <div
                                                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold mr-3 text-white flex-shrink-0"
                                                style={{ backgroundColor: doc ? getDoctorHexColor(doc.color) : '#94a3b8' }}
                                            >
                                                {doc ? doc.name.substring(0, 2) : '?'}
                                            </div>
                                            <div className="min-w-0">
                                                <div className="text-sm font-bold text-slate-700 flex items-center truncate">
                                                    {doc ? doc.name : 'Non assigné'}
                                                </div>
                                                <div className="text-xs text-slate-500">{s.type} {s.subType && `• ${s.subType}`}</div>
                                            </div>
                                        </>
                                    )}
                                </div>
                                <div className="text-xs font-bold bg-white px-2 py-1 rounded border border-slate-200 text-slate-600 flex-shrink-0 ml-2">
                                    {s.location}
                                </div>
                            </div>
                        )
                    })
                }
            </div>
        );

        return (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-full overflow-hidden">
                <div className="bg-white rounded-xl border border-slate-200 flex flex-col overflow-hidden">
                    <div className="p-3 bg-yellow-50 border-b border-yellow-100 text-yellow-800 font-bold uppercase text-xs tracking-wider flex items-center">
                        <Clock className="w-4 h-4 mr-2" /> Matin
                    </div>
                    <div className="p-4 overflow-y-auto flex-1">
                        {renderSlotList(morningSlots)}
                    </div>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 flex flex-col overflow-hidden">
                    <div className="p-3 bg-indigo-50 border-b border-indigo-100 text-indigo-800 font-bold uppercase text-xs tracking-wider flex items-center">
                        <Clock className="w-4 h-4 mr-2" /> Après-midi
                    </div>
                    <div className="p-4 overflow-y-auto flex-1">
                        {renderSlotList(afternoonSlots)}
                    </div>
                </div>
            </div>
        )
    };

    const renderWeekView = () => {
        const days = Object.values(DayOfWeek);
        return (
            <div className="overflow-x-auto pb-2">
                <div className="grid grid-cols-5 gap-3 min-w-[700px]">
                    {days.map(day => {
                        const date = getDateForDayOfWeek(currentWeekStart, day);
                        const isToday = date === new Date().toISOString().split('T')[0];
                        const daySlots = schedule.filter(s => s.date === date);

                        // Summary logic - search by activity name (subType) instead of hardcoded IDs
                        const astreinte = daySlots.find(s =>
                            s.type === SlotType.ACTIVITY &&
                            (s.subType?.toLowerCase().includes('astreinte') || s.location?.toLowerCase().includes('astreinte'))
                        );
                        const unity = daySlots.find(s =>
                            s.type === SlotType.ACTIVITY &&
                            (s.subType?.toLowerCase().includes('unity') || s.location?.toLowerCase().includes('unity'))
                        );

                        const docAstreinte = doctors.find(d => d.id === astreinte?.assignedDoctorId);
                        const docUnity = doctors.find(d => d.id === unity?.assignedDoctorId);

                        // RCPs List
                        const rcps = daySlots.filter(s => s.type === SlotType.RCP);

                        return (
                            <div key={day} className={`flex flex-col border rounded-lg overflow-hidden ${isToday ? 'ring-2 ring-blue-400 border-blue-400' : 'bg-slate-50 border-slate-200'}`}>
                                <div className={`text-xs font-bold text-center py-2 uppercase ${isToday ? 'bg-blue-500 text-white' : 'bg-slate-200 text-slate-700'}`}>
                                    {day} <span className="block text-[9px] font-normal opacity-80">{date.split('-').slice(1).reverse().join('/')}</span>
                                </div>
                                <div className="p-2 space-y-2 flex-1 bg-white">
                                    {/* Key Roles Summary - Only show activities that have assignments */}
                                    {(docAstreinte || docUnity) && (
                                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Clés</div>
                                    )}

                                    {astreinte?.assignedDoctorId && docAstreinte && (
                                        <div className="flex items-center justify-between bg-red-50 p-1.5 rounded border border-red-200 border-l-4 border-l-red-500">
                                            <span className="text-[9px] text-red-700 font-bold">Astreinte</span>
                                            <span className="text-[9px] text-slate-800 truncate max-w-[60px]">{docAstreinte.name}</span>
                                        </div>
                                    )}
                                    {unity?.assignedDoctorId && docUnity && (
                                        <div className="flex items-center justify-between bg-orange-50 p-1.5 rounded border border-orange-200 border-l-4 border-l-orange-500">
                                            <span className="text-[9px] text-orange-700 font-bold">UNITY</span>
                                            <span className="text-[9px] text-slate-800 truncate max-w-[60px]">{docUnity.name}</span>
                                        </div>
                                    )}

                                    {(docAstreinte || docUnity) && <div className="h-px bg-slate-100 my-2"></div>}

                                    {/* Workflow if applicable */}
                                    {(() => {
                                        const workflow = daySlots.find(s =>
                                            s.type === SlotType.ACTIVITY &&
                                            s.activityId &&
                                            activityDefinitions.find(a => a.id === s.activityId && a.equityGroup === 'workflow')
                                        );
                                        const docWorkflow = doctors.find(d => d.id === workflow?.assignedDoctorId);
                                        return workflow?.assignedDoctorId && docWorkflow ? (
                                            <>
                                                <div className="flex items-center justify-between bg-emerald-50 p-1.5 rounded border border-emerald-200 border-l-4 border-l-emerald-500">
                                                    <span className="text-[9px] text-emerald-700 font-bold">Workflow</span>
                                                    <span className="text-[9px] text-slate-800 truncate max-w-[60px]">{docWorkflow.name}</span>
                                                </div>
                                                <div className="h-px bg-slate-100 my-2"></div>
                                            </>
                                        ) : null;
                                    })()}

                                    {/* RCPs Summary */}
                                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">RCPs</div>
                                    {rcps.length === 0 ? <span className="text-[9px] text-slate-300 italic">Aucune</span> : (
                                        <div className="space-y-1">
                                            {rcps.map(rcp => {
                                                if (rcp.isUnconfirmed) {
                                                    // RCP non confirmée - afficher les référents par défaut (pas comme participants)
                                                    const referentNames = [rcp.assignedDoctorId, ...(rcp.secondaryDoctorIds || [])]
                                                        .map(id => doctors.find(d => d.id === id)?.name)
                                                        .filter(Boolean);

                                                    return (
                                                        <div key={rcp.id} className="flex flex-col bg-yellow-50 p-1 rounded border border-yellow-100 border-l-4 border-l-yellow-500">
                                                            <div className="flex justify-between items-center mb-1">
                                                                <span className="text-[8px] text-purple-700 font-bold truncate max-w-[50px]">{rcp.location}</span>
                                                                <span className="text-[8px] text-yellow-700 font-bold">⚠️ À confirmer</span>
                                                            </div>
                                                            <div className="text-[6px] text-slate-400 uppercase font-bold mb-0.5">Référents :</div>
                                                            <div className="flex flex-wrap gap-0.5">
                                                                {referentNames.map(name => (
                                                                    <span key={name} className="text-[7px] bg-white border border-slate-200 px-1 rounded text-slate-500 italic">
                                                                        {name}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )
                                                }

                                                // RCP confirmée - afficher UNIQUEMENT les médecins qui ont confirmé "Présent"
                                                const confirmedIds = [rcp.assignedDoctorId, ...(rcp.secondaryDoctorIds || [])].filter(Boolean);
                                                const confirmedDocs = confirmedIds
                                                    .map(id => doctors.find(d => d.id === id))
                                                    .filter(Boolean);

                                                return (
                                                    <div key={rcp.id} className="flex flex-col bg-green-50 p-1 rounded border border-green-200 border-l-4 border-l-green-500">
                                                        <div className="flex justify-between items-center mb-1">
                                                            <span className="text-[8px] text-purple-700 font-bold truncate max-w-[50px]">{rcp.location}</span>
                                                            <span className="text-[8px] text-green-600 font-bold flex items-center">
                                                                <span className="mr-0.5">✓</span> Confirmée
                                                            </span>
                                                        </div>
                                                        <div className="text-[6px] text-green-600 uppercase font-bold mb-0.5">Présent(s) :</div>
                                                        <div className="flex flex-wrap gap-0.5">
                                                            {confirmedDocs.map((doc) => (
                                                                <span key={doc?.id} className="text-[7px] bg-white border border-green-300 px-1 rounded text-green-800 font-bold">
                                                                    {doc?.name}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    )}

                                    <div className="h-px bg-slate-100 my-2"></div>

                                    {/* Consult Activity Count - Blue for consultations (Box 1-3) */}
                                    <div className="flex justify-between items-center">
                                        <span className="text-[10px] text-slate-500">Consultations</span>
                                        <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-1.5 rounded border border-blue-200">
                                            {daySlots.filter(s => s.type === SlotType.CONSULTATION).length}
                                        </span>
                                    </div>

                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>
        )
    };

    // --- UNASSIGNED DOCTORS CALCULATION ---
    const unassignedDoctors = useMemo(() => {
        const dateStr = selectedDate.toISOString().split('T')[0];
        const daySlots = schedule.filter(s => s.date === dateStr);

        const unassigned = {
            [Period.MORNING]: [] as Doctor[],
            [Period.AFTERNOON]: [] as Doctor[]
        };

        // Find WEEKLY activity IDs (like Supervision Workflow) - these are passive and don't block slots
        const passiveActivityIds = activityDefinitions
            .filter(act => act.type === 'WEEKLY')
            .map(act => act.id);

        [Period.MORNING, Period.AFTERNOON].forEach(period => {
            // Exclude passive activities (WEEKLY type) from busy calculation
            const busyDocIds = daySlots
                .filter(s => s.period === period)
                .filter(s => !s.activityId || !passiveActivityIds.includes(s.activityId)) // Exclude passive activities
                .flatMap(s => [s.assignedDoctorId, ...(s.secondaryDoctorIds || [])])
                .filter(Boolean);

            unassigned[period] = doctors.filter(doc => {
                // Not busy
                if (busyDocIds.includes(doc.id)) return false;
                // Not Absent (Granular Check)
                const isAbsent = unavailabilities.some(u => {
                    if (u.doctorId !== doc.id) return false;
                    if (!isDateInRange(dateStr, u.startDate, u.endDate)) return false;
                    if (u.period && u.period !== 'ALL_DAY' && u.period !== period) return false;
                    return true;
                });

                if (isAbsent) return false;

                // Day Exclusion Check
                const currentDayOfWeek = selectedDate.toLocaleDateString('fr-FR', { weekday: 'long' });
                const mappedDay = Object.values(DayOfWeek).find(d => d.toLowerCase() === currentDayOfWeek.toLowerCase());
                if (mappedDay && doc.excludedDays.includes(mappedDay)) return false;

                return true;
            });
        });
        return unassigned;
    }, [schedule, doctors, unavailabilities, selectedDate, activityDefinitions]);


    return (
        <div className="space-y-6 h-full flex flex-col">
            {/* Header Controls */}
            <div className="flex flex-col md:flex-row justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                <div className="flex items-center space-x-4 mb-4 md:mb-0">
                    <div className="flex bg-slate-100 p-1 rounded-lg">
                        <button
                            onClick={() => setViewMode('DAY')}
                            className={`px-3 py-2 flex items-center text-xs font-bold rounded-md transition-all ${viewMode === 'DAY' ? 'bg-white shadow text-blue-700' : 'text-slate-500 hover:bg-slate-200'}`}
                        >
                            <LayoutList className="w-4 h-4 mr-2" /> Vue Jour
                        </button>
                        <button
                            onClick={() => setViewMode('WEEK')}
                            className={`px-3 py-2 flex items-center text-xs font-bold rounded-md transition-all ${viewMode === 'WEEK' ? 'bg-white shadow text-blue-700' : 'text-slate-500 hover:bg-slate-200'}`}
                        >
                            <LayoutGrid className="w-4 h-4 mr-2" /> Vue Semaine
                        </button>
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-slate-800 capitalize">
                            {viewMode === 'DAY'
                                ? selectedDate.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
                                : `Semaine du ${currentWeekStart.toLocaleDateString('fr-FR')}`
                            }
                        </h1>
                    </div>
                </div>

                <div className="flex items-center space-x-2">
                    <button onClick={() => handleTimeChange('prev')} className="p-2 hover:bg-slate-100 rounded-full text-slate-600 border border-slate-200">
                        <ChevronLeft className="w-5 h-5" />
                    </button>
                    <div className="relative">
                        <input
                            type="date"
                            className="pl-8 pr-2 py-1.5 border border-slate-300 rounded-md text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={selectedDate.toISOString().split('T')[0]}
                            onChange={handleDateChange}
                        />
                        <Calendar className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
                    </div>
                    <button onClick={() => handleTimeChange('next')} className="p-2 hover:bg-slate-100 rounded-full text-slate-600 border border-slate-200">
                        <ChevronRight className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* Dynamic Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                    title={viewMode === 'DAY' ? "Médecins Présents" : "Effectif Dispo (Semaine)"}
                    value={stats.presentDoctorsCount}
                    icon={Users}
                    color="bg-blue-500"
                    description={`Disponibles sur ${doctors.length} effectifs`}
                />
                <StatCard
                    title={viewMode === 'DAY' ? "Conflits (Jour)" : "Conflits (Semaine)"}
                    value={stats.conflictCount}
                    icon={AlertTriangle}
                    color={stats.conflictCount > 0 ? "bg-red-500" : "bg-green-500"}
                    description={stats.conflictCount > 0 ? "Action requise" : "Tout est calme"}
                />
                <StatCard
                    title={viewMode === 'DAY' ? "Activités Prévues" : "Total Créneaux"}
                    value={stats.totalActivities}
                    icon={Activity}
                    color="bg-orange-500"
                    description={viewMode === 'DAY' ? "Consultations & RCP" : "Charge globale"}
                />
                <StatCard
                    title="Taux de Remplissage"
                    value={`${stats.occupancy}%`}
                    icon={Clock}
                    color="bg-purple-500"
                    description="Créneaux assignés"
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
                {/* Left: Alerts, Absences & UNASSIGNED */}
                <div className="lg:col-span-1 flex flex-col gap-4 overflow-hidden max-h-[600px] overflow-y-auto">

                    {/* ALERTES */}
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col shrink-0">
                        <div className="p-4 border-b border-slate-100 bg-red-50/50">
                            <h2 className="font-bold text-slate-800 flex items-center justify-between">
                                <span className="flex items-center">
                                    <AlertTriangle className="w-5 h-5 mr-2 text-red-500" />
                                    Alertes {viewMode === 'DAY' ? 'du jour' : 'de la semaine'}
                                </span>
                                <span className="text-xs bg-red-200 text-red-800 px-2 py-0.5 rounded-full">{stats.filteredConflicts.length}</span>
                            </h2>
                        </div>
                        <div className="p-4 max-h-80 overflow-y-auto space-y-3">
                            {stats.filteredConflicts.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-20 text-slate-400">
                                    <span className="text-sm">Aucun conflit détecté.</span>
                                </div>
                            ) : (
                                stats.filteredConflicts.map(conflict => {
                                    const doc = doctors.find(d => d.id === conflict.doctorId);
                                    const slot = schedule.find(s => s.id === conflict.slotId);

                                    let locationDetail = "";
                                    if (slot) {
                                        locationDetail = `${slot.location || slot.subType}`;
                                    }

                                    return (
                                        <div
                                            key={conflict.id}
                                            onClick={() => handleAlertClick(conflict)}
                                            className="p-3 bg-white border border-red-100 rounded-lg shadow-sm hover:border-red-300 hover:shadow-md transition-all cursor-pointer relative group"
                                        >
                                            <div className="flex justify-between items-start mb-1">
                                                <span className="text-[10px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full border border-red-100 uppercase">
                                                    {conflict.type === 'DOUBLE_BOOKING' ? 'Double Réservation' : 'Indisponibilité'}
                                                </span>
                                                <span className="text-[10px] text-slate-400 font-mono">
                                                    {slot?.day.substring(0, 3)} {slot?.period === Period.MORNING ? 'AM' : 'PM'}
                                                </span>
                                            </div>
                                            <div className="flex items-center mt-2">
                                                <div
                                                    className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold mr-2 text-white"
                                                    style={{ backgroundColor: getDoctorHexColor(doc?.color) }}
                                                >
                                                    Dr
                                                </div>
                                                <p className="text-sm font-bold text-slate-700">{doc?.name || 'Inconnu'}</p>
                                            </div>
                                            <p className="text-xs text-slate-500 mt-1 pl-8">{conflict.description}</p>
                                            {locationDetail && (
                                                <div className="mt-2 pl-8">
                                                    <span className="text-[10px] font-medium text-slate-600 bg-slate-100 px-2 py-1 rounded">
                                                        {locationDetail}
                                                    </span>
                                                </div>
                                            )}

                                            <div className="absolute inset-0 bg-blue-500/0 group-hover:bg-blue-500/5 rounded-lg transition-colors pointer-events-none" />
                                            <div className="absolute right-2 bottom-2 text-xs text-blue-600 font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                                                Résoudre →
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    {/* RCPs ON HOLIDAYS ALERT */}
                    {rcpsOnHolidays.length > 0 && (
                        <div className="bg-white rounded-xl shadow-sm border border-orange-200 flex flex-col shrink-0">
                            <div className="p-4 border-b border-orange-100 bg-gradient-to-r from-orange-50 to-amber-50">
                                <h2 className="font-bold text-slate-800 flex items-center justify-between">
                                    <span className="flex items-center">
                                        <CalendarX2 className="w-5 h-5 mr-2 text-orange-500" />
                                        RCP sur Jour Férié
                                    </span>
                                    <span className="text-xs bg-orange-200 text-orange-800 px-2 py-0.5 rounded-full font-bold">
                                        {rcpsOnHolidays.length}
                                    </span>
                                </h2>
                                <p className="text-[10px] text-orange-600 mt-1">
                                    Ces RCP tombent sur un jour férié ({selectedDate.toLocaleDateString('fr-FR', { month: 'long' })} & {new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1).toLocaleDateString('fr-FR', { month: 'long' })}). Cliquez pour les déplacer.
                                </p>
                            </div>
                            <div className="p-3 max-h-80 overflow-y-auto space-y-2">
                                {rcpsOnHolidays.map(({ slot, holiday, weekStart }) => {
                                    const allDoctorIds = [slot.assignedDoctorId, ...(slot.secondaryDoctorIds || [])].filter(Boolean);
                                    const formattedDate = new Date(slot.date).toLocaleDateString('fr-FR', {
                                        weekday: 'long',
                                        day: 'numeric',
                                        month: 'long',
                                        year: 'numeric'
                                    });
                                    const isConfirmed = !slot.isUnconfirmed;

                                    return (
                                        <div
                                            key={slot.id}
                                            onClick={() => setRcpExceptionSlot(slot)}
                                            className="p-3 bg-gradient-to-r from-orange-50 to-white border border-orange-200 rounded-lg hover:border-orange-400 hover:shadow-md transition-all cursor-pointer relative group"
                                        >
                                            {/* Top row: Holiday badge + Status */}
                                            <div className="flex justify-between items-start mb-2">
                                                <span className="text-[10px] font-bold text-orange-700 bg-orange-100 px-2 py-0.5 rounded-full border border-orange-200">
                                                    ⚠️ {holiday.name}
                                                </span>
                                                {/* Status badge */}
                                                {isConfirmed ? (
                                                    <span className="text-[9px] font-bold text-green-700 bg-green-100 px-1.5 py-0.5 rounded border border-green-200">
                                                        ✓ Confirmée
                                                    </span>
                                                ) : (
                                                    <span className="text-[9px] font-bold text-yellow-700 bg-yellow-100 px-1.5 py-0.5 rounded border border-yellow-200">
                                                        ⚠ À confirmer
                                                    </span>
                                                )}
                                            </div>

                                            {/* RCP Name & Date */}
                                            <div className="flex items-center mb-1">
                                                <MapPin className="w-4 h-4 text-purple-500 mr-2" />
                                                <span className="font-bold text-sm text-slate-800">{slot.location}</span>
                                                <span className="ml-2 text-[9px] text-purple-600 font-bold bg-purple-50 px-1.5 py-0.5 rounded border border-purple-100">
                                                    RCP
                                                </span>
                                            </div>

                                            <div className="text-xs text-slate-600 mb-2 pl-6 capitalize">
                                                📅 {formattedDate} à {slot.time || '--:--'}
                                            </div>

                                            {/* Doctors */}
                                            <div className="flex flex-wrap gap-1 pl-6">
                                                {allDoctorIds.slice(0, 3).map(id => {
                                                    const d = doctors.find(doc => doc.id === id);
                                                    if (!d) return null;
                                                    return (
                                                        <div
                                                            key={id}
                                                            className="flex items-center bg-white px-1.5 py-0.5 rounded border border-slate-200"
                                                        >
                                                            <div
                                                                className="w-4 h-4 rounded-full flex items-center justify-center text-[7px] font-bold mr-1 text-white"
                                                                style={{ backgroundColor: getDoctorHexColor(d.color) }}
                                                            >
                                                                {d.name.substring(0, 2)}
                                                            </div>
                                                            <span className="text-[9px] text-slate-700">{d.name}</span>
                                                        </div>
                                                    );
                                                })}
                                                {allDoctorIds.length > 3 && (
                                                    <span className="text-[9px] text-slate-400">+{allDoctorIds.length - 3}</span>
                                                )}
                                            </div>

                                            {/* Hover action hint */}
                                            <div className="absolute right-2 bottom-2 text-xs text-orange-600 font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                                                Déplacer →
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* NON-POSTED DOCTORS */}
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col shrink-0">
                        <div className="p-3 border-b border-slate-100 bg-slate-50">
                            <h2 className="font-bold text-slate-700 flex items-center text-sm">
                                <UserMinus className="w-4 h-4 mr-2 text-slate-500" />
                                Médecins Non Postés (Ce jour)
                            </h2>
                        </div>
                        <div className="p-3 space-y-4">
                            <div>
                                <h4 className="text-[10px] font-bold text-slate-400 uppercase mb-2">Matin</h4>
                                <div className="flex flex-wrap gap-2">
                                    {unassignedDoctors[Period.MORNING].length === 0 ? <span className="text-xs text-slate-400 italic">Tous occupés</span> :
                                        unassignedDoctors[Period.MORNING].map(d => (
                                            <div key={d.id} className={`text-[10px] px-2 py-1 rounded border bg-white text-slate-600 border-slate-200`}>
                                                {d.name}
                                            </div>
                                        ))
                                    }
                                </div>
                            </div>
                            <div>
                                <h4 className="text-[10px] font-bold text-slate-400 uppercase mb-2">Après-Midi</h4>
                                <div className="flex flex-wrap gap-2">
                                    {unassignedDoctors[Period.AFTERNOON].length === 0 ? <span className="text-xs text-slate-400 italic">Tous occupés</span> :
                                        unassignedDoctors[Period.AFTERNOON].map(d => (
                                            <div key={d.id} className={`text-[10px] px-2 py-1 rounded border bg-white text-slate-600 border-slate-200`}>
                                                {d.name}
                                            </div>
                                        ))
                                    }
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ABSENCES */}
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col shrink-0">
                        <div className="p-3 border-b border-slate-100 bg-slate-50">
                            <h2 className="font-bold text-slate-700 flex items-center text-sm">
                                <UserX className="w-4 h-4 mr-2 text-slate-500" />
                                Médecins Absents
                            </h2>
                        </div>
                        <div className="p-3 max-h-40 overflow-y-auto space-y-2">
                            {stats.absentees.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full text-slate-400">
                                    <span className="text-xs">Tout le monde est présent.</span>
                                </div>
                            ) : (
                                stats.absentees.map(abs => {
                                    const doc = doctors.find(d => d.id === abs.doctorId);
                                    return (
                                        <div key={abs.id} className="flex items-center justify-between p-2 bg-slate-50 rounded border border-slate-100">
                                            <div className="flex items-center">
                                                <div
                                                    className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold mr-2 opacity-50 text-white"
                                                    style={{ backgroundColor: getDoctorHexColor(doc?.color) }}
                                                >
                                                    Dr
                                                </div>
                                                <div>
                                                    <div className="text-xs font-bold text-slate-600">{doc?.name}</div>
                                                    <div className="text-[10px] text-slate-400 uppercase font-bold flex items-center">
                                                        {abs.reason}
                                                        {abs.period && abs.period !== 'ALL_DAY' && (
                                                            <span className="ml-1 text-[9px] bg-slate-100 text-slate-500 px-1 rounded uppercase">
                                                                {abs.period === 'Matin' ? 'AM' : 'PM'}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="text-[10px] text-slate-500 bg-white px-2 py-1 rounded border">
                                                {abs.startDate === abs.endDate ? abs.startDate : `Jusqu'au ${abs.endDate.split('-').slice(1).reverse().join('/')}`}
                                            </div>
                                        </div>
                                    )
                                })
                            )}
                        </div>
                    </div>
                </div>

                {/* Right: Main Content (Day or Week View) */}
                <div className="lg:col-span-2 flex flex-col min-h-0">
                    {viewMode === 'DAY' ? renderDayView() : renderWeekView()}
                </div>
            </div>

            {selectedSlot && (
                <ConflictResolverModal
                    slot={selectedSlot}
                    conflict={selectedConflict || undefined}
                    doctors={doctors}
                    slots={schedule}
                    unavailabilities={unavailabilities}
                    onClose={() => { setSelectedSlot(null); setSelectedConflict(null); }}
                    onResolve={handleResolve}
                    onCloseSlot={handleCloseSlot}
                />
            )}

            {/* RCP Exception Modal for moving RCPs from holidays */}
            {rcpExceptionSlot && (
                <RcpExceptionModal
                    slot={rcpExceptionSlot}
                    doctors={doctors}
                    existingException={rcpExceptions.find(ex =>
                        ex.rcpTemplateId === rcpExceptionSlot.id.split('-').slice(0, -3).join('-') &&
                        ex.originalDate === rcpExceptionSlot.date
                    )}
                    onSave={(exception: RcpException) => {
                        addRcpException(exception);
                        setRcpExceptionSlot(null);
                    }}
                    onClose={() => setRcpExceptionSlot(null)}
                    onRemoveException={() => {
                        // Remove exception logic if needed
                        setRcpExceptionSlot(null);
                    }}
                />
            )}
        </div>
    );
};

export default Dashboard;

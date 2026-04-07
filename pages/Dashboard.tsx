
import React, { useContext, useState, useMemo } from 'react';
import { AppContext } from '../App';
import { useAuth } from '../context/AuthContext';
import StatCard from '../components/StatCard';
import ConflictResolverModal from '../components/ConflictResolverModal';
import RcpExceptionModal from '../components/RcpExceptionModal';
import { Users, AlertTriangle, Calendar, Activity, Clock, ChevronLeft, ChevronRight, LayoutList, LayoutGrid, UserX, CalendarDays, UserMinus, CalendarX2, MapPin } from 'lucide-react';
import { DayOfWeek, Period, SlotType, Doctor, ScheduleSlot, Conflict, RcpException } from '../types';
import { getDateForDayOfWeek, isDateInRange, generateScheduleForWeek, detectConflicts, isFrenchHoliday, getFrenchHolidays } from '../services/scheduleService';
import { getDoctorHexColor } from '../components/DoctorBadge';
import { Card, CardHeader, CardTitle, CardBody, Badge, Button } from '../src/components/ui';

const shortName = (name: string): string => {
  const parts = name.split(' ');
  if (parts.length <= 1) return name;
  const title = parts[0]; // "Dr." or "Pr."
  const rest = parts.slice(1).join(' ');
  return rest.length > 8 ? `${title} ${rest.substring(0, 7)}…` : name;
};

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

    const { profile } = useAuth();

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
            // ACTIVITY slots: only show doctor if explicitly assigned via manual override.
            // Template defaults should never appear as real assignments.
            if (slot.type === SlotType.ACTIVITY) {
                return { ...slot, assignedDoctorId: null };
            }
            return slot;
        });
    }, [currentWeekStart, template, unavailabilities, doctors, activityDefinitions, rcpTypes, effectiveHistory, rcpAttendance, rcpExceptions, manualOverrides, isCurrentWeekValidated]);

    // Build conflicts ONLY for the currently visible period so they can never
    // bleed in from other days/weeks regardless of navigation state.
    const conflicts = useMemo(() => {
        const dateStr = selectedDate.toISOString().split('T')[0];
        let visibleSlots;
        if (viewMode === 'DAY') {
            // Only the slots belonging to the selected day
            visibleSlots = schedule.filter(s => s.date === dateStr);
        } else {
            // Only Mon–Fri of the displayed week
            const weekEndDate = new Date(currentWeekStart);
            weekEndDate.setDate(weekEndDate.getDate() + 4);
            const ws = currentWeekStart.toISOString().split('T')[0];
            const we = weekEndDate.toISOString().split('T')[0];
            visibleSlots = schedule.filter(s => s.date >= ws && s.date <= we);
        }
        return detectConflicts(visibleSlots, unavailabilities, doctors, activityDefinitions);
    }, [schedule, unavailabilities, doctors, activityDefinitions, viewMode, selectedDate, currentWeekStart]);

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

        // conflicts is already scoped to the visible period (day or week)
        // by the conflicts useMemo — no secondary filtering needed here.
        const relevantConflicts = conflicts;

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


    // Slot display order: Astreinte → Unity → Workflow → RCP → Consultation → other
    const slotSortPriority = (s: any): number => {
        if (s.type === SlotType.ACTIVITY) {
            const sub = (s.subType || s.location || '').toLowerCase();
            if (sub.includes('astreinte'))  return 0;
            if (sub.includes('unity'))      return 1;
            if (sub.includes('workflow') || sub.includes('supervision')) return 2;
            return 3;
        }
        if (s.type === SlotType.RCP)          return 4;
        if (s.type === SlotType.CONSULTATION) return 5;
        return 6;
    };

    // --- RENDER HELPERS ---
    const renderDayView = () => {
        const dateStr = selectedDate.toISOString().split('T')[0];
        const daySlots = schedule.filter(s => s.date === dateStr);

        const morningSlots = daySlots.filter(s => s.period === Period.MORNING).sort((a, b) => slotSortPriority(a) - slotSortPriority(b));
        const afternoonSlots = daySlots.filter(s => s.period === Period.AFTERNOON).sort((a, b) => slotSortPriority(a) - slotSortPriority(b));

        const renderSlotList = (slots: typeof daySlots) => (
            <div className="space-y-2">
                {slots.length === 0 ? <p className="text-sm text-text-muted italic">Aucune activité prévue.</p> :
                    slots.map(s => {
                        const doc = doctors.find(d => d.id === s.assignedDoctorId);
                        const isRcpUnconfirmed = s.type === SlotType.RCP && s.isUnconfirmed;

                        // Determine border color — Option C clinical palette
                        let borderColor = 'var(--color-border)';
                        if (s.type === SlotType.RCP) {
                            borderColor = s.isUnconfirmed ? '#D97706' : '#059669';
                        } else if (s.type === SlotType.CONSULTATION) {
                            borderColor = '#3B6FD4';
                        } else if (s.type === SlotType.ACTIVITY) {
                            const subTypeLower = (s.subType || s.location || '').toLowerCase();
                            if (subTypeLower.includes('astreinte')) {
                                borderColor = '#DC4E3A';
                            } else if (subTypeLower.includes('unity')) {
                                borderColor = '#6D28D9';
                            } else if (subTypeLower.includes('workflow') || subTypeLower.includes('supervision')) {
                                borderColor = '#0F766E';
                            } else {
                                // fallback: use activityDef color
                                const actDef = activityDefinitions?.find((a: any) => a.id === s.activityId);
                                if (actDef?.color) borderColor = getDoctorHexColor(actDef.color);
                            }
                        }

                        return (
                            <div key={s.id} className="flex items-center justify-between p-2 bg-muted rounded-card border border-border/60" style={{ borderLeftWidth: '3px', borderLeftColor: borderColor }}>
                                <div className="flex items-center flex-1 min-w-0">
                                    {isRcpUnconfirmed ? (
                                        <div className="flex flex-col gap-0.5">
                                            <Badge variant="amber">A confirmer</Badge>
                                            <div className="text-[9px] text-text-muted uppercase font-bold mt-1">Référents :</div>
                                            <div className="text-xs text-text-muted italic">
                                                {[s.assignedDoctorId, ...(s.secondaryDoctorIds || [])].map(id => doctors.find(d => d.id === id)?.name).filter(Boolean).join(', ')}
                                            </div>
                                        </div>
                                    ) : s.type === SlotType.RCP ? (
                                        <div className="flex flex-col gap-0.5">
                                            <Badge variant="green">Confirmée</Badge>
                                            <div className="text-[9px] text-success uppercase font-bold mt-1">Present(s) :</div>
                                            <div className="flex flex-wrap gap-1">
                                                {[s.assignedDoctorId, ...(s.secondaryDoctorIds || [])].filter(Boolean).map(id => {
                                                    const d = doctors.find(doc => doc.id === id);
                                                    if (!d) return null;
                                                    return (
                                                        <div key={id} className="flex items-center bg-surface px-1.5 py-0.5 rounded-btn-sm border border-border">
                                                            <div
                                                                className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold mr-1 text-white"
                                                                style={{ backgroundColor: getDoctorHexColor(d.color) }}
                                                            >
                                                                {d.name.substring(0, 2)}
                                                            </div>
                                                            <span className="text-xs font-bold text-text-base">{d.name}</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            <div
                                                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold mr-3 text-white flex-shrink-0"
                                                style={{ backgroundColor: doc ? getDoctorHexColor(doc.color) : 'var(--color-muted-fg)' }}
                                            >
                                                {doc ? doc.name.substring(0, 2) : '?'}
                                            </div>
                                            <div className="min-w-0">
                                                <div className="text-sm font-bold text-text-base flex items-center truncate">
                                                    {doc ? doc.name : 'Non assigné'}
                                                </div>
                                                <div className="text-xs text-text-muted">{s.type} {s.subType && `• ${s.subType}`}</div>
                                            </div>
                                        </>
                                    )}
                                </div>
                                <div className="text-xs font-bold bg-surface px-2 py-1 rounded-btn-sm border border-border text-text-muted flex-shrink-0 ml-2">
                                    {s.location}
                                </div>
                            </div>
                        )
                    })
                }
            </div>
        );

        return (
            <div className="flex flex-col md:grid md:grid-cols-2 gap-3 md:gap-4 h-full overflow-auto">
                <Card className="flex flex-col">
                    <CardHeader>
                        <CardTitle className="flex items-center">
                            <Clock className="w-3.5 h-3.5 mr-2 text-warning" aria-hidden="true" /> Matin
                        </CardTitle>
                        <Badge variant="amber">{morningSlots.length}</Badge>
                    </CardHeader>
                    <CardBody className="overflow-y-auto max-h-[250px] md:max-h-none md:flex-1">
                        {renderSlotList(morningSlots)}
                    </CardBody>
                </Card>
                <Card className="flex flex-col">
                    <CardHeader>
                        <CardTitle className="flex items-center">
                            <Clock className="w-3.5 h-3.5 mr-2 text-primary" aria-hidden="true" /> Après-midi
                        </CardTitle>
                        <Badge variant="blue">{afternoonSlots.length}</Badge>
                    </CardHeader>
                    <CardBody className="overflow-y-auto max-h-[250px] md:max-h-none md:flex-1">
                        {renderSlotList(afternoonSlots)}
                    </CardBody>
                </Card>
            </div>
        )
    };

    const renderWeekView = () => {
        const days = Object.values(DayOfWeek);
        return (
            <div className="overflow-x-auto pb-2">
                <div className="grid grid-cols-5 gap-1 md:gap-3 min-w-[420px] md:min-w-[700px]">
                    {days.map(day => {
                        const date = getDateForDayOfWeek(currentWeekStart, day);
                        const isToday = date === new Date().toISOString().split('T')[0];
                        const daySlots = schedule.filter(s => s.date === date);

                        // Summary logic - search by activity name (subType) instead of hardcoded IDs
                        const astreintes = daySlots.filter(s =>
                            s.type === SlotType.ACTIVITY &&
                            (s.subType?.toLowerCase().includes('astreinte') || s.location?.toLowerCase().includes('astreinte'))
                        );
                        const unitys = daySlots.filter(s =>
                            s.type === SlotType.ACTIVITY &&
                            (s.subType?.toLowerCase().includes('unity') || s.location?.toLowerCase().includes('unity'))
                        );
                        const hasAstreinte = astreintes.some(s => s.assignedDoctorId);
                        const hasUnity = unitys.some(s => s.assignedDoctorId);

                        // RCPs List
                        const rcps = daySlots.filter(s => s.type === SlotType.RCP);

                        return (
                            <div key={day} className={`flex flex-col border rounded-card overflow-hidden ${isToday ? 'ring-2 ring-primary border-primary' : 'bg-muted border-border'}`}>
                                <div className={`text-[9px] md:text-xs font-bold text-center py-1 md:py-2 uppercase tracking-wider ${isToday ? 'bg-primary text-white' : 'bg-border/60 text-text-base'}`}>
                                    {day.substring(0, 3)} <span className="block text-[8px] md:text-[9px] font-normal opacity-80">{date.split('-').slice(1).reverse().join('/')}</span>
                                </div>
                                <div className="p-1 md:p-2 space-y-1 md:space-y-2 flex-1 bg-surface">
                                    {/* Key Roles Summary - Only show activities that have assignments */}
                                    {(hasAstreinte || hasUnity) && (
                                        <div className="text-[8px] md:text-[10px] font-bold text-text-muted uppercase tracking-wider mb-0.5 md:mb-1">Clés</div>
                                    )}

                                    {astreintes.filter(s => s.assignedDoctorId).map(s => {
                                        const doc = doctors.find(d => d.id === s.assignedDoctorId);
                                        if (!doc) return null;
                                        return (
                                            <div key={s.id} className="p-1 md:p-1.5 rounded-btn-sm border-l-2 overflow-hidden min-w-0" style={{ backgroundColor: 'rgba(220,78,58,0.10)', borderColor: 'rgba(220,78,58,0.25)', borderLeftColor: '#DC4E3A' }}>
                                                <div className="flex items-center justify-between">
                                                    <div className="text-[7px] font-bold leading-none" style={{ color: '#DC4E3A' }}>Astr.{s.period === 'Matin' ? ' 🌅' : ' 🌆'}</div>
                                                </div>
                                                <div className="text-[8px] text-text-base truncate w-full" title={doc.name}>{shortName(doc.name)}</div>
                                            </div>
                                        );
                                    })}
                                    {unitys.filter(s => s.assignedDoctorId).map(s => {
                                        const doc = doctors.find(d => d.id === s.assignedDoctorId);
                                        if (!doc) return null;
                                        return (
                                            <div key={s.id} className="p-1 md:p-1.5 rounded-btn-sm border-l-2 overflow-hidden min-w-0" style={{ backgroundColor: 'rgba(109,40,217,0.10)', borderColor: 'rgba(109,40,217,0.25)', borderLeftColor: '#6D28D9' }}>
                                                <div className="flex items-center justify-between">
                                                    <div className="text-[7px] font-bold leading-none" style={{ color: '#6D28D9' }}>UNITY{s.period === 'Matin' ? ' 🌅' : ' 🌆'}</div>
                                                </div>
                                                <div className="text-[8px] text-text-base truncate w-full" title={doc.name}>{shortName(doc.name)}</div>
                                            </div>
                                        );
                                    })}

                                    {(hasAstreinte || hasUnity) && <div className="h-px bg-border my-1 md:my-2"></div>}

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
                                                <div className="p-1 md:p-1.5 rounded-btn-sm border-l-2 overflow-hidden min-w-0" style={{ backgroundColor: 'rgba(15,118,110,0.10)', borderColor: 'rgba(15,118,110,0.25)', borderLeftColor: '#0F766E' }}>
                                                    <div className="text-[7px] font-bold leading-none" style={{ color: '#0F766E' }}>Wrkflw</div>
                                                    <div className="text-[8px] text-text-base truncate w-full" title={docWorkflow.name}>{shortName(docWorkflow.name)}</div>
                                                </div>
                                                <div className="h-px bg-border my-1 md:my-2"></div>
                                            </>
                                        ) : null;
                                    })()}

                                    {/* RCPs Summary */}
                                    <div className="text-[8px] md:text-[10px] font-bold text-text-muted uppercase tracking-wider mb-0.5 md:mb-1">RCPs</div>
                                    {rcps.length === 0 ? <span className="text-[9px] text-text-muted italic">Aucune</span> : (
                                        <div className="space-y-1">
                                            {rcps.map(rcp => {
                                                if (rcp.isUnconfirmed) {
                                                    // RCP non confirmée - afficher les référents par défaut (pas comme participants)
                                                    const referentDocs = [rcp.assignedDoctorId, ...(rcp.secondaryDoctorIds || [])]
                                                        .map(id => doctors.find(d => d.id === id))
                                                        .filter(Boolean);

                                                    return (
                                                        <div key={rcp.id} className="overflow-hidden min-w-0 rounded-btn-sm border-l-2 border border-warning/30" style={{ backgroundColor: 'rgba(245,158,11,0.08)', borderLeftColor: '#F59E0B' }}>
                                                            {/* Header row */}
                                                            <div className="flex items-center gap-1 px-1 pt-1 min-w-0">
                                                                <span className="text-[8px] font-bold text-text-base truncate flex-1 min-w-0" title={rcp.location ?? ''}>{rcp.location}</span>
                                                                <span className="shrink-0 text-[6px] font-bold uppercase tracking-wide px-1 py-0.5 rounded" style={{ backgroundColor: 'rgba(245,158,11,0.18)', color: '#B45309' }}>? conf.</span>
                                                            </div>
                                                            {/* Referent pills */}
                                                            <div className="px-1 pb-1 pt-0.5">
                                                                <div className="text-[6px] text-text-muted uppercase font-bold leading-none mb-0.5">Réf.</div>
                                                                <div className="flex flex-col gap-0.5">
                                                                    {referentDocs.map(doc => (
                                                                        <span key={doc?.id} className="text-[7px] text-text-muted italic truncate block min-w-0" title={doc?.name}>
                                                                            {shortName(doc?.name ?? '')}
                                                                        </span>
                                                                    ))}
                                                                </div>
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
                                                    <div key={rcp.id} className="overflow-hidden min-w-0 rounded-btn-sm border-l-2 border border-success/30" style={{ backgroundColor: 'rgba(16,185,129,0.08)', borderLeftColor: '#10B981' }}>
                                                        {/* Header row */}
                                                        <div className="flex items-center gap-1 px-1 pt-1 min-w-0">
                                                            <span className="text-[8px] font-bold text-text-base truncate flex-1 min-w-0" title={rcp.location ?? ''}>{rcp.location}</span>
                                                            <span className="shrink-0 text-[6px] font-bold uppercase tracking-wide px-1 py-0.5 rounded" style={{ backgroundColor: 'rgba(16,185,129,0.18)', color: '#059669' }}>Conf.</span>
                                                        </div>
                                                        {/* Present pills */}
                                                        <div className="px-1 pb-1 pt-0.5">
                                                            <div className="text-[6px] uppercase font-bold leading-none mb-0.5" style={{ color: '#059669' }}>Présent(s)</div>
                                                            <div className="flex flex-col gap-0.5">
                                                                {confirmedDocs.map((doc) => (
                                                                    <span key={doc?.id} className="text-[7px] font-semibold truncate block min-w-0" style={{ color: '#065F46' }} title={doc?.name}>
                                                                        {shortName(doc?.name ?? '')}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    )}

                                    <div className="h-px bg-border my-2"></div>

                                    {/* Consult Activity Count */}
                                    <div className="flex items-center justify-between gap-1 min-w-0">
                                        <span className="text-[8px] md:text-[10px] font-bold text-text-muted uppercase tracking-wider truncate">Consult.</span>
                                        <span className="shrink-0 text-[8px] md:text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-full min-w-[20px] text-center" style={{ backgroundColor: 'rgba(59,130,246,0.12)', color: '#2563EB' }}>
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
        <div className="space-y-5 lg:space-y-6">
            {/* Page header */}
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-extrabold text-text-base tracking-tight leading-tight">
                        Tableau de bord
                    </h1>
                    <p className="text-sm text-text-muted mt-0.5">Vue d'ensemble de la planification</p>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex bg-muted p-1 rounded-btn-sm">
                        <button
                            onClick={() => setViewMode('DAY')}
                            className={`px-2 md:px-3 py-1.5 md:py-2 flex items-center text-xs font-bold rounded-btn-sm transition-all ${viewMode === 'DAY' ? 'bg-surface shadow-card text-primary' : 'text-text-muted hover:bg-border/60'}`}
                        >
                            <LayoutList className="w-4 h-4 md:mr-2" />
                            <span className="text-[10px] md:text-xs ml-1">Jour</span>
                        </button>
                        <button
                            onClick={() => setViewMode('WEEK')}
                            className={`px-2 md:px-3 py-1.5 md:py-2 flex items-center text-xs font-bold rounded-btn-sm transition-all ${viewMode === 'WEEK' ? 'bg-surface shadow-card text-primary' : 'text-text-muted hover:bg-border/60'}`}
                        >
                            <LayoutGrid className="w-4 h-4 md:mr-2" />
                            <span className="text-[10px] md:text-xs ml-1">Sem.</span>
                        </button>
                    </div>

                    <div className="flex items-center gap-2">
                        <button onClick={() => handleTimeChange('prev')} className="p-1.5 md:p-2 hover:bg-muted rounded-full text-text-muted border border-border transition-colors">
                            <ChevronLeft className="w-4 h-4 md:w-5 md:h-5" />
                        </button>
                        <div className="relative">
                            <input
                                type="date"
                                className="pl-7 md:pl-8 pr-2 py-1 md:py-1.5 border border-border rounded-btn-sm text-xs md:text-sm text-text-base bg-surface focus:outline-none focus:ring-2 focus:ring-primary w-32 md:w-auto"
                                value={selectedDate.toISOString().split('T')[0]}
                                onChange={handleDateChange}
                            />
                            <Calendar className="w-3.5 h-3.5 md:w-4 md:h-4 text-text-muted absolute left-2 md:left-2.5 top-2 md:top-2.5 pointer-events-none" />
                        </div>
                        <button onClick={() => handleTimeChange('next')} className="p-1.5 md:p-2 hover:bg-muted rounded-full text-text-muted border border-border transition-colors">
                            <ChevronRight className="w-4 h-4 md:w-5 md:h-5" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Welcome Banner */}
            {(() => {
                const today = new Date();
                const todayStr = today.toISOString().split('T')[0];
                const currentDoctor = profile?.doctor_id ? doctors.find(d => d.id === profile.doctor_id) : null;
                const doctorName = currentDoctor ? currentDoctor.name.replace(/^Dr\.?\s*/i, '') : null;
                const dayNames = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
                const monthNames = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
                const dateLabel = `${dayNames[today.getDay()]} ${today.getDate()} ${monthNames[today.getMonth()]} ${today.getFullYear()}`;
                const todaySlots = currentDoctor ? schedule.filter(s =>
                    s.date === todayStr && !s.isCancelled &&
                    (s.assignedDoctorId === profile!.doctor_id ||
                     (s.secondaryDoctorIds ?? []).includes(profile!.doctor_id!))
                ) : [];
                const formatSlotTime = (s: ScheduleSlot) => {
                    if (s.time) return s.time.substring(0, 5).replace(':', 'h');
                    return s.period === Period.MORNING ? '08h00' : '14h00';
                };
                const getSlotLabel = (s: ScheduleSlot) => {
                    if (s.type === SlotType.RCP) return s.subType ?? 'RCP';
                    if (s.type === SlotType.ACTIVITY) {
                        const act = activityDefinitions.find(a => a.id === s.subType);
                        return act?.name ?? s.subType ?? 'Activité';
                    }
                    return s.subType ?? s.type;
                };
                return (
                    <div className="rounded-card overflow-hidden bg-gradient-to-br from-primary/90 to-primary shadow-modal">
                        <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-4">
                            {/* Left: greeting */}
                            <div className="flex-1 min-w-0">
                                <p className="text-xl font-extrabold text-white leading-tight tracking-tight">
                                    {doctorName ? `Bonjour, Dr ${doctorName} 👋` : 'Bonjour 👋'}
                                </p>
                                <p className="text-sm text-white/70 mt-0.5 font-medium">{dateLabel}</p>
                            </div>
                            {/* Right: today's schedule */}
                            <div className="flex-1 min-w-0 sm:border-l sm:border-white/20 sm:pl-4">
                                {todaySlots.length === 0 ? (
                                    <p className="text-sm text-white/60 italic">Aucune activité prévue aujourd'hui.</p>
                                ) : (
                                    <div className="space-y-1.5">
                                        <p className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Aujourd'hui</p>
                                        {todaySlots.slice(0, 4).map(s => (
                                            <div key={s.id} className="flex items-center gap-2">
                                                <span className="text-[11px] font-mono text-white/60 w-10 shrink-0">{formatSlotTime(s)}</span>
                                                <span className="text-sm font-semibold text-white truncate">{getSlotLabel(s)}</span>
                                            </div>
                                        ))}
                                        {todaySlots.length > 4 && (
                                            <p className="text-[10px] text-white/50">+{todaySlots.length - 4} autres</p>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                );
            })()}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 lg:gap-6">
                {/* Left: Alerts, Absences & UNASSIGNED */}
                <div className="lg:col-span-1 flex flex-col gap-3 lg:gap-4">

                    {/* ALERTES */}
                    <Card>
                        <CardHeader>
                            <CardTitle>
                                <span className="flex items-center">
                                    <AlertTriangle className="w-4 h-4 mr-2 text-danger" />
                                    Alertes {viewMode === 'DAY' ? 'du jour' : 'de la semaine'}
                                </span>
                            </CardTitle>
                            <Badge variant={stats.filteredConflicts.length > 0 ? 'red' : 'gray'}>{stats.filteredConflicts.length}</Badge>
                        </CardHeader>
                        <CardBody className="max-h-48 md:max-h-80 overflow-y-auto space-y-2 md:space-y-3">
                            {stats.filteredConflicts.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-20 text-text-muted">
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
                                            className="flex items-start gap-3 py-3 border-b border-border/50 last:border-0 cursor-pointer group"
                                        >
                                            <span className="w-2 h-2 rounded-full bg-danger mt-1.5 flex-shrink-0" aria-hidden="true" />
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center justify-between gap-2 mb-1">
                                                    <Badge variant="red">
                                                        {conflict.type === 'DOUBLE_BOOKING' ? 'Double Réservation' : 'Indisponibilité'}
                                                    </Badge>
                                                    <span className="text-[10px] text-text-muted font-mono flex-shrink-0">
                                                        {slot?.date
                                                            ? new Date(slot.date + 'T12:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
                                                            : slot?.day?.substring(0, 3)
                                                        }
                                                        {' · '}{slot?.period === Period.MORNING ? 'Matin' : 'PM'}
                                                    </span>
                                                </div>
                                                <p className="text-sm font-medium text-text-base leading-snug">{doc?.name || 'Inconnu'}</p>
                                                <p className="text-xs text-text-muted mt-0.5">{conflict.description}</p>
                                                {locationDetail && (
                                                    <span className="inline-block mt-1 text-[10px] font-medium text-text-muted bg-muted px-2 py-0.5 rounded-btn-sm">
                                                        {locationDetail}
                                                    </span>
                                                )}
                                                <span className="block text-xs text-primary font-bold mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    Résoudre →
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </CardBody>
                    </Card>

                    {/* RCPs ON HOLIDAYS ALERT — only shown to the referring (lead) doctor */}
                    {rcpsOnHolidays.filter(({ slot }) => profile?.doctor_id && slot.assignedDoctorId === profile.doctor_id).length > 0 && (
                        <Card>
                            <CardHeader>
                                <CardTitle>
                                    <span className="flex items-center">
                                        <CalendarX2 className="w-4 h-4 mr-2 text-warning" />
                                        RCP sur Jour Férié
                                    </span>
                                </CardTitle>
                                <Badge variant="amber">{rcpsOnHolidays.filter(({ slot }) => profile?.doctor_id && slot.assignedDoctorId === profile.doctor_id).length}</Badge>
                            </CardHeader>
                            <CardBody>
                                <p className="text-[10px] text-warning-text mb-3">
                                    Ces RCP tombent sur un jour férié ({selectedDate.toLocaleDateString('fr-FR', { month: 'long' })} & {new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1).toLocaleDateString('fr-FR', { month: 'long' })}). Cliquez pour les déplacer.
                                </p>
                                <div className="max-h-80 overflow-y-auto space-y-2">
                                    {rcpsOnHolidays.filter(({ slot }) => profile?.doctor_id && slot.assignedDoctorId === profile.doctor_id).map(({ slot, holiday, weekStart }) => {
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
                                                className="flex items-start gap-3 py-3 border-b border-border/50 last:border-0 cursor-pointer group"
                                            >
                                                <span className="w-2 h-2 rounded-full bg-warning mt-1.5 flex-shrink-0" aria-hidden="true" />
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex justify-between items-start gap-2 mb-1">
                                                        <Badge variant="amber">{holiday.name}</Badge>
                                                        {isConfirmed ? (
                                                            <Badge variant="green">Confirmée</Badge>
                                                        ) : (
                                                            <Badge variant="amber">A confirmer</Badge>
                                                        )}
                                                    </div>
                                                    <p className="text-sm font-medium text-text-base leading-snug flex items-center gap-1.5">
                                                        <MapPin className="w-3.5 h-3.5 text-secondary flex-shrink-0" aria-hidden="true" />
                                                        {slot.location}
                                                        <Badge variant="violet" className="text-[9px] px-1.5 py-0">RCP</Badge>
                                                    </p>
                                                    <p className="text-xs text-text-muted mt-0.5 capitalize">{formattedDate} a {slot.time || '--:--'}</p>
                                                    <div className="flex flex-wrap gap-1 mt-1.5">
                                                        {allDoctorIds.slice(0, 3).map(id => {
                                                            const d = doctors.find(doc => doc.id === id);
                                                            if (!d) return null;
                                                            return (
                                                                <div key={id} className="flex items-center bg-surface px-1.5 py-0.5 rounded-btn-sm border border-border">
                                                                    <div
                                                                        className="w-4 h-4 rounded-full flex items-center justify-center text-[7px] font-bold mr-1 text-white"
                                                                        style={{ backgroundColor: getDoctorHexColor(d.color) }}
                                                                    >
                                                                        {d.name.substring(0, 2)}
                                                                    </div>
                                                                    <span className="text-[9px] text-text-base">{d.name}</span>
                                                                </div>
                                                            );
                                                        })}
                                                        {allDoctorIds.length > 3 && (
                                                            <span className="text-[9px] text-text-muted">+{allDoctorIds.length - 3}</span>
                                                        )}
                                                    </div>
                                                    <span className="block text-xs text-warning-text font-bold mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        Déplacer →
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </CardBody>
                        </Card>
                    )}

                    {/* NON-POSTED DOCTORS */}
                    <Card>
                        <CardHeader>
                            <CardTitle>
                                <span className="flex items-center">
                                    <UserMinus className="w-4 h-4 mr-2 text-text-muted" />
                                    Médecins Non Postés (Ce jour)
                                </span>
                            </CardTitle>
                        </CardHeader>
                        <CardBody className="space-y-4">
                            <div>
                                <h4 className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-2">Matin</h4>
                                <div className="flex flex-wrap gap-1.5">
                                    {unassignedDoctors[Period.MORNING].length === 0 ? <span className="text-xs text-text-muted italic">Tous occupés</span> :
                                        unassignedDoctors[Period.MORNING].map(d => (
                                            <Badge key={d.id} variant="gray">{d.name}</Badge>
                                        ))
                                    }
                                </div>
                            </div>
                            <div>
                                <h4 className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-2">Après-Midi</h4>
                                <div className="flex flex-wrap gap-1.5">
                                    {unassignedDoctors[Period.AFTERNOON].length === 0 ? <span className="text-xs text-text-muted italic">Tous occupés</span> :
                                        unassignedDoctors[Period.AFTERNOON].map(d => (
                                            <Badge key={d.id} variant="gray">{d.name}</Badge>
                                        ))
                                    }
                                </div>
                            </div>
                        </CardBody>
                    </Card>

                    {/* ABSENCES */}
                    <Card>
                        <CardHeader>
                            <CardTitle>
                                <span className="flex items-center">
                                    <UserX className="w-4 h-4 mr-2 text-text-muted" />
                                    Médecins Absents
                                </span>
                            </CardTitle>
                        </CardHeader>
                        <CardBody className="max-h-40 overflow-y-auto">
                            {stats.absentees.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full text-text-muted">
                                    <span className="text-xs">Tout le monde est présent.</span>
                                </div>
                            ) : (
                                stats.absentees.map(abs => {
                                    const doc = doctors.find(d => d.id === abs.doctorId);
                                    return (
                                        <div key={abs.id} className="flex items-start gap-3 py-3 border-b border-border/50 last:border-0">
                                            <span className="w-2 h-2 rounded-full bg-warning mt-1.5 flex-shrink-0" aria-hidden="true" />
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm font-medium text-text-base leading-snug">{doc?.name}</p>
                                                <p className="text-xs text-text-muted mt-0.5 flex items-center gap-1">
                                                    {abs.reason}
                                                    {abs.period && abs.period !== 'ALL_DAY' && (
                                                        <Badge variant="gray" className="text-[9px] px-1 py-0">{abs.period === 'Matin' ? 'AM' : 'PM'}</Badge>
                                                    )}
                                                </p>
                                            </div>
                                            <span className="text-[10px] text-text-muted bg-muted px-2 py-1 rounded-btn-sm border border-border flex-shrink-0">
                                                {abs.startDate === abs.endDate ? abs.startDate : `Jusqu'au ${abs.endDate.split('-').slice(1).reverse().join('/')}`}
                                            </span>
                                        </div>
                                    )
                                })
                            )}
                        </CardBody>
                    </Card>
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

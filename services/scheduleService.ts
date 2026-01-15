
import { ActivityDefinition, Conflict, DayOfWeek, Doctor, Holiday, Period, RcpDefinition, ReplacementSuggestion, ScheduleSlot, ScheduleTemplateSlot, ShiftHistory, SlotType, Unavailability, RcpAttendance, RcpException, ManualOverrides, RcpManualInstance } from '../types';

export const isDateInRange = (dateStr: string, startStr: string, endStr: string) => {
    const d = new Date(dateStr);
    const s = new Date(startStr);
    const e = new Date(endStr);
    return d >= s && d <= e;
};

// New Helper: Check if doctor is absent for a specific period
export const isAbsent = (doctor: Doctor, dateStr: string, period: Period, unavailabilities: Unavailability[]): boolean => {
    if (!doctor) return false;
    return unavailabilities.some(u => {
        if (u.doctorId !== doctor.id) return false;
        if (!isDateInRange(dateStr, u.startDate, u.endDate)) return false;

        // Granularity check
        if (!u.period || u.period === 'ALL_DAY') return true;
        return u.period === period;
    });
};

// NEW: Check if doctor has a recurring WEEKLY exclusion for a specific day/period
// Priority: excludedHalfDays (granular) > excludedDays (legacy full-day)
export const isExcludedHalfDay = (doctor: Doctor, day: DayOfWeek, period: Period): boolean => {
    if (!doctor) return false;

    // 1. First check granular half-day exclusions (takes priority)
    if (doctor.excludedHalfDays && doctor.excludedHalfDays.length > 0) {
        return doctor.excludedHalfDays.some(
            excl => excl.day === day && excl.period === period
        );
    }

    // 2. Fallback to legacy excludedDays (full day = both periods excluded)
    if (doctor.excludedDays && doctor.excludedDays.includes(day)) {
        return true;
    }

    return false;
};



// Helper: Check if doctor is NOT WORKING at all on a specific day (both periods excluded)
export const isFullDayExcluded = (doctor: Doctor, day: DayOfWeek): boolean => {
    if (!doctor) return false;

    // If using legacy excludedDays
    if (doctor.excludedDays && doctor.excludedDays.includes(day)) {
        return true;
    }

    // If using granular half-days, both periods must be excluded
    if (doctor.excludedHalfDays && doctor.excludedHalfDays.length > 0) {
        const morningExcluded = doctor.excludedHalfDays.some(
            excl => excl.day === day && excl.period === Period.MORNING
        );
        const afternoonExcluded = doctor.excludedHalfDays.some(
            excl => excl.day === day && excl.period === Period.AFTERNOON
        );
        return morningExcluded && afternoonExcluded;
    }

    return false;
};


// --- DYNAMIC FRENCH HOLIDAYS ALGORITHM ---
const getEasterDate = (year: number): Date => {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(year, month - 1, day);
};

const addDays = (date: Date, days: number): Date => {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
};

export const getFrenchHolidays = (year: number): Holiday[] => {
    const holidays: Holiday[] = [
        { date: `${year}-01-01`, name: "Jour de l'An" },
        { date: `${year}-05-01`, name: "Fête du Travail" },
        { date: `${year}-05-08`, name: "Victoire 1945" },
        { date: `${year}-07-14`, name: "Fête Nationale" },
        { date: `${year}-08-15`, name: "Assomption" },
        { date: `${year}-11-01`, name: "Toussaint" },
        { date: `${year}-11-11`, name: "Armistice" },
        { date: `${year}-12-25`, name: "Noël" },
    ];

    const easter = getEasterDate(year);
    const easterMonday = addDays(easter, 1);
    const ascension = addDays(easter, 39);
    const pentecostMonday = addDays(easter, 50);

    const formatDate = (d: Date) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    };

    holidays.push({ date: formatDate(easterMonday), name: "Lundi de Pâques" });
    holidays.push({ date: formatDate(ascension), name: "Ascension" });
    holidays.push({ date: formatDate(pentecostMonday), name: "Lundi de Pentecôte" });

    return holidays;
};

export const isFrenchHoliday = (dateStr: string): Holiday | undefined => {
    const year = parseInt(dateStr.split('-')[0], 10);
    const holidays = getFrenchHolidays(year);
    return holidays.find(h => h.date === dateStr);
};

export const getDateForDayOfWeek = (mondayDate: Date, day: DayOfWeek): string => {
    const map: Record<DayOfWeek, number> = {
        [DayOfWeek.MONDAY]: 0,
        [DayOfWeek.TUESDAY]: 1,
        [DayOfWeek.WEDNESDAY]: 2,
        [DayOfWeek.THURSDAY]: 3,
        [DayOfWeek.FRIDAY]: 4
    };

    const result = new Date(mondayDate);
    result.setDate(mondayDate.getDate() + map[day]);

    // Use local time components to avoid UTC shift which causes date to be off by 1
    const year = result.getFullYear();
    const month = String(result.getMonth() + 1).padStart(2, '0');
    const d = String(result.getDate()).padStart(2, '0');

    return `${year}-${month}-${d}`;
};

export const getWeekNumber = (d: Date): number => {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
};

export const getNthDayOfMonth = (date: Date): number => {
    return Math.ceil(date.getDate() / 7);
};

// --- WORK RATE CALCULATOR ---
// Calculates percentage (0.0 - 1.0) based on half-days worked (Mon-Fri = 10 half-days)
export const getDoctorWorkRate = (doctor: Doctor): number => {
    if (!doctor) return 1; // Safety check

    const standardDays = [DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY, DayOfWeek.THURSDAY, DayOfWeek.FRIDAY];
    const totalHalfDays = 10; // 5 days * 2 half-days

    // NEW: Count excluded half-days from granular system
    if (doctor.excludedHalfDays && doctor.excludedHalfDays.length > 0) {
        // Count only standard workday half-days
        const excludedCount = doctor.excludedHalfDays.filter(
            excl => standardDays.includes(excl.day)
        ).length;
        const rate = (totalHalfDays - excludedCount) / totalHalfDays;
        return rate > 0.1 ? rate : 0.1; // Minimum floor
    }

    // LEGACY: Fall back to excludedDays (full day = 2 half-days)
    if (doctor.excludedDays && doctor.excludedDays.length > 0) {
        const excludedCount = doctor.excludedDays.filter(d => standardDays.includes(d)).length;
        const rate = (totalHalfDays - (excludedCount * 2)) / totalHalfDays;
        return rate > 0.1 ? rate : 0.1;
    }

    return 1; // Full time
};


// --- SMART SCRIPT: REPLACEMENT ALGORITHM ---
export const getAlgorithmicReplacementSuggestion = (
    conflictSlot: ScheduleSlot,
    unavailableDoc: Doctor,
    availableDocs: Doctor[],
    schedule: ScheduleSlot[], // Current schedule context for load balancing
    shiftHistory: ShiftHistory = {}, // History for equity
    activities: ActivityDefinition[] = [] // NEW: Activities to determine equity groups
): ReplacementSuggestion[] => {

    // Find the activity for this slot
    const slotActivity = activities.find(a => a.id === conflictSlot.activityId);
    const equityGroup = slotActivity?.equityGroup || 'custom_' + (conflictSlot.activityId || 'default');

    // Get all activities in this equity group for scoring
    const groupActivities = activities.filter(a =>
        (a.equityGroup || 'custom_' + a.id) === equityGroup
    );
    const groupActivityIds = groupActivities.map(a => a.id);

    return availableDocs
        .filter(candidate => {
            // 0. HARD EXCLUSIONS
            if (candidate.excludedSlotTypes?.includes(conflictSlot.type)) return false;
            if (conflictSlot.activityId && candidate.excludedActivities.includes(conflictSlot.activityId)) return false;
            return true;
        })
        .map(candidate => {
            let score = 50; // Base score
            const reasons: string[] = [];

            // 1. Specialty Match
            const sharedSpecialties = candidate.specialty.filter(s => unavailableDoc.specialty.includes(s));
            if (sharedSpecialties.length > 0) {
                score += 30;
                reasons.push(`Même spécialité (${sharedSpecialties.join(', ')})`);
            }

            // 2. Load Balancing (Weighted Equity by Group)
            const workRate = getDoctorWorkRate(candidate);

            // Calculate total history for this equity group
            let historyTotal = 0;
            groupActivityIds.forEach(actId => {
                historyTotal += shiftHistory[candidate.id]?.[actId] || 0;
            });

            // Count current schedule assignments in this group
            const currentShifts = schedule.filter(s =>
                s.assignedDoctorId === candidate.id &&
                s.id !== conflictSlot.id &&
                groupActivityIds.includes(s.activityId || '')
            ).length;

            // Cumulative Weighted Score
            const weightedScore = (historyTotal + currentShifts) / workRate;

            // In suggestions, lower score is better (candidate is less loaded)
            // We invert this for the "Score" (0-100) returned to UI
            if (weightedScore < 10) {
                score += 20;
                reasons.push("Charge pondérée faible");
            } else if (weightedScore > 30) {
                score -= 20;
                reasons.push("Charge pondérée élevée");
            }

            // 3. Slot Type Match / Affinities
            const locationLower = conflictSlot.location.toLowerCase();
            const relevantSpecialty = candidate.specialty.find(s => locationLower.includes(s.toLowerCase()));
            if (relevantSpecialty) {
                score += 20;
                reasons.push(`Expertise pertinente (${relevantSpecialty})`);
            }

            const finalScore = Math.max(0, Math.min(100, score));
            if (reasons.length === 0) reasons.push("Disponible");

            return {
                originalDoctorId: unavailableDoc.id,
                suggestedDoctorId: candidate.id,
                reasoning: reasons.join(" • "),
                score: finalScore
            };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 5); // Return top 5
};


// --- ACTIVITY DISTRIBUTION LOGIC (CORE OVERHAUL) ---

// Helper: Check if a doctor is eligible for a specific activity/day
const isDoctorEligible = (
    doc: Doctor,
    activityId: string,
    day: DayOfWeek,
    dateStr: string,
    unavailabilities: Unavailability[],
    period: Period,
    currentAssignments: ScheduleSlot[],
    checkBlocking: boolean = true
): boolean => {
    if (!doc) return false;

    // 1. Profile Exclusions
    if (doc.excludedActivities && doc.excludedActivities.includes(activityId)) return false;

    // 1.5 NEW: Check granular half-day exclusions (takes priority over legacy excludedDays)
    if (isExcludedHalfDay(doc, day, period)) return false;

    // 2. Absences (Granular - temporary/dated unavailabilities)
    if (isAbsent(doc, dateStr, period, unavailabilities)) return false;

    // 3. Strict Blocking (Double Booking)
    if (checkBlocking) {
        const isBlocked = currentAssignments.some(s =>
            s.date === dateStr &&
            s.period === period &&
            (s.assignedDoctorId === doc.id || s.secondaryDoctorIds?.includes(doc.id)) &&
            (s.type === SlotType.RCP ? !s.isUnconfirmed : s.isBlocking !== false)
        );
        if (isBlocked) return false;
    }

    return true;
};


// Helper: Check strict full week availability for Workflow
const isDoctorAvailableForFullWeek = (
    doc: Doctor,
    weekDates: string[],
    unavailabilities: Unavailability[]
): boolean => {
    if (!doc) return false;
    // If unavailable for ANY part of ANY day in the range, return false
    return !weekDates.some(date => {
        // Check "ALL_DAY", "MORNING", or "AFTERNOON" - any absence disqualifies for workflow
        return unavailabilities.some(u => {
            if (u.doctorId !== doc.id) return false;
            // Does unavailability overlap with this date?
            return isDateInRange(date, u.startDate, u.endDate);
        });
    });
};

export const fillAutoActivities = (
    slots: ScheduleSlot[],
    activities: ActivityDefinition[],
    allDoctors: Doctor[],
    unavailabilities: Unavailability[],
    shiftHistory: ShiftHistory,
    activitiesStartDate?: string | null // NEW: Date from which to start counting equity
): ScheduleSlot[] => {
    // We work on a copy
    const filledSlots = [...slots];

    if (!allDoctors || allDoctors.length === 0) return filledSlots;

    // -- INITIALIZE TRACKERS BY EQUITY GROUP --

    // Group activities by their equityGroup
    const activityGroups: Record<string, ActivityDefinition[]> = {};
    activities.forEach(act => {
        const group = act.equityGroup || 'custom_' + act.id;
        if (!activityGroups[group]) activityGroups[group] = [];
        activityGroups[group].push(act);
    });

    // Equity Score Tracker per Doctor per EquityGroup
    // This combines history + current assignments
    const equityScores: Record<string, Record<string, number>> = {};

    // Current Week Load Tracker (for tie-breaking)
    const currentWeekLoad: Record<string, number> = {};

    // Initialize from History
    allDoctors.forEach(d => {
        equityScores[d.id] = {};
        currentWeekLoad[d.id] = 0;

        // For each equity group, sum up history from all activities in that group
        Object.entries(activityGroups).forEach(([groupName, groupActs]) => {
            let totalHistory = 0;
            groupActs.forEach(act => {
                totalHistory += shiftHistory[d.id]?.[act.id] || 0;
            });
            equityScores[d.id][groupName] = totalHistory;
        });
    });

    // Separate Activities by Type
    const weeklyActivities = activities.filter(a => a.granularity === 'WEEKLY');
    const halfDayActivities = activities.filter(a => a.granularity === 'HALF_DAY');

    // -- PHASE 1: ASSIGN HALF-DAY ACTIVITIES (Unity, Astreinte, etc.) --
    // These are assigned day by day with equity balance per group

    halfDayActivities.forEach(act => {
        const actSlots = filledSlots.filter(s => s.activityId === act.id);
        const equityGroup = act.equityGroup || 'custom_' + act.id;

        actSlots.forEach(slot => {
            // SKIP IF HOLIDAY
            if (isFrenchHoliday(slot.date)) return;

            // Skip if already manually assigned
            if (slot.assignedDoctorId) {
                // Count it toward equity
                if (equityScores[slot.assignedDoctorId]) {
                    equityScores[slot.assignedDoctorId][equityGroup] =
                        (equityScores[slot.assignedDoctorId][equityGroup] || 0) + 1;
                    currentWeekLoad[slot.assignedDoctorId] =
                        (currentWeekLoad[slot.assignedDoctorId] || 0) + 1;
                }
                return;
            }

            // Filter Eligible Doctors
            const candidates = allDoctors.filter(doc => {
                return isDoctorEligible(doc, act.id, slot.day, slot.date, unavailabilities, slot.period, filledSlots, true);
            });

            if (candidates.length > 0) {
                // SORT BY WEIGHTED CUMULATIVE SCORE for this equity group
                candidates.sort((a, b) => {
                    const rateA = getDoctorWorkRate(a);
                    const rateB = getDoctorWorkRate(b);

                    // Weighted score = equity points / work rate
                    const scoreA = (equityScores[a.id]?.[equityGroup] || 0) / rateA;
                    const scoreB = (equityScores[b.id]?.[equityGroup] || 0) / rateB;

                    // Primary: lower weighted score = better candidate
                    if (Math.abs(scoreA - scoreB) > 0.1) {
                        return scoreA - scoreB;
                    }

                    // Secondary: lower current week load
                    const loadA = currentWeekLoad[a.id] || 0;
                    const loadB = currentWeekLoad[b.id] || 0;
                    if (loadA !== loadB) return loadA - loadB;

                    // Tertiary: random for fairness
                    return 0.5 - Math.random();
                });

                const chosen = candidates[0];
                slot.assignedDoctorId = chosen.id;

                // Update trackers
                equityScores[chosen.id][equityGroup] =
                    (equityScores[chosen.id][equityGroup] || 0) + 1;
                currentWeekLoad[chosen.id] =
                    (currentWeekLoad[chosen.id] || 0) + 1;
            }
        });
    });

    // -- PHASE 2: ASSIGN WEEKLY ACTIVITIES (Workflow, Supervision, etc.) --
    // These assign 1 doctor for the whole week

    weeklyActivities.forEach(act => {
        const actSlots = filledSlots.filter(s => s.activityId === act.id);
        const equityGroup = act.equityGroup || 'custom_' + act.id;
        const isWorkflowActivity = equityGroup === 'workflow';

        if (actSlots.length === 0) return;

        // Check if manually assigned
        const manualAssign = actSlots.find(s => s.assignedDoctorId);
        if (manualAssign && manualAssign.assignedDoctorId) {
            // Count it toward equity
            if (equityScores[manualAssign.assignedDoctorId]) {
                equityScores[manualAssign.assignedDoctorId][equityGroup] =
                    (equityScores[manualAssign.assignedDoctorId][equityGroup] || 0) + 1;
            }
            return;
        }

        const distinctDates = [...new Set(actSlots.map(s => s.date))];

        // Filter Candidates
        // For WORKFLOW activities: Only check if doctor has excluded the activity or has unavailabilities
        // For OTHER weekly activities: Require full week availability
        const candidates = allDoctors.filter(doc => {
            // Check if doctor excluded this activity
            if (doc.excludedActivities && doc.excludedActivities.includes(act.id)) return false;

            if (isWorkflowActivity) {
                // Workflow: Only check for actual unavailabilities (congés, maladie, etc.)
                // Don't require full week presence - it's non-blocking
                const hasUnavailability = distinctDates.some(date => {
                    return unavailabilities.some(u => {
                        if (u.doctorId !== doc.id) return false;
                        return isDateInRange(date, u.startDate, u.endDate);
                    });
                });
                return !hasUnavailability;
            } else {
                // Other weekly activities: require strict full week availability
                return isDoctorAvailableForFullWeek(doc, distinctDates, unavailabilities);
            }
        });

        if (candidates.length > 0) {
            if (isWorkflowActivity) {
                // WORKFLOW: Simple rotation - choose doctor with fewest points
                // If multiple have same points, pick randomly among them
                const minPoints = Math.min(...candidates.map(c => equityScores[c.id]?.[equityGroup] || 0));
                const tiedCandidates = candidates.filter(c => (equityScores[c.id]?.[equityGroup] || 0) === minPoints);

                // Pick randomly if there's a tie
                const chosen = tiedCandidates.length > 1
                    ? tiedCandidates[Math.floor(Math.random() * tiedCandidates.length)]
                    : tiedCandidates[0];

                actSlots.forEach(s => s.assignedDoctorId = chosen.id);

                // Update equity
                equityScores[chosen.id][equityGroup] =
                    (equityScores[chosen.id][equityGroup] || 0) + 1;
            } else {
                // OTHER WEEKLY ACTIVITIES: Use weighted formula
                candidates.sort((a, b) => {
                    const rateA = getDoctorWorkRate(a);
                    const rateB = getDoctorWorkRate(b);

                    const scoreA = (equityScores[a.id]?.[equityGroup] || 0) / rateA;
                    const scoreB = (equityScores[b.id]?.[equityGroup] || 0) / rateB;

                    if (Math.abs(scoreA - scoreB) > 0.1) return scoreA - scoreB;

                    // Secondary: current week load
                    const loadA = currentWeekLoad[a.id] || 0;
                    const loadB = currentWeekLoad[b.id] || 0;
                    if (loadA !== loadB) return loadA - loadB;

                    return 0.5 - Math.random();
                });

                const chosen = candidates[0];
                actSlots.forEach(s => s.assignedDoctorId = chosen.id);

                // Update equity
                equityScores[chosen.id][equityGroup] =
                    (equityScores[chosen.id][equityGroup] || 0) + 1;
            }
        }
    });

    return filledSlots;
};

// --- ITERATIVE HISTORY CALCULATOR ---
// CRITICAL: This function counts ONLY saved assignments (from manualOverrides)
// NOT auto-generated assignments. Empty weeks = 0 points.
// For WORKFLOW activities: count 1 point per WEEK, not per slot!
export const computeHistoryFromDate = (
    startDateStr: string,
    targetDate: Date,
    template: ScheduleTemplateSlot[],
    unavailabilities: Unavailability[],
    doctors: Doctor[],
    activities: ActivityDefinition[],
    rcpDefinitions: RcpDefinition[],
    manualOverrides: ManualOverrides
): ShiftHistory => {

    const computedHistory: ShiftHistory = {};

    // Build equity groups from activities
    const equityGroups = new Set<string>();
    const workflowActivityIds = new Set<string>();
    if (activities) {
        activities.forEach(a => {
            equityGroups.add(a.equityGroup || 'custom_' + a.id);
            // Track workflow activities for special counting
            if (a.equityGroup === 'workflow' || a.granularity === 'WEEKLY') {
                workflowActivityIds.add(a.id);
            }
        });
    }

    if (doctors) {
        doctors.forEach(d => {
            computedHistory[d.id] = {};
            // Initialize all activities to 0
            if (activities) {
                activities.forEach(a => {
                    computedHistory[d.id][a.id] = 0;
                });
            }
            // Initialize equity group counters
            equityGroups.forEach(group => {
                computedHistory[d.id][`equity_${group}`] = 0;
            });
        });
    }

    const startRaw = new Date(startDateStr);

    // Safety check
    if (isNaN(startRaw.getTime())) return computedHistory;

    // Get the MONDAY of the week containing the start date
    // This ensures we start counting from the beginning of the start week
    const startDay = startRaw.getDay();
    const start = new Date(startRaw);
    start.setDate(startRaw.getDate() - startDay + (startDay === 0 ? -6 : 1));
    start.setHours(0, 0, 0, 0);

    // Track workflow weeks already counted per doctor per activity
    // Key: "doctorId-activityId-weekStart"
    const workflowWeeksCounted = new Set<string>();

    const current = new Date(start);
    // Loop week by week until targetDate (exclusive)
    let loops = 0;
    while (current < targetDate && loops < 104) {
        const weekStartStr = current.toISOString().split('T')[0];

        // Generate week slots WITHOUT auto-fill - we only want the slot IDs
        const weekSlots = generateScheduleForWeek(
            new Date(current),
            template,
            unavailabilities,
            doctors,
            activities,
            rcpDefinitions,
            false, // CRITICAL: NO auto-fill! Only count saved overrides
            {}, // No history needed
            {}, // No RCP attendance for history calculation
            []
        );

        // Count ONLY slots that have a saved override in manualOverrides
        weekSlots.forEach(slot => {
            if (slot.type !== SlotType.ACTIVITY) return;

            const override = manualOverrides[slot.id];
            if (!override || override === '__CLOSED__') return;

            // Extract doctor ID (handle 'auto:' prefix)
            const isAuto = override.startsWith('auto:');
            const doctorId = isAuto ? override.substring(5) : override;

            // Only count if we have a valid doctor and activity
            if (doctorId && slot.activityId && computedHistory[doctorId]) {
                if (computedHistory[doctorId][slot.activityId] === undefined) {
                    computedHistory[doctorId][slot.activityId] = 0;
                }

                // WORKFLOW ACTIVITIES: Count 1 per WEEK, not per slot
                if (workflowActivityIds.has(slot.activityId)) {
                    const weekKey = `${doctorId}-${slot.activityId}-${weekStartStr}`;
                    if (!workflowWeeksCounted.has(weekKey)) {
                        workflowWeeksCounted.add(weekKey);
                        computedHistory[doctorId][slot.activityId]++;
                    }
                    // Skip incrementing again for same week
                } else {
                    // HALF-DAY ACTIVITIES: Count each slot
                    computedHistory[doctorId][slot.activityId]++;
                }
            }
        });

        current.setDate(current.getDate() + 7);
        loops++;
    }

    return computedHistory;
};

export const generateScheduleForWeek = (
    mondayDate: Date,
    template: ScheduleTemplateSlot[],
    unavailabilities: Unavailability[],
    doctors: Doctor[],
    activities: ActivityDefinition[],
    rcpDefinitions: RcpDefinition[],
    forceRegenerateActivities: boolean = true,
    shiftHistory: ShiftHistory = {},
    rcpAttendance: RcpAttendance = {},
    rcpExceptions: RcpException[] = []
): ScheduleSlot[] => {

    if (!doctors) return [];

    const slots: ScheduleSlot[] = [];
    const currentWeekNum = getWeekNumber(mondayDate);

    // 1. FIXED TEMPLATE (Consultations / RCP Standard)
    template.forEach(t => {
        // Standard RCP Rules Check
        const rcpDef = rcpDefinitions.find(r => r.name === t.location);
        const standardDate = getDateForDayOfWeek(mondayDate, t.day);
        const dateObj = new Date(standardDate);

        if (rcpDef) {
            if (rcpDef.frequency === 'BIWEEKLY') {
                if (rcpDef.weekParity === 'ODD' && currentWeekNum % 2 === 0) return;
                if (rcpDef.weekParity === 'EVEN' && currentWeekNum % 2 !== 0) return;
                if (!rcpDef.weekParity && currentWeekNum % 2 === 0) return;
            } else if (rcpDef.frequency === 'MONTHLY') {
                const nth = getNthDayOfMonth(dateObj);
                const targetWeek = rcpDef.monthlyWeekNumber || 1;
                if (nth !== targetWeek) return;
            } else if (rcpDef.frequency === 'MANUAL') {
                // Skip standard template generation for MANUAL types.
                // They are injected later via `rcpDef.manualInstances`.
                return;
            }
        } else if (t.frequency === 'BIWEEKLY') {
            if (currentWeekNum % 2 === 0) return;
        }

        let finalDate = standardDate;
        let finalPeriod = t.period;
        let finalTime = t.time;
        let isCancelled = false;

        // CHECK EXCEPTIONS (RCP Moved/Cancelled)
        if (t.type === SlotType.RCP) {
            const exception = rcpExceptions.find(ex => ex.rcpTemplateId === t.id && ex.originalDate === standardDate);
            if (exception) {
                if (exception.isCancelled) {
                    isCancelled = true;
                } else {
                    if (exception.newDate) finalDate = exception.newDate;
                    if (exception.newPeriod) finalPeriod = exception.newPeriod;
                    if (exception.newTime) finalTime = exception.newTime;
                }
            }
        }

        // Don't skip cancelled RCPs - include them with isCancelled flag so they can be shown and un-cancelled
        const generatedId = `${t.id}-${standardDate}`;

        // Resolve primary and secondary doctors
        let assignedId: string | null = null;
        let secondaryIds: string[] = [];
        let isUnconfirmed = false;
        let forceBlocking = false;

        // Apply Override from Exception (Custom Participants)
        let effectiveDoctorIds = t.doctorIds;
        let effectiveDefaultId = t.defaultDoctorId;
        let effectiveSecondaryIds = t.secondaryDoctorIds;

        if (t.type === SlotType.RCP) {
            const exception = rcpExceptions.find(ex => ex.rcpTemplateId === t.id && ex.originalDate === standardDate);
            if (exception && exception.customDoctorIds) {
                effectiveDoctorIds = exception.customDoctorIds;
                effectiveDefaultId = exception.customDoctorIds[0] || null;
                effectiveSecondaryIds = exception.customDoctorIds.slice(1);
            }
        }

        // Skip attendance/assignment logic for cancelled slots
        if (!isCancelled) {
            if (t.type === SlotType.RCP) {
                // ... (Attendance Logic same as before)
                const attendanceMap = rcpAttendance[generatedId] || {};
                const confirmedDocs = Object.keys(attendanceMap).filter(id => attendanceMap[id] === 'PRESENT');

                if (confirmedDocs.length > 0) {
                    assignedId = confirmedDocs[0];
                    secondaryIds = confirmedDocs.slice(1);
                    isUnconfirmed = false;
                    forceBlocking = true;
                } else {
                    isUnconfirmed = true;
                    const baseEligibleIds = (effectiveDoctorIds && effectiveDoctorIds.length > 0)
                        ? effectiveDoctorIds
                        : (effectiveDefaultId ? [effectiveDefaultId, ...(effectiveSecondaryIds || [])] : []);

                    const eligibleIds = baseEligibleIds.filter(id => attendanceMap[id] !== 'ABSENT');

                    if (eligibleIds.length > 0) {
                        assignedId = eligibleIds[0];
                        secondaryIds = eligibleIds.slice(1);
                    } else {
                        assignedId = null;
                        secondaryIds = [];
                    }
                }
            } else {
                if (effectiveDoctorIds && effectiveDoctorIds.length > 0) {
                    assignedId = effectiveDoctorIds[0];
                    secondaryIds = effectiveDoctorIds.slice(1);
                } else {
                    assignedId = effectiveDefaultId;
                    secondaryIds = effectiveSecondaryIds || [];
                }
            }

            // --- ZOMBIE PROTECTION ---
            if (assignedId && !doctors.some(d => d.id === assignedId)) {
                assignedId = null;
            }
            secondaryIds = (secondaryIds || []).filter(sid => doctors.some(d => d.id === sid));
        }

        let backupDoctorId = t.backupDoctorId;
        if (backupDoctorId && !doctors.some(d => d.id === backupDoctorId)) {
            backupDoctorId = null;
        }

        slots.push({
            id: generatedId,
            date: finalDate,
            day: t.day,
            period: finalPeriod,
            time: finalTime,
            location: t.location,
            type: t.type,
            subType: t.subType,
            assignedDoctorId: assignedId,
            secondaryDoctorIds: secondaryIds,
            backupDoctorId: backupDoctorId,
            isGenerated: true,
            isBlocking: isCancelled ? false : (forceBlocking ? true : (t.isBlocking !== undefined ? t.isBlocking : true)),
            isUnconfirmed: isUnconfirmed,
            isCancelled: isCancelled
        });
    });

    // 1.5 INJECT MANUAL RCP INSTANCES (Standardized Injection)
    rcpDefinitions.forEach(rcpDef => {
        if (rcpDef.frequency === 'MANUAL' && rcpDef.manualInstances) {
            rcpDef.manualInstances.forEach(instance => {
                // Check if instance falls in current week
                const d = new Date(instance.date);
                const day = d.getDay();
                const diff = d.getDate() - day + (day === 0 ? -6 : 1);
                const instanceMonday = new Date(d);
                instanceMonday.setDate(diff);
                instanceMonday.setHours(0, 0, 0, 0);

                const currentMonday = new Date(mondayDate);
                currentMonday.setHours(0, 0, 0, 0);

                if (instanceMonday.getTime() === currentMonday.getTime()) {
                    // MATCH! Create slot.
                    const generatedId = `manual-rcp-${rcpDef.id}-${instance.id}`;

                    // Determine Period based on Time
                    const hour = parseInt(instance.time.split(':')[0], 10);
                    const period = hour < 13 ? Period.MORNING : Period.AFTERNOON;

                    // Map JS Day (0=Sun) to Enum
                    const dayMap = [null, DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY, DayOfWeek.THURSDAY, DayOfWeek.FRIDAY, null];
                    const dayEnum = dayMap[day];

                    if (dayEnum) {
                        // 1. Base Eligibility
                        const definedLead = instance.doctorIds[0] || null;
                        const definedSecondaries = instance.doctorIds.slice(1);
                        const definedBackup = instance.backupDoctorId || null;

                        // 2. Check Attendance (To confirm presence/absence)
                        const attendanceMap = rcpAttendance[generatedId] || {};
                        const confirmedDocs = Object.keys(attendanceMap).filter(id => attendanceMap[id] === 'PRESENT');

                        let assignedId: string | null = null;
                        let secondaryIds: string[] = [];
                        let isUnconfirmed = false;
                        let forceBlocking = false;

                        if (confirmedDocs.length > 0) {
                            // If at least one confirmed, they are the lead
                            assignedId = confirmedDocs[0];
                            secondaryIds = confirmedDocs.slice(1);
                            isUnconfirmed = false; // Confirmed!
                            forceBlocking = true;
                        } else {
                            // Check if original assignments are absent
                            isUnconfirmed = true;

                            // Filter out absentees from original plan
                            const allPlanned = [definedLead, ...definedSecondaries].filter(Boolean) as string[];
                            const eligibleIds = allPlanned.filter(id => attendanceMap[id] !== 'ABSENT');

                            if (eligibleIds.length > 0) {
                                assignedId = eligibleIds[0];
                                secondaryIds = eligibleIds.slice(1);
                            } else {
                                assignedId = null;
                                secondaryIds = [];
                            }
                        }

                        slots.push({
                            id: generatedId,
                            date: instance.date,
                            day: dayEnum,
                            period: period,
                            time: instance.time,
                            location: rcpDef.name,
                            type: SlotType.RCP,
                            subType: rcpDef.name,
                            assignedDoctorId: assignedId,
                            secondaryDoctorIds: secondaryIds,
                            backupDoctorId: definedBackup,
                            isGenerated: true,
                            isBlocking: forceBlocking || true, // Manual RCPs are explicit events
                            isUnconfirmed: isUnconfirmed
                        });
                    }
                }
            });
        }
    });


    // 2. GENERATE ACTIVITY SLOTS
    activities.forEach(act => {
        const days = Object.values(DayOfWeek);
        const periods = [Period.MORNING, Period.AFTERNOON];

        days.forEach(day => {
            const date = getDateForDayOfWeek(mondayDate, day);

            periods.forEach(p => {
                slots.push({
                    id: `act-${act.id}-${date}-${p}`,
                    date: date,
                    day: day,
                    period: p,
                    location: act.name,
                    type: SlotType.ACTIVITY,
                    subType: act.name,
                    activityId: act.id,
                    assignedDoctorId: null,
                    isBlocking: !act.allowDoubleBooking
                });
            });
        });
    });

    // 3. FILL AUTO-ACTIVITIES
    if (forceRegenerateActivities) {
        return fillAutoActivities(slots, activities, doctors, unavailabilities, shiftHistory);
    }

    return slots;
};

// ... (Rest of functions: generateMonthSchedule, findConflictingSlot, detectConflicts, getAvailableDoctors - Unchanged)
export const generateMonthSchedule = (
    startOfMonth: Date,
    template: ScheduleTemplateSlot[],
    unavailabilities: Unavailability[],
    doctors: Doctor[],
    activities: ActivityDefinition[],
    rcpDefinitions: RcpDefinition[],
    shiftHistory: ShiftHistory,
    rcpAttendance: RcpAttendance
): ScheduleSlot[] => {
    let allSlots: ScheduleSlot[] = [];
    const current = new Date(startOfMonth);

    for (let i = 0; i < 5; i++) {
        const weekSlots = generateScheduleForWeek(
            new Date(current),
            template,
            unavailabilities,
            doctors,
            activities,
            rcpDefinitions,
            false, // NEVER auto-fill in month view - we use overrides only
            shiftHistory,
            rcpAttendance,
            []
        );
        allSlots = [...allSlots, ...weekSlots];
        current.setDate(current.getDate() + 7);
    }
    return allSlots;
};

export const findConflictingSlot = (
    currentSlot: ScheduleSlot,
    allSlots: ScheduleSlot[],
    doctorId: string
): ScheduleSlot | undefined => {
    return allSlots.find(s =>
        s.id !== currentSlot.id &&
        s.date === currentSlot.date &&
        s.period === currentSlot.period &&
        (s.assignedDoctorId === doctorId || s.secondaryDoctorIds?.includes(doctorId)) &&
        (s.type === SlotType.RCP ? !s.isUnconfirmed : s.isBlocking !== false)
    );
};

export const detectConflicts = (
    slots: ScheduleSlot[],
    unavailabilities: Unavailability[],
    doctors: Doctor[],
    activities: ActivityDefinition[]
): Conflict[] => {
    const conflicts: Conflict[] = [];
    const doctorSlots: Record<string, ScheduleSlot[]> = {};

    if (!doctors) return [];

    slots.forEach(slot => {
        const docs = [slot.assignedDoctorId, ...(slot.secondaryDoctorIds || [])].filter(Boolean) as string[];
        docs.forEach(dId => {
            if (!doctorSlots[dId]) doctorSlots[dId] = [];
            doctorSlots[dId].push(slot);
        });
    });

    // 1. Unavailability
    unavailabilities.forEach(absence => {
        const docSlots = doctorSlots[absence.doctorId] || [];
        docSlots.forEach(slot => {
            // Use helper that checks date range and period
            const doc = doctors.find(d => d.id === absence.doctorId);
            if (doc && isAbsent(doc, slot.date, slot.period, [absence])) {
                conflicts.push({
                    id: `conflict-abs-${slot.id}-${absence.doctorId}`,
                    slotId: slot.id,
                    doctorId: absence.doctorId,
                    type: 'UNAVAILABLE',
                    description: `Absent (${absence.reason}${absence.period && absence.period !== 'ALL_DAY' ? ' - ' + absence.period : ''})`,
                    severity: 'HIGH'
                });
            }
        });
    });

    // 2. Double Booking & Exclusions
    Object.keys(doctorSlots).forEach(doctorId => {
        const doc = doctors.find(d => d.id === doctorId);
        if (!doc) return;

        const mySlots = doctorSlots[doctorId];

        mySlots.forEach(slot => {
            // NEW: Check for granular half-day exclusions (recurring weekly)
            if (isExcludedHalfDay(doc, slot.day, slot.period)) {
                // For RCPs, only show conflict if doctor has confirmed PRESENT
                // (if they haven't responded or are ABSENT, no conflict - they won't be there anyway)
                if (slot.type === SlotType.RCP) {
                    // RCP: Only conflict if doctor confirmed presence AND it's on a non-working half-day
                    // The isUnconfirmed flag indicates the doctor has confirmed (false = confirmed)
                    if (!slot.isUnconfirmed) {
                        // Doctor confirmed they will attend this RCP on a non-working day - this is a real conflict
                        const periodLabel = slot.period === Period.MORNING ? 'matin' : 'après-midi';
                        conflicts.push({
                            id: `conflict-halfday-excl-${slot.id}-${doctorId}`,
                            slotId: slot.id,
                            doctorId,
                            type: 'UNAVAILABLE',
                            description: `⚠️ ${doc.name} a confirmé sa présence à la RCP mais ne travaille pas le ${slot.day} ${periodLabel}`,
                            severity: 'HIGH'
                        });
                    }
                    // If unconfirmed or ABSENT, no conflict - doctor won't be attending
                } else {
                    // Non-RCP slots: Always show conflict for half-day exclusions
                    const periodLabel = slot.period === Period.MORNING ? 'matin' : 'après-midi';
                    conflicts.push({
                        id: `conflict-halfday-excl-${slot.id}-${doctorId}`,
                        slotId: slot.id,
                        doctorId,
                        type: 'UNAVAILABLE',
                        description: `Ne travaille pas le ${slot.day} ${periodLabel} (absence récurrente)`,
                        severity: 'HIGH'
                    });
                }
            }

            if (slot.activityId && doc.excludedActivities && doc.excludedActivities.includes(slot.activityId)) {
                conflicts.push({
                    id: `conflict-act-excl-${slot.id}-${doctorId}`,
                    slotId: slot.id,
                    doctorId,
                    type: 'COMPETENCE_MISMATCH',
                    description: `Exclu de l'activité : ${slot.subType}`,
                    severity: 'HIGH'
                });
            }
        });


        for (let i = 0; i < mySlots.length; i++) {
            for (let j = i + 1; j < mySlots.length; j++) {
                const s1 = mySlots[i];
                const s2 = mySlots[j];

                if (s1.date === s2.date && s1.period === s2.period) {
                    const isS1Rcp = s1.type === SlotType.RCP;
                    const isS2Rcp = s2.type === SlotType.RCP;

                    const isS1Blocking = isS1Rcp ? !s1.isUnconfirmed : (s1.isBlocking !== false);
                    const isS2Blocking = isS2Rcp ? !s2.isUnconfirmed : (s2.isBlocking !== false);

                    if (isS1Blocking && isS2Blocking && s1.id !== s2.id) {
                        let desc1 = `Double réservation (${s2.location})`;
                        let desc2 = `Double réservation (${s1.location})`;

                        if (isS1Rcp || isS2Rcp) {
                            const rcp = isS1Rcp ? s1 : s2;
                            const other = isS1Rcp ? s2 : s1;
                            const rcpName = rcp.subType || rcp.location;
                            const otherName = other.subType || other.location;
                            const msg = `⚠️ CONFLIT : ${doc.name} a confirmé sa présence à la RCP "${rcpName}". Impossible de l'affecter à "${otherName}" sur la même demi-journée.`;
                            desc1 = msg;
                            desc2 = msg;
                        } else if (s1.type === SlotType.ACTIVITY && s2.type === SlotType.ACTIVITY) {
                            const msg = `${doc.name} cumule ${s1.subType} et ${s2.subType}.`;
                            desc1 = msg;
                            desc2 = msg;
                        } else {
                            const msg = `${doc.name} est en ${s1.location} et en ${s2.location} simultanément.`;
                            desc1 = msg;
                            desc2 = msg;
                        }

                        conflicts.push({
                            id: `conflict-db-${s1.id}-${s2.id}-${doctorId}`,
                            slotId: s1.id,
                            doctorId: doctorId,
                            type: 'DOUBLE_BOOKING',
                            description: desc1,
                            severity: 'HIGH'
                        });

                        conflicts.push({
                            id: `conflict-db-${s2.id}-${s1.id}-${doctorId}`,
                            slotId: s2.id,
                            doctorId: doctorId,
                            type: 'DOUBLE_BOOKING',
                            description: desc2,
                            severity: 'HIGH'
                        });
                    }
                }
            }
        }
    });

    return conflicts;
};

export const getAvailableDoctors = (
    allDoctors: Doctor[],
    slots: ScheduleSlot[],
    unavailabilities: Unavailability[],
    targetDay: DayOfWeek,
    targetPeriod: Period,
    targetDate?: string,
    targetSlotType?: SlotType
): Doctor[] => {
    if (!allDoctors) return [];
    return allDoctors.filter(doc => {
        // NEW: Check granular half-day exclusions (recurring weekly)
        if (isExcludedHalfDay(doc, targetDay, targetPeriod)) return false;

        if (targetDate) {
            // Check temporary unavailabilities (congés, maladie, etc.)
            if (isAbsent(doc, targetDate, targetPeriod, unavailabilities)) return false;
            if (targetSlotType && doc.excludedSlotTypes?.includes(targetSlotType)) return false;

            const isBusy = slots.some(s =>
                s.date === targetDate &&
                s.period === targetPeriod &&
                (s.assignedDoctorId === doc.id || s.secondaryDoctorIds?.includes(doc.id)) &&
                (s.type === SlotType.RCP ? !s.isUnconfirmed : s.isBlocking !== false)
            );
            if (isBusy) return false;
        }
        return true;
    });
};


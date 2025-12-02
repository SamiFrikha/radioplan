
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
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(),0,1));
    return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1)/7);
};

export const getNthDayOfMonth = (date: Date): number => {
    return Math.ceil(date.getDate() / 7);
};

// --- WORK RATE CALCULATOR ---
// Calculates percentage (0.0 - 1.0) based on days worked (Mon-Fri)
export const getDoctorWorkRate = (doctor: Doctor): number => {
    if (!doctor || !doctor.excludedDays) return 1; // Safety check
    const standardDays = [DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY, DayOfWeek.THURSDAY, DayOfWeek.FRIDAY];
    // Count how many standard days are excluded
    const excludedCount = doctor.excludedDays.filter(d => standardDays.includes(d)).length;
    // Base 5 days. If 1 day excluded -> 4/5 = 80%.
    const rate = (5 - excludedCount) / 5;
    return rate > 0.1 ? rate : 0.1; // Minimum floor to avoid division by zero
};

// --- SMART SCRIPT: REPLACEMENT ALGORITHM ---
export const getAlgorithmicReplacementSuggestion = (
    conflictSlot: ScheduleSlot,
    unavailableDoc: Doctor,
    availableDocs: Doctor[],
    schedule: ScheduleSlot[], // Current schedule context for load balancing
    shiftHistory: ShiftHistory = {} // History for equity
): ReplacementSuggestion[] => {
    
    return availableDocs
    .filter(candidate => {
        // 0. HARD EXCLUSIONS
        if (candidate.excludedSlotTypes?.includes(conflictSlot.type)) return false;
        if (conflictSlot.activityId && (candidate.excludedActivities || []).includes(conflictSlot.activityId)) return false;
        return true;
    })
    .map(candidate => {
        let score = 50; // Base score
        const reasons: string[] = [];

        // 1. Specialty Match
        const sharedSpecialties = (candidate.specialty || []).filter(s => (unavailableDoc.specialty || []).includes(s));
        if (sharedSpecialties.length > 0) {
            score += 30;
            reasons.push(`Même spécialité (${sharedSpecialties.join(', ')})`);
        }

        // 2. Load Balancing (Weighted Equity)
        const workRate = getDoctorWorkRate(candidate);
        
        // Unified Score: Unity + Astreinte
        const hUnity = shiftHistory[candidate.id]?.['act_unity'] || 0;
        const hAstreinte = shiftHistory[candidate.id]?.['act_astreinte'] || 0;
        
        const currentShifts = schedule.filter(s => 
            s.assignedDoctorId === candidate.id && s.id !== conflictSlot.id && (s.activityId === 'act_unity' || s.activityId === 'act_astreinte')
        ).length;

        // Cumulative Weighted Score
        const weightedScore = (hUnity + hAstreinte + currentShifts) / workRate;

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
        const relevantSpecialty = (candidate.specialty || []).find(s => locationLower.includes(s.toLowerCase()));
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
    if (doc.excludedDays && doc.excludedDays.includes(day)) return false;
    
    // 2. Absences (Granular)
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
  shiftHistory: ShiftHistory
): ScheduleSlot[] => {
  // We work on a copy
  const filledSlots = [...slots];
  
  // -- INITIALIZE TRACKERS --
  
  // 1. Unified Weighted Score Tracker (Unity + Astreinte)
  const combinedLoad: Record<string, number> = {};
  
  // 2. Independent Workflow Score Tracker
  const workflowScore: Record<string, number> = {};

  // 3. Current Week Load Tracker
  const currentWeekLoad: Record<string, number> = {};

  // Initialize from History
  if (allDoctors) {
      allDoctors.forEach(d => {
          const hUnity = shiftHistory[d.id]?.['act_unity'] || 0;
          const hAstreinte = shiftHistory[d.id]?.['act_astreinte'] || 0;
          const hWorkflow = shiftHistory[d.id]?.['act_workflow'] || 0;
          
          combinedLoad[d.id] = hUnity + hAstreinte;
          workflowScore[d.id] = hWorkflow;
          currentWeekLoad[d.id] = 0;
      });
  }

  // Separate Activities
  const workflowActivity = activities.find(a => a.id === 'act_workflow');
  const heavyActivities = activities.filter(a => a.id !== 'act_workflow'); // Unity, Astreinte, etc.

  // --- PHASE 1: ASSIGN HEAVY ACTIVITIES (Blocking / Half-Day) ---
  
  heavyActivities.forEach(act => {
      const actSlots = filledSlots.filter(s => s.activityId === act.id);
      
      actSlots.forEach(slot => {
          // SKIP IF HOLIDAY
          if (isFrenchHoliday(slot.date)) return;

          // Skip if manually assigned
          if (slot.assignedDoctorId) {
              if (act.id === 'act_unity' || act.id === 'act_astreinte') {
                  combinedLoad[slot.assignedDoctorId] = (combinedLoad[slot.assignedDoctorId] || 0) + 1;
                  currentWeekLoad[slot.assignedDoctorId] = (currentWeekLoad[slot.assignedDoctorId] || 0) + 1;
              }
              return;
          }

          // Filter Eligible
          const candidates = allDoctors.filter(doc => {
              return isDoctorEligible(doc, act.id, slot.day, slot.date, unavailabilities, slot.period, filledSlots, true);
          });

          if (candidates.length > 0) {
              // SORT BY WEIGHTED CUMULATIVE SCORE
              candidates.sort((a, b) => {
                  const rateA = getDoctorWorkRate(a);
                  const rateB = getDoctorWorkRate(b);
                  
                  const scoreA = combinedLoad[a.id] / rateA;
                  const scoreB = combinedLoad[b.id] / rateB;

                  if (Math.abs(scoreA - scoreB) > 0.1) {
                      return scoreA - scoreB;
                  }
                  
                  return a.id.localeCompare(b.id);
              });

              const chosen = candidates[0];
              slot.assignedDoctorId = chosen.id;
              
              if (act.id === 'act_unity' || act.id === 'act_astreinte') {
                  combinedLoad[chosen.id] += 1;
                  currentWeekLoad[chosen.id] += 1;
              }
          }
      });
  });

  // --- PHASE 2: ASSIGN WORKFLOW (Weekly / Non-Blocking) ---
  
  if (workflowActivity) {
      const wfSlots = filledSlots.filter(s => s.activityId === workflowActivity.id);
      
      if (wfSlots.length > 0) {
          // Check manual assignment
          const manualAssign = wfSlots.find(s => s.assignedDoctorId);
          if (manualAssign && manualAssign.assignedDoctorId) {
               workflowScore[manualAssign.assignedDoctorId] += 1;
          } else {
               const distinctDates = [...new Set(wfSlots.map(s => s.date))];
               
               // Filter Candidates with STRICT Exclusion Rule
               const candidates = allDoctors.filter(doc => {
                   if (doc.excludedActivities && doc.excludedActivities.includes(workflowActivity.id)) return false;
                   return isDoctorAvailableForFullWeek(doc, distinctDates, unavailabilities);
               });

               if (candidates.length > 0) {
                   candidates.sort((a, b) => {
                       const wfA = workflowScore[a.id];
                       const wfB = workflowScore[b.id];
                       if (wfA !== wfB) return wfA - wfB;

                       const loadA = currentWeekLoad[a.id];
                       const loadB = currentWeekLoad[b.id];
                       if (loadA !== loadB) return loadA - loadB;

                       return 0.5 - Math.random(); 
                   });

                   const chosen = candidates[0];
                   wfSlots.forEach(s => s.assignedDoctorId = chosen.id);
                   workflowScore[chosen.id] += 1;
               }
          }
      }
  }

  return filledSlots;
};

// --- ITERATIVE HISTORY CALCULATOR ---
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
    if (doctors) {
        doctors.forEach(d => {
            computedHistory[d.id] = { 'act_unity': 0, 'act_astreinte': 0, 'act_workflow': 0 };
        });
    }

    const start = new Date(startDateStr);
    
    const startDay = start.getDay();
    const diff = start.getDate() - startDay + (startDay === 0 ? -6 : 1);
    const current = new Date(start);
    current.setDate(diff);
    current.setHours(0,0,0,0);

    const target = new Date(targetDate);
    target.setHours(0,0,0,0);

    let loops = 0;
    while (current < target && loops < 500) {
        const weekSlots = generateScheduleForWeek(
            new Date(current),
            template,
            unavailabilities,
            doctors,
            activities,
            rcpDefinitions,
            true, 
            computedHistory, 
            {}, 
            []
        );

        const finalSlots = weekSlots.map(s => {
             if (manualOverrides && manualOverrides[s.id] && manualOverrides[s.id] !== '__CLOSED__') {
                 return { ...s, assignedDoctorId: manualOverrides[s.id] };
             }
             return s;
        });

        finalSlots.forEach(s => {
            if (s.assignedDoctorId && computedHistory[s.assignedDoctorId]) {
                if (s.activityId === 'act_unity') computedHistory[s.assignedDoctorId]['act_unity']++;
                if (s.activityId === 'act_astreinte') computedHistory[s.assignedDoctorId]['act_astreinte']++;
                if (s.activityId === 'act_workflow' && s.day === DayOfWeek.MONDAY && s.period === Period.MORNING) {
                     computedHistory[s.assignedDoctorId]['act_workflow']++;
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

    if (isCancelled) return; 

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
      isBlocking: forceBlocking ? true : (t.isBlocking !== undefined ? t.isBlocking : true),
      isUnconfirmed: isUnconfirmed
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
              instanceMonday.setHours(0,0,0,0);
              
              const currentMonday = new Date(mondayDate);
              currentMonday.setHours(0,0,0,0);

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
            true, 
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
        if (doc.excludedDays && doc.excludedDays.includes(slot.day)) {
            conflicts.push({
                id: `conflict-day-excl-${slot.id}-${doctorId}`,
                slotId: slot.id,
                doctorId,
                type: 'UNAVAILABLE',
                description: `Ne travaille pas le ${slot.day}`,
                severity: 'MEDIUM'
            });
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
                    const msg = `Présence confirmée à la ${rcp.subType || rcp.location}. Impossible d'assurer ${other.subType || other.location}.`;
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
    if (targetDate) {
      if (isAbsent(doc, targetDate, targetPeriod, unavailabilities)) return false;
      if (doc.excludedDays && doc.excludedDays.includes(targetDay)) return false;
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

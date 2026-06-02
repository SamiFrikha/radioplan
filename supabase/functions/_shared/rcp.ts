// Shared RCP occurrence + availability logic for the rcp-reminders and
// rcp-auto-assign edge functions. Keeping this in one place guarantees the
// reminder system and the auto-assignment draw stay in sync.

export const DAY_OFFSETS: Record<string, number> = {
  'Lundi': 0, 'Mardi': 1, 'Mercredi': 2, 'Jeudi': 3, 'Vendredi': 4,
};

export const toDateStr = (d: Date): string =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;

// ISO week number — same algorithm as the frontend getWeekNumber.
export const getISOWeekNumber = (d: Date): number => {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
};

// Nth week of month (1 = first, etc.) — same as the frontend getNthDayOfMonth.
export const getNthWeekOfMonth = (dateStr: string): number =>
  Math.ceil(parseInt(dateStr.split('-')[2], 10) / 7);

export interface RcpDef {
  id: string;
  name: string;
  frequency: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'MANUAL';
  week_parity: 'ODD' | 'EVEN' | null;
  monthly_week_number: number | null;
}

export interface Unavail {
  doctor_id: string;
  start_date: string;
  end_date: string;
  period: string; // 'ALL_DAY' | 'Matin' | 'Après-midi'
}

// Whether a template-based RCP actually occurs on the given week / standard date.
// Returns false for: a cancelled exception, MANUAL frequency (handled separately
// via rcp_manual_instances), the wrong bi-weekly parity, or the wrong week of month.
export const templateRcpOccurs = (
  rcpDef: RcpDef | undefined,
  templateFrequency: string | undefined | null,
  weekNum: number,
  standardDateStr: string,
  cancelledException: boolean,
): boolean => {
  if (cancelledException) return false;

  if (rcpDef) {
    if (rcpDef.frequency === 'MANUAL') return false;

    if (rcpDef.frequency === 'BIWEEKLY') {
      if (rcpDef.week_parity === 'ODD' && weekNum % 2 === 0) return false;
      if (rcpDef.week_parity === 'EVEN' && weekNum % 2 !== 0) return false;
      if (!rcpDef.week_parity && weekNum % 2 === 0) return false;
    }

    if (rcpDef.frequency === 'MONTHLY') {
      if (getNthWeekOfMonth(standardDateStr) !== (rcpDef.monthly_week_number ?? 1)) return false;
    }
  } else if (templateFrequency === 'BIWEEKLY') {
    if (weekNum % 2 === 0) return false;
  }

  return true;
};

// Whether an unavailability record covers a specific date + period (handles half-days).
export const isUnavailableForSlot = (
  u: Unavail,
  dateStr: string,
  slotPeriod: string,
): boolean => {
  if (u.start_date > dateStr || u.end_date < dateStr) return false;
  if (u.period === 'ALL_DAY') return true;
  return u.period === slotPeriod;
};

// Set of doctor IDs unavailable for a given date + period.
export const unavailableDoctorSet = (
  unavail: Unavail[],
  dateStr: string,
  slotPeriod: string,
): Set<string> => {
  const s = new Set<string>();
  for (const u of unavail) {
    if (isUnavailableForSlot(u, dateStr, slotPeriod)) s.add(u.doctor_id);
  }
  return s;
};

// Resolve the assigned doctor IDs for a template slot (explicit list wins,
// otherwise default + secondary).
export const resolveAssignedIds = (slot: {
  doctor_ids?: string[] | null;
  default_doctor_id?: string | null;
  secondary_doctor_ids?: string[] | null;
}): string[] =>
  slot.doctor_ids?.length
    ? slot.doctor_ids
    : [slot.default_doctor_id, ...(slot.secondary_doctor_ids ?? [])].filter(Boolean) as string[];

// Derive the period of a manual RCP instance from its time (before 14h = Matin).
export const periodFromTime = (time: string | null | undefined): string => {
  const hour = parseInt((time ?? '08:00').split(':')[0], 10);
  return hour < 14 ? 'Matin' : 'Après-midi';
};

// The Monday→Friday date range (as YYYY-MM-DD strings) for a week start.
export const weekRange = (weekStart: Date): { startStr: string; endStr: string } => {
  const end = new Date(weekStart);
  end.setUTCDate(weekStart.getUTCDate() + 4);
  return { startStr: toDateStr(weekStart), endStr: toDateStr(end) };
};

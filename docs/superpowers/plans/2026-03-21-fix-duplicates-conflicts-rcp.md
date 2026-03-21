# Fix Doublons, Conflits Profil, Remplacement RCP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix duplicate unavailabilities root cause, add conflict resolution tab to doctor profile, separate referent vs exceptional doctors in RCP replacement, and fix legacy bugs (AM/PM, dedup).

**Architecture:** Direct fixes to existing React components and services. One new Supabase migration for DB cleanup. No new files except the migration SQL.

**Tech Stack:** React 19 + TypeScript, Supabase (PostgreSQL), Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-03-21-fix-duplicates-conflicts-rcp-design.md`

---

### Task 1: Add `syncUnavailability` to AppContext

**Files:**
- Modify: `types.ts:270` (add to AppContextType)
- Modify: `App.tsx:386-412` (add function)
- Modify: `App.tsx:659-677` (add to Provider value)

- [ ] **Step 1: Add `syncUnavailability` to `AppContextType`**

In `types.ts`, after line 271 (`removeUnavailability`), add:

```typescript
  syncUnavailability: (u: Unavailability) => void;
```

- [ ] **Step 2: Create `syncUnavailability` function in App.tsx**

In `App.tsx`, after the `removeUnavailability` function (after line ~430), add:

```typescript
    const syncUnavailability = (u: Unavailability) => {
        setUnavailabilities(prev => {
            if (prev.some(existing => existing.id === u.id)) return prev;
            return [...prev, u];
        });
    };
```

- [ ] **Step 3: Expose in Provider value**

In `App.tsx` line ~663, add `syncUnavailability` to the context value. After `addUnavailability, removeUnavailability,` add `syncUnavailability,`:

```typescript
            updateSchedule, updateTemplate, addUnavailability, removeUnavailability, syncUnavailability, setCurrentUser,
```

- [ ] **Step 4: Verify build compiles**

Run: `npm run build 2>&1 | head -20`
Expected: No TypeScript errors related to syncUnavailability.

- [ ] **Step 5: Commit**

```bash
git add types.ts App.tsx
git commit -m "feat: add syncUnavailability to AppContext (state-only, no DB insert)"
```

---

### Task 2: Fix TeamManagement double-insertion bug

**Files:**
- Modify: `pages/admin/TeamManagement.tsx:36` (import syncUnavailability)
- Modify: `pages/admin/TeamManagement.tsx:775` (replace addUnavailability with syncUnavailability)

- [ ] **Step 1: Update context destructuring**

In `pages/admin/TeamManagement.tsx` line 36, change:

```typescript
    const { doctors, removeDoctor, updateDoctor, activityDefinitions, unavailabilities, addUnavailability, removeUnavailability } = useContext(AppContext);
```

to:

```typescript
    const { doctors, removeDoctor, updateDoctor, activityDefinitions, unavailabilities, addUnavailability, removeUnavailability, syncUnavailability } = useContext(AppContext);
```

- [ ] **Step 2: Replace addUnavailability with syncUnavailability on line 775**

In `pages/admin/TeamManagement.tsx` line 775, change:

```typescript
            addUnavailability(savedUnavail);
```

to:

```typescript
            syncUnavailability(savedUnavail);
```

- [ ] **Step 3: Verify build compiles**

Run: `npm run build 2>&1 | head -20`
Expected: Clean build, no errors.

- [ ] **Step 4: Commit**

```bash
git add pages/admin/TeamManagement.tsx
git commit -m "fix: prevent double DB insertion of unavailabilities from TeamManagement"
```

---

### Task 3: Create DB migration — cleanup duplicates + UNIQUE constraint

**Files:**
- Create: `supabase/migrations/21_fix_duplicate_unavailabilities.sql`

- [ ] **Step 1: Create migration file**

Create `supabase/migrations/21_fix_duplicate_unavailabilities.sql`:

```sql
-- Migration 21: Fix duplicate unavailabilities
-- Root cause: TeamManagement.tsx was calling addUnavailability() after direct DB insert,
-- causing every admin-created absence to be inserted twice.

-- 1. Normalize NULL periods to 'ALL_DAY'
UPDATE public.unavailabilities SET period = 'ALL_DAY' WHERE period IS NULL;

-- 2. Make period NOT NULL with default (required for plain UNIQUE constraint)
ALTER TABLE public.unavailabilities
    ALTER COLUMN period SET DEFAULT 'ALL_DAY',
    ALTER COLUMN period SET NOT NULL;

-- 3. Remove duplicate unavailabilities, keeping the oldest (smallest created_at)
DELETE FROM public.unavailabilities
WHERE id NOT IN (
    SELECT DISTINCT ON (doctor_id, start_date, end_date, period)
        id
    FROM public.unavailabilities
    ORDER BY doctor_id, start_date, end_date, period, created_at ASC
);

-- 4. Add UNIQUE constraint to prevent future duplicates
CREATE UNIQUE INDEX IF NOT EXISTS unavailabilities_unique_entry
ON public.unavailabilities(doctor_id, start_date, end_date, period);
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/21_fix_duplicate_unavailabilities.sql
git commit -m "fix(db): migration 21 — cleanup duplicate unavailabilities + add UNIQUE constraint"
```

---

### Task 4: Update unavailabilityService to use upsert

**Files:**
- Modify: `services/unavailabilityService.ts:22-45` (change create to upsert)

- [ ] **Step 1: Replace `insert` with `upsert` in create method**

In `services/unavailabilityService.ts`, replace the entire `create` method (lines 22-45) with:

```typescript
    async create(unavailability: Omit<Unavailability, 'id'>): Promise<Unavailability> {
        const payload = {
            doctor_id: unavailability.doctorId,
            start_date: unavailability.startDate,
            end_date: unavailability.endDate,
            period: unavailability.period || 'ALL_DAY',
            reason: unavailability.reason
        };

        // Try insert first; if duplicate (UNIQUE violation), fetch the existing row
        const { data, error } = await supabase
            .from('unavailabilities')
            .insert(payload)
            .select()
            .single();

        if (error) {
            // 23505 = unique_violation — duplicate already exists, fetch it
            if (error.code === '23505') {
                const { data: existing } = await supabase
                    .from('unavailabilities')
                    .select('*')
                    .eq('doctor_id', payload.doctor_id)
                    .eq('start_date', payload.start_date)
                    .eq('end_date', payload.end_date)
                    .eq('period', payload.period)
                    .single();
                if (existing) {
                    return {
                        id: existing.id,
                        doctorId: existing.doctor_id,
                        startDate: existing.start_date,
                        endDate: existing.end_date,
                        period: existing.period,
                        reason: existing.reason
                    };
                }
            }
            throw error;
        }

        return {
            id: data.id,
            doctorId: data.doctor_id,
            startDate: data.start_date,
            endDate: data.end_date,
            period: data.period,
            reason: data.reason
        };
    },
```

- [ ] **Step 2: Verify build compiles**

Run: `npm run build 2>&1 | head -20`
Expected: Clean build.

- [ ] **Step 3: Commit**

```bash
git add services/unavailabilityService.ts
git commit -m "fix: use upsert in unavailabilityService.create to prevent DB-level duplicates"
```

---

### Task 5: Fix AM/PM display bug in Dashboard and TeamManagement

**Files:**
- Modify: `pages/Dashboard.tsx:826`
- Modify: `pages/admin/TeamManagement.tsx:1969`

- [ ] **Step 1: Fix Dashboard AM/PM**

In `pages/Dashboard.tsx` line 826, change:

```typescript
                                                    {' · '}{slot?.period === Period.MORNING ? 'Matin' : 'AM'}
```

to:

```typescript
                                                    {' · '}{slot?.period === Period.MORNING ? 'Matin' : 'Après-midi'}
```

- [ ] **Step 2: Fix TeamManagement AM/PM**

In `pages/admin/TeamManagement.tsx` line 1969, change:

```typescript
                                                                    {unavail.period === Period.MORNING ? 'AM' : 'PM'}
```

to:

```typescript
                                                                    {unavail.period === Period.MORNING ? 'Matin' : 'Après-midi'}
```

- [ ] **Step 3: Commit**

```bash
git add pages/Dashboard.tsx pages/admin/TeamManagement.tsx
git commit -m "fix: correct AM/PM display labels in Dashboard and TeamManagement"
```

---

### Task 6: Fix DOUBLE_BOOKING dedup losing one conflict side

**Files:**
- Modify: `services/scheduleService.ts:1146-1153`

- [ ] **Step 1: Update dedup key for DOUBLE_BOOKING**

In `services/scheduleService.ts`, replace lines 1146-1153:

```typescript
    const dedupMap = new Map<string, Conflict>();
    for (const c of conflicts) {
        const slot = slots.find(s => s.id === c.slotId);
        const key = `${c.type}-${c.doctorId}-${slot?.date ?? 'unknown'}-${slot?.period ?? 'unknown'}`;
        if (!dedupMap.has(key)) {
            dedupMap.set(key, c);
        }
    }
```

with:

```typescript
    const dedupMap = new Map<string, Conflict>();
    for (const c of conflicts) {
        // DOUBLE_BOOKING: use slotId in key so both sides of a conflict pair survive
        // Other types: use date+period to dedup true duplicates (e.g. from duplicate absences)
        const slot = slots.find(s => s.id === c.slotId);
        const key = c.type === 'DOUBLE_BOOKING'
            ? `${c.type}-${c.doctorId}-${c.slotId}`
            : `${c.type}-${c.doctorId}-${slot?.date ?? 'unknown'}-${slot?.period ?? 'unknown'}`;
        if (!dedupMap.has(key)) {
            dedupMap.set(key, c);
        }
    }
```

- [ ] **Step 2: Verify build compiles**

Run: `npm run build 2>&1 | head -20`
Expected: Clean build.

- [ ] **Step 3: Commit**

```bash
git add services/scheduleService.ts
git commit -m "fix: preserve both sides of DOUBLE_BOOKING conflicts in dedup"
```

---

### Task 7: Add Conflicts tab to Profile — state, logic, imports

**Files:**
- Modify: `pages/Profile.tsx:1-18` (imports)
- Modify: `pages/Profile.tsx:220` (tab type)
- Modify: `pages/Profile.tsx:232-238` (add state)

- [ ] **Step 1: Add imports**

In `pages/Profile.tsx`, update the import from `scheduleService` (line 14) to include the needed functions:

```typescript
import { getDateForDayOfWeek, isFrenchHoliday, generateScheduleForWeek, detectConflicts } from '../services/scheduleService';
```

Also add `ConflictResolverModal` import after line 18:

```typescript
import ConflictResolverModal from '../components/ConflictResolverModal';
```

Also add `Conflict, ScheduleSlot` to the types import (line 13) if not already present.

Also add `manualOverrides` and `setManualOverrides` to the context destructuring in the Profile component (line ~193-213). They are needed for conflict resolution via `handleConflictResolve`.

Add `ManualOverrides` to the types import if needed:

```typescript
import { SlotType, Doctor, Period, Specialty, Conflict, ScheduleSlot } from '../types';
```

- [ ] **Step 2: Add 'conflits' to tab type**

In `pages/Profile.tsx` line 220, change:

```typescript
    const [activeTab, setActiveTab] = useState<'notifications' | 'absences' | 'preferences' | 'rcp'>('rcp');
```

to:

```typescript
    const [activeTab, setActiveTab] = useState<'notifications' | 'absences' | 'preferences' | 'rcp' | 'conflits'>('rcp');
```

- [ ] **Step 3: Add conflicts state**

After line 238 (after `absenceConflictModal` state), add:

```typescript
    // Conflicts tab state
    const [conflictsWeekOffset, setConflictsWeekOffset] = useState(0);
    const [conflictModalSlot, setConflictModalSlot] = useState<ScheduleSlot | null>(null);
    const [conflictModalConflict, setConflictModalConflict] = useState<Conflict | null>(null);
```

- [ ] **Step 4: Commit**

```bash
git add pages/Profile.tsx
git commit -m "feat(profile): add conflicts tab state and imports"
```

---

### Task 8: Add Conflicts tab — detection logic and schedule

**Files:**
- Modify: `pages/Profile.tsx` (add useMemo after existing hooks, ~line 318)

- [ ] **Step 1: Add conflict detection useMemo and schedule ref**

After the `useEffect` block that updates `currentDoctor` (after line 318), add:

```typescript
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
        // Use manualOverrides to persist the resolution (same mechanism as Dashboard)
        // This works regardless of which week's schedule generated the slot
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
```

- [ ] **Step 2: Verify build compiles**

Run: `npm run build 2>&1 | head -20`
Expected: Clean build (logic added but not rendered yet, no unused warnings for useMemo).

- [ ] **Step 3: Commit**

```bash
git add pages/Profile.tsx
git commit -m "feat(profile): add conflict detection logic for conflicts tab"
```

---

### Task 9: Add Conflicts tab — UI rendering

**Files:**
- Modify: `pages/Profile.tsx:824-858` (add tab button)
- Modify: `pages/Profile.tsx` after last `activeTab ===` block (add tab content)

- [ ] **Step 1: Add tab button**

In `pages/Profile.tsx`, after the "Préférences" tab button (after line 857, before the closing `</div>` of tab navigation), add:

```typescript
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
```

- [ ] **Step 2: Add tab content**

After the last `{activeTab === 'preferences' && ( ... )}` block (before the closing `</div>` of tab content), add:

```typescript
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
```

- [ ] **Step 3: Add ConflictResolverModal rendering**

At the end of the Profile component, just before the final closing `</div>` and after the `AbsenceConflictsModal`, add:

```typescript
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
```

- [ ] **Step 4: Verify build compiles**

Run: `npm run build 2>&1 | head -20`
Expected: Clean build.

- [ ] **Step 5: Commit**

```bash
git add pages/Profile.tsx
git commit -m "feat(profile): add Conflicts tab with week navigation and resolution modal"
```

---

### Task 10: ConflictResolverModal — separate referent vs exceptional doctors

**Files:**
- Modify: `components/ConflictResolverModal.tsx:24` (add rcpTypes to destructuring)
- Modify: `components/ConflictResolverModal.tsx:389-422` (REQUEST mode doctor list)
- Modify: `components/ConflictResolverModal.tsx:425-462` (DIRECT mode select)

- [ ] **Step 1: Add `rcpTypes` to context destructuring**

In `components/ConflictResolverModal.tsx` line 24, change:

```typescript
    const { effectiveHistory, activityDefinitions, rcpAttendance, setRcpAttendance } = useContext(AppContext);
```

to:

```typescript
    const { effectiveHistory, activityDefinitions, rcpAttendance, setRcpAttendance, rcpTypes } = useContext(AppContext);
```

- [ ] **Step 2: Add referent doctor computation**

After line 38 (`const isRcpConflict = ...`), add:

```typescript
    // Compute referent doctor IDs from the RCP definition (not from slot.doctorIds which may be stale)
    const referentDoctorIds = useMemo(() => {
        if (!isRcpConflict) return new Set<string>();
        const rcpDef = rcpTypes.find(r => r.name === slot.location);
        if (!rcpDef) return new Set<string>();
        return new Set<string>([
            ...(rcpDef.doctorIds || []),
            ...(rcpDef.secondaryDoctorIds || []),
            ...(rcpDef.backupDoctorId ? [rcpDef.backupDoctorId] : []),
        ].filter(Boolean));
    }, [isRcpConflict, rcpTypes, slot.location]);
```

- [ ] **Step 3: Replace REQUEST mode doctor list (lines 403-419)**

In `components/ConflictResolverModal.tsx`, replace the REQUEST mode doctor list. Find the block:

```typescript
                                        <div className="space-y-2">
                                            {doctors.filter(d => d.id !== assignedDoctor?.id).map(doc => (
                                                <div key={doc.id} className="flex items-center justify-between p-2.5 bg-white border border-slate-200 rounded-lg hover:border-blue-300 transition">
                                                    <span className="text-sm font-medium text-slate-700">{doc.name}</span>
                                                    {/* flag exceptional */}
                                                    {!slot.doctorIds?.includes(doc.id) && (
                                                        <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full border border-amber-200 mr-2">Exceptionnel</span>
                                                    )}
                                                    <button
                                                        onClick={() => handleRequestReplacement(doc.id)}
                                                        disabled={sendingRequestTo === doc.id}
                                                        className="text-xs bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg hover:bg-blue-200 disabled:opacity-50 font-medium"
                                                    >
                                                        {sendingRequestTo === doc.id ? 'Envoi…' : 'Demander'}
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
```

Replace with:

```typescript
                                        <div className="space-y-2">
                                            {/* Referent doctors first */}
                                            {doctors.filter(d => d.id !== assignedDoctor?.id && referentDoctorIds.has(d.id)).length > 0 && (
                                                <div className="mb-1">
                                                    <p className="text-[10px] uppercase font-bold text-green-700 mb-1.5">
                                                        Médecins référents ({doctors.filter(d => d.id !== assignedDoctor?.id && referentDoctorIds.has(d.id)).length})
                                                    </p>
                                                    {doctors.filter(d => d.id !== assignedDoctor?.id && referentDoctorIds.has(d.id)).map(doc => (
                                                        <div key={doc.id} className="flex items-center justify-between p-2.5 bg-white border border-green-200 rounded-lg hover:border-green-400 transition mb-1.5">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-sm font-medium text-slate-700">{doc.name}</span>
                                                                <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full border border-green-200">Référent</span>
                                                            </div>
                                                            <button
                                                                onClick={() => handleRequestReplacement(doc.id)}
                                                                disabled={sendingRequestTo === doc.id}
                                                                className="text-xs bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg hover:bg-blue-200 disabled:opacity-50 font-medium"
                                                            >
                                                                {sendingRequestTo === doc.id ? 'Envoi…' : 'Demander'}
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                            {/* Exceptional doctors */}
                                            {doctors.filter(d => d.id !== assignedDoctor?.id && !referentDoctorIds.has(d.id)).length > 0 && (
                                                <div>
                                                    <p className="text-[10px] uppercase font-bold text-amber-700 mb-1.5">
                                                        Autres médecins — sélection exceptionnelle ({doctors.filter(d => d.id !== assignedDoctor?.id && !referentDoctorIds.has(d.id)).length})
                                                    </p>
                                                    {doctors.filter(d => d.id !== assignedDoctor?.id && !referentDoctorIds.has(d.id)).map(doc => (
                                                        <div key={doc.id} className="flex items-center justify-between p-2.5 bg-white border border-amber-200 rounded-lg hover:border-amber-400 transition mb-1.5">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-sm font-medium text-slate-700">{doc.name}</span>
                                                                <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full border border-amber-200">Exceptionnel</span>
                                                            </div>
                                                            <button
                                                                onClick={() => handleRequestReplacement(doc.id)}
                                                                disabled={sendingRequestTo === doc.id}
                                                                className="text-xs bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg hover:bg-blue-200 disabled:opacity-50 font-medium"
                                                            >
                                                                {sendingRequestTo === doc.id ? 'Envoi…' : 'Demander'}
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
```

- [ ] **Step 4: Replace DIRECT mode select (lines 434-448)**

Find the DIRECT mode `<select>` block:

```typescript
                                    <select
                                        className="w-full text-sm border-slate-300 rounded-lg shadow-sm focus:border-green-500 focus:ring-1 focus:ring-green-500 p-2.5 mb-3"
                                        value={rcpDirectDoctorId}
                                        onChange={e => setRcpDirectDoctorId(e.target.value)}
                                    >
                                        <option value="">-- Choisir un médecin --</option>
                                        {doctors.filter(d => d.id !== assignedDoctor?.id).map(doc => {
                                            const exceptional = !slot.doctorIds?.includes(doc.id);
                                            return (
                                                <option key={doc.id} value={doc.id}>
                                                    {exceptional ? '⚠️ ' : '✓ '}{doc.name}{exceptional ? ' (remplacement exceptionnel)' : ''}
                                                </option>
                                            );
                                        })}
                                    </select>
```

Replace with:

```typescript
                                    <select
                                        className="w-full text-sm border-slate-300 rounded-lg shadow-sm focus:border-green-500 focus:ring-1 focus:ring-green-500 p-2.5 mb-3"
                                        value={rcpDirectDoctorId}
                                        onChange={e => setRcpDirectDoctorId(e.target.value)}
                                    >
                                        <option value="">-- Choisir un médecin --</option>
                                        {referentDoctorIds.size > 0 && (
                                            <optgroup label="Médecins référents">
                                                {doctors.filter(d => d.id !== assignedDoctor?.id && referentDoctorIds.has(d.id)).map(doc => (
                                                    <option key={doc.id} value={doc.id}>
                                                        ✓ {doc.name}
                                                    </option>
                                                ))}
                                            </optgroup>
                                        )}
                                        <optgroup label="Autres — sélection exceptionnelle">
                                            {doctors.filter(d => d.id !== assignedDoctor?.id && !referentDoctorIds.has(d.id)).map(doc => (
                                                <option key={doc.id} value={doc.id}>
                                                    ⚠️ {doc.name} (exceptionnel)
                                                </option>
                                            ))}
                                        </optgroup>
                                    </select>
```

- [ ] **Step 5: Update the exceptional warning check to use referentDoctorIds**

Find line 449:

```typescript
                                    {rcpDirectDoctorId && !slot.doctorIds?.includes(rcpDirectDoctorId) && (
```

Replace with:

```typescript
                                    {rcpDirectDoctorId && !referentDoctorIds.has(rcpDirectDoctorId) && (
```

- [ ] **Step 6: Verify build compiles**

Run: `npm run build 2>&1 | head -20`
Expected: Clean build.

- [ ] **Step 7: Commit**

```bash
git add components/ConflictResolverModal.tsx
git commit -m "feat(rcp): separate referent vs exceptional doctors in replacement modal"
```

---

### Task 11: Profile RCP tab — show exceptional RCPs via rcpAttendance

**Files:**
- Modify: `pages/Profile.tsx:321-448` (getUpcomingRcps function)

- [ ] **Step 1: Add exceptional RCP detection in getUpcomingRcps**

In `pages/Profile.tsx`, find the `getUpcomingRcps` function. At the end, just before the final `return [...standardRcps, ...manualRcps].sort(...)` (line 447), add a third source of RCPs — exceptional ones from `rcpAttendance`:

```typescript
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
```

**Important**:
1. Update the existing `return` statement on line 447: replace `[...standardRcps, ...manualRcps]` with `[...standardRcps, ...manualRcps, ...exceptionalRcps]` (already done in the code above).
2. Add `isExceptional: false` to the return object in `standardRcps` (line ~386, after `isManual: false`) and `manualRcps` (line ~443, after `isManual: true`) so TypeScript types are consistent across all three arrays.

- [ ] **Step 2: Add "Exceptionnel" badge in RCP card rendering**

Find the RCP card rendering in the RCP tab content (search for `{activeTab === 'rcp'`). In the card where the RCP name/location is shown, add a badge for exceptional RCPs. After the RCP location/name text, add:

```typescript
                                                {rcp.isExceptional && (
                                                    <span className="ml-2 text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full border border-amber-200 font-bold">
                                                        Exceptionnel
                                                    </span>
                                                )}
```

The exact insertion point is next to where `rcp.template.location` or the RCP name is displayed in the card.

- [ ] **Step 3: Verify build compiles**

Run: `npm run build 2>&1 | head -20`
Expected: Clean build.

- [ ] **Step 4: Commit**

```bash
git add pages/Profile.tsx
git commit -m "feat(profile): show exceptional RCPs in RCP tab with badge"
```

---

### Task 12: Final build verification

**Files:** None (verification only)

- [ ] **Step 1: Full build**

Run: `npm run build`
Expected: Clean build, no errors, no warnings about unused variables.

- [ ] **Step 2: Dev server smoke test**

Run: `npm run dev`
Open browser, verify:
1. Dashboard → navigate weeks → conflicts don't accumulate
2. Dashboard → AM/PM labels are correct ("Matin" / "Après-midi")
3. Profile → Conflicts tab shows with badge count
4. Profile → Conflicts tab → click a conflict → ConflictResolverModal opens
5. Profile → RCP tab → exceptional RCPs show with "Exceptionnel" badge
6. ConflictResolverModal (RCP) → doctors split into "Référents" and "Exceptionnels"
7. TeamManagement → add an absence → check DB only has 1 entry (not 2)

- [ ] **Step 3: Final commit (if any cleanup needed)**

```bash
git add -A
git commit -m "chore: final cleanup after duplicate fix and conflicts tab implementation"
```

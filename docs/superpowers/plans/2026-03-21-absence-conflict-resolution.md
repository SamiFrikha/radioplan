# Absence Conflict Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a doctor declares an absence (congé/indisponibilité), immediately show them all their scheduled commitments during that period and let them resolve each conflict (find replacement or close slot) before finishing.

**Architecture:** After saving the unavailability, compute conflicting slots from the weekly template + activities for each date in the absence range. Display an `AbsenceConflictsModal` listing all affected slots grouped by date. Each slot is clickable and opens the existing `ConflictResolverModal` for resolution. The doctor can resolve all, some, or skip.

**Tech Stack:** React, existing AppContext (template, doctors, unavailabilities, activityDefinitions, shiftHistory), existing ConflictResolverModal.

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `components/AbsenceConflictsModal.tsx` | **Create** | Modal listing all conflicting slots for an absence period, with resolve/close actions per slot |
| `pages/Profile.tsx` | **Modify** | Wire up the new modal after `handleAddUnavailability`, add state + context values |

## Context: Key Existing Code

- **`handleAddUnavailability`** (`pages/Profile.tsx:518-544`): Current handler that saves absence and resets form. We add conflict detection AFTER save.
- **`ConflictResolverModal`** (`components/ConflictResolverModal.tsx`): Existing modal that shows replacement suggestions (algorithmic + manual) and "close slot" action. We reuse it per-conflict.
- **`ScheduleTemplateSlot`** (`types.ts:101-116`): Weekly blueprint with `day`, `period`, `defaultDoctorId`, `secondaryDoctorIds`, `doctorIds`, `type`, `location`, `subType`.
- **`AppContext`** (`types.ts:250-309`): Provides `template`, `doctors`, `unavailabilities`, `activityDefinitions`, `shiftHistory`, `effectiveHistory`, `updateSchedule`, `schedule`.
- **`generateScheduleForWeek`** (`services/scheduleService.ts:650-942`): Generates dated `ScheduleSlot[]` from template + unavailabilities for a given Monday.
- **`isAbsent`** (`services/scheduleService.ts:12-22`): Checks if doctor is absent for date/period.
- **`getAvailableDoctors`** (`services/scheduleService.ts:1144-1173`): Returns available doctors for a slot.

---

### Task 1: Create AbsenceConflictsModal Component

**Files:**
- Create: `components/AbsenceConflictsModal.tsx`

- [ ] **Step 1: Create the component file with types and basic structure**

The component receives the absence date range, period, doctor, and app context data. It computes conflicting slots by scanning the template for each date in the range.

```tsx
// components/AbsenceConflictsModal.tsx
import React, { useState, useMemo } from 'react';
import { Calendar, AlertTriangle, UserPlus, XCircle, CheckCircle2, ChevronRight } from 'lucide-react';
import { ScheduleTemplateSlot, ScheduleSlot, Doctor, ActivityDefinition, Unavailability, Conflict, Period, ShiftHistory } from '../types';
import { generateScheduleForWeek } from '../services/scheduleService';
import ConflictResolverModal from './ConflictResolverModal';

interface AbsenceConflictsModalProps {
  doctorId: string;
  doctorName: string;
  startDate: string;        // ISO YYYY-MM-DD
  endDate: string;          // ISO YYYY-MM-DD
  period: 'ALL_DAY' | Period;
  doctors: Doctor[];
  template: ScheduleTemplateSlot[];
  unavailabilities: Unavailability[];
  activityDefinitions: ActivityDefinition[];
  shiftHistory: ShiftHistory;
  rcpTypes: any[];
  rcpAttendance: any;
  rcpExceptions: any[];
  onResolve: (slotId: string, newDoctorId: string) => void;
  onCloseSlot: (slotId: string) => void;
  onDismiss: () => void;
}
```

- [ ] **Step 2: Implement the conflict computation logic**

For each Monday in the absence date range, call `generateScheduleForWeek()` to get actual slots. Then filter for slots where the doctor is assigned and the date/period overlap with the absence.

```tsx
// Inside the component:
const conflictingSlots = useMemo(() => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const allSlots: ScheduleSlot[] = [];

  // Find all Mondays that cover the absence range
  const firstMonday = new Date(start);
  const dayOfWeek = firstMonday.getDay();
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  firstMonday.setDate(firstMonday.getDate() + diff);

  const lastMonday = new Date(end);
  const dayOfWeek2 = lastMonday.getDay();
  const diff2 = dayOfWeek2 === 0 ? -6 : 1 - dayOfWeek2;
  lastMonday.setDate(lastMonday.getDate() + diff2);

  for (let monday = new Date(firstMonday); monday <= lastMonday; monday.setDate(monday.getDate() + 7)) {
    const weekSlots = generateScheduleForWeek(
      new Date(monday), template, unavailabilities, doctors,
      activityDefinitions, rcpTypes, false, shiftHistory, rcpAttendance, rcpExceptions
    );
    allSlots.push(...weekSlots);
  }

  // Filter: slots assigned to this doctor within the absence date range and period
  return allSlots.filter(slot => {
    const slotDate = new Date(slot.date);
    if (slotDate < start || slotDate > end) return false;

    // Check period overlap
    if (period !== 'ALL_DAY' && slot.period !== period) return false;

    // Check if doctor is assigned (primary, secondary, or in doctorIds)
    const isPrimary = slot.assignedDoctorId === doctorId;
    const isSecondary = slot.secondaryDoctorIds?.includes(doctorId);
    return isPrimary || isSecondary;
  }).filter(slot => !slot.isClosed && !slot.isCancelled)
    .sort((a, b) => a.date.localeCompare(b.date) || a.period.localeCompare(b.period));
}, [startDate, endDate, period, doctorId, template, unavailabilities, doctors, activityDefinitions, rcpTypes, shiftHistory, rcpAttendance, rcpExceptions]);
```

- [ ] **Step 3: Implement the modal UI with conflict list**

Group conflicts by date. Each row shows: date, period, type, location. Clickable to open ConflictResolverModal. Track resolved slots.

```tsx
const [resolvedSlots, setResolvedSlots] = useState<Set<string>>(new Set());
const [activeConflictSlot, setActiveConflictSlot] = useState<ScheduleSlot | null>(null);

// Group by date for display
const groupedByDate = useMemo(() => {
  const groups: Record<string, ScheduleSlot[]> = {};
  for (const slot of conflictingSlots) {
    (groups[slot.date] ??= []).push(slot);
  }
  return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
}, [conflictingSlots]);

const handleResolve = (slotId: string, newDoctorId: string) => {
  onResolve(slotId, newDoctorId);
  setResolvedSlots(prev => new Set(prev).add(slotId));
  setActiveConflictSlot(null);
};

const handleCloseSlot = (slotId: string) => {
  onCloseSlot(slotId);
  setResolvedSlots(prev => new Set(prev).add(slotId));
  setActiveConflictSlot(null);
};
```

- [ ] **Step 4: Implement the full render with styling**

```tsx
const formatDate = (dateStr: string) => {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
};

const slotTypeLabels: Record<string, string> = {
  CONSULTATION: 'Consultation',
  RCP: 'RCP',
  MACHINE: 'Machine',
  ACTIVITY: 'Activité',
  OTHER: 'Autre',
};

// If ConflictResolverModal is open for a specific slot, render it
if (activeConflictSlot) {
  const conflict: Conflict = {
    id: `absence-${activeConflictSlot.id}`,
    slotId: activeConflictSlot.id,
    doctorId: doctorId,
    type: 'UNAVAILABLE',
    description: `${doctorName} est absent(e) — remplacement nécessaire`,
    severity: 'HIGH',
  };

  return (
    <ConflictResolverModal
      slot={activeConflictSlot}
      conflict={conflict}
      doctors={doctors}
      slots={conflictingSlots}
      unavailabilities={unavailabilities}
      onClose={() => setActiveConflictSlot(null)}
      onResolve={handleResolve}
      onCloseSlot={handleCloseSlot}
    />
  );
}

// Main modal: list of conflicting slots
return (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
    <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
      {/* Header */}
      <div className="p-4 border-b bg-amber-50 rounded-t-xl">
        <div className="flex items-center gap-2 text-amber-700">
          <AlertTriangle className="w-5 h-5" />
          <h2 className="font-bold text-lg">Créneaux impactés</h2>
        </div>
        <p className="text-sm text-amber-600 mt-1">
          Vous avez {conflictingSlots.length} créneau{conflictingSlots.length > 1 ? 'x' : ''} pendant votre absence.
          Trouvez un remplaçant ou fermez chaque créneau.
        </p>
      </div>

      {/* Conflict list */}
      <div className="overflow-y-auto flex-1 p-3 space-y-3">
        {conflictingSlots.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-green-500" />
            <p className="font-medium">Aucun créneau impacté</p>
            <p className="text-sm">Vous n'avez aucune activité planifiée pendant cette période.</p>
          </div>
        ) : (
          groupedByDate.map(([date, slots]) => (
            <div key={date}>
              <div className="flex items-center gap-2 mb-1">
                <Calendar className="w-4 h-4 text-blue-500" />
                <span className="text-sm font-semibold text-gray-700 capitalize">{formatDate(date)}</span>
              </div>
              <div className="space-y-1 ml-6">
                {slots.map(slot => {
                  const isResolved = resolvedSlots.has(slot.id);
                  return (
                    <button
                      key={slot.id}
                      onClick={() => !isResolved && setActiveConflictSlot(slot)}
                      disabled={isResolved}
                      className={`w-full text-left flex items-center justify-between p-2 rounded-lg border transition-colors ${
                        isResolved
                          ? 'bg-green-50 border-green-200 opacity-60'
                          : 'bg-white border-gray-200 hover:bg-blue-50 hover:border-blue-300 cursor-pointer'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          slot.period === 'Matin' ? 'bg-yellow-100 text-yellow-700' : 'bg-orange-100 text-orange-700'
                        }`}>
                          {slot.period}
                        </span>
                        <span className="text-sm font-medium text-gray-800">
                          {slotTypeLabels[slot.type] || slot.type}
                        </span>
                        {slot.location && (
                          <span className="text-xs text-gray-500">— {slot.location}</span>
                        )}
                        {slot.subType && (
                          <span className="text-xs text-gray-400">({slot.subType})</span>
                        )}
                      </div>
                      {isResolved ? (
                        <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t bg-gray-50 rounded-b-xl flex justify-between items-center">
        <span className="text-xs text-gray-500">
          {resolvedSlots.size}/{conflictingSlots.length} résolu{resolvedSlots.size > 1 ? 's' : ''}
        </span>
        <button
          onClick={onDismiss}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
        >
          {conflictingSlots.length === 0 || resolvedSlots.size === conflictingSlots.length ? 'Terminé' : 'Passer pour le moment'}
        </button>
      </div>
    </div>
  </div>
);
```

- [ ] **Step 5: Export the component**

Wrap everything in `export default AbsenceConflictsModal` and ensure all imports are correct.

---

### Task 2: Wire Up Modal in Profile.tsx

**Files:**
- Modify: `pages/Profile.tsx:192-208` (add destructured context values)
- Modify: `pages/Profile.tsx:214-224` (add state)
- Modify: `pages/Profile.tsx:518-544` (modify handleAddUnavailability)
- Modify: `pages/Profile.tsx` (add modal render before closing `</div>`)

- [ ] **Step 1: Add imports and state**

At top of Profile.tsx, add import:
```tsx
import AbsenceConflictsModal from '../components/AbsenceConflictsModal';
```

In the `useContext(AppContext)` destructuring (line 192-208), add:
```tsx
shiftHistory,
effectiveHistory,
updateSchedule,
schedule,
```

After existing state declarations (around line 224), add:
```tsx
const [absenceConflictModal, setAbsenceConflictModal] = useState<{
    startDate: string;
    endDate: string;
    period: 'ALL_DAY' | Period;
} | null>(null);
```

- [ ] **Step 2: Modify handleAddUnavailability to show modal after save**

After saving the unavailability (line 536), instead of just resetting the form, trigger the conflict modal:

```tsx
const handleAddUnavailability = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentDoctor) return;

    const confirmMessage = `...`; // existing
    if (!window.confirm(confirmMessage)) return;

    // Save the absence dates BEFORE resetting form
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
    setStartDate(new Date().toISOString().split('T')[0]);
    setEndDate(new Date().toISOString().split('T')[0]);
    setAbsencePeriod('ALL_DAY');
    setReason('CONGRES');

    // Show conflict resolution modal
    setAbsenceConflictModal({
        startDate: savedStartDate,
        endDate: savedEndDate,
        period: savedPeriod,
    });
};
```

- [ ] **Step 3: Add resolution handlers**

Add handlers for when the doctor resolves a conflict from the modal:

```tsx
const handleAbsenceConflictResolve = (slotId: string, newDoctorId: string) => {
    // Update the schedule: replace doctor in the slot
    const updatedSchedule = schedule.map(s =>
        s.id === slotId ? { ...s, assignedDoctorId: newDoctorId } : s
    );
    updateSchedule(updatedSchedule);
};

const handleAbsenceConflictClose = (slotId: string) => {
    // Close the slot
    const updatedSchedule = schedule.map(s =>
        s.id === slotId ? { ...s, isClosed: true, assignedDoctorId: null } : s
    );
    updateSchedule(updatedSchedule);
};
```

- [ ] **Step 4: Render the modal**

At the end of the Profile component JSX (before the final closing `</div>`), add:

```tsx
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
```

- [ ] **Step 5: Verify dev server renders correctly**

Run the dev server and verify:
1. Navigate to Profile → Absences tab
2. The form still works
3. No console errors
4. Build succeeds: `npm run build`

- [ ] **Step 6: Commit**

```bash
git add components/AbsenceConflictsModal.tsx pages/Profile.tsx
git commit -m "feat: prompt doctor to resolve conflicts when declaring absence"
```

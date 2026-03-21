# RadioPlan — 4 Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement 4 features: (1) full availability check in ConflictResolverModal, (2) per-type push notification preferences in Profile, (3) accept replacement → auto-assign doctor to slot, (4) Mon Planning RCP status indicator (à confirmer / confirmé).

**Architecture:** React 19 + Supabase (Postgres + RLS). State is managed via AppContext (App.tsx). Manual overrides are persisted as JSONB in a `settings` table via `settingsService.update()`. Notifications are stored in a `notifications` table and pushed via Edge Functions.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, Supabase JS, Lucide React icons, Vite

---

## File Map

| File | Change |
|------|--------|
| `components/ConflictResolverModal.tsx` | Pass `slot.type` to `getAvailableDoctors` |
| `pages/Profile.tsx` | Add per-type notification preference toggles; fix `handleReplacement` to also assign doctor |
| `services/replacementService.ts` | New `acceptAndAssignReplacement()` function |
| `services/settingsService.ts` | Read to understand update API |
| `components/PersonalAgendaWeek.tsx` | Add ⚠️ icon for unconfirmed RCP, green border for confirmed |
| `supabase/migrations/YYYYMMDD_notification_prefs.sql` | Add `notification_preferences` JSONB column to `profiles` |

---

## Task 1 — Fix availability check in ConflictResolverModal

**Files:**
- Modify: `components/ConflictResolverModal.tsx` line 68

**Context:**
`getAvailableDoctors(doctors, slots, unavailabilities, slot.day, slot.period, slot.date)` is called WITHOUT `slot.type`. This means:
- Doctors who have excluded the RCP slot type (`doc.excludedSlotTypes`) are NOT filtered out
- The function already handles consultations, activities, unavailabilities and other RCPs via the `isBusy` check (line 1180-1186 of scheduleService.ts)

The fix is a one-liner: pass `slot.type` as the 6th argument.

- [ ] **Step 1: Edit ConflictResolverModal.tsx**

Find this code (line ~68):
```typescript
const avail = getAvailableDoctors(doctors, slots, unavailabilities, slot.day, slot.period, slot.date);
```
Replace with:
```typescript
const avail = getAvailableDoctors(doctors, slots, unavailabilities, slot.day, slot.period, slot.date, slot.type);
```

- [ ] **Step 2: Verify build passes**
```bash
npm run build 2>&1 | tail -5
```
Expected: `✓ built in Xs`

- [ ] **Step 3: Commit**
```bash
git add components/ConflictResolverModal.tsx
git commit -m "fix(availability): pass slot.type to getAvailableDoctors in ConflictResolverModal"
```

---

## Task 2 — Supabase migration: notification_preferences column

**Files:**
- Create: `supabase/migrations/20260321_notification_prefs.sql`

**Context:**
We need to store per-user, per-type push notification preferences. Adding a `notification_preferences` JSONB column to `profiles` is the simplest approach — no new table, RLS already covers profiles.

Default value: all enabled (`{}`). A missing key = enabled.

- [ ] **Step 1: Create migration file**

```sql
-- supabase/migrations/20260321_notification_prefs.sql
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notification_preferences jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.profiles.notification_preferences IS
  'Map of NotificationType → boolean. Missing key = true (enabled by default).
   Example: {"RCP_REMINDER_24H": false, "REPLACEMENT_REQUEST": true}';
```

- [ ] **Step 2: Apply migration via MCP**

Use `mcp__9f8933f6-9215-46da-8131-3fb6418e9aa0__apply_migration` with the SQL above.

- [ ] **Step 3: Verify column exists**

Use `mcp__9f8933f6-9215-46da-8131-3fb6418e9aa0__execute_sql`:
```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'profiles' AND column_name = 'notification_preferences';
```
Expected: 1 row, `jsonb`, default `'{}'`.

- [ ] **Step 4: Commit migration file**
```bash
git add supabase/migrations/20260321_notification_prefs.sql
git commit -m "feat(db): add notification_preferences jsonb column to profiles"
```

---

## Task 3 — Add useNotificationPreferences hook

**Files:**
- Create: `hooks/useNotificationPreferences.ts`

**Context:**
This hook reads/writes `notification_preferences` for the current user via the `profiles` table.

- [ ] **Step 1: Create the hook**

```typescript
// hooks/useNotificationPreferences.ts
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';
import { NotificationType } from '../types';

// Human-readable labels for each notification type
export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  RCP_REMINDER_24H:    'Rappel RCP 24h avant',
  RCP_REMINDER_12H:    'Rappel RCP 12h avant',
  RCP_AUTO_ASSIGNED:   'Affectation automatique RCP',
  RCP_SLOT_FILLED:     'RCP créneau pourvu',
  RCP_UNASSIGNED_ALERT:'Alerte RCP non assignée',
  REPLACEMENT_REQUEST: 'Demande de remplacement reçue',
  REPLACEMENT_ACCEPTED:'Remplacement accepté',
  REPLACEMENT_REJECTED:'Remplacement refusé',
};

export const ALL_NOTIFICATION_TYPES: NotificationType[] = [
  'REPLACEMENT_REQUEST',
  'REPLACEMENT_ACCEPTED',
  'REPLACEMENT_REJECTED',
  'RCP_REMINDER_24H',
  'RCP_REMINDER_12H',
  'RCP_AUTO_ASSIGNED',
  'RCP_SLOT_FILLED',
  'RCP_UNASSIGNED_ALERT',
];

interface UseNotificationPreferencesResult {
  prefs: Record<string, boolean>;    // type → enabled
  isEnabled: (type: NotificationType) => boolean;
  toggle: (type: NotificationType) => Promise<void>;
  loading: boolean;
}

export function useNotificationPreferences(userId: string | undefined): UseNotificationPreferencesResult {
  const [prefs, setPrefs] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    supabase
      .from('profiles')
      .select('notification_preferences')
      .eq('id', userId)
      .single()
      .then(({ data }) => {
        if (data?.notification_preferences) {
          setPrefs(data.notification_preferences as Record<string, boolean>);
        }
      })
      .finally(() => setLoading(false));
  }, [userId]);

  const isEnabled = useCallback(
    (type: NotificationType) => prefs[type] !== false, // default true
    [prefs]
  );

  const toggle = useCallback(async (type: NotificationType) => {
    if (!userId) return;
    const newPrefs = { ...prefs, [type]: !isEnabled(type) };
    setPrefs(newPrefs);
    await supabase
      .from('profiles')
      .update({ notification_preferences: newPrefs })
      .eq('id', userId);
  }, [userId, prefs, isEnabled]);

  return { prefs, isEnabled, toggle, loading };
}
```

- [ ] **Step 2: Verify TypeScript compiles**
```bash
npm run build 2>&1 | tail -5
```

- [ ] **Step 3: Commit**
```bash
git add hooks/useNotificationPreferences.ts
git commit -m "feat(hooks): add useNotificationPreferences hook"
```

---

## Task 4 — Add notification preference toggles in Profile.tsx

**Files:**
- Modify: `pages/Profile.tsx`

**Context:**
In `NotificationSection`, after the push enable/disable block (currently lines 78-116), add a list of per-type toggles. Import and use `useNotificationPreferences`.

- [ ] **Step 1: Add import at top of Profile.tsx**

After the existing imports, add:
```typescript
import { useNotificationPreferences, ALL_NOTIFICATION_TYPES, NOTIFICATION_TYPE_LABELS } from '../hooks/useNotificationPreferences';
```

- [ ] **Step 2: Add hook call inside NotificationSection component**

Inside `NotificationSection`, after the `usePushNotifications` call (line ~40), add:
```typescript
const { isEnabled, toggle, loading: prefsLoading } = useNotificationPreferences(userId);
```

- [ ] **Step 3: Add toggle UI after the push enable/disable block**

After the `{pushError && ...}` block (around line 116), insert:
```tsx
{/* Per-type notification preferences */}
{permission === 'granted' && (
  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
      Types de notifications push
    </p>
    {ALL_NOTIFICATION_TYPES.map(type => (
      <div key={type} className="flex items-center justify-between">
        <span className="text-sm text-slate-700">{NOTIFICATION_TYPE_LABELS[type]}</span>
        <button
          disabled={prefsLoading}
          onClick={() => toggle(type)}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none
            ${isEnabled(type) ? 'bg-blue-600' : 'bg-slate-300'}`}
        >
          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform
            ${isEnabled(type) ? 'translate-x-4' : 'translate-x-0.5'}`} />
        </button>
      </div>
    ))}
  </div>
)}
```

> Note: Toggles only show when push is `granted`. If not granted, the top section already explains how to enable.

- [ ] **Step 4: Build and verify**
```bash
npm run build 2>&1 | tail -5
```

- [ ] **Step 5: Commit**
```bash
git add pages/Profile.tsx
git commit -m "feat(profile): add per-type push notification preference toggles"
```

---

## Task 5 — acceptAndAssignReplacement in replacementService.ts

**Files:**
- Modify: `services/replacementService.ts`

**Context:**
Currently `resolveReplacementRequest` only updates the `replacement_requests.status` — it does NOT update the actual schedule assignment. We need a new function that:
1. Marks the request as ACCEPTED
2. Updates the settings `manualOverrides` so the accepting doctor is assigned to the slot
3. For RCP slots: also upserts `rcp_attendance` with status PRESENT

The `manualOverrides` is stored in a `settings` table (a JSONB settings record). The key is the `slot_id` and value is the doctor's ID.

First, we need to understand the settingsService API. Based on App.tsx: `settingsService.update({ manualOverrides: overrides })` does a full replace.

For a targeted slot override without a full reload, we can do a Supabase RPC or just do a JSONB merge directly.

- [ ] **Step 1: Add helper to read current manualOverrides from settings**

The settings table structure: there's one row per organization (or a single global row). Read it to get current overrides, merge the new one, then update.

Add to `services/replacementService.ts`:

```typescript
// services/replacementService.ts (additions)

/**
 * Accepts a replacement request AND directly assigns the target doctor to the slot.
 * - Updates replacement_requests.status = 'ACCEPTED'
 * - Upserts the slot assignment in settings.manualOverrides
 * - For RCP slots: upserts rcp_attendance
 */
export const acceptAndAssignReplacement = async (
  requestId: string,
  slotId: string,
  targetDoctorId: string,
  slotType?: string,
): Promise<ReplacementRequest> => {
  // 1. Mark request as accepted
  const resolved = await resolveReplacementRequest(requestId, 'ACCEPTED');

  // 2. Merge slotId → targetDoctorId into settings.manualOverrides
  const { data: settings, error: settingsErr } = await supabase
    .from('settings')
    .select('id, manual_overrides')
    .limit(1)
    .single();
  if (settingsErr) throw settingsErr;

  const currentOverrides: Record<string, string> = settings.manual_overrides ?? {};
  const newOverrides = { ...currentOverrides, [slotId]: targetDoctorId };

  const { error: updateErr } = await supabase
    .from('settings')
    .update({ manual_overrides: newOverrides })
    .eq('id', settings.id);
  if (updateErr) throw updateErr;

  // 3. For RCP slots: upsert rcp_attendance as PRESENT
  if (slotType === 'RCP') {
    const { error: attErr } = await supabase
      .from('rcp_attendance')
      .upsert(
        { slot_id: slotId, doctor_id: targetDoctorId, status: 'PRESENT' },
        { onConflict: 'slot_id,doctor_id' }
      );
    if (attErr) console.warn('rcp_attendance upsert failed:', attErr);
  }

  return resolved;
};
```

> **Important:** Check actual column name in `settings` table. The app uses `manualOverrides` as JS key but the DB column may be `manual_overrides` (snake_case) or stored inside a `data` JSONB blob. Read `services/settingsService.ts` before implementing to get exact column name.

- [ ] **Step 2: Read settingsService.ts to verify column names**

```bash
cat services/settingsService.ts
```
Adapt the column name in `acceptAndAssignReplacement` accordingly.

- [ ] **Step 3: Build to verify types**
```bash
npm run build 2>&1 | tail -5
```

- [ ] **Step 4: Commit**
```bash
git add services/replacementService.ts
git commit -m "feat(replacement): add acceptAndAssignReplacement that also updates slot assignment"
```

---

## Task 6 — Wire accept replacement in Profile.tsx

**Files:**
- Modify: `pages/Profile.tsx`

**Context:**
Replace `resolveReplacementRequest` call in `handleReplacement` with `acceptAndAssignReplacement` when status is ACCEPTED. Also need to refresh `manualOverrides` in AppContext so the Dashboard/Planning instantly reflects the change.

- [ ] **Step 1: Import acceptAndAssignReplacement**

In Profile.tsx, change the import line:
```typescript
import { resolveReplacementRequest } from '../services/replacementService';
```
To:
```typescript
import { resolveReplacementRequest, acceptAndAssignReplacement } from '../services/replacementService';
```

- [ ] **Step 2: Add AppContext consumption in NotificationSection**

`NotificationSection` currently receives `userId` and `currentDoctorName` as props. We need to also pass `setManualOverrides` from AppContext so we can refresh local state. Add it as a prop:

In the `NotificationSection` props interface, add:
```typescript
onAssigned?: (slotId: string, doctorId: string) => void;
```

In the Profile component, pass it:
```tsx
<NotificationSection
  ...existing props...
  onAssigned={(slotId, doctorId) => {
    const newOverrides = { ...manualOverrides, [slotId]: doctorId };
    setManualOverrides(newOverrides);
  }}
/>
```

- [ ] **Step 3: Update handleReplacement logic**

```typescript
const handleReplacement = async (n: any, status: 'ACCEPTED' | 'REJECTED') => {
    const requestId = n.data?.requestId as string | undefined;
    const slotId = n.data?.slotId as string | undefined;
    const slotType = n.data?.slotType as string | undefined;
    if (!requestId) return;
    setActionLoading(requestId);
    try {
        let resolved;
        if (status === 'ACCEPTED' && slotId) {
            // Use the enriched function that also assigns the doctor
            resolved = await acceptAndAssignReplacement(requestId, slotId, profile?.doctor_id ?? '', slotType);
            // Refresh local AppContext overrides
            onAssigned?.(slotId, profile?.doctor_id ?? '');
        } else {
            resolved = await resolveReplacementRequest(requestId, status);
        }
        // ...rest of notification sending (unchanged)
    }
    // ...
};
```

> **Note:** `profile?.doctor_id` here is the TARGET doctor (the one accepting). This is correct: the person reading this notification IS the replacement target.

- [ ] **Step 4: Ensure slotType is stored in replacement_requests.data**

Check what `data` field is stored in the notification when a REPLACEMENT_REQUEST is created (in ConflictResolverModal.tsx `handleRequestReplacement`). If `slotType` is not in `data`, add it:

In ConflictResolverModal.tsx where `createNotification` is called for REPLACEMENT_REQUEST, add `slotType: effectiveSlot.type` to the data object.

Also update `sendReplacementRequest` or store `slot_type` in `replacement_requests` table if needed — OR just store it in the notification data (simplest).

- [ ] **Step 5: Build**
```bash
npm run build 2>&1 | tail -5
```

- [ ] **Step 6: Commit**
```bash
git add pages/Profile.tsx components/ConflictResolverModal.tsx
git commit -m "feat(replacement): accept replacement directly assigns doctor to slot"
```

---

## Task 7 — Mon Planning: RCP status indicator

**Files:**
- Modify: `components/PersonalAgendaWeek.tsx`

**Context:**
Currently all RCP slots show with violet styling, no status distinction. We need:
- `slot.isUnconfirmed === true` → keep violet bg + add ⚠️ triangle icon (AlertTriangle from lucide-react)
- RCP confirmed as PRESENT (in `rcpAttendance[slot.id][doctorId] === 'PRESENT'`) → add `border-green-400` ring

The `rcpAttendance` comes from AppContext and is of type `RcpAttendance = Record<slotId, Record<doctorId, 'PRESENT' | 'ABSENT'>>`.

- [ ] **Step 1: Import AlertTriangle**

At top of PersonalAgendaWeek.tsx, change:
```typescript
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
```
To:
```typescript
import { ChevronLeft, ChevronRight, CalendarDays, AlertTriangle } from 'lucide-react';
```

- [ ] **Step 2: Add RCP status helper inside component**

After the `doctorId` declaration, add:
```typescript
// Returns RCP attendance status for current doctor on a slot
const getRcpStatus = (slot: any): 'UNCONFIRMED' | 'PRESENT' | 'NONE' => {
  if (slot.type !== SlotType.RCP) return 'NONE';
  if (slot.isUnconfirmed) return 'UNCONFIRMED';
  const attendance = rcpAttendance[slot.id];
  if (attendance && doctorId && attendance[doctorId] === 'PRESENT') return 'PRESENT';
  return 'NONE';
};
```

- [ ] **Step 3: Update slot card rendering**

Find the slot card `<div>` (around line 160-174):
```tsx
<div key={slot.id}
  className={`rounded-lg border px-1.5 py-1 mb-0.5 ${style.bg} ${style.border}`}
  title={`${slot.subType || slot.location}`}>
  <div className="flex items-center gap-1">
    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${style.dot}`} />
    <span className={`text-[10px] font-semibold truncate ${style.text}`}>
      {slot.subType || slot.location}
    </span>
  </div>
```

Replace with:
```tsx
{(() => {
  const rcpStatus = getRcpStatus(slot);
  const extraBorder = slot.type === SlotType.RCP
    ? rcpStatus === 'PRESENT' ? 'border-green-400 border-2' : ''
    : '';
  return (
    <div key={slot.id}
      className={`rounded-lg border px-1.5 py-1 mb-0.5 ${style.bg} ${style.border} ${extraBorder}`}
      title={`${slot.subType || slot.location}`}>
      <div className="flex items-center gap-1">
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${style.dot}`} />
        <span className={`text-[10px] font-semibold truncate ${style.text} flex-1`}>
          {slot.subType || slot.location}
        </span>
        {rcpStatus === 'UNCONFIRMED' && (
          <AlertTriangle size={10} className="text-amber-500 shrink-0" />
        )}
      </div>
      {slot.subType && slot.location && slot.location !== slot.subType && (
        <p className={`text-[9px] opacity-70 truncate ml-2.5 ${style.text}`}>{slot.location}</p>
      )}
    </div>
  );
})()}
```

- [ ] **Step 4: Update legend to include RCP status info**

In the legend section (around line 186-196), add entries:
```tsx
{ label: 'RCP à confirmer', style: SLOT_STYLE[SlotType.RCP], extra: '⚠️' },
{ label: 'RCP confirmé', style: { ...SLOT_STYLE[SlotType.RCP], border: 'border-green-400' }, extra: '' },
```

Adjust the legend rendering to show the triangle emoji for "à confirmer".

- [ ] **Step 5: Build**
```bash
npm run build 2>&1 | tail -5
```

- [ ] **Step 6: Commit**
```bash
git add components/PersonalAgendaWeek.tsx
git commit -m "feat(planning): show RCP confirmation status in Mon Planning (⚠️ unconfirmed, green border confirmed)"
```

---

## Task 8 — Push changes to GitHub

- [ ] **Step 1: Final build verification**
```bash
npm run build 2>&1 | tail -5
```

- [ ] **Step 2: Push**
```bash
git push origin main
```

---

## Quick-reference: key files

| Concern | File |
|---------|------|
| Availability check | `components/ConflictResolverModal.tsx:68` |
| `getAvailableDoctors` | `services/scheduleService.ts:1161` |
| Replacement service | `services/replacementService.ts` |
| Settings persistence | `services/settingsService.ts` |
| Notification prefs hook | `hooks/useNotificationPreferences.ts` (new) |
| Profile + notifications | `pages/Profile.tsx` |
| Mon Planning weekly | `components/PersonalAgendaWeek.tsx` |
| RcpAttendance type | `types.ts` — `RcpAttendance = Record<slotId, Record<doctorId, AttendanceStatus>>` |

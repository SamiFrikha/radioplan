# RadioPlan — RCP Locking, Auto-Assignment, Notifications & Personal Agenda

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add RCP attendance locking (first-come first-served), admin-configurable auto-assignment cron, a full in-app + push notification system (bell icon, notification center, conflict resolution via notifications), and a personal agenda (week + month) in each doctor's profile.

**Architecture:** New Supabase tables power all persistence (notifications, push_subscriptions, replacement_requests, rcp_auto_config). RCP locking is derived from existing `rcp_attendance` table — first PRÉSENT record locks a slot, no new lock table needed. A React context (NotificationContext) feeds a bell icon and a notification list in Profile. Supabase Edge Functions handle cron auto-assignment + push delivery. The existing ConflictResolverModal is replaced by a notification-based replacement request flow.

**Tech Stack:** React 19, TypeScript, Supabase (PostgreSQL + RLS + pg_cron + Edge Functions), Vite, web-push (VAPID), lucide-react icons, existing Tailwind classes.

---

## Key DB Schema Reference (existing tables)

| Table | Key columns |
|-------|-------------|
| `app_settings` | Singleton row `id=1`, columns: `postes TEXT[]`, `activities_start_date DATE`, `validated_weeks TEXT[]`, `manual_overrides JSONB` |
| `doctors` | `id UUID`, `name TEXT`, etc. |
| `schedule_templates` | `id UUID`, `day TEXT`, `period TEXT`, `type TEXT`, `sub_type TEXT`, `doctor_ids UUID[]`, etc. |
| `rcp_definitions` | `id UUID`, `name TEXT`, `frequency TEXT`, etc. |
| `rcp_attendance` | `id UUID`, `slot_id TEXT`, `doctor_id UUID`, `status TEXT ('PRESENT'\|'ABSENT')` |
| `profiles` | `id UUID` (= auth user id), `doctor_id TEXT` |

**RCP slot_id format:** `${templateSlotId}-${dateStr}` e.g. `"abc123-2026-03-24"` — generated in `scheduleService.ts:732`.

---

## File Map

### New files to create
| File | Purpose |
|------|---------|
| `supabase/migrations/15_create_notifications.sql` | `notifications` table |
| `supabase/migrations/16_create_push_subscriptions.sql` | `push_subscriptions` table |
| `supabase/migrations/17_create_replacement_requests.sql` | `replacement_requests` table |
| `supabase/migrations/18_create_rcp_auto_config.sql` | Admin-configurable auto-assignment deadline |
| `services/notificationService.ts` | CRUD for notifications (Supabase) |
| `services/pushService.ts` | VAPID key management + Web Push subscription |
| `services/rcpAutoConfigService.ts` | CRUD for auto-assignment config |
| `services/replacementService.ts` | CRUD for replacement requests |
| `context/NotificationContext.tsx` | React context: notifications list, unread count, bell state |
| `components/NotificationBell.tsx` | Bell icon + dropdown, badge with unread count |
| `components/PersonalAgendaWeek.tsx` | Week view of personal schedule |
| `components/PersonalAgendaMonth.tsx` | Month calendar view of personal schedule |
| `supabase/functions/rcp-auto-assign/index.ts` | Edge Function: cron auto-assignment + push delivery |
| `supabase/functions/rcp-reminders/index.ts` | Edge Function: 24h + 12h reminders before deadline |
| `public/sw.js` | Service worker for Web Push |

### Files to modify
| File | Changes |
|------|---------|
| `types.ts` | Add `AppNotification`, `ReplacementRequest`, `PushSubscription`, `RcpAutoConfig` types |
| `App.tsx` | Wrap app in `NotificationProvider` |
| `components/Sidebar.tsx` | Add `NotificationBell` to header |
| `pages/Profile.tsx` | Add notification list section (replace old RCP count); add personal agenda tabs; update RCP attendance UI with lock logic derived from `rcpAttendance` |
| `pages/Configuration.tsx` | Add "Auto-assignment deadline" admin panel |
| `components/ConflictResolverModal.tsx` | Replace direct assign with "send replacement request" flow |
| `index.tsx` | Register service worker for PWA push |

---

## Phase 1 — Database Migrations

### Task 1: Create `notifications` table

**Files:**
- Create: `supabase/migrations/15_create_notifications.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Migration 15: notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    type        text NOT NULL,
    -- Types: RCP_REMINDER_24H, RCP_REMINDER_12H, RCP_AUTO_ASSIGNED,
    --        RCP_SLOT_FILLED, RCP_UNASSIGNED_ALERT,
    --        REPLACEMENT_REQUEST, REPLACEMENT_ACCEPTED, REPLACEMENT_REJECTED
    title       text NOT NULL,
    body        text NOT NULL,
    data        jsonb DEFAULT '{}'::jsonb,
    read        boolean NOT NULL DEFAULT false,
    created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own notifications"
    ON public.notifications FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Service role inserts notifications"
    ON public.notifications FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Users update own notifications"
    ON public.notifications FOR UPDATE
    USING (auth.uid() = user_id);

CREATE INDEX idx_notifications_user_unread
    ON public.notifications(user_id, read, created_at DESC);
```

- [ ] **Step 2: Apply in Supabase SQL Editor** (paste and run)

Expected: no errors, `notifications` table visible in Table Editor.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/15_create_notifications.sql
git commit -m "feat(db): add notifications table with RLS"
```

---

### Task 2: Create `push_subscriptions` table

**Files:**
- Create: `supabase/migrations/16_create_push_subscriptions.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Migration 16: push_subscriptions
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    endpoint    text NOT NULL,
    p256dh      text NOT NULL,
    auth        text NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE(user_id, endpoint)
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own subscriptions"
    ON public.push_subscriptions FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Service role reads all (for sending push from Edge Function)
CREATE POLICY "Service role reads all subscriptions"
    ON public.push_subscriptions FOR SELECT
    USING (true);
```

- [ ] **Step 2: Apply in Supabase SQL Editor**

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/16_create_push_subscriptions.sql
git commit -m "feat(db): add push_subscriptions table"
```

---

### Task 3: Create `replacement_requests` table

**Files:**
- Create: `supabase/migrations/17_create_replacement_requests.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Migration 17: replacement_requests
CREATE TABLE IF NOT EXISTS public.replacement_requests (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_doctor_id   uuid NOT NULL REFERENCES public.doctors(id),
    target_doctor_id      uuid NOT NULL REFERENCES public.doctors(id),
    slot_date             date NOT NULL,
    period                text NOT NULL,
    activity_name         text NOT NULL,
    slot_id               text NOT NULL,
    status                text NOT NULL DEFAULT 'PENDING'
                          CHECK (status IN ('PENDING', 'ACCEPTED', 'REJECTED')),
    created_at            timestamptz NOT NULL DEFAULT now(),
    resolved_at           timestamptz
);

ALTER TABLE public.replacement_requests ENABLE ROW LEVEL SECURITY;

-- Requester and target can both read their own requests
CREATE POLICY "Doctors read their own requests"
    ON public.replacement_requests FOR SELECT
    USING (
        auth.uid() IN (
            SELECT id FROM public.profiles
            WHERE doctor_id::uuid = requester_doctor_id
               OR doctor_id::uuid = target_doctor_id
        )
    );

CREATE POLICY "Authenticated users insert requests"
    ON public.replacement_requests FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users update requests"
    ON public.replacement_requests FOR UPDATE
    USING (auth.uid() IS NOT NULL);
```

- [ ] **Step 2: Apply in Supabase SQL Editor**

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/17_create_replacement_requests.sql
git commit -m "feat(db): add replacement_requests table"
```

---

### Task 4: Create `rcp_auto_config` table

**Files:**
- Create: `supabase/migrations/18_create_rcp_auto_config.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Migration 18: rcp_auto_config
-- Admin-configurable auto-assignment deadline per week
CREATE TABLE IF NOT EXISTS public.rcp_auto_config (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    week_start_date date NOT NULL UNIQUE,
    deadline_at     timestamptz NOT NULL,
    executed_at     timestamptz,
    created_by      uuid REFERENCES public.profiles(id),
    created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rcp_auto_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users read config"
    ON public.rcp_auto_config FOR SELECT
    USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins manage config"
    ON public.rcp_auto_config FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());
```

- [ ] **Step 2: Apply in Supabase SQL Editor**

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/18_create_rcp_auto_config.sql
git commit -m "feat(db): add rcp_auto_config table for admin deadline"
```

---

## Phase 2 — Types & Services

### Task 5: Update `types.ts`

**Files:**
- Modify: `types.ts`

- [ ] **Step 1: Add new types at the end of `types.ts`** (after the last existing export)

```typescript
// --- NOTIFICATION SYSTEM ---

export type NotificationType =
  | 'RCP_REMINDER_24H'
  | 'RCP_REMINDER_12H'
  | 'RCP_AUTO_ASSIGNED'
  | 'RCP_SLOT_FILLED'
  | 'RCP_UNASSIGNED_ALERT'
  | 'REPLACEMENT_REQUEST'
  | 'REPLACEMENT_ACCEPTED'
  | 'REPLACEMENT_REJECTED';

export interface AppNotification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  data: Record<string, unknown>;
  read: boolean;
  created_at: string;
}

export interface ReplacementRequest {
  id: string;
  requesterDoctorId: string;
  targetDoctorId: string;
  slotDate: string;         // YYYY-MM-DD
  period: Period;
  activityName: string;
  slotId: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  created_at: string;
  resolved_at?: string;
}

export interface RcpAutoConfig {
  id: string;
  weekStartDate: string;   // YYYY-MM-DD
  deadlineAt: string;      // ISO datetime
  executedAt?: string;
  createdAt: string;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd C:/Users/jaste/OneDrive/Bureau/radioplan
npm run build 2>&1 | head -30
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add types.ts
git commit -m "feat(types): add AppNotification, ReplacementRequest, RcpAutoConfig types"
```

---

### Task 6: Create `notificationService.ts`

**Files:**
- Create: `services/notificationService.ts`

- [ ] **Step 1: Write the service**

```typescript
// services/notificationService.ts
import { supabase } from './supabaseClient';
import { AppNotification } from '../types';

export const getNotifications = async (userId: string): Promise<AppNotification[]> => {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return data as AppNotification[];
};

export const markAsRead = async (notificationId: string): Promise<void> => {
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('id', notificationId);
  if (error) throw error;
};

export const markAllAsRead = async (userId: string): Promise<void> => {
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('user_id', userId)
    .eq('read', false);
  if (error) throw error;
};

export const createNotification = async (
  notification: Omit<AppNotification, 'id' | 'created_at'>
): Promise<void> => {
  const { error } = await supabase.from('notifications').insert(notification);
  if (error) throw error;
};

export const subscribeToNotifications = (
  userId: string,
  onNew: (n: AppNotification) => void
): (() => void) => {
  const channel = supabase
    .channel(`notifications:${userId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => onNew(payload.new as AppNotification)
    )
    .subscribe();
  return () => { supabase.removeChannel(channel); };
};
```

- [ ] **Step 2: Verify build**

```bash
npm run build 2>&1 | head -30
```

- [ ] **Step 3: Commit**

```bash
git add services/notificationService.ts
git commit -m "feat(services): add notificationService (CRUD + realtime)"
```

---

### Task 7: Create `pushService.ts` + generate VAPID keys

**Files:**
- Create: `services/pushService.ts`
- Create: `public/sw.js`
- Modify: `index.tsx`

- [ ] **Step 1: Generate VAPID keys**

```bash
cd C:/Users/jaste/OneDrive/Bureau/radioplan
npx web-push generate-vapid-keys
```

Copy the output. Store them:
- `VITE_VAPID_PUBLIC_KEY=<public_key>` → append to `.env.local`
- `VAPID_PRIVATE_KEY=<private_key>` → Supabase Dashboard > Project Settings > Edge Functions > Secrets
- `VAPID_PUBLIC_KEY=<public_key>` → same Supabase secrets
- `VAPID_SUBJECT=mailto:admin@radioplan.fr` → same Supabase secrets

- [ ] **Step 2: Append public key to `.env.local`**

```bash
echo "VITE_VAPID_PUBLIC_KEY=<your_generated_public_key>" >> .env.local
```

- [ ] **Step 3: Write `services/pushService.ts`**

```typescript
// services/pushService.ts
import { supabase } from './supabaseClient';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string;

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export const isPushSupported = (): boolean =>
  'serviceWorker' in navigator && 'PushManager' in window;

export const subscribeToPush = async (userId: string): Promise<boolean> => {
  if (!isPushSupported()) return false;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
    const json = subscription.toJSON();
    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        user_id: userId,
        endpoint: json.endpoint,
        p256dh: json.keys?.p256dh,
        auth: json.keys?.auth,
      },
      { onConflict: 'user_id,endpoint' }
    );
    return !error;
  } catch {
    return false;
  }
};

export const unsubscribeFromPush = async (userId: string): Promise<void> => {
  if (!isPushSupported()) return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (subscription) {
    await subscription.unsubscribe();
    await supabase
      .from('push_subscriptions')
      .delete()
      .eq('user_id', userId)
      .eq('endpoint', subscription.endpoint);
  }
};

export const isPushSubscribed = async (): Promise<boolean> => {
  if (!isPushSupported()) return false;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  return !!sub;
};
```

- [ ] **Step 4: Create `public/sw.js`**

```javascript
// public/sw.js — Service Worker for Web Push
self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {};
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'RadioPlan', {
      body: data.body ?? '',
      icon: '/favicon.ico',
      data: data.data ?? {},
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow('/'));
});
```

- [ ] **Step 5: Register service worker in `index.tsx`**

Add before `root.render(...)`:

```typescript
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(console.error);
}
```

- [ ] **Step 6: Verify build**

```bash
npm run build 2>&1 | head -30
```

- [ ] **Step 7: Commit**

```bash
git add services/pushService.ts public/sw.js index.tsx .env.local
git commit -m "feat(push): add Web Push service + service worker + VAPID setup"
```

---

### Task 8: Create `rcpAutoConfigService.ts` and `replacementService.ts`

**Files:**
- Create: `services/rcpAutoConfigService.ts`
- Create: `services/replacementService.ts`

- [ ] **Step 1: Write `services/rcpAutoConfigService.ts`**

```typescript
// services/rcpAutoConfigService.ts
import { supabase } from './supabaseClient';
import { RcpAutoConfig } from '../types';

const mapRow = (r: any): RcpAutoConfig => ({
  id: r.id,
  weekStartDate: r.week_start_date,
  deadlineAt: r.deadline_at,
  executedAt: r.executed_at,
  createdAt: r.created_at,
});

export const getRcpAutoConfigs = async (): Promise<RcpAutoConfig[]> => {
  const { data, error } = await supabase
    .from('rcp_auto_config')
    .select('*')
    .order('week_start_date', { ascending: false })
    .limit(10);
  if (error) throw error;
  return (data ?? []).map(mapRow);
};

export const upsertRcpAutoConfig = async (
  weekStartDate: string,
  deadlineAt: string,
  createdBy: string
): Promise<void> => {
  const { error } = await supabase.from('rcp_auto_config').upsert(
    { week_start_date: weekStartDate, deadline_at: deadlineAt, created_by: createdBy },
    { onConflict: 'week_start_date' }
  );
  if (error) throw error;
};

export const triggerAutoAssignNow = async (weekStartDate: string): Promise<void> => {
  const { error } = await supabase.functions.invoke('rcp-auto-assign', {
    body: { weekStartDate, force: true },
  });
  if (error) throw error;
};
```

- [ ] **Step 2: Write `services/replacementService.ts`**

```typescript
// services/replacementService.ts
import { supabase } from './supabaseClient';
import { ReplacementRequest } from '../types';
import { Period } from '../types';

const mapRow = (r: any): ReplacementRequest => ({
  id: r.id,
  requesterDoctorId: r.requester_doctor_id,
  targetDoctorId: r.target_doctor_id,
  slotDate: r.slot_date,
  period: r.period as Period,
  activityName: r.activity_name,
  slotId: r.slot_id,
  status: r.status,
  created_at: r.created_at,
  resolved_at: r.resolved_at,
});

export const sendReplacementRequest = async (
  req: Omit<ReplacementRequest, 'id' | 'created_at' | 'resolved_at' | 'status'>
): Promise<string> => {
  const { data, error } = await supabase
    .from('replacement_requests')
    .insert({
      requester_doctor_id: req.requesterDoctorId,
      target_doctor_id: req.targetDoctorId,
      slot_date: req.slotDate,
      period: req.period,
      activity_name: req.activityName,
      slot_id: req.slotId,
      status: 'PENDING',
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
};

export const resolveReplacementRequest = async (
  requestId: string,
  status: 'ACCEPTED' | 'REJECTED'
): Promise<ReplacementRequest> => {
  const { data, error } = await supabase
    .from('replacement_requests')
    .update({ status, resolved_at: new Date().toISOString() })
    .eq('id', requestId)
    .select('*')
    .single();
  if (error) throw error;
  return mapRow(data);
};
```

- [ ] **Step 3: Verify build**

```bash
npm run build 2>&1 | head -30
```

- [ ] **Step 4: Commit**

```bash
git add services/rcpAutoConfigService.ts services/replacementService.ts
git commit -m "feat(services): add rcpAutoConfigService and replacementService"
```

---

## Phase 3 — RCP Attendance Locking

### Task 9: Update RCP attendance UI in `Profile.tsx`

**Context:** The lock is NOT a separate data structure. It is derived from the existing `rcpAttendance` state: if any doctor has `status = 'PRESENT'` for a given `slotKey`, the slot is "locked". The existing `setRcpAttendance` already persists to Supabase via the app's data flow.

**Files:**
- Modify: `pages/Profile.tsx`

- [ ] **Step 1: Add lock derivation helper in `Profile.tsx`**

At the top of the component, below the existing `rcpAttendance` destructure from context, add:

```typescript
// Derive lock status from existing rcpAttendance (no new state needed)
const getRcpLockInfo = (slotKey: string): { lockedByDoctorId: string | null } => {
  const slotAttendance = rcpAttendance[slotKey] ?? {};
  const lockedByDoctorId =
    Object.entries(slotAttendance).find(([, status]) => status === 'PRESENT')?.[0] ?? null;
  return { lockedByDoctorId };
};
```

- [ ] **Step 2: Update the RCP attendance toggle handler**

Find the function that calls `setRcpAttendance` when a doctor marks PRÉSENT/ABSENT. It will look like a handler that takes a slotKey and status. Update its logic:

```typescript
const handleRcpAttendance = (slotKey: string, doctorId: string, newStatus: RcpStatus) => {
  const { lockedByDoctorId } = getRcpLockInfo(slotKey);

  // Block PRÉSENT if slot already locked by someone else
  if (newStatus === 'PRESENT' && lockedByDoctorId && lockedByDoctorId !== doctorId) {
    return;
  }

  // Update attendance as before
  const updated: RcpAttendance = {
    ...rcpAttendance,
    [slotKey]: {
      ...(rcpAttendance[slotKey] ?? {}),
      [doctorId]: newStatus,
    },
  };
  setRcpAttendance(updated);

  // If marking PRÉSENT → trigger notification to other assigned doctors
  // (notification creation handled in Phase 5 when NotificationContext is available)
};
```

- [ ] **Step 3: Update the RCP slot render in `Profile.tsx`**

In the JSX where each RCP slot is rendered (look for the PRÉSENT/ABSENT buttons), add lock status display. For each RCP slot, before the buttons:

```tsx
// Derive lock info for this slot
const { lockedByDoctorId } = getRcpLockInfo(slotKey);
const isLockedByMe = lockedByDoctorId === currentDoctorId;
const isLockedBySomeoneElse = !!lockedByDoctorId && !isLockedByMe;
const lockedByDoctor = lockedByDoctorId ? doctors.find(d => d.id === lockedByDoctorId) : null;

// Status badge (add above the buttons)
{isLockedBySomeoneElse && (
  <span className="inline-flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">
    <UserCheck size={12} />
    Confirmé — {lockedByDoctor?.name ?? 'Médecin inconnu'}
  </span>
)}
{isLockedByMe && (
  <span className="inline-flex items-center gap-1 text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">
    <UserCheck size={12} />
    Vous avez confirmé
  </span>
)}
{!lockedByDoctorId && (
  <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded-full">
    En attente de confirmation
  </span>
)}

// Add disabled prop to PRÉSENT button:
<button
  onClick={() => handleRcpAttendance(slotKey, currentDoctorId!, 'PRESENT')}
  disabled={isLockedBySomeoneElse}
  className={`... ${isLockedBySomeoneElse ? 'opacity-40 cursor-not-allowed' : ''}`}
>
  Présent
</button>
```

- [ ] **Step 4: Manual smoke test**

```bash
npm run dev
```

Test scenario:
1. Log in as Doctor A → go to Profile → find an RCP → click Présent → badge shows "Vous avez confirmé"
2. Log in as Doctor B (same RCP) → Présent button is disabled, badge shows "Confirmé — Dr A"
3. Doctor A switches to Absent → badge returns to "En attente de confirmation", Doctor B can now click Présent

- [ ] **Step 5: Commit**

```bash
git add pages/Profile.tsx
git commit -m "feat(rcp): first-to-confirm locks RCP slot using existing rcpAttendance state"
```

---

## Phase 4 — Auto-Assignment Cron + Admin Config

### Task 10: Admin deadline config UI in `Configuration.tsx`

**Files:**
- Modify: `pages/Configuration.tsx`

- [ ] **Step 1: Add imports to `Configuration.tsx`**

At the top of `Configuration.tsx`, add:

```typescript
import { getRcpAutoConfigs, upsertRcpAutoConfig, triggerAutoAssignNow } from '../services/rcpAutoConfigService';
import { RcpAutoConfig } from '../types';
import { useAuth } from '../context/AuthContext';
```

- [ ] **Step 2: Add state and effect for auto-config (inside the `Configuration` component)**

```typescript
const [rcpAutoConfigs, setRcpAutoConfigs] = useState<RcpAutoConfig[]>([]);
const [autoConfigWeekDate, setAutoConfigWeekDate] = useState('');
const [autoConfigDeadlineDate, setAutoConfigDeadlineDate] = useState('');
const [autoConfigDeadlineTime, setAutoConfigDeadlineTime] = useState('14:00');
const [savingAutoConfig, setSavingAutoConfig] = useState(false);

useEffect(() => {
  getRcpAutoConfigs().then(setRcpAutoConfigs).catch(console.error);
}, []);

const handleSaveAutoConfig = async () => {
  if (!autoConfigWeekDate || !autoConfigDeadlineDate || !profile?.id) return;
  setSavingAutoConfig(true);
  const deadlineAt = new Date(`${autoConfigDeadlineDate}T${autoConfigDeadlineTime}:00`).toISOString();
  await upsertRcpAutoConfig(autoConfigWeekDate, deadlineAt, profile.id);
  const updated = await getRcpAutoConfigs();
  setRcpAutoConfigs(updated);
  setSavingAutoConfig(false);
};
```

- [ ] **Step 3: Add JSX section in the RCP configuration tab/area**

Find the existing RCP configuration area in the JSX. Add a new section (below existing RCP settings):

```tsx
{/* Auto-assignment deadline */}
<div className="border border-gray-200 rounded-xl p-4 space-y-4">
  <h3 className="font-semibold text-gray-700">Attribution automatique des RCP</h3>
  <p className="text-sm text-gray-500">
    Si aucun médecin n'a confirmé sa présence avant cette date/heure,
    le système tire au sort un médecin disponible.
  </p>

  <div className="grid grid-cols-3 gap-3">
    <div>
      <label className="text-xs text-gray-500 block mb-1">Semaine (lundi de la semaine RCP)</label>
      <input type="date" value={autoConfigWeekDate}
        onChange={e => setAutoConfigWeekDate(e.target.value)}
        className="w-full border rounded px-2 py-1.5 text-sm" />
    </div>
    <div>
      <label className="text-xs text-gray-500 block mb-1">Date limite</label>
      <input type="date" value={autoConfigDeadlineDate}
        onChange={e => setAutoConfigDeadlineDate(e.target.value)}
        className="w-full border rounded px-2 py-1.5 text-sm" />
    </div>
    <div>
      <label className="text-xs text-gray-500 block mb-1">Heure limite</label>
      <input type="time" value={autoConfigDeadlineTime}
        onChange={e => setAutoConfigDeadlineTime(e.target.value)}
        className="w-full border rounded px-2 py-1.5 text-sm" />
    </div>
  </div>

  <button onClick={handleSaveAutoConfig} disabled={savingAutoConfig}
    className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
    {savingAutoConfig ? 'Sauvegarde...' : 'Sauvegarder la deadline'}
  </button>

  <div className="space-y-2 mt-2">
    {rcpAutoConfigs.map(c => (
      <div key={c.id}
        className="flex items-center justify-between bg-gray-50 rounded-lg p-3 text-sm border border-gray-100">
        <div>
          <span className="font-medium">Semaine du {c.weekStartDate}</span>
          <span className="text-gray-500 ml-3">
            Tirage: {new Date(c.deadlineAt).toLocaleString('fr-FR')}
          </span>
        </div>
        {c.executedAt
          ? <span className="text-green-600 text-xs font-medium">✓ Exécuté</span>
          : (
            <button onClick={() => triggerAutoAssignNow(c.weekStartDate)}
              className="text-xs text-orange-600 underline hover:text-orange-800">
              Forcer maintenant
            </button>
          )
        }
      </div>
    ))}
  </div>
</div>
```

- [ ] **Step 4: Build and verify**

```bash
npm run build 2>&1 | head -30
```

- [ ] **Step 5: Commit**

```bash
git add pages/Configuration.tsx
git commit -m "feat(admin): add RCP auto-assignment deadline config panel"
```

---

### Task 11: Edge Function `rcp-auto-assign`

**Files:**
- Create: `supabase/functions/rcp-auto-assign/index.ts`

**Note on slot_id:** The slot_id format used in `rcp_attendance` is `${templateSlotId}-${dateStr}` (see `scheduleService.ts:732`). The Edge Function replicates this to query and insert records consistently.

**Note on `app_settings`:** This is a singleton row — do NOT use key-value queries. It is NOT needed in this function; all data comes from dedicated tables.

- [ ] **Step 1: Write the Edge Function**

```typescript
// supabase/functions/rcp-auto-assign/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'https://esm.sh/web-push@3.6.7';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT')!,
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!
);

const DAY_OFFSETS: Record<string, number> = {
  'Lundi': 0, 'Mardi': 1, 'Mercredi': 2, 'Jeudi': 3, 'Vendredi': 4
};

const toDateStr = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

Deno.serve(async (req) => {
  const body = await req.json();

  // --- checkPending mode: called by pg_cron every hour ---
  if (body.checkPending) {
    const { data: pending } = await supabase
      .from('rcp_auto_config')
      .select('week_start_date')
      .is('executed_at', null)
      .lte('deadline_at', new Date().toISOString());

    for (const cfg of (pending ?? [])) {
      await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/rcp-auto-assign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        },
        body: JSON.stringify({ weekStartDate: cfg.week_start_date }),
      });
    }
    return new Response(JSON.stringify({ checked: pending?.length ?? 0 }));
  }

  // --- Main mode: process a specific week ---
  const { weekStartDate, force } = body;

  const { data: config } = await supabase
    .from('rcp_auto_config')
    .select('*')
    .eq('week_start_date', weekStartDate)
    .single();

  if (!config) return new Response('No config for this week', { status: 404 });
  if (config.executed_at && !force) return new Response('Already executed', { status: 200 });

  // Load data from dedicated tables
  const [{ data: doctors }, { data: templateSlots }, { data: rcpDefs }, { data: unavailabilities }, { data: profiles }] = await Promise.all([
    supabase.from('doctors').select('id'),
    supabase.from('schedule_templates').select('id, day, doctor_ids, default_doctor_id, secondary_doctor_ids, type, sub_type').eq('type', 'RCP'),
    supabase.from('rcp_definitions').select('id, name, frequency, week_parity'),
    supabase.from('unavailabilities').select('doctor_id, start_date, end_date'),
    supabase.from('profiles').select('id, doctor_id'),
  ]);

  const weekStart = new Date(weekStartDate + 'T00:00:00Z');
  const results = [];

  for (const slot of (templateSlots ?? [])) {
    const dayOffset = DAY_OFFSETS[slot.day];
    if (dayOffset === undefined) continue;

    const slotDate = new Date(weekStart);
    slotDate.setUTCDate(weekStart.getUTCDate() + dayOffset);
    const dateStr = toDateStr(slotDate);
    const slotId = `${slot.id}-${dateStr}`;

    // Check if already locked (PRÉSENT record exists)
    const { data: presentRecord } = await supabase
      .from('rcp_attendance')
      .select('doctor_id')
      .eq('slot_id', slotId)
      .eq('status', 'PRESENT')
      .limit(1);

    if (presentRecord && presentRecord.length > 0) continue; // already confirmed

    // Get assigned doctor IDs for this slot
    const assignedIds: string[] = (slot.doctor_ids?.length
      ? slot.doctor_ids
      : [slot.default_doctor_id, ...(slot.secondary_doctor_ids ?? [])].filter(Boolean)
    );

    // Filter available: not ABSENT in rcp_attendance, not on leave
    const { data: absentRecords } = await supabase
      .from('rcp_attendance')
      .select('doctor_id')
      .eq('slot_id', slotId)
      .eq('status', 'ABSENT');

    const absentIds = new Set((absentRecords ?? []).map((r: any) => r.doctor_id));

    const available = assignedIds.filter(docId => {
      if (absentIds.has(docId)) return false;
      const onLeave = (unavailabilities ?? []).some((u: any) =>
        u.doctor_id === docId && dateStr >= u.start_date && dateStr <= u.end_date
      );
      return !onLeave;
    });

    if (available.length === 0) {
      // Notify all admin users (profiles without doctor_id)
      const admins = (profiles ?? []).filter((p: any) => !p.doctor_id);
      for (const admin of admins) {
        await supabase.from('notifications').insert({
          user_id: admin.id,
          type: 'RCP_UNASSIGNED_ALERT',
          title: 'RCP sans médecin disponible',
          body: `Aucun médecin disponible pour le RCP du ${dateStr} (${slot.sub_type ?? slot.type})`,
          data: { slotId, date: dateStr },
        });
      }
      continue;
    }

    // Random pick
    const pickedDoctorId = available[Math.floor(Math.random() * available.length)];

    // Insert PRÉSENT record in rcp_attendance
    await supabase.from('rcp_attendance').upsert(
      { slot_id: slotId, doctor_id: pickedDoctorId, status: 'PRESENT' },
      { onConflict: 'slot_id,doctor_id' }
    );

    // Notify the picked doctor
    const pickedProfile = (profiles ?? []).find((p: any) => p.doctor_id === pickedDoctorId);
    if (pickedProfile) {
      await supabase.from('notifications').insert({
        user_id: pickedProfile.id,
        type: 'RCP_AUTO_ASSIGNED',
        title: 'Vous avez été assigné à un RCP',
        body: `Vous avez été sélectionné pour le RCP du ${dateStr} (${slot.sub_type ?? 'RCP'})`,
        data: { slotId, date: dateStr },
      });

      // Send push notification
      const { data: pushSubs } = await supabase
        .from('push_subscriptions')
        .select('endpoint, p256dh, auth')
        .eq('user_id', pickedProfile.id);

      for (const sub of (pushSubs ?? [])) {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            JSON.stringify({ title: 'RadioPlan — RCP assigné', body: `RCP du ${dateStr}` })
          );
        } catch { /* expired subscription */ }
      }
    }

    results.push({ slotId, assignedTo: pickedDoctorId });
  }

  // Mark config as executed
  await supabase
    .from('rcp_auto_config')
    .update({ executed_at: new Date().toISOString() })
    .eq('week_start_date', weekStartDate);

  return new Response(JSON.stringify({ ok: true, results }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
```

- [ ] **Step 2: Deploy**

```bash
supabase functions deploy rcp-auto-assign
```

- [ ] **Step 3: Set up pg_cron** (run in Supabase SQL Editor)

```sql
SELECT cron.schedule(
  'rcp-auto-assign-check',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/rcp-auto-assign',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    ),
    body := '{"checkPending": true}'::jsonb
  );
  $$
);
```

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/rcp-auto-assign/
git commit -m "feat(cron): add rcp-auto-assign Edge Function with pg_cron trigger"
```

---

### Task 12: Edge Function `rcp-reminders`

**Files:**
- Create: `supabase/functions/rcp-reminders/index.ts`

- [ ] **Step 1: Write the Edge Function**

```typescript
// supabase/functions/rcp-reminders/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const DAY_OFFSETS: Record<string, number> = {
  'Lundi': 0, 'Mardi': 1, 'Mercredi': 2, 'Jeudi': 3, 'Vendredi': 4
};

const toDateStr = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

Deno.serve(async () => {
  const now = new Date();

  // Find configs with deadline in next 24–25h or 12–13h
  const in12h = new Date(now.getTime() + 12 * 3600_000);
  const in13h = new Date(now.getTime() + 13 * 3600_000);
  const in24h = new Date(now.getTime() + 24 * 3600_000);
  const in25h = new Date(now.getTime() + 25 * 3600_000);

  const { data: configs12h } = await supabase
    .from('rcp_auto_config').select('*').is('executed_at', null)
    .gte('deadline_at', in12h.toISOString()).lte('deadline_at', in13h.toISOString());

  const { data: configs24h } = await supabase
    .from('rcp_auto_config').select('*').is('executed_at', null)
    .gte('deadline_at', in24h.toISOString()).lte('deadline_at', in25h.toISOString());

  const [{ data: templateSlots }, { data: profiles }] = await Promise.all([
    supabase.from('schedule_templates').select('id, day, doctor_ids, default_doctor_id, secondary_doctor_ids, type, sub_type').eq('type', 'RCP'),
    supabase.from('profiles').select('id, doctor_id'),
  ]);

  const sendReminders = async (
    configs: any[],
    type: 'RCP_REMINDER_24H' | 'RCP_REMINDER_12H',
    hoursLabel: number
  ) => {
    for (const cfg of configs) {
      const weekStart = new Date(cfg.week_start_date + 'T00:00:00Z');

      for (const slot of (templateSlots ?? [])) {
        const dayOffset = DAY_OFFSETS[slot.day];
        if (dayOffset === undefined) continue;

        const slotDate = new Date(weekStart);
        slotDate.setUTCDate(weekStart.getUTCDate() + dayOffset);
        const dateStr = toDateStr(slotDate);
        const slotId = `${slot.id}-${dateStr}`;

        // Skip if already confirmed
        const { data: present } = await supabase
          .from('rcp_attendance').select('id').eq('slot_id', slotId).eq('status', 'PRESENT').limit(1);
        if (present && present.length > 0) continue;

        const assignedIds: string[] = slot.doctor_ids?.length
          ? slot.doctor_ids
          : [slot.default_doctor_id, ...(slot.secondary_doctor_ids ?? [])].filter(Boolean);

        for (const docId of assignedIds) {
          const prof = (profiles ?? []).find((p: any) => p.doctor_id === docId);
          if (!prof) continue;

          await supabase.from('notifications').insert({
            user_id: prof.id,
            type,
            title: `Rappel RCP — ${hoursLabel}h avant tirage`,
            body: `Personne n'a encore confirmé pour le RCP du ${dateStr}. Tirage automatique dans ${hoursLabel}h.`,
            data: { slotId, date: dateStr },
          });
        }
      }
    }
  };

  await sendReminders(configs12h ?? [], 'RCP_REMINDER_12H', 12);
  await sendReminders(configs24h ?? [], 'RCP_REMINDER_24H', 24);

  return new Response(JSON.stringify({ ok: true }));
});
```

- [ ] **Step 2: Deploy and add cron**

```bash
supabase functions deploy rcp-reminders
```

```sql
-- In Supabase SQL Editor:
SELECT cron.schedule(
  'rcp-reminders-check',
  '30 * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/rcp-reminders',
    headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.service_role_key')),
    body := '{}'::jsonb
  );
  $$
);
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/rcp-reminders/
git commit -m "feat(cron): add 24h and 12h RCP reminder Edge Function"
```

---

## Phase 5 — Notification System UI

### Task 13: Create `NotificationContext`

**Files:**
- Create: `context/NotificationContext.tsx`

- [ ] **Step 1: Write the context**

```typescript
// context/NotificationContext.tsx
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { AppNotification } from '../types';
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
  subscribeToNotifications,
} from '../services/notificationService';
import { useAuth } from './AuthContext';

interface NotificationContextType {
  notifications: AppNotification[];
  unreadCount: number;
  loading: boolean;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  refresh: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType>({
  notifications: [],
  unreadCount: 0,
  loading: false,
  markRead: async () => {},
  markAllRead: async () => {},
  refresh: async () => {},
});

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const data = await getNotifications(userId);
      setNotifications(data);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    refresh();
    const unsub = subscribeToNotifications(userId, (newNotif) => {
      setNotifications(prev => [newNotif, ...prev]);
    });
    return unsub;
  }, [userId, refresh]);

  const markRead = async (id: string) => {
    await markAsRead(id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const markAllRead = async () => {
    if (!userId) return;
    await markAllAsRead(userId);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, loading, markRead, markAllRead, refresh }}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => useContext(NotificationContext);
```

- [ ] **Step 2: Wrap app in `NotificationProvider` in `App.tsx`**

Add import:
```typescript
import { NotificationProvider } from './context/NotificationContext';
```

Find the root JSX return in `App.tsx`. Wrap the content that needs notification access (the router/main layout) inside `<NotificationProvider>`:

```tsx
// The existing AppContext.Provider wraps everything — add NotificationProvider inside it:
return (
  <AppContext.Provider value={contextValue}>
    <NotificationProvider>
      {/* existing Router / layout */}
    </NotificationProvider>
  </AppContext.Provider>
);
```

- [ ] **Step 3: Commit**

```bash
git add context/NotificationContext.tsx App.tsx
git commit -m "feat(notifications): add NotificationContext with realtime subscription"
```

---

### Task 14: Create `NotificationBell` component

**Files:**
- Create: `components/NotificationBell.tsx`

- [ ] **Step 1: Write the component**

```tsx
// components/NotificationBell.tsx
import React, { useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { useNotifications } from '../context/NotificationContext';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../services/supabaseClient';
import { AppNotification } from '../types';
import { resolveReplacementRequest } from '../services/replacementService';
import { createNotification } from '../services/notificationService';

const NOTIF_ICON: Record<string, string> = {
  RCP_AUTO_ASSIGNED: '🎲',
  RCP_SLOT_FILLED: '✅',
  RCP_REMINDER_24H: '⏰',
  RCP_REMINDER_12H: '⚠️',
  RCP_UNASSIGNED_ALERT: '🚨',
  REPLACEMENT_REQUEST: '🔄',
  REPLACEMENT_ACCEPTED: '✅',
  REPLACEMENT_REJECTED: '❌',
};

// Sub-component: Accept/Reject buttons for replacement requests
const ReplacementActions: React.FC<{
  requestId: string;
  onResolved: () => void;
}> = ({ requestId, onResolved }) => {
  const [loading, setLoading] = useState(false);

  const handle = async (status: 'ACCEPTED' | 'REJECTED') => {
    setLoading(true);
    try {
      const resolved = await resolveReplacementRequest(requestId, status);

      // Notify the requester
      const { data: requesterProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('doctor_id', resolved.requesterDoctorId)
        .single();

      if (requesterProfile) {
        await createNotification({
          user_id: requesterProfile.id,
          type: status === 'ACCEPTED' ? 'REPLACEMENT_ACCEPTED' : 'REPLACEMENT_REJECTED',
          title: status === 'ACCEPTED' ? 'Remplacement accepté ✅' : 'Remplacement refusé ❌',
          body: `Votre demande de remplacement pour le ${resolved.slotDate} (${resolved.period}) a été ${status === 'ACCEPTED' ? 'acceptée' : 'refusée'}.`,
          data: { requestId, slotId: resolved.slotId },
          read: false,
        });
      }

      onResolved();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex gap-2 mt-2">
      <button onClick={() => handle('ACCEPTED')} disabled={loading}
        className="text-xs bg-green-100 text-green-700 px-3 py-1 rounded-full hover:bg-green-200 disabled:opacity-50">
        Accepter
      </button>
      <button onClick={() => handle('REJECTED')} disabled={loading}
        className="text-xs bg-red-100 text-red-700 px-3 py-1 rounded-full hover:bg-red-200 disabled:opacity-50">
        Refuser
      </button>
    </div>
  );
};

// Notification item
const NotificationItem: React.FC<{
  notification: AppNotification;
  onRead: () => void;
}> = ({ notification, onRead }) => {
  const icon = NOTIF_ICON[notification.type] ?? '🔔';
  const date = new Date(notification.created_at).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
  const requestId = notification.data?.requestId as string | undefined;

  return (
    <div
      onClick={onRead}
      className={`px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors
        ${!notification.read ? 'bg-blue-50' : ''}`}
    >
      <div className="flex items-start gap-2">
        <span className="text-lg mt-0.5 shrink-0">{icon}</span>
        <div className="flex-1 min-w-0">
          <p className={`text-sm ${!notification.read ? 'font-semibold text-gray-800' : 'text-gray-700'}`}>
            {notification.title}
          </p>
          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{notification.body}</p>
          <p className="text-xs text-gray-400 mt-1">{date}</p>
          {notification.type === 'REPLACEMENT_REQUEST' && requestId && (
            <ReplacementActions requestId={requestId} onResolved={onRead} />
          )}
        </div>
        {!notification.read && (
          <span className="w-2 h-2 bg-blue-500 rounded-full mt-1.5 shrink-0" />
        )}
      </div>
    </div>
  );
};

// Main Bell component
const NotificationBell: React.FC = () => {
  const { notifications, unreadCount, markRead, markAllRead, loading } = useNotifications();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="relative p-2 rounded-full hover:bg-gray-100 transition-colors"
        aria-label="Notifications"
      >
        <Bell size={20} className="text-gray-600" />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 bg-red-500 text-white text-xs rounded-full
                           min-w-[18px] h-[18px] flex items-center justify-center px-1 leading-none font-medium">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-11 w-80 bg-white rounded-xl shadow-xl border border-gray-200 z-50 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
              <span className="font-semibold text-sm text-gray-700">
                Notifications {unreadCount > 0 && `(${unreadCount})`}
              </span>
              {unreadCount > 0 && (
                <button onClick={markAllRead}
                  className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                  <CheckCheck size={12} /> Tout lu
                </button>
              )}
            </div>
            <div className="max-h-96 overflow-y-auto divide-y divide-gray-100">
              {loading && (
                <p className="text-center py-8 text-gray-400 text-sm">Chargement...</p>
              )}
              {!loading && notifications.length === 0 && (
                <p className="text-center py-8 text-gray-400 text-sm">Aucune notification</p>
              )}
              {notifications.map(n => (
                <NotificationItem key={n.id} notification={n} onRead={() => markRead(n.id)} />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default NotificationBell;
```

- [ ] **Step 2: Add `NotificationBell` to `Sidebar.tsx`**

In `Sidebar.tsx`, add import:
```typescript
import NotificationBell from './NotificationBell';
```

Find the header/top area of the sidebar and add:
```tsx
<NotificationBell />
```

- [ ] **Step 3: Manual test**

```bash
npm run dev
```

Open app → bell icon appears → click → dropdown shows "Aucune notification".

- [ ] **Step 4: Commit**

```bash
git add components/NotificationBell.tsx components/Sidebar.tsx
git commit -m "feat(ui): add NotificationBell with badge, dropdown, and replacement Accept/Reject"
```

---

### Task 15: Notification section in `Profile.tsx` + remove old RCP count

**Files:**
- Modify: `pages/Profile.tsx`

- [ ] **Step 1: Remove old RCP count notification system**

Search in `Profile.tsx` for the section that counts/shows unconfirmed RCPs for the current week and next week. Delete that entire JSX block. It was a UI-only counter that displayed something like "X RCP non choisis".

- [ ] **Step 2: Add imports at top of `Profile.tsx`**

```typescript
import { useNotifications } from '../context/NotificationContext';
```

- [ ] **Step 3: Add notification list section in `Profile.tsx`**

Find where the profile tabs/sections are defined. Add a "Notifications" tab or accordion section:

```tsx
// Add to tab definitions (or section list):
{ id: 'notifications', label: 'Notifications', icon: <Bell size={16} /> }

// Tab content:
{activeTab === 'notifications' && (
  <NotificationSection />
)}
```

Add the `NotificationSection` component inline in `Profile.tsx`:

```tsx
const NotificationSection: React.FC = () => {
  const { notifications, unreadCount, markRead, markAllRead, loading } = useNotifications();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-700 flex items-center gap-2">
          Mes notifications
          {unreadCount > 0 && (
            <span className="bg-red-500 text-white text-xs rounded-full px-2 py-0.5">
              {unreadCount}
            </span>
          )}
        </h2>
        {unreadCount > 0 && (
          <button onClick={markAllRead} className="text-sm text-blue-600 hover:underline">
            Tout marquer lu
          </button>
        )}
      </div>

      {loading && <p className="text-sm text-gray-400 py-6 text-center">Chargement...</p>}

      {!loading && notifications.length === 0 && (
        <p className="text-sm text-gray-400 py-6 text-center">Aucune notification</p>
      )}

      <div className="space-y-2">
        {notifications.map(n => (
          <div key={n.id}
            onClick={() => markRead(n.id)}
            className={`rounded-xl p-3.5 border cursor-pointer transition-colors
              ${n.read ? 'bg-white border-gray-200' : 'bg-blue-50 border-blue-200'}`}
          >
            <div className="flex items-start gap-2">
              {!n.read && <span className="w-2 h-2 bg-blue-500 rounded-full mt-1.5 shrink-0" />}
              <div className="flex-1">
                <p className={`text-sm ${n.read ? 'text-gray-700' : 'font-semibold text-gray-800'}`}>
                  {n.title}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">{n.body}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {new Date(n.created_at).toLocaleString('fr-FR')}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
```

- [ ] **Step 4: Build and verify**

```bash
npm run build 2>&1 | head -20
```

- [ ] **Step 5: Commit**

```bash
git add pages/Profile.tsx
git commit -m "feat(profile): replace RCP count widget with full notification list section"
```

---

## Phase 6 — Conflict Resolution via Notifications

### Task 16: Update `ConflictResolverModal.tsx`

**Files:**
- Modify: `components/ConflictResolverModal.tsx`

**Note:** `ConflictResolverModal` receives a `conflict: Conflict` prop and a `slot: ScheduleSlot` prop (or similar). The field `slot.date`, `slot.period`, and `slot.location`/`subType` are the correct sources for slot info — NOT `conflict.date` or `conflict.period` which don't exist on the `Conflict` type.

- [ ] **Step 1: Read the top of `ConflictResolverModal.tsx` to understand its current props**

```bash
# Read first 60 lines to understand component interface
```
Use the Read tool: `components/ConflictResolverModal.tsx` lines 1-60.

- [ ] **Step 2: Add imports to `ConflictResolverModal.tsx`**

```typescript
import { supabase } from '../services/supabaseClient';
import { sendReplacementRequest } from '../services/replacementService';
import { createNotification } from '../services/notificationService';
import { useAuth } from '../context/AuthContext';
```

- [ ] **Step 3: Add state for request flow**

Inside the component:

```typescript
const { profile } = useAuth();
const [requestSent, setRequestSent] = useState(false);
const [sendingRequestTo, setSendingRequestTo] = useState<string | null>(null);
```

- [ ] **Step 4: Replace "assign" action with "request replacement" action**

Find the button/handler that currently directly assigns a replacement doctor. Replace or supplement it with a "Demander remplacement" button that triggers a notification:

```typescript
const handleRequestReplacement = async (targetDoctorId: string) => {
  if (!slot || !profile) return;
  setSendingRequestTo(targetDoctorId);
  try {
    // Create replacement request in DB
    const requestId = await sendReplacementRequest({
      requesterDoctorId: currentDoctorId!,  // currentDoctorId from profile or context
      targetDoctorId,
      slotDate: slot.date,         // ScheduleSlot.date
      period: slot.period,         // ScheduleSlot.period
      activityName: slot.subType ?? slot.location,  // human-readable label
      slotId: slot.id,             // ScheduleSlot.id
    });

    // Find target doctor's user profile
    const { data: targetProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('doctor_id', targetDoctorId)
      .single();

    if (targetProfile) {
      // Send notification to target doctor
      const requesterDoctor = doctors.find(d => d.id === currentDoctorId);
      await createNotification({
        user_id: targetProfile.id,
        type: 'REPLACEMENT_REQUEST',
        title: 'Demande de remplacement',
        body: `Dr ${requesterDoctor?.name ?? 'Inconnu'} vous demande de le remplacer : ${slot.subType ?? slot.location} le ${slot.date} (${slot.period})`,
        data: { requestId, slotId: slot.id },
        read: false,
      });
    }

    setRequestSent(true);
  } catch (e) {
    console.error('Failed to send replacement request:', e);
  } finally {
    setSendingRequestTo(null);
  }
};
```

- [ ] **Step 5: Update the JSX**

Replace the existing "Assigner" button for each available doctor with a "Demander remplacement" button:

```tsx
{/* Where available replacement doctors are listed: */}
{availableDoctors.map(doc => (
  <div key={doc.id} className="flex items-center justify-between p-2 border rounded-lg">
    <span className="text-sm text-gray-700">{doc.name}</span>
    <button
      onClick={() => handleRequestReplacement(doc.id)}
      disabled={sendingRequestTo === doc.id || requestSent}
      className="text-xs bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg hover:bg-blue-200 disabled:opacity-50"
    >
      {sendingRequestTo === doc.id ? 'Envoi...' : 'Demander remplacement'}
    </button>
  </div>
))}

{requestSent && (
  <p className="text-sm text-green-600 font-medium text-center py-2">
    ✓ Demande envoyée — le médecin recevra une notification
  </p>
)}
```

- [ ] **Step 6: Manual test**

1. Trigger a conflict (doctor with DOUBLE_BOOKING) → open conflict resolver
2. Click "Demander remplacement" for an available doctor
3. Confirm "Demande envoyée" message appears
4. Log in as the target doctor → bell shows badge → open notifications → see "Demande de remplacement" with Accept/Reject buttons
5. Click Accept → original doctor's bell shows "Remplacement accepté ✅"

- [ ] **Step 7: Commit**

```bash
git add components/ConflictResolverModal.tsx
git commit -m "feat(conflicts): replace direct assign with notification-based replacement request"
```

---

## Phase 7 — Personal Agenda (Week + Month)

### Task 17: Create `PersonalAgendaWeek` component

**Files:**
- Create: `components/PersonalAgendaWeek.tsx`

**Note on `generateScheduleForWeek` signature:**
```typescript
generateScheduleForWeek(
  mondayDate: Date,
  template: ScheduleTemplateSlot[],
  unavailabilities: Unavailability[],   // 3rd param
  doctors: Doctor[],                    // 4th param
  activities: ActivityDefinition[],     // 5th param
  rcpDefinitions: RcpDefinition[],      // 6th param
  forceRegenerateActivities?: boolean,  // 7th (default true)
  shiftHistory?: ShiftHistory,          // 8th (default {})
  rcpAttendance?: RcpAttendance,        // 9th
  rcpExceptions?: RcpException[]        // 10th
)
```
**Do NOT pass `postes` or `manualOverrides` — they are not parameters of this function.**

- [ ] **Step 1: Write the component**

```tsx
// components/PersonalAgendaWeek.tsx
import React, { useMemo, useContext } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { AppContext } from '../App';
import { useAuth } from '../context/AuthContext';
import { generateScheduleForWeek } from '../services/scheduleService';
import { DayOfWeek, Period, SlotType } from '../types';

interface Props {
  weekOffset: number;
  onOffsetChange: (offset: number) => void;
}

const DAY_ORDER = [DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY, DayOfWeek.THURSDAY, DayOfWeek.FRIDAY];
const PERIODS = [Period.MORNING, Period.AFTERNOON];

const TYPE_COLOR: Record<string, string> = {
  [SlotType.CONSULTATION]: 'bg-blue-100 text-blue-800 border-blue-200',
  [SlotType.RCP]:          'bg-green-100 text-green-800 border-green-200',
  [SlotType.ACTIVITY]:     'bg-orange-100 text-orange-800 border-orange-200',
  LEAVE:                   'bg-gray-100 text-gray-600 border-gray-200',
};

const PersonalAgendaWeek: React.FC<Props> = ({ weekOffset, onOffsetChange }) => {
  const {
    doctors, template, unavailabilities,
    activityDefinitions, rcpTypes, rcpAttendance, rcpExceptions,
  } = useContext(AppContext);

  const { profile } = useAuth();
  const doctorId = profile?.doctor_id;

  const weekStart = useMemo(() => {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(now);
    monday.setDate(diff + weekOffset * 7);
    monday.setHours(0, 0, 0, 0);
    return monday;
  }, [weekOffset]);

  const schedule = useMemo(() => {
    if (!doctorId) return [];
    return generateScheduleForWeek(
      weekStart,
      template,
      unavailabilities,
      doctors,
      activityDefinitions,
      rcpTypes,
      false,          // forceRegenerateActivities
      {},             // shiftHistory — not needed for display
      rcpAttendance,
      rcpExceptions,
    );
  }, [weekStart, template, unavailabilities, doctors, activityDefinitions, rcpTypes, rcpAttendance, rcpExceptions, doctorId]);

  // Build grid: day → period → my slots + leaves
  const grid = useMemo(() => {
    const result: Record<string, Record<string, any[]>> = {};

    for (const day of DAY_ORDER) {
      result[day] = {};
      for (const period of PERIODS) {
        const d = new Date(weekStart);
        d.setDate(weekStart.getDate() + DAY_ORDER.indexOf(day));
        const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

        const onLeave = unavailabilities.some(u =>
          u.doctorId === doctorId &&
          dateStr >= u.startDate && dateStr <= u.endDate &&
          (!u.period || u.period === 'ALL_DAY' || u.period === period)
        );

        if (onLeave) {
          result[day][period] = [{ id: 'leave-' + dateStr, type: 'LEAVE', location: 'Congé / Indispo', date: dateStr }];
        } else {
          result[day][period] = schedule.filter(s =>
            s.day === day && s.period === period &&
            (s.assignedDoctorId === doctorId || s.secondaryDoctorIds?.includes(doctorId!))
          );
        }
      }
    }
    return result;
  }, [schedule, doctorId, unavailabilities, weekStart]);

  const weekLabel = (() => {
    const end = new Date(weekStart);
    end.setDate(weekStart.getDate() + 4);
    const fmt = (d: Date) => d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
    return `${fmt(weekStart)} — ${end.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}`;
  })();

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => onOffsetChange(weekOffset - 1)} className="p-1 hover:bg-gray-100 rounded-lg">
          <ChevronLeft size={18} />
        </button>
        <span className="text-sm font-medium text-gray-700">Semaine du {weekLabel}</span>
        <button onClick={() => onOffsetChange(weekOffset + 1)} className="p-1 hover:bg-gray-100 rounded-lg">
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="grid grid-cols-5 gap-2">
        {DAY_ORDER.map(day => (
          <div key={day}>
            <div className="text-xs font-semibold text-center text-gray-400 uppercase pb-1">
              {day.slice(0, 3)}
            </div>
            {PERIODS.map(period => (
              <div key={period} className="mb-1">
                <div className="text-xs text-gray-400 mb-0.5 text-center">
                  {period === Period.MORNING ? 'AM' : 'PM'}
                </div>
                {grid[day][period].length === 0
                  ? <div className="h-12 rounded-lg border border-dashed border-gray-200 bg-gray-50" />
                  : grid[day][period].map((slot: any) => (
                      <div key={slot.id}
                        className={`text-xs rounded-lg border px-1.5 py-1 mb-0.5 ${TYPE_COLOR[slot.type] ?? 'bg-gray-100'}`}>
                        <span className="font-medium truncate block">{slot.location}</span>
                        {slot.subType && <span className="opacity-70 truncate block">{slot.subType}</span>}
                      </div>
                    ))
                }
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

export default PersonalAgendaWeek;
```

- [ ] **Step 2: Build check**

```bash
npm run build 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add components/PersonalAgendaWeek.tsx
git commit -m "feat(agenda): add PersonalAgendaWeek component"
```

---

### Task 18: Create `PersonalAgendaMonth` component

**Files:**
- Create: `components/PersonalAgendaMonth.tsx`

- [ ] **Step 1: Write the component**

```tsx
// components/PersonalAgendaMonth.tsx
import React, { useMemo, useContext, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { AppContext } from '../App';
import { useAuth } from '../context/AuthContext';
import { generateScheduleForWeek } from '../services/scheduleService';
import { SlotType } from '../types';

const DOT_COLOR: Record<string, string> = {
  [SlotType.CONSULTATION]: 'bg-blue-400',
  [SlotType.RCP]:          'bg-green-400',
  [SlotType.ACTIVITY]:     'bg-orange-400',
  LEAVE:                   'bg-gray-400',
};

const toKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

const PersonalAgendaMonth: React.FC = () => {
  const {
    doctors, template, unavailabilities,
    activityDefinitions, rcpTypes, rcpAttendance, rcpExceptions,
  } = useContext(AppContext);

  const { profile } = useAuth();
  const doctorId = profile?.doctor_id;

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const prevMonth = () => { if (month === 0) { setYear(y => y-1); setMonth(11); } else setMonth(m => m-1); };
  const nextMonth = () => { if (month === 11) { setYear(y => y+1); setMonth(0); } else setMonth(m => m+1); };

  // Calendar grid: first Monday on or before 1st of month
  const weeks: Date[][] = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const offset = (firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1);
    const start = new Date(firstDay);
    start.setDate(firstDay.getDate() - offset);
    return Array.from({ length: 6 }, (_, w) =>
      Array.from({ length: 7 }, (_, d) => {
        const date = new Date(start);
        date.setDate(start.getDate() + w * 7 + d);
        return date;
      })
    );
  }, [year, month]);

  // Generate slots for each visible Monday
  const scheduleByDate = useMemo(() => {
    if (!doctorId) return {};
    const result: Record<string, any[]> = {};
    const mondays = weeks.map(w => w[0]);
    for (const monday of mondays) {
      const slots = generateScheduleForWeek(
        monday,
        template,
        unavailabilities,
        doctors,
        activityDefinitions,
        rcpTypes,
        false,
        {},
        rcpAttendance,
        rcpExceptions,
      );
      for (const slot of slots) {
        if (slot.assignedDoctorId !== doctorId && !slot.secondaryDoctorIds?.includes(doctorId)) continue;
        const key = slot.date;
        if (!result[key]) result[key] = [];
        result[key].push(slot);
      }
    }
    return result;
  }, [year, month, doctorId, template, unavailabilities, doctors, activityDefinitions, rcpTypes, rcpAttendance, rcpExceptions]);

  const monthLabel = new Date(year, month).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button onClick={prevMonth} className="p-1 hover:bg-gray-100 rounded-lg"><ChevronLeft size={18} /></button>
        <span className="text-sm font-semibold text-gray-700 capitalize">{monthLabel}</span>
        <button onClick={nextMonth} className="p-1 hover:bg-gray-100 rounded-lg"><ChevronRight size={18} /></button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {['L','M','M','J','V','S','D'].map((d, i) => (
          <div key={i} className="text-xs text-center text-gray-400 font-medium py-1">{d}</div>
        ))}
      </div>

      {/* Calendar cells */}
      <div className="grid grid-cols-7 gap-0.5">
        {weeks.flat().map((date, i) => {
          const key = toKey(date);
          const slots = scheduleByDate[key] ?? [];
          const onLeave = unavailabilities.some(u =>
            u.doctorId === doctorId && key >= u.startDate && key <= u.endDate
          );
          const isCurrentMonth = date.getMonth() === month;
          const isToday = key === toKey(today);
          const isSelected = key === selectedDate;
          const dotTypes = [...new Set([...(onLeave ? ['LEAVE'] : []), ...slots.map(s => s.type)])].slice(0, 3);

          return (
            <div key={i}
              onClick={() => setSelectedDate(isSelected ? null : key)}
              className={`min-h-[52px] rounded-lg p-1 cursor-pointer transition-colors
                ${isCurrentMonth ? 'bg-white hover:bg-gray-50' : 'bg-gray-50 opacity-40'}
                ${isToday ? 'ring-2 ring-blue-400' : ''}
                ${isSelected ? 'ring-2 ring-indigo-400 bg-indigo-50' : ''}
              `}>
              <div className={`text-xs text-center mb-1 ${isToday ? 'font-bold text-blue-600' : 'text-gray-600'}`}>
                {date.getDate()}
              </div>
              <div className="flex flex-wrap gap-0.5 justify-center">
                {dotTypes.map((type, j) => (
                  <span key={j} className={`w-1.5 h-1.5 rounded-full ${DOT_COLOR[type] ?? 'bg-gray-300'}`} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Day detail */}
      {selectedDate && (
        <div className="mt-3 p-3 bg-gray-50 rounded-xl border border-gray-200 text-sm">
          <p className="font-semibold text-gray-700 mb-2 capitalize">
            {new Date(selectedDate + 'T12:00:00').toLocaleDateString('fr-FR', {
              weekday: 'long', day: '2-digit', month: 'long'
            })}
          </p>
          {(() => {
            const daySlots = scheduleByDate[selectedDate] ?? [];
            const onLeave = unavailabilities.some(u =>
              u.doctorId === doctorId && selectedDate >= u.startDate && selectedDate <= u.endDate
            );
            if (onLeave) return <p className="text-gray-500">Congé / Indisponibilité</p>;
            if (daySlots.length === 0) return <p className="text-gray-400">Aucune activité</p>;
            return daySlots.map((s: any) => (
              <div key={s.id} className="flex items-center gap-2 py-1">
                <span className={`w-2 h-2 rounded-full shrink-0 ${DOT_COLOR[s.type] ?? 'bg-gray-300'}`} />
                <span className="text-gray-700">{s.location}</span>
                {s.subType && <span className="text-gray-400">— {s.subType}</span>}
                <span className="text-gray-400 text-xs ml-auto">{s.period}</span>
              </div>
            ));
          })()}
        </div>
      )}
    </div>
  );
};

export default PersonalAgendaMonth;
```

- [ ] **Step 2: Commit**

```bash
git add components/PersonalAgendaMonth.tsx
git commit -m "feat(agenda): add PersonalAgendaMonth calendar component"
```

---

### Task 19: Integrate agenda into `Profile.tsx`

**Files:**
- Modify: `pages/Profile.tsx`

- [ ] **Step 1: Add imports**

```typescript
import { Calendar } from 'lucide-react';
import PersonalAgendaWeek from '../components/PersonalAgendaWeek';
import PersonalAgendaMonth from '../components/PersonalAgendaMonth';
```

- [ ] **Step 2: Add state variables**

```typescript
const [agendaView, setAgendaView] = useState<'week' | 'month'>('week');
const [agendaWeekOffset, setAgendaWeekOffset] = useState(0);
```

- [ ] **Step 3: Add "Mon Planning" tab and content**

Add to tab definitions:
```typescript
{ id: 'agenda', label: 'Mon Planning', icon: <Calendar size={16} /> }
```

Add tab content:
```tsx
{activeTab === 'agenda' && (
  <div className="space-y-4">
    {/* Week / Month toggle */}
    <div className="flex gap-2">
      <button
        onClick={() => setAgendaView('week')}
        className={`px-4 py-1.5 text-sm rounded-lg font-medium transition-colors
          ${agendaView === 'week' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
        Semaine
      </button>
      <button
        onClick={() => setAgendaView('month')}
        className={`px-4 py-1.5 text-sm rounded-lg font-medium transition-colors
          ${agendaView === 'month' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
        Mois
      </button>
    </div>

    {agendaView === 'week'
      ? <PersonalAgendaWeek weekOffset={agendaWeekOffset} onOffsetChange={setAgendaWeekOffset} />
      : <PersonalAgendaMonth />
    }
  </div>
)}
```

- [ ] **Step 4: Full build and smoke test**

```bash
npm run build && npm run dev
```

Manual test:
1. Log in as a doctor → Profile → "Mon Planning" tab
2. Week view: slots appear for current week in correct day/period cells
3. Navigate weeks: data updates
4. Switch to Month: calendar grid with colored dots
5. Click a day: popover shows activities, RCP, leaves

- [ ] **Step 5: Final commit**

```bash
git add pages/Profile.tsx
git commit -m "feat(profile): add week + month personal agenda to Profile page"
```

---

## Final Checklist

- [ ] Migrations 15–18 applied in Supabase SQL Editor (existing migrations 01–14 should NOT be re-run)
- [ ] VAPID keys generated and stored (`.env.local` + Supabase Edge Function Secrets)
- [ ] Edge Functions deployed: `rcp-auto-assign`, `rcp-reminders`
- [ ] pg_cron jobs created in Supabase SQL Editor
- [ ] RCP locking tested (first PRÉSENT disables button for others, shows "Confirmé — Dr X")
- [ ] Admin deadline config saves and appears in Configuration
- [ ] Bell icon shows badge counter in header
- [ ] Notification dropdown lists notifications with correct types
- [ ] Profile "Mon Planning" tab shows week + month agenda
- [ ] Profile "Notifications" section replaces old RCP count widget
- [ ] Conflict modal sends notification instead of direct assign
- [ ] Target doctor sees Accept/Reject in bell dropdown → resolves → requester notified
- [ ] `npm run build` passes with zero TypeScript errors

---

## Key Files Reference

| File | Role |
|------|------|
| `types.ts` | All TypeScript types |
| `App.tsx` | Context state + NotificationProvider wrapper |
| `services/notificationService.ts` | Notification CRUD + realtime |
| `services/pushService.ts` | Web Push subscription management |
| `services/replacementService.ts` | Replacement request CRUD |
| `services/rcpAutoConfigService.ts` | Admin deadline config |
| `context/NotificationContext.tsx` | Global notification state |
| `components/NotificationBell.tsx` | Bell icon + dropdown + Replace Actions |
| `components/PersonalAgendaWeek.tsx` | Week view agenda |
| `components/PersonalAgendaMonth.tsx` | Month calendar agenda |
| `supabase/functions/rcp-auto-assign/` | Auto-assignment cron (reads from `doctors`, `schedule_templates`, `rcp_definitions`, `rcp_attendance`) |
| `supabase/functions/rcp-reminders/` | 24h/12h reminder cron |
| `pages/Profile.tsx` | Notification list + agenda tabs + RCP lock UI |
| `pages/Configuration.tsx` | Admin deadline config UI |
| `components/ConflictResolverModal.tsx` | Notification-based replacement request flow |

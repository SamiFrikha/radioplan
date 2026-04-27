# Jours fériés, congés enrichis, corrections MonPlanning & Conflits — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Afficher les jours fériés français dans Mon Planning, enrichir l'affichage des congés avec statut de remplacement et clickabilité, supprimer les RCP parasites, et corriger le bug d'auto-remplacement dans l'onglet Conflits du profil.

**Architecture:** 4 fichiers modifiés. PersonalAgendaWeek et PersonalAgendaMonth reçoivent de nouveaux props et une logique de schedule scindée (rawSchedule + schedule avec overrides). MonPlanning.tsx orchestre le mini-modal résolu. Profile.tsx reçoit un fix ponctuel.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, `isFrenchHoliday()` de `scheduleService.ts`, `manualOverrides: Record<string, string>` pour les statuts de remplacement.

**Spec:** `docs/superpowers/specs/2026-04-27-feries-conges-conflits-design.md`

---

## Fichiers modifiés

| Fichier | Rôle des changements |
|---|---|
| `pages/Profile.tsx` | Fix isResolved (~ligne 1944) |
| `components/PersonalAgendaWeek.tsx` | Suppression missedRcps, jours fériés headers, rawSchedule split, conflictSlots enrichis + cliquables, nouveaux props |
| `components/PersonalAgendaMonth.tsx` | Jours fériés cellules, rawScheduleByDate split, micro-indicateurs congé, popup enrichi, nouveaux props |
| `pages/MonPlanning.tsx` | Gestion nouveaux props, mini-modal détail résolu, handler onConflictClick |

**Planning.tsx : inchangé.**

---

## Task 1 : Fix Profile.tsx — bug auto-remplacement invalide

**Fichier :** `pages/Profile.tsx`

### Contexte
Actuellement lignes ~1944–1948 :
```typescript
const rawOverride = manualOverrides[conflict.slotId] ?? '';
const isResolved = rawOverride !== '' && rawOverride !== '__CLOSED__';
const isClosed = rawOverride === '__CLOSED__';
const resolvedDoctorId = rawOverride.startsWith('auto:') ? rawOverride.substring(5) : rawOverride;
const resolvedDoctor = isResolved ? doctors.find(d => d.id === resolvedDoctorId) : null;
```
Si `rawOverride` = l'ID du médecin absent lui-même, `isResolved = true` à tort → conflit affiché "résolu par lui-même" et non cliquable.

- [ ] **Remplacer le bloc complet** (les 5 lignes ci-dessus) par :

```typescript
const rawOverride = manualOverrides[conflict.slotId] ?? '';
const isClosed = rawOverride === '__CLOSED__';
const resolvedDoctorId = rawOverride.startsWith('auto:') ? rawOverride.substring(5) : rawOverride;
const isResolved = rawOverride !== '' && !isClosed && resolvedDoctorId !== conflict.doctorId;
const resolvedDoctor = isResolved ? doctors.find(d => d.id === resolvedDoctorId) : null;
```

- [ ] **Vérification manuelle** : Un médecin absent avec un conflit Unity dont `manualOverrides[slotId]` = son propre ID doit voir le conflit en rouge "non résolu" et cliquable (pas vert "résolu par lui-même").

- [ ] **Commit**
```bash
git add pages/Profile.tsx
git commit -m "fix: conflit non résolu si l'override désigne le médecin absent lui-même"
```

---

## Task 2 : Supprimer `missedRcps` de PersonalAgendaWeek

**Fichier :** `components/PersonalAgendaWeek.tsx`

### Contexte
`missedRcps` affiche en bas de chaque colonne les RCP gérées par d'AUTRES médecins pendant l'absence du médecin connecté. Ces cards en pointillés "SARCOME · Indisponible · Dr GRELLIER" ne concernent pas l'utilisateur.

- [ ] **Supprimer le useMemo `missedRcps`** (~ligne 140, environ 16 lignes) :
```typescript
// SUPPRIMER ce bloc entier :
const missedRcps = useMemo(() => {
  if (!doctorId) return [];
  return schedule.filter(s => {
    if (s.type !== SlotType.RCP || s.isCancelled) return false;
    const isAssigned = s.assignedDoctorId === doctorId ||
      (s.secondaryDoctorIds ?? []).includes(doctorId);
    if (isAssigned) return false;
    const isUnavailable = unavailabilities.some((u: any) =>
      u.doctorId === doctorId &&
      s.date >= u.startDate && s.date <= u.endDate
    );
    return isUnavailable && !!s.assignedDoctorId;
  });
}, [schedule, doctorId, unavailabilities]);
```

- [ ] **Supprimer le bloc de rendu `dayMissed`** en desktop (~ligne 699, environ 22 lignes) :
```typescript
// SUPPRIMER ce bloc entier (dans la grid desktop) :
{(() => {
  const dayMissed = missedRcps.filter(s => s.date === dateStr);
  if (dayMissed.length === 0) return null;
  return dayMissed.map(s => {
    const assignedDoc = doctors.find((d: any) => d.id === s.assignedDoctorId);
    return (
      <div key={`missed-${s.id}`} ...>
        ...
      </div>
    );
  });
})()}
```

- [ ] **Supprimer le bloc de rendu `allConflictSlots` / `conf-mob`** en mobile (~ligne 353–355 et ~ligne 436–462 de la section mobile) :
  - Ligne ~353 : `const allConflictSlots = periods.flatMap((p: any) => p.conflictSlots || []);`
  - Le bloc `{allConflictSlots.map((slot: any) => { ... })}` dans la section mobile — **NE PAS SUPPRIMER**, ce sont les vrais conflictSlots du médecin. Supprimer uniquement le bloc `missedRcps` qui était distinct.

> **Note :** `allConflictSlots` (issu de `periods.conflictSlots`) est différent de `missedRcps`. Ne pas confondre. Seul le useMemo `missedRcps` et son rendu desktop sont supprimés.

- [ ] **Vérification** : `npm run build` sans erreurs TypeScript.

- [ ] **Commit**
```bash
git add components/PersonalAgendaWeek.tsx
git commit -m "fix: supprimer missedRcps (RCP autres médecins affichées pendant absence)"
```

---

## Task 3 : Jours fériés dans PersonalAgendaWeek

**Fichier :** `components/PersonalAgendaWeek.tsx`

### 3a — Importer `isFrenchHoliday`

- [ ] Modifier l'import existant :
```typescript
// Avant :
import { generateScheduleForWeek } from '../services/scheduleService';

// Après :
import { generateScheduleForWeek, isFrenchHoliday } from '../services/scheduleService';
```

### 3b — Header desktop (dans la grille 5 colonnes)

Localiser le header de colonne dans la grid desktop (~ligne 518) :
```tsx
<div key={day} className="flex flex-col gap-1">
  {/* Day header */}
  <div className={`text-center rounded-card py-1.5 px-1 ${isToday ? 'bg-gradient-primary' : 'bg-muted'}`}>
    <p className={`text-xs font-bold uppercase tracking-wide ${isToday ? 'text-white' : 'text-text-muted'}`}>
      {DAY_LABELS[day]}
    </p>
    <p className={`text-sm font-semibold ${isToday ? 'text-white' : 'text-text-base'}`}>
      {date.getDate()}
    </p>
  </div>
```

- [ ] **Remplacer par** (ajouter `holiday` et adapter les classes) :
```tsx
<div key={day} className="flex flex-col gap-1">
  {/* Day header */}
  {(() => {
    const holiday = isFrenchHoliday(dateStr);
    if (isToday) {
      return (
        <div className="text-center rounded-card py-1.5 px-1 bg-gradient-primary">
          <p className="text-xs font-bold uppercase tracking-wide text-white">{DAY_LABELS[day]}</p>
          <p className="text-sm font-semibold text-white">{date.getDate()}</p>
          {holiday && <p className="text-[8px] text-white/80 truncate">{holiday.name.substring(0, 12)}</p>}
        </div>
      );
    }
    if (holiday) {
      return (
        <div className="text-center rounded-card py-1.5 px-1 bg-red-50 border border-red-200">
          <p className="text-xs font-bold uppercase tracking-wide text-red-500">{DAY_LABELS[day]}</p>
          <p className="text-sm font-semibold text-red-600">{date.getDate()}</p>
          <p className="text-[8px] text-red-400 truncate">{holiday.name.substring(0, 12)}</p>
        </div>
      );
    }
    return (
      <div className="text-center rounded-card py-1.5 px-1 bg-muted">
        <p className="text-xs font-bold uppercase tracking-wide text-text-muted">{DAY_LABELS[day]}</p>
        <p className="text-sm font-semibold text-text-base">{date.getDate()}</p>
      </div>
    );
  })()}
```

### 3c — Header mobile (cercles de date, section `if (isMobile)`)

Localiser le cercle de date mobile (~ligne 363) :
```tsx
{isToday ? (
  <div className="w-9 h-9 rounded-full bg-gradient-primary flex items-center justify-center flex-shrink-0">
    <span className="text-sm font-bold text-white tabular-nums">{dayNumber}</span>
  </div>
) : (
  <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
    <span className="text-sm font-medium text-text-muted tabular-nums">{dayNumber}</span>
  </div>
)}
```

- [ ] **Remplacer par** (ajouter la variable `holiday` dans la déstructuration du map et adapter le rendu) :

Ajouter `const holiday = isFrenchHoliday(dateStr);` juste avant ce bloc, puis :
```tsx
{isToday ? (
  <div className="flex flex-col items-center gap-0.5">
    <div className="w-9 h-9 rounded-full bg-gradient-primary flex items-center justify-center flex-shrink-0">
      <span className="text-sm font-bold text-white tabular-nums">{dayNumber}</span>
    </div>
    {holiday && <span className="text-[8px] text-red-400 truncate max-w-[40px] text-center leading-tight">{holiday.name.substring(0, 10)}</span>}
  </div>
) : holiday ? (
  <div className="flex flex-col items-center gap-0.5">
    <div className="w-9 h-9 rounded-full bg-red-50 border-2 border-red-300 flex items-center justify-center flex-shrink-0">
      <span className="text-sm font-medium text-red-600 tabular-nums">{dayNumber}</span>
    </div>
    <span className="text-[8px] text-red-400 truncate max-w-[40px] text-center leading-tight">{holiday.name.substring(0, 10)}</span>
  </div>
) : (
  <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
    <span className="text-sm font-medium text-text-muted tabular-nums">{dayNumber}</span>
  </div>
)}
```

- [ ] **Vérification** : Naviguer à une semaine contenant un jour férié (ex. semaine du 1er mai 2026). Le header doit apparaître en rouge avec le nom "Fête du Travail".

- [ ] **Commit**
```bash
git add components/PersonalAgendaWeek.tsx
git commit -m "feat: jours fériés français dans les headers de PersonalAgendaWeek"
```

---

## Task 4 : Jours fériés dans PersonalAgendaMonth

**Fichier :** `components/PersonalAgendaMonth.tsx`

### 4a — Importer `isFrenchHoliday`

- [ ] :
```typescript
import { generateScheduleForWeek, isFrenchHoliday } from '../services/scheduleService';
```

### 4b — Afficher le nom dans la cellule

Localiser l'affichage du numéro du jour dans chaque cellule (~ligne 393) :
```tsx
{/* Day number */}
<div className={`mb-0.5 ${
  isToday
    ? 'w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-primary text-white flex items-center justify-center mx-auto text-[10px] sm:text-xs font-bold'
    : 'text-xs sm:text-sm text-center font-medium text-text-base'
}`}>
  {date.getDate()}
</div>
```

- [ ] **Ajouter `const holiday = isFrenchHoliday(key);`** juste avant ce bloc (mais après la déclaration de `key`), puis remplacer le bloc par :
```tsx
{/* Day number */}
<div className={`mb-0.5 ${
  isToday
    ? 'w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-primary text-white flex items-center justify-center mx-auto text-[10px] sm:text-xs font-bold'
    : holiday
      ? 'text-xs sm:text-sm text-center font-medium text-red-600'
      : 'text-xs sm:text-sm text-center font-medium text-text-base'
}`}>
  {date.getDate()}
</div>
{holiday && isCurrentMonth && !isWeekend && (
  <div className="text-[8px] text-red-400 text-center leading-tight truncate mb-0.5">
    {holiday.name.substring(0, 10)}
  </div>
)}
```

- [ ] **Vérification** : Vue mois de mai 2026 — le 1er (Fête du Travail) et le 8 (Victoire 1945) doivent avoir le numéro en rouge + micro-label.

- [ ] **Commit**
```bash
git add components/PersonalAgendaMonth.tsx
git commit -m "feat: jours fériés français dans les cellules de PersonalAgendaMonth"
```

---

## Task 5 : PersonalAgendaWeek — rawSchedule + conflictSlots enrichis

**Fichier :** `components/PersonalAgendaWeek.tsx`

### Contexte technique important
Pour afficher le statut "Remplacé par Dr. X" dans les conflictSlots, on a besoin de savoir quels slots étaient **originellement** assignés au médecin **avant** l'application des `manualOverrides`. Actuellement, `schedule` applique les overrides, donc un slot avec un remplaçant a `assignedDoctorId = replacementId` et disparaît de la vue du médecin absent.

**Solution :** Séparer `schedule` en deux useMemos :
- `rawSchedule` : généré sans overrides (ni replacement, ni `__CLOSED__`)
- `schedule` : rawSchedule avec overrides appliqués (comportement actuel)

`conflictSlots` utilisera `rawSchedule` pour trouver les slots originaux, puis `manualOverrides` pour le statut.

### 5a — Séparer `schedule` en `rawSchedule` + `schedule`

- [ ] **Remplacer le useMemo `schedule` unique** par deux useMemos :

```typescript
// 1. Raw schedule — generated, no override application
const rawSchedule = useMemo(() => {
  if (!doctorId) return [];
  return generateScheduleForWeek(
    weekStart, template, unavailabilities, doctors,
    activityDefinitions, rcpTypes, false, {}, rcpAttendance, rcpExceptions,
  );
}, [weekStart, template, unavailabilities, doctors, activityDefinitions, rcpTypes, rcpAttendance, rcpExceptions, doctorId]);

// 2. Schedule with overrides applied — used for normal slot display
const schedule = useMemo(() => {
  return rawSchedule.map(slot => {
    const overrideValue = manualOverrides[slot.id];
    if (!overrideValue || overrideValue === '__CLOSED__') return slot;
    const isAuto = overrideValue.startsWith('auto:');
    const assignedId = isAuto ? overrideValue.substring(5) : overrideValue;
    return { ...slot, assignedDoctorId: assignedId };
  });
}, [rawSchedule, manualOverrides]);
```

> Le reste du code qui référence `schedule` reste inchangé.

### 5b — Modifier le calcul de `conflictSlots` dans `days`

Localiser dans le useMemo `days` le bloc `if (onLeave)` (~ligne 173) :
```typescript
const conflictSlots = schedule.filter(s =>
  s.day === day && s.period === period &&
  (s.assignedDoctorId === doctorId || s.secondaryDoctorIds?.includes(doctorId!))
);
```

- [ ] **Remplacer par** (utiliser `rawSchedule` au lieu de `schedule`) :
```typescript
const conflictSlots = rawSchedule.filter(s =>
  s.day === day && s.period === period &&
  (s.assignedDoctorId === doctorId || s.secondaryDoctorIds?.includes(doctorId!))
);
```

Ajouter `rawSchedule` aux dépendances du useMemo `days`.

### 5c — Ajouter les nouveaux props à l'interface

- [ ] **Modifier l'interface Props** (~ligne 12) :
```typescript
interface Props {
  weekOffset: number;
  onOffsetChange: (offset: number) => void;
  onConsultClick?: (slot: any) => void;
  onRcpClick?: (slot: any) => void;
  onActivityClick?: (slot: any) => void;
  onConflictClick?: (slot: any) => void;
  onResolvedConflictClick?: (slot: any, replacementDoctorId: string | null) => void;
}
```

- [ ] **Déstructurer les nouveaux props** dans la signature du composant :
```typescript
const PersonalAgendaWeek: React.FC<Props> = ({
  weekOffset, onOffsetChange,
  onConsultClick, onRcpClick, onActivityClick,
  onConflictClick, onResolvedConflictClick,  // NEW
}) => {
```

### 5d — Enrichir le rendu des `conflictSlots` en DESKTOP

Localiser le bloc `{conflictSlots?.map((slot: any) => { ... })}` dans la grid desktop (~ligne 675).

- [ ] **Remplacer le corps du map** par la version enrichie :
```tsx
{conflictSlots?.map((slot: any) => {
  const ov = manualOverrides[slot.id] ?? '';
  const isClosed = ov === '__CLOSED__';
  const rawReplacerId = ov.startsWith('auto:') ? ov.substring(5) : ov;
  const isReplaced = ov !== '' && !isClosed && rawReplacerId !== doctorId;
  const replacerDoctor = isReplaced ? doctors.find((d: any) => d.id === rawReplacerId) : null;
  const isResolved = isClosed || isReplaced;

  const name = slot.subType || slot.location
    || (slot.type === SlotType.CONSULTATION ? 'Consult.'
      : slot.type === SlotType.RCP ? 'RCP' : 'Activité');

  const statusColor = isResolved ? '#059669' : '#D97706';
  const statusLabel = isClosed
    ? '✓ Fermé'
    : isReplaced
      ? `✓ ${replacerDoctor?.name || '?'}`
      : '⚠ Non résolu';

  const handleClick = () => {
    if (!isResolved) {
      onConflictClick?.(slot);
    } else {
      onResolvedConflictClick?.(slot, isReplaced ? rawReplacerId : null);
    }
  };

  return (
    <div
      key={`conf-${slot.id}`}
      className={`rounded-btn-sm border border-dashed px-1.5 py-1 mb-0.5 ${(onConflictClick || onResolvedConflictClick) ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
      style={{
        backgroundColor: isResolved ? 'rgba(5,150,105,0.08)' : 'rgba(217,119,6,0.08)',
        borderColor: isResolved ? 'rgba(5,150,105,0.35)' : 'rgba(217,119,6,0.35)',
      }}
      onClick={handleClick}
    >
      <div className="flex items-center gap-1">
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: statusColor }} />
        <span className="text-[10px] font-semibold truncate flex-1" style={{ color: statusColor }}>{name}</span>
      </div>
      <p className="text-[9px] ml-2.5 font-medium truncate" style={{ color: statusColor }}>
        {statusLabel}
      </p>
    </div>
  );
})}
```

### 5e — Enrichir le rendu des `conflictSlots` en MOBILE

Localiser le bloc `{allConflictSlots.map((slot: any) => { ... })}` dans la section mobile (~ligne 436).

- [ ] **Remplacer le corps du map** par la même logique (adapter légèrement pour mobile) :
```tsx
{allConflictSlots.map((slot: any) => {
  const ov = manualOverrides[slot.id] ?? '';
  const isClosed = ov === '__CLOSED__';
  const rawReplacerId = ov.startsWith('auto:') ? ov.substring(5) : ov;
  const isReplaced = ov !== '' && !isClosed && rawReplacerId !== doctorId;
  const replacerDoctor = isReplaced ? doctors.find((d: any) => d.id === rawReplacerId) : null;
  const isResolved = isClosed || isReplaced;

  const name = slot.subType || slot.location
    || (slot.type === SlotType.CONSULTATION ? 'Consultation'
      : slot.type === SlotType.RCP ? 'RCP' : 'Activité');

  const statusColor = isResolved ? '#059669' : '#D97706';
  const statusLabel = isClosed
    ? '✓ Fermé'
    : isReplaced
      ? `✓ ${replacerDoctor?.name || '?'}`
      : '⚠ Non résolu';

  const handleClick = () => {
    if (!isResolved) onConflictClick?.(slot);
    else onResolvedConflictClick?.(slot, isReplaced ? rawReplacerId : null);
  };

  return (
    <div key={`conf-mob-${slot.id}`} className="relative">
      <div
        className="w-2.5 h-2.5 rounded-full -ml-[22px] mt-3 flex-shrink-0 absolute border-2 border-surface"
        style={{ backgroundColor: statusColor }} aria-hidden="true"
      />
      <div
        className={`flex items-center gap-3 py-2 px-3 rounded-btn-sm opacity-80 ${(onConflictClick || onResolvedConflictClick) ? 'cursor-pointer hover:opacity-100 transition-opacity' : ''}`}
        onClick={handleClick}
      >
        <span className="text-xs font-semibold text-text-muted tabular-nums w-10 flex-shrink-0">
          {slot.period === Period.MORNING ? '08h00' : '14h00'}
        </span>
        <span className="flex-1 min-w-0">
          <span className="text-sm font-medium truncate block" style={{ color: statusColor }}>{name}</span>
          <span className="text-[10px] font-semibold" style={{ color: statusColor }}>{statusLabel}</span>
        </span>
        <span
          className="rounded-full text-[9px] font-bold px-2 py-0.5 text-white flex-shrink-0"
          style={{ backgroundColor: statusColor }}
        >
          {isClosed ? 'FERMÉ' : isReplaced ? 'REMPL.' : 'À résoudre'}
        </span>
      </div>
    </div>
  );
})}
```

- [ ] **Vérification TypeScript** : `npm run build` sans erreurs.

- [ ] **Vérification manuelle** :
  - Naviguer à MonPlanning > Semaine où le médecin est en congé
  - Chaque activité impactée affiche son nom + statut (Non résolu / Fermé / Remplacé par…)
  - Les cartes sont cliquables (curseur pointer)

- [ ] **Commit**
```bash
git add components/PersonalAgendaWeek.tsx
git commit -m "feat: conflictSlots enrichis avec statut remplacement et clickabilité"
```

---

## Task 6 : MonPlanning.tsx — wiring + mini-modal détail

**Fichier :** `pages/MonPlanning.tsx`

### 6a — Imports et état

- [ ] **Ajouter `Period` et `SlotType` aux imports** (si pas déjà présents) :
```typescript
import { ScheduleSlot, SlotType, Period } from '../types';
```

- [ ] **Ajouter l'état `resolvedDetailSlot`** après les états existants :
```typescript
const [resolvedDetailSlot, setResolvedDetailSlot] = useState<{
  slot: ScheduleSlot;
  replacementDoctorId: string | null;
} | null>(null);
```

### 6b — Handlers pour les nouveaux props

- [ ] **Ajouter après `handleActivityCloseSlot`** :
```typescript
const handleConflictClick = (slot: ScheduleSlot) => {
  if (slot.type === SlotType.CONSULTATION) {
    setSelectedConsultSlot(slot);
  } else if (slot.type === SlotType.ACTIVITY) {
    setSelectedActivitySlot(slot);
  }
  // RCP conflicts from leave days: not common, ignore for now
};

const handleResolvedConflictClick = (slot: ScheduleSlot, replacementDoctorId: string | null) => {
  setResolvedDetailSlot({ slot, replacementDoctorId });
};
```

### 6c — Passer les props à PersonalAgendaWeek

Localiser l'usage de `<PersonalAgendaWeek` (~ligne 141) et ajouter les deux nouveaux props :
```tsx
<PersonalAgendaWeek
  weekOffset={agendaWeekOffset}
  onOffsetChange={setAgendaWeekOffset}
  onConsultClick={setSelectedConsultSlot}
  onRcpClick={setSelectedRcpSlot}
  onActivityClick={setSelectedActivitySlot}
  onConflictClick={handleConflictClick}
  onResolvedConflictClick={handleResolvedConflictClick}
/>
```

### 6d — Mini-modal de détail (résolu/fermé)

- [ ] **Ajouter le mini-modal** après le dernier modal existant (`{selectedRcpSlot && ...}`) :

```tsx
{resolvedDetailSlot && (() => {
  const { slot, replacementDoctorId } = resolvedDetailSlot;
  const isClosed = replacementDoctorId === null;
  const replacerDoctor = replacementDoctorId
    ? doctors.find(d => d.id === replacementDoctorId)
    : null;
  const absentDoctor = doctors.find(d => d.id === profile?.doctor_id);
  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={() => setResolvedDetailSlot(null)}
    >
      <div
        className="bg-surface rounded-2xl shadow-modal max-w-sm w-full p-5 border border-border/60"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-border">
          <h3 className="font-bold text-base text-text-base">Détail du remplacement</h3>
          <button
            onClick={() => setResolvedDetailSlot(null)}
            className="w-8 h-8 flex items-center justify-center hover:bg-muted rounded-lg text-text-muted transition-colors"
          >
            <span className="text-lg leading-none">✕</span>
          </button>
        </div>
        <div className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-text-muted">Activité</span>
            <span className="font-semibold text-text-base">
              {slot.subType || slot.location || 'Activité'}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-text-muted">Date</span>
            <span className="font-semibold text-text-base">
              {slot.date
                ? new Date(slot.date + 'T12:00').toLocaleDateString('fr-FR', {
                    weekday: 'short', day: 'numeric', month: 'short',
                  })
                : slot.day ?? ''}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-text-muted">Créneau</span>
            <span className="font-semibold text-text-base">
              {slot.period === Period.MORNING ? 'Matin' : 'Après-midi'}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-text-muted">Médecin absent</span>
            <span className="font-semibold text-text-base">
              {absentDoctor?.name ?? 'Vous'}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-text-muted">Remplaçant</span>
            <span className="font-semibold text-text-base">
              {isClosed ? 'Créneau fermé' : (replacerDoctor?.name ?? 'Dr. inconnu')}
            </span>
          </div>
          <div className="flex justify-between text-sm border-t border-border pt-3">
            <span className="text-text-muted">Statut</span>
            <span className="font-semibold text-green-600">
              {isClosed ? '✓ Fermé' : '✓ Résolu'}
            </span>
          </div>
        </div>
        <button
          onClick={() => setResolvedDetailSlot(null)}
          className="mt-4 w-full py-2 text-sm font-semibold bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
        >
          Fermer
        </button>
      </div>
    </div>
  );
})()}
```

- [ ] **Vérification TypeScript** : `npm run build` sans erreurs.

- [ ] **Vérification manuelle** :
  - Cliquer sur une carte "⚠ Non résolu" → ouvre ConflictResolverModal
  - Cliquer sur une carte "✓ Remplacé par Dr. X" → ouvre mini-modal avec tous les détails
  - Cliquer sur une carte "✓ Fermé" → ouvre mini-modal (Remplaçant = "Créneau fermé")
  - Overlay du mini-modal : clic en dehors ferme

- [ ] **Commit**
```bash
git add pages/MonPlanning.tsx
git commit -m "feat: mini-modal détail remplacement + wiring onConflictClick dans MonPlanning"
```

---

## Task 7 : PersonalAgendaMonth — congés enrichis + nouveaux props

**Fichier :** `components/PersonalAgendaMonth.tsx`

### 7a — Nouveaux props

- [ ] **Modifier l'interface Props** (~ligne 193) :
```typescript
interface Props {
  onRcpClick?: (slot: any) => void;
  onActivityClick?: (slot: any) => void;
  onConsultClick?: (slot: any) => void;
  onConflictClick?: (slot: any) => void;
  onResolvedConflictClick?: (slot: any, replacementDoctorId: string | null) => void;
}
```

- [ ] **Déstructurer les nouveaux props** dans la signature du composant :
```typescript
const PersonalAgendaMonth: React.FC<Props> = ({
  onRcpClick, onActivityClick, onConsultClick,
  onConflictClick, onResolvedConflictClick,
}) => {
```

### 7b — Séparer `scheduleByDate` en `rawScheduleByDate` + `scheduleByDate`

- [ ] **Renommer le useMemo `scheduleByDate` existant** en `rawScheduleByDate` et supprimer l'application des overrides :
```typescript
const rawScheduleByDate = useMemo(() => {
  if (!doctorId) return {} as Record<string, any[]>;
  const result: Record<string, any[]> = {};
  const mondays = weeks.map(w => w[0]);
  for (const monday of mondays) {
    const generated = generateScheduleForWeek(
      monday, template, unavailabilities, doctors,
      activityDefinitions, rcpTypes, false, {}, rcpAttendance, rcpExceptions,
    );
    for (const slot of generated) {
      const isVisible =
        slot.assignedDoctorId === doctorId ||
        slot.secondaryDoctorIds?.includes(doctorId) ||
        (slot.type === SlotType.RCP && (
          rcpAttendance[slot.id]?.[doctorId] === 'PRESENT' ||
          rcpAttendance[slot.id]?.[doctorId] === 'ABSENT'
        ));
      if (!isVisible) continue;
      const key = slot.date;
      if (!result[key]) result[key] = [];
      result[key].push(slot);
    }
  }
  return result;
}, [year, month, doctorId, template, unavailabilities, doctors, activityDefinitions, rcpTypes, rcpAttendance, rcpExceptions, weeks]);
```

- [ ] **Ajouter un `scheduleByDate`** (avec overrides appliqués) juste après :
```typescript
const scheduleByDate = useMemo(() => {
  const result: Record<string, any[]> = {};
  for (const [date, slots] of Object.entries(rawScheduleByDate)) {
    result[date] = slots.map(slot => {
      const overrideValue = manualOverrides[slot.id];
      if (!overrideValue || overrideValue === '__CLOSED__') return slot;
      const isAuto = overrideValue.startsWith('auto:');
      const assignedId = isAuto ? overrideValue.substring(5) : overrideValue;
      return { ...slot, assignedDoctorId: assignedId };
    });
  }
  return result;
}, [rawScheduleByDate, manualOverrides]);
```

> `scheduleByDate` reste utilisé pour l'affichage normal des slots (pas en congé). `rawScheduleByDate` est utilisé pour les indicateurs de congé.

### 7c — Micro-indicateurs dans la cellule congé

Localiser le bloc `{onLeave && isCurrentMonth && !isWeekend ? (` (~ligne 402) :
```tsx
{onLeave && isCurrentMonth && !isWeekend ? (
  <div
    className="text-[9px] sm:text-[10px] rounded px-1 py-0.5 text-center font-semibold leading-tight text-white mt-0.5"
    style={{ backgroundColor: SLOT_COLORS.LEAVE }}
  >
    Congé
  </div>
```

- [ ] **Remplacer par** (badge Congé + micro-indicateurs) :
```tsx
{onLeave && isCurrentMonth && !isWeekend ? (
  <div className="space-y-0.5">
    <div
      className="text-[9px] sm:text-[10px] rounded px-1 py-0.5 text-center font-semibold leading-tight text-white mt-0.5"
      style={{ backgroundColor: SLOT_COLORS.LEAVE }}
    >
      Congé
    </div>
    {/* Micro-indicateurs des activités impactées */}
    {(() => {
      const dayRawSlots = rawScheduleByDate[key] ?? [];
      // Filter to HALF_DAY slots (WEEKLY shown in banner, not here)
      const impacted = dayRawSlots.filter((s: any) => {
        if (s.type === SlotType.ACTIVITY) {
          const def = activityDefinitions.find((a: any) => a.id === s.activityId);
          return def?.granularity !== 'WEEKLY';
        }
        return true;
      });
      const visible = impacted.slice(0, 2);
      const extra = impacted.length - visible.length;
      return (
        <>
          {visible.map((s: any) => {
            const ov = manualOverrides[s.id] ?? '';
            const isClosed = ov === '__CLOSED__';
            const rawReplacerId = ov.startsWith('auto:') ? ov.substring(5) : ov;
            const isReplaced = ov !== '' && !isClosed && rawReplacerId !== doctorId;
            const isResolved = isClosed || isReplaced;
            const dotColor = isResolved ? '#059669' : '#D97706';
            const actName = s.subType || s.location
              || (s.type === SlotType.CONSULTATION ? 'CS'
                : s.type === SlotType.RCP ? 'RCP' : 'Act.');
            return (
              <div key={s.id} className="flex items-center gap-0.5">
                <span className="w-1.5 h-1.5 rounded-full shrink-0 flex-shrink-0" style={{ backgroundColor: dotColor }} />
                <span className="text-[8px] truncate" style={{ color: dotColor }}>
                  {isResolved ? '✓' : '⚠'} {actName.substring(0, 7)}
                </span>
              </div>
            );
          })}
          {extra > 0 && (
            <span className="text-[8px] text-text-muted">+{extra}</span>
          )}
        </>
      );
    })()}
  </div>
```

### 7d — Enrichir le popup de détail pour les jours en congé

Localiser dans le popup modal `{selectedDate && (` la section `if (onLeave)` (~ligne 521) :
```tsx
if (onLeave) return (
  <div className="flex items-center gap-2 py-2 px-3 rounded-lg bg-muted">
    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: SLOT_COLORS.LEAVE }} />
    <p className="text-text-muted italic text-sm">Congé / Indisponibilité</p>
  </div>
);
```

- [ ] **Remplacer par** (congé + liste des activités impactées) :
```tsx
if (onLeave) {
  const dayRawSlots = rawScheduleByDate[selectedDate] ?? [];
  const impacted = dayRawSlots.filter((s: any) => {
    if (s.type === SlotType.ACTIVITY) {
      const def = activityDefinitions.find((a: any) => a.id === s.activityId);
      return def?.granularity !== 'WEEKLY';
    }
    return true;
  });
  return (
    <div>
      <div className="flex items-center gap-2 py-2 px-3 rounded-lg bg-muted mb-3">
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: SLOT_COLORS.LEAVE }} />
        <p className="text-text-muted italic text-sm">Congé / Indisponibilité</p>
      </div>
      {impacted.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Activités impactées</p>
          {impacted.map((s: any) => {
            const ov = manualOverrides[s.id] ?? '';
            const isClosed = ov === '__CLOSED__';
            const rawReplacerId = ov.startsWith('auto:') ? ov.substring(5) : ov;
            const isReplaced = ov !== '' && !isClosed && rawReplacerId !== doctorId;
            const replacerDoctor = isReplaced ? doctors.find((d: any) => d.id === rawReplacerId) : null;
            const isResolved = isClosed || isReplaced;
            const statusColor = isResolved ? '#059669' : '#D97706';
            const actName = s.subType || s.location
              || (s.type === SlotType.CONSULTATION ? 'Consultation'
                : s.type === SlotType.RCP ? 'RCP' : 'Activité');
            const statusLabel = isClosed
              ? '✓ Fermé'
              : isReplaced
                ? `✓ Remplacé par ${replacerDoctor?.name || '?'}`
                : '⚠ Non résolu';
            const handleClick = () => {
              setSelectedDate(null);
              if (!isResolved) onConflictClick?.(s);
              else onResolvedConflictClick?.(s, isReplaced ? rawReplacerId : null);
            };
            return (
              <div
                key={s.id}
                className={`rounded-lg p-3 border border-dashed ${(onConflictClick || onResolvedConflictClick) ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
                style={{
                  backgroundColor: isResolved ? 'rgba(5,150,105,0.06)' : 'rgba(217,119,6,0.06)',
                  borderColor: isResolved ? 'rgba(5,150,105,0.3)' : 'rgba(217,119,6,0.3)',
                }}
                onClick={handleClick}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold" style={{ color: statusColor }}>{actName}</span>
                  <span className="text-xs font-medium" style={{ color: statusColor }}>{s.period === Period.MORNING ? 'Matin' : 'AM'}</span>
                </div>
                <p className="text-[11px] mt-1" style={{ color: statusColor }}>{statusLabel}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

### 7e — Passer les props depuis MonPlanning.tsx

- [ ] **Modifier l'appel de `<PersonalAgendaMonth`** dans `MonPlanning.tsx` (~ligne 150) :
```tsx
<PersonalAgendaMonth
  onRcpClick={setSelectedRcpSlot}
  onActivityClick={setSelectedActivitySlot}
  onConsultClick={setSelectedConsultSlot}
  onConflictClick={handleConflictClick}
  onResolvedConflictClick={handleResolvedConflictClick}
/>
```

- [ ] **Vérification TypeScript** : `npm run build` sans erreurs.

- [ ] **Vérification manuelle** :
  - Vue mois, cellule en congé : badge "Congé" + micro-indicateurs colorés
  - Clic sur la cellule → popup avec la liste des activités impactées
  - Clic sur activité non résolue dans popup → ferme popup + ouvre ConflictResolverModal
  - Clic sur activité résolue → ferme popup + ouvre mini-modal détail

- [ ] **Commit final**
```bash
git add components/PersonalAgendaMonth.tsx pages/MonPlanning.tsx
git commit -m "feat: PersonalAgendaMonth — congés enrichis avec indicateurs et popup détail"
```

---

## Vérification finale

- [ ] `npm run build` — 0 erreurs TypeScript
- [ ] Naviguer à Mon Planning > Semaine avec jours fériés → headers rouges corrects
- [ ] Naviguer à Mon Planning > Mois avec jours fériés → numéros rouges + micro-labels
- [ ] Médecin en congé > vue semaine → cartes cliquables avec bons statuts
- [ ] Médecin en congé > vue mois → micro-indicateurs + popup enrichi
- [ ] Onglet Conflits du profil → un conflit avec self-override reste rouge et cliquable
- [ ] Aucune régression sur les vues sans congé (slots normaux, RCP, activités)

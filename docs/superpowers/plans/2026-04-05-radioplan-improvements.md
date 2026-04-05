# RadioPlan Améliorations v2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implémenter 12 fonctionnalités/corrections sur l'application RadioPlan (absences éditables J-30, conflits visuels, RCP filtrés, planning interactif, corrections mobile, préférences persistées).

**Architecture:** Pas de nouvelles tables Supabase (sauf colonne `ui_prefs` dans `profiles`). Chaque feature est autonome et modifie 1-3 fichiers. Pas de refactoring global. Pas de test framework — vérification manuelle avec `npm run dev`.

**Tech Stack:** React 19 + TypeScript, Supabase (PostgreSQL), Tailwind CSS, lucide-react, React Router v7

---

## Fichiers impactés

| Fichier | Tâches |
|---|---|
| `supabase/migrations/22_add_ui_prefs_to_profiles.sql` | T1 (nouveau) |
| `pages/Profile.tsx` | T2, T3, T4, T5, T11 |
| `pages/Configuration.tsx` | T6 |
| `pages/MonPlanning.tsx` | T7, T8, T9 |
| `components/PersonalAgendaWeek.tsx` | T8, T9 |
| `components/PersonalAgendaMonth.tsx` | T10 |
| `components/RcpAttendanceModal.tsx` | T9 (nouveau) |
| `pages/Planning.tsx` | T12, T13 |
| `pages/Dashboard.tsx` | T14 |

---

## Task 1 — Migration DB : colonne ui_prefs

**Files:**
- Create: `supabase/migrations/22_add_ui_prefs_to_profiles.sql`

- [ ] **Step 1 : Créer le fichier de migration**

```sql
-- 22_add_ui_prefs_to_profiles.sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ui_prefs JSONB DEFAULT '{}';
```

- [ ] **Step 2 : Appliquer la migration dans Supabase**

Via le dashboard Supabase → SQL Editor, coller et exécuter le contenu. Vérifier que la colonne `ui_prefs` apparaît bien dans la table `profiles`.

- [ ] **Step 3 : Commit**

```bash
git add supabase/migrations/22_add_ui_prefs_to_profiles.sql
git commit -m "feat(db): add ui_prefs JSONB column to profiles (migration 22)"
```

---

## Task 2 — Feature 6 : Profil RCP → dates réellement prévues

**Files:**
- Modify: `pages/Profile.tsx` — fonction `getUpcomingRcps()` lignes ~458-625

**Contexte :** La branche `standardRcps` (lignes ~480-524) itère sur `relevantTemplates` sans vérifier si le RCP est réellement programmé cette semaine-là (fréquence BIWEEKLY/MONTHLY). `getWeekNumber` et `getNthDayOfMonth` sont déjà exportés de `scheduleService.ts` mais pas encore importés dans Profile.tsx.

- [ ] **Step 1 : Ajouter les imports manquants dans Profile.tsx (ligne 17)**

```typescript
// Ligne 17 — remplacer :
import { getDateForDayOfWeek, isFrenchHoliday, generateScheduleForWeek, detectConflicts } from '../services/scheduleService';
// Par :
import { getDateForDayOfWeek, isFrenchHoliday, generateScheduleForWeek, detectConflicts, getWeekNumber, getNthDayOfMonth } from '../services/scheduleService';
```

- [ ] **Step 2 : Dans `getUpcomingRcps()`, calculer `currentWeekNum` pour la semaine cible**

Juste après la ligne `const targetMonday = new Date(currentMonday);` et sa `setDate(...)` (autour de la ligne 469), ajouter :

```typescript
const currentWeekNum = getWeekNumber(targetMonday);
```

- [ ] **Step 3 : Dans la branche `standardRcps`, ajouter les checks de fréquence**

Dans `standardRcps`, la structure est `relevantTemplates.map(t => { ... })`. Remplacer ce `map` par `flatMap` retournant `[]` pour les semaines à sauter, ou plus simple : convertir en `filter + map`. La manière la plus propre pour ce code est d'utiliser une boucle `for...of` avec `continue`. Mais comme c'est un `.map()`, convertir en `.reduce()` ou utiliser un tableau intermédiaire.

La solution la plus propre sans restructurer : transformer le `.map()` en `.flatMap()` qui retourne `[]` pour sauter une semaine :

```typescript
// Remplacer : const standardRcps = relevantTemplates.map(t => {
const standardRcps = relevantTemplates.flatMap(t => {
    const slotDate = getDateForDayOfWeek(targetMonday, t.day);
    const exception = rcpExceptions.find(ex => ex.rcpTemplateId === t.id && ex.originalDate === slotDate);

    // ── Frequency checks (copié depuis scheduleService.ts lignes ~694-710) ──
    const rcpDef = rcpTypes.find(r => r.name === t.location);
    if (rcpDef) {
        if (rcpDef.frequency === 'BIWEEKLY') {
            if (rcpDef.weekParity === 'ODD'  && currentWeekNum % 2 === 0) return [];
            if (rcpDef.weekParity === 'EVEN' && currentWeekNum % 2 !== 0) return [];
            if (!rcpDef.weekParity && currentWeekNum % 2 === 0) return [];
        } else if (rcpDef.frequency === 'MONTHLY') {
            const nth = getNthDayOfMonth(new Date(slotDate));
            if (nth !== (rcpDef.monthlyWeekNumber || 1)) return [];
        } else if (rcpDef.frequency === 'MANUAL') {
            return []; // handled by manualRcps branch
        }
    } else if (t.frequency === 'BIWEEKLY') {
        if (currentWeekNum % 2 === 0) return [];
    }

    // ── isCancelled check ──
    if (exception?.isCancelled) return [];

    // ... reste du corps identique à l'existant ...
    // IMPORTANT : à la fin, retourner [result] au lieu de result
    const displayDate = exception?.newDate || slotDate;
    // ... (garder tout le code existant jusqu'à la fin du map) ...
    return [{ /* objet existant */ }]; // ← wrapper dans un tableau
});
```

**Attention :** Il faut lire le corps complet du `.map()` existant (lignes ~480-524) et l'envelopper dans `flatMap`, en changeant le `return { ... }` final en `return [{ ... }]`.

- [ ] **Step 4 : Vérifier dans le navigateur**

Démarrer `npm run dev`. Aller dans Profil → onglet RCP. Naviguer vers une semaine où un RCP bimensuel ne devrait pas être (ex : semaine suivant la semaine où il a lieu). Vérifier qu'il n'apparaît pas. Naviguer vers la bonne semaine — il doit apparaître.

- [ ] **Step 5 : Commit**

```bash
git add pages/Profile.tsx
git commit -m "fix(profile): filter RCP by actual frequency (BIWEEKLY/MONTHLY/MANUAL)"
```

---

## Task 3 — Feature 7 : Profil RCP → demander/assigner remplacement

**Files:**
- Modify: `pages/Profile.tsx` — onglet `rcp`, rendu des cartes (après ligne ~1435)

**Contexte :** Les cartes RCP montrent déjà les boutons Présent/Absent et éventuellement le bouton "Déplacer". Il faut ajouter deux boutons : "Demander un remplacement" et "Assigner directement" qui ouvrent `ConflictResolverModal`. Le modal est déjà importé (ligne 22). La variable d'état `conflictModalSlot` et `conflictModalConflict` existent déjà. `ConflictResolverModal` est déjà rendu en bas de la page (ligne ~1637).

Il faut aussi calculer `rcpWeekSlots` pour la semaine affichée (comme `slots` prop du modal).

- [ ] **Step 1 : Ajouter le calcul de `rcpWeekSlots` dans Profile.tsx**

Trouver où `conflictsWeekSchedule` est calculé (ligne ~406). Ajouter juste après :

```typescript
// Schedule pour la semaine RCP affichée (notifWeekOffset) — utilisé comme slots prop dans ConflictResolverModal depuis l'onglet RCP
const rcpWeekSlots = useMemo(() => {
    if (!currentDoctor) return [];
    const today = new Date();
    const currentMonday = new Date(today);
    const day = currentMonday.getDay();
    const diff = currentMonday.getDate() - day + (day === 0 ? -6 : 1);
    currentMonday.setDate(diff);
    currentMonday.setHours(0, 0, 0, 0);
    const targetMonday = new Date(currentMonday);
    targetMonday.setDate(targetMonday.getDate() + (notifWeekOffset * 7));
    return generateScheduleForWeek(
        targetMonday, template, unavailabilities, doctors,
        activityDefinitions, rcpTypes, false, {}, rcpAttendance, rcpExceptions
    );
}, [currentDoctor, notifWeekOffset, template, unavailabilities, doctors, activityDefinitions, rcpTypes, rcpAttendance, rcpExceptions]);
```

- [ ] **Step 2 : Dans le rendu des cartes RCP, ajouter les boutons après la zone Présent/Absent**

Localiser la zone des boutons de présence (ligne ~1382) et après la section `Déplacer` (ligne ~1437-1459), à l'intérieur du bloc `{!rcp.isCancelled && (...)}`  et après les `colleaguesStatus`, ajouter :

```typescript
{/* Replacement / direct assignment buttons */}
{rcp.myStatus !== 'PRESENT' && (
    <div className="flex gap-2 mt-3 pt-3 border-t border-border">
        <button
            onClick={() => {
                const syntheticSlot: ScheduleSlot = {
                    id: rcp.generatedId,
                    date: rcp.date,
                    day: rcp.template.day,
                    period: rcp.template.period ?? Period.MORNING,
                    time: rcp.template.time,
                    location: rcp.template.location || rcp.template.id,
                    subType: rcp.template.location,
                    type: SlotType.RCP,
                    assignedDoctorId: currentDoctor!.id,
                    secondaryDoctorIds: rcp.template.secondaryDoctorIds ?? [],
                    backupDoctorId: rcp.template.backupDoctorId,
                    isUnconfirmed: true,
                };
                setConflictModalSlot(syntheticSlot);
                setConflictModalConflict(null);
            }}
            className="flex-1 py-2 rounded-btn text-xs font-semibold border border-border text-text-muted hover:bg-muted transition-all flex items-center justify-center gap-1.5"
        >
            <UserCheck className="w-3.5 h-3.5" />
            Demander remplacement
        </button>
        <button
            onClick={() => {
                const syntheticSlot: ScheduleSlot = {
                    id: rcp.generatedId,
                    date: rcp.date,
                    day: rcp.template.day,
                    period: rcp.template.period ?? Period.MORNING,
                    time: rcp.template.time,
                    location: rcp.template.location || rcp.template.id,
                    subType: rcp.template.location,
                    type: SlotType.RCP,
                    assignedDoctorId: currentDoctor!.id,
                    secondaryDoctorIds: rcp.template.secondaryDoctorIds ?? [],
                    backupDoctorId: rcp.template.backupDoctorId,
                    isUnconfirmed: true,
                };
                setConflictModalSlot(syntheticSlot);
                setConflictModalConflict(null);
            }}
            className="flex-1 py-2 rounded-btn text-xs font-semibold border border-primary/30 text-primary hover:bg-primary/5 transition-all flex items-center justify-center gap-1.5"
        >
            <UserCheck className="w-3.5 h-3.5" />
            Assigner directement
        </button>
    </div>
)}
```

**Note :** Les deux boutons ouvrent le même `ConflictResolverModal`. Le modal gère lui-même les modes REQUEST/DIRECT selon le rôle et le contexte. Si nécessaire, ajouter un prop `initialMode` au modal — mais d'abord tester sans, le modal doit déjà proposer les deux options.

- [ ] **Step 3 : Le `ConflictResolverModal` existant (ligne ~1637) utilise `conflictsWeekSchedule` comme `slots`. Mettre à jour pour utiliser `rcpWeekSlots` quand le slot est un RCP**

Localiser le rendu du `ConflictResolverModal` en bas de Profile.tsx (~ligne 1638) :
```typescript
<ConflictResolverModal
    slot={conflictModalSlot}
    conflict={conflictModalConflict ?? undefined}
    doctors={doctors}
    slots={conflictsWeekSchedule}   // ← changer ici
    ...
```
Remplacer `slots={conflictsWeekSchedule}` par :
```typescript
slots={conflictModalSlot?.type === SlotType.RCP ? rcpWeekSlots : conflictsWeekSchedule}
```

- [ ] **Step 4 : Vérifier dans le navigateur**

Aller Profil → onglet RCP. Sur un RCP non confirmé, vérifier que les deux boutons apparaissent. Cliquer "Demander remplacement" → le ConflictResolverModal s'ouvre avec le slot RCP.

- [ ] **Step 5 : Commit**

```bash
git add pages/Profile.tsx
git commit -m "feat(profile): add replacement request/direct assign buttons to RCP cards"
```

---

## Task 4 — Feature 1 : Absence modifiable jusqu'à J-30

**Files:**
- Modify: `pages/Profile.tsx` — liste des absences, lignes ~1268-1293

**Contexte :** La liste des absences (onglet `absences`) affiche un cadenas SVG hardcodé pour toutes les absences (ligne 1282) et un message fixe (ligne 1291-1293). `removeUnavailability` est déjà dans le contexte (ligne 268).

- [ ] **Step 1 : Remplacer le contenu de la `li` de chaque absence (lignes 1269-1288)**

Remplacer :
```typescript
<li key={abs.id} className="p-3 flex justify-between items-center hover:bg-muted">
    <div className="text-sm flex-1">
        <div className="font-bold text-text-base">{abs.reason}</div>
        <div className="text-xs text-text-muted mt-0.5">
            {abs.startDate} → {abs.endDate}
            {abs.period && abs.period !== 'ALL_DAY' && (
                <span className="ml-2 text-[10px] bg-muted text-text-muted px-1 rounded">
                    {abs.period === Period.MORNING ? 'Matin' : 'Après-midi'}
                </span>
            )}
        </div>
    </div>
    {/* No delete button - only admin can delete */}
    <div className="text-text-muted p-2" title="Contactez un administrateur pour modifier">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
    </div>
</li>
```

Par :
```typescript
<li key={abs.id} className="p-3 flex justify-between items-center hover:bg-muted">
    <div className="text-sm flex-1">
        <div className="font-bold text-text-base">{abs.reason}</div>
        <div className="text-xs text-text-muted mt-0.5">
            {abs.startDate} → {abs.endDate}
            {abs.period && abs.period !== 'ALL_DAY' && (
                <span className="ml-2 text-[10px] bg-muted text-text-muted px-1 rounded">
                    {abs.period === Period.MORNING ? 'Matin' : 'Après-midi'}
                </span>
            )}
        </div>
    </div>
    {(() => {
        const daysUntilStart = (new Date(abs.startDate).getTime() - Date.now()) / 86_400_000;
        const canDelete = isAdmin || daysUntilStart > 30;
        if (canDelete) {
            return (
                <button
                    onClick={() => {
                        if (window.confirm(`Supprimer l'absence du ${abs.startDate} au ${abs.endDate} ?`)) {
                            removeUnavailability(abs.id);
                        }
                    }}
                    className="p-2 text-danger hover:bg-danger/10 rounded transition-colors"
                    title="Supprimer cette absence"
                >
                    <Trash2 className="w-4 h-4" />
                </button>
            );
        }
        return (
            <div className="p-2 text-text-muted" title="Suppression impossible — moins de 30 jours avant le début">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
            </div>
        );
    })()}
</li>
```

- [ ] **Step 2 : Rendre le message bas conditionnel (ligne ~1291-1293)**

Remplacer :
```typescript
<p className="text-[10px] text-text-muted mt-2 pl-1 italic">
    Pour modifier ou supprimer une absence, contactez un administrateur.
</p>
```

Par :
```typescript
{myAbsences.length > 0 && myAbsences.every(abs =>
    (new Date(abs.startDate).getTime() - Date.now()) / 86_400_000 <= 30
) && !isAdmin && (
    <p className="text-[10px] text-text-muted mt-2 pl-1 italic">
        Toutes vos absences sont verrouillées (départ dans moins de 30 jours). Contactez un administrateur si nécessaire.
    </p>
)}
```

- [ ] **Step 3 : Vérifier dans le navigateur**

Créer une absence avec startDate dans 2 mois → icône poubelle apparaît. Créer une avec startDate dans 10 jours → cadenas apparaît. Admin → poubelle toujours présente.

- [ ] **Step 4 : Commit**

```bash
git add pages/Profile.tsx
git commit -m "feat(profile): allow doctors to delete absences > 30 days before start"
```

---

## Task 5 — Feature 2 : Conflits dans profil → vert quand résolu

**Files:**
- Modify: `pages/Profile.tsx` — rendu des conflits, lignes ~1575-1608

**Contexte :** Chaque conflit est rendu dans un `div` avec classe `border-red-100`. Il faut inspecter `manualOverrides[conflict.slotId]` pour déterminer le statut.

- [ ] **Step 1 : Dans la boucle `profileConflicts.map(conflict => {`, ajouter la détection de résolution**

Juste après `const slot = conflictsWeekSchedule.find(...)` (ligne ~1576), ajouter :

```typescript
// Résolution check
const rawOverride = manualOverrides[conflict.slotId] ?? '';
const isResolved = rawOverride !== '' && rawOverride !== '__CLOSED__';
const isClosed = rawOverride === '__CLOSED__';
const resolvedDoctorId = rawOverride.startsWith('auto:') ? rawOverride.substring(5) : rawOverride;
const resolvedDoctor = isResolved ? doctors.find(d => d.id === resolvedDoctorId) : null;
```

- [ ] **Step 2 : Mettre à jour les classes du div conteneur du conflit**

Remplacer la classe du div principal (ligne ~1580-1586) :
```typescript
className="p-3 bg-surface border border-red-100 rounded-card shadow-sm hover:border-red-300 hover:shadow-md transition-all cursor-pointer relative group"
```
Par :
```typescript
className={`p-3 rounded-card shadow-sm transition-all cursor-pointer relative group ${
    isResolved ? 'bg-green-50 border border-green-200 hover:border-green-400'
    : isClosed  ? 'bg-muted border border-border'
    : 'bg-surface border border-red-100 hover:border-red-300 hover:shadow-md'
}`}
```

- [ ] **Step 3 : Ajouter l'indicateur de résolution dans le contenu de la carte**

Juste après `<p className="text-xs text-text-muted mt-1">{conflict.description}</p>` (ligne ~1601), ajouter :

```typescript
{isResolved && resolvedDoctor && (
    <div className="flex items-center gap-1.5 mt-2 text-xs text-green-700 font-semibold">
        <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
        Résolu — remplacé par {resolvedDoctor.name}
    </div>
)}
{isClosed && (
    <div className="flex items-center gap-1.5 mt-2 text-xs text-text-muted font-semibold">
        <XCircle className="w-3.5 h-3.5" />
        Créneau fermé
    </div>
)}
```

- [ ] **Step 4 : Vérifier dans le navigateur**

Résoudre un conflit via le ConflictResolverModal → la carte doit passer au vert avec le nom du remplaçant. Fermer un créneau → la carte doit passer en gris.

- [ ] **Step 5 : Commit**

```bash
git add pages/Profile.tsx
git commit -m "feat(profile): show resolved conflicts in green with replacing doctor name"
```

---

## Task 6 — Feature 12 : Annuler toutes les auto-affectations RCP

**Files:**
- Modify: `pages/Configuration.tsx` — section auto-affectation (~ligne 1135)

**Contexte :** Le bouton "Lancer maintenant" est à la ligne ~1138. Il faut ajouter un bouton "Annuler auto-affectations" dans la même zone. `manualOverrides` et `setManualOverrides` sont dans le contexte (ligne ~24-25). `template` aussi (ligne ~17).

- [ ] **Step 1 : Ajouter la fonction `handleCancelAllRcpAutoAssignments` dans Configuration.tsx**

Après la fonction `handleSaveAutoConfig` (chercher `const handleSaveAutoConfig`), ajouter :

```typescript
const handleCancelAllRcpAutoAssignments = () => {
    if (!window.confirm(
        'Annuler toutes les auto-affectations RCP ?\n\nLes affectations manuelles sont conservées. Seules les attributions automatiques (tirage au sort) seront supprimées.'
    )) return;

    const rcpTemplateIds = template
        .filter(t => t.type === SlotType.RCP)
        .map(t => t.id);

    const newOverrides = Object.fromEntries(
        Object.entries(manualOverrides).filter(([key, value]) => {
            if (!(value as string).startsWith('auto:')) return true;
            const isRcpSlot = rcpTemplateIds.some(id => key.startsWith(id + '-'));
            return !isRcpSlot;
        })
    );

    setManualOverrides(newOverrides);
};
```

- [ ] **Step 2 : Ajouter le bouton dans l'UI, sous le bouton "Lancer maintenant" (~ligne 1138)**

Juste après le bouton existant "Lancer maintenant" dans la div `flex items-center justify-between`, ajouter un second bouton :

```typescript
<button
    onClick={handleCancelAllRcpAutoAssignments}
    className="flex items-center gap-1.5 text-xs bg-danger/10 text-danger border border-danger/20 px-3 py-1.5 rounded-btn hover:bg-danger/20 font-medium transition-colors"
>
    <RotateCcw size={12} /> Annuler les auto-affectations
</button>
```

**Note :** `RotateCcw` n'est PAS dans les imports lucide-react de Configuration.tsx. L'ajouter impérativement à la ligne d'import lucide existante.

- [ ] **Step 3 : Vérifier dans le navigateur**

Aller Configuration → RCP → Règles. Cliquer "Annuler les auto-affectations" → confirmation → les auto-affectations RCP disparaissent du planning. Les affectations manuelles restent.

- [ ] **Step 4 : Commit**

```bash
git add pages/Configuration.tsx
git commit -m "feat(config): add cancel-all RCP auto-assignments button"
```

---

## Task 7 — MonPlanning.tsx : infrastructure AppContext + état modal (prérequis T8+T9)

**Files:**
- Modify: `pages/MonPlanning.tsx`

**Contexte :** MonPlanning.tsx est actuellement 41 lignes, sans AppContext. Il faut ajouter le contexte et les états pour gérer les modaux des features 8 et 9.

- [ ] **Step 1 : Réécrire MonPlanning.tsx avec AppContext + états modaux**

```typescript
import React, { useState, useContext } from 'react';
import { AppContext } from '../App';
import PersonalAgendaWeek from '../components/PersonalAgendaWeek';
import PersonalAgendaMonth from '../components/PersonalAgendaMonth';
import ConflictResolverModal from '../components/ConflictResolverModal';
import RcpAttendanceModal from '../components/RcpAttendanceModal';
import { ScheduleSlot } from '../types';
import { useAuth } from '../context/AuthContext';

const MonPlanning: React.FC = () => {
  const [agendaView, setAgendaView] = useState<'week' | 'month'>('week');
  const [agendaWeekOffset, setAgendaWeekOffset] = useState(0);
  const [selectedConsultSlot, setSelectedConsultSlot] = useState<ScheduleSlot | null>(null);
  const [selectedRcpSlot, setSelectedRcpSlot] = useState<ScheduleSlot | null>(null);

  const {
    doctors, unavailabilities, manualOverrides, setManualOverrides,
    template, activityDefinitions, rcpTypes, rcpAttendance, rcpExceptions,
  } = useContext(AppContext);

  const { profile } = useAuth();

  const handleConsultResolve = (slotId: string, newDoctorId: string) => {
    setManualOverrides((prev: Record<string, string>) => ({ ...prev, [slotId]: newDoctorId }));
    setSelectedConsultSlot(null);
  };

  const handleConsultCloseSlot = (slotId: string) => {
    setManualOverrides((prev: Record<string, string>) => ({ ...prev, [slotId]: '__CLOSED__' }));
    setSelectedConsultSlot(null);
  };

  // Derive schedule slots for the current week (for ConflictResolverModal's slots prop)
  // PersonalAgendaWeek already computes this internally; we pass the full list via context
  // For now, pass an empty array — ConflictResolverModal uses it only for suggestion logic
  const weekSlots: ScheduleSlot[] = [];

  return (
    <div className="max-w-6xl mx-auto space-y-4 pb-20">
      <div className="bg-surface rounded-card shadow-card border border-border p-4 md:p-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-extrabold text-text-base tracking-tight">Mon planning</h1>
          <div className="flex rounded-btn-sm border border-border overflow-hidden">
            <button
              onClick={() => setAgendaView('week')}
              className={`px-4 py-2 text-sm font-medium transition-colors ${agendaView === 'week' ? 'bg-primary text-white' : 'bg-surface text-text-muted hover:bg-muted'}`}
            >
              Semaine
            </button>
            <button
              onClick={() => setAgendaView('month')}
              className={`px-4 py-2 text-sm font-medium transition-colors ${agendaView === 'month' ? 'bg-primary text-white' : 'bg-surface text-text-muted hover:bg-muted'}`}
            >
              Mois
            </button>
          </div>
        </div>

        {agendaView === 'week' ? (
          <PersonalAgendaWeek
            weekOffset={agendaWeekOffset}
            onOffsetChange={setAgendaWeekOffset}
            onConsultClick={setSelectedConsultSlot}
            onRcpClick={setSelectedRcpSlot}
          />
        ) : (
          <PersonalAgendaMonth />
        )}
      </div>

      {selectedConsultSlot && (
        <ConflictResolverModal
          slot={selectedConsultSlot}
          doctors={doctors}
          slots={weekSlots}
          unavailabilities={unavailabilities}
          onClose={() => setSelectedConsultSlot(null)}
          onResolve={handleConsultResolve}
          onCloseSlot={handleConsultCloseSlot}
        />
      )}

      {selectedRcpSlot && profile?.doctor_id && (
        <RcpAttendanceModal
          slot={selectedRcpSlot}
          doctorId={profile.doctor_id}
          onClose={() => setSelectedRcpSlot(null)}
        />
      )}
    </div>
  );
};

export default MonPlanning;
```

- [ ] **Step 2 : Vérifier que TypeScript ne se plaint pas sur `setManualOverrides`**

`setManualOverrides` dans AppContext est de type `(overrides: Record<string, string>) => void` ou `Dispatch<SetStateAction<...>>`. Si TypeScript signale une erreur sur le type du callback `prev =>`, ajuster le type : `(prev: Record<string, string>) => ({...})`. Corriger si erreur.

- [ ] **Step 3 : Commit (partiel — sans les nouvelles props dans PersonalAgendaWeek ni RcpAttendanceModal qui viennent aux tâches suivantes)**

```bash
git add pages/MonPlanning.tsx
git commit -m "refactor(mon-planning): add AppContext, modal state for consult/RCP click handlers"
```

---

## Task 8 — Feature 8 : Vue semaine → clic sur Consultation

**Files:**
- Modify: `components/PersonalAgendaWeek.tsx`

**Contexte :** PersonalAgendaWeek reçoit `weekOffset` et `onOffsetChange`. Il faut ajouter deux props optionnelles et rendre les cartes consultation cliquables.

- [ ] **Step 1 : Ajouter les nouvelles props dans l'interface Props**

```typescript
// Modifier l'interface Props (ligne ~11) :
interface Props {
  weekOffset: number;
  onOffsetChange: (offset: number) => void;
  onConsultClick?: (slot: any) => void;
  onRcpClick?: (slot: any) => void;
}
```

- [ ] **Step 2 : Extraire `onConsultClick` et `onRcpClick` dans le composant**

```typescript
const PersonalAgendaWeek: React.FC<Props> = ({ weekOffset, onOffsetChange, onConsultClick, onRcpClick }) => {
```

- [ ] **Step 3 : Rendre les cartes Consultation cliquables (version desktop)**

Dans la section desktop (`return (` après la section mobile), trouver le bloc `if (slot.type === SlotType.CONSULTATION)` (ligne ~494). Ajouter `onClick` et `cursor-pointer` :

```typescript
if (slot.type === SlotType.CONSULTATION) {
  return (
    <div key={slot.id}
      className="rounded-btn-sm border px-1.5 py-1 mb-0.5 text-white cursor-pointer hover:opacity-80 transition-opacity"
      style={{ backgroundColor: SLOT_COLORS.CONSULT, borderColor: SLOT_COLORS.CONSULT }}
      title={slot.subType || slot.location || 'Consultation'}
      onClick={() => onConsultClick?.(slot)}   // ← ajouter
    >
```

- [ ] **Step 4 : Rendre les cartes Consultation cliquables (version mobile)**

Dans la section mobile, trouver le rendu des slots dans la timeline (`allSlots.map((slot: any) => { ... return (<div key={slot.id} className="relative"> ...`). Ajouter le onClick sur le div interne quand `slot.type === SlotType.CONSULTATION` :

Dans le div `flex items-center gap-3 py-2 px-3 rounded-btn-sm`, ajouter `onClick` si consultation :
```typescript
<div
  className={`flex items-center gap-3 py-2 px-3 rounded-btn-sm ${slot.type === SlotType.CONSULTATION ? 'cursor-pointer hover:bg-muted/50' : ''}`}
  onClick={() => slot.type === SlotType.CONSULTATION ? onConsultClick?.(slot) : undefined}
>
```

- [ ] **Step 5 : Vérifier dans le navigateur**

Aller Mon Planning → Semaine. Cliquer sur une carte de consultation → ConflictResolverModal s'ouvre. Cliquer en dehors → se ferme.

- [ ] **Step 6 : Commit**

```bash
git add components/PersonalAgendaWeek.tsx
git commit -m "feat(agenda-week): consultation cards are now clickable (open ConflictResolverModal)"
```

---

## Task 9 — Feature 9 : Vue semaine → clic RCP + nouveau RcpAttendanceModal

**Files:**
- Create: `components/RcpAttendanceModal.tsx`
- Modify: `components/PersonalAgendaWeek.tsx`

- [ ] **Step 1 : Créer `components/RcpAttendanceModal.tsx`**

```typescript
// components/RcpAttendanceModal.tsx
import React, { useContext, useState } from 'react';
import { X, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { ScheduleSlot } from '../types';
import { AppContext } from '../App';
import { supabase } from '../services/supabaseClient';

interface Props {
  slot: ScheduleSlot;
  doctorId: string;
  onClose: () => void;
}

const RcpAttendanceModal: React.FC<Props> = ({ slot, doctorId, onClose }) => {
  const { rcpAttendance, setRcpAttendance } = useContext(AppContext);
  const [loading, setLoading] = useState<'PRESENT' | 'ABSENT' | null>(null);

  const currentStatus = rcpAttendance[slot.id]?.[doctorId] ?? null;

  const handleChoice = async (status: 'PRESENT' | 'ABSENT') => {
    setLoading(status);
    try {
      if (status === 'PRESENT') {
        await supabase
          .from('rcp_attendance')
          .upsert({ slot_id: slot.id, doctor_id: doctorId, status: 'PRESENT' },
                   { onConflict: 'slot_id, doctor_id' });
        // setRcpAttendance accepte un objet complet (pas un updater fonctionnel) — pattern de Profile.tsx handleAttendanceToggle
        setRcpAttendance({
          ...rcpAttendance,
          [slot.id]: { ...(rcpAttendance[slot.id] ?? {}), [doctorId]: 'PRESENT' },
        });
      } else {
        await supabase
          .from('rcp_attendance')
          .delete()
          .eq('slot_id', slot.id)
          .eq('doctor_id', doctorId);
        const updatedSlot = { ...(rcpAttendance[slot.id] ?? {}) };
        delete updatedSlot[doctorId];
        setRcpAttendance({ ...rcpAttendance, [slot.id]: updatedSlot });
      }
      onClose();
    } catch (err) {
      console.error('RcpAttendanceModal error:', err);
    } finally {
      setLoading(null);
    }
  };

  const slotLabel = slot.subType || slot.location || 'RCP';
  const dateLabel = slot.date
    ? new Date(slot.date + 'T12:00').toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long' })
    : '';

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface rounded-xl shadow-modal w-full max-w-xs p-5"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="font-bold text-text-base text-sm">{slotLabel}</p>
            {dateLabel && <p className="text-xs text-text-muted mt-0.5 capitalize">{dateLabel}</p>}
          </div>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded-btn-sm text-text-muted">
            <X size={16} />
          </button>
        </div>

        {currentStatus && (
          <p className="text-xs text-center text-text-muted mb-3 italic">
            Statut actuel : <span className="font-semibold">{currentStatus === 'PRESENT' ? 'Présent' : 'Absent'}</span>
          </p>
        )}

        <div className="flex gap-3">
          <button
            onClick={() => handleChoice('PRESENT')}
            disabled={!!loading}
            className="flex-1 py-3 rounded-btn font-semibold text-sm text-white flex items-center justify-center gap-2 transition-all hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: '#059669' }}
          >
            {loading === 'PRESENT' ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
            Présent
          </button>
          <button
            onClick={() => handleChoice('ABSENT')}
            disabled={!!loading}
            className="flex-1 py-3 rounded-btn font-semibold text-sm text-white flex items-center justify-center gap-2 transition-all hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: '#DC2626' }}
          >
            {loading === 'ABSENT' ? <Loader2 size={16} className="animate-spin" /> : <XCircle size={16} />}
            Absent
          </button>
        </div>
      </div>
    </div>
  );
};

export default RcpAttendanceModal;
```

- [ ] **Step 2 : Rendre les cartes RCP cliquables dans PersonalAgendaWeek (desktop)**

Dans le bloc `if (slot.type === SlotType.RCP)` de la version desktop (ligne ~433), ajouter `onClick` et `cursor-pointer` sur le div principal de la carte :

```typescript
<div key={slot.id}
  className={`rounded-btn-sm px-1.5 py-1 mb-0.5 ${s.border} cursor-pointer hover:opacity-80 transition-opacity`}
  style={{ ...s.bg, ...s.borderC }}
  title={slot.subType || slot.location}
  onClick={() => onRcpClick?.(slot)}   // ← ajouter
>
```

- [ ] **Step 3 : Rendre les cartes RCP cliquables (mobile)**

Dans la section mobile, dans le rendu des slots de la timeline, le div `flex items-center gap-3 py-2 px-3 rounded-btn-sm` — ajouter onClick pour les RCP :

```typescript
onClick={() => slot.type === SlotType.RCP ? onRcpClick?.(slot) : undefined}
```

Et ajouter `cursor-pointer` si type RCP.

- [ ] **Step 4 : Vérifier dans le navigateur**

Cliquer sur une carte RCP dans Mon Planning → Semaine. La RcpAttendanceModal s'ouvre avec les deux boutons. Choisir "Présent" → la modale se ferme, la carte RCP passe en vert "Confirmé". Choisir "Absent" → carte mise à jour.

- [ ] **Step 5 : Commit**

```bash
git add components/RcpAttendanceModal.tsx components/PersonalAgendaWeek.tsx
git commit -m "feat(agenda-week): RCP cards clickable — opens Présent/Absent modal"
```

---

## Task 10 — Feature 10 : Vue mois → fenêtre flottante

**Files:**
- Modify: `components/PersonalAgendaMonth.tsx` — fin du fichier, lignes ~353-416

- [ ] **Step 1 : Remplacer le panneau bas par une modale centrée**

Trouver le bloc `{selectedDate && (` à la fin du composant (ligne ~354). Remplacer tout le bloc jusqu'à sa fermeture par :

```tsx
{selectedDate && (
  <div
    className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
    onClick={() => setSelectedDate(null)}
  >
    <div
      className="bg-surface rounded-xl shadow-modal max-w-sm w-full p-5 max-h-[80vh] overflow-y-auto"
      onClick={e => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-3">
        <p className="font-semibold text-text-base capitalize">
          {new Date(selectedDate + 'T12:00:00').toLocaleDateString('fr-FR', {
            weekday: 'long', day: '2-digit', month: 'long'
          })}
        </p>
        <button
          onClick={() => setSelectedDate(null)}
          className="p-1 hover:bg-muted rounded-btn-sm text-text-muted"
        >
          <span className="text-lg leading-none">✕</span>
        </button>
      </div>
      {/* Contenu identique à l'ancien panneau — copier le bloc (() => { ... })() ici */}
      {(() => {
        const daySlots = scheduleByDate[selectedDate] ?? [];
        const onLeave = unavailabilities.some(u =>
          u.doctorId === doctorId && selectedDate >= u.startDate && selectedDate <= u.endDate
        );
        if (onLeave) return <p className="text-text-muted italic text-sm">Congé / Indisponibilité</p>;
        if (daySlots.length === 0) return <p className="text-text-muted italic text-sm">Aucune activité planifiée</p>;

        const morningSlots = daySlots.filter((s: any) => s.period === Period.MORNING);
        const afternoonSlots = daySlots.filter((s: any) => s.period === Period.AFTERNOON);

        const renderDetailSlot = (s: any) => {
          const rcpStatus = getRcpStatus(s, doctorId, rcpAttendance);
          const dotColor = s.type === SlotType.RCP
            ? (rcpStatus === 'PRESENT' ? 'bg-green-500' : rcpStatus === 'UNCONFIRMED' ? 'bg-amber-500' : 'bg-violet-500')
            : (SLOT_DOT[s.type] ?? 'bg-muted');
          return (
            <div key={s.id} className="flex items-center gap-2 py-1">
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${dotColor}`} />
              <span className="text-text-base font-medium text-sm">{getLabel(s)}</span>
              {s.type === SlotType.RCP && rcpStatus === 'UNCONFIRMED' && (
                <span className="text-xs text-amber-600 font-medium flex items-center gap-0.5">
                  <AlertTriangle size={10} />À confirmer
                </span>
              )}
              {s.type === SlotType.RCP && rcpStatus === 'PRESENT' && (
                <span className="text-xs text-green-600 font-medium flex items-center gap-0.5">
                  <CheckCircle2 size={10} />Confirmé
                </span>
              )}
              {s.location && s.location !== s.subType && (
                <span className="text-text-muted text-xs">— {s.location}</span>
              )}
            </div>
          );
        };

        return (
          <div className="space-y-3">
            {morningSlots.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-1.5">🌅 Matin</p>
                {morningSlots.map(renderDetailSlot)}
              </div>
            )}
            {afternoonSlots.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-1.5">🌇 Après-midi</p>
                {afternoonSlots.map(renderDetailSlot)}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  </div>
)}
```

**Note :** Importer `AlertTriangle` si pas déjà importé (il l'est déjà ligne 1 de PersonalAgendaMonth.tsx).

- [ ] **Step 2 : Vérifier dans le navigateur**

Aller Mon Planning → Mois. Cliquer sur un jour → une modale flottante centrée s'ouvre avec les bons codes couleur. Cliquer en dehors → se ferme. Tester sur mobile (fenêtre rétrécie).

- [ ] **Step 3 : Commit**

```bash
git add components/PersonalAgendaMonth.tsx
git commit -m "feat(agenda-month): replace bottom panel with centered floating modal"
```

---

## Task 11 — Feature 11 : Bouton test notifications push

**Files:**
- Modify: `pages/Profile.tsx` — composant `NotificationSection` (lignes ~31-...)

**Contexte :** `NotificationSection` contient une section préférences avec des toggles pour chaque type de notification (`ALL_NOTIFICATION_TYPES`). Il faut ajouter un bouton ▶ à côté de chaque toggle. `createNotification` est déjà importé (ligne 15). `NOTIFICATION_TYPE_LABELS` est importé (ligne 14).

- [ ] **Step 1 : Ajouter l'état `testingType` dans NotificationSection**

Dans le composant `NotificationSection`, ajouter :
```typescript
const [testingType, setTestingType] = useState<string | null>(null);
const [testedType, setTestedType] = useState<string | null>(null);
```

- [ ] **Step 2 : Ajouter la fonction `handleTestNotification`**

```typescript
const handleTestNotification = async (notifType: string) => {
  if (!userId || testingType) return;
  setTestingType(notifType);
  try {
    await createNotification({
      user_id: userId,
      type: notifType,
      title: `[TEST] ${NOTIFICATION_TYPE_LABELS[notifType] ?? notifType}`,
      body: 'Ceci est une notification de test. Elle apparaît dans votre liste de notifications.',
    });
    setTestedType(notifType);
    setTimeout(() => setTestedType(null), 2000);
  } catch (err) {
    console.error('Test notification error:', err);
  } finally {
    setTestingType(null);
  }
};
```

- [ ] **Step 3 : Localiser la zone des toggles de type de notification**

Dans `NotificationSection`, chercher le rendu des préférences par type — probablement un `.map()` sur `ALL_NOTIFICATION_TYPES`. Ajouter le bouton test à côté du toggle :

```typescript
{ALL_NOTIFICATION_TYPES.map(type => (
  <div key={type} className="flex items-center justify-between py-2">
    {/* toggle existant */}
    <div className="flex items-center gap-2">
      {/* ... toggle ... */}
      <button
        onClick={() => handleTestNotification(type)}
        disabled={!isEnabled(type) || !!testingType || prefsLoading}
        className="px-2 py-1 text-[10px] font-bold rounded border border-border text-text-muted hover:bg-muted disabled:opacity-40 transition-colors flex items-center gap-1"
        title="Envoyer une notification de test"
      >
        {testingType === type ? (
          <Loader2 size={10} className="animate-spin" />
        ) : testedType === type ? (
          '✓'
        ) : (
          '▶'
        )}
        {testingType === type ? '' : testedType === type ? 'Envoyé' : 'Test'}
      </button>
    </div>
  </div>
))}
```

**Note :** La structure exacte du rendu des toggles peut varier. Lire le code de `NotificationSection` pour identifier précisément où insérer le bouton à côté de chaque toggle de type.

- [ ] **Step 4 : Vérifier dans le navigateur**

Aller Profil → Notifications. Pour un type de notification activé, cliquer ▶ "Test". Vérifier que la cloche de notification affiche la nouvelle notification. Pour un type désactivé, le bouton doit être grisé.

- [ ] **Step 5 : Commit**

```bash
git add pages/Profile.tsx
git commit -m "feat(profile): add test button for each notification type"
```

---

## Task 12 — Feature 3 : Préférence densité persistée dans Planning.tsx

**Files:**
- Modify: `pages/Planning.tsx`

**Contexte :** `density` est à la ligne 72 (`const [density, setDensity] = useState<'COMPACT' | 'COMFORTABLE'>('COMFORTABLE')`). `user` vient de `useAuth()`. `supabase` est importable depuis `../services/supabaseClient`.

- [ ] **Step 1 : Ajouter les imports nécessaires dans Planning.tsx**

Vérifier que `supabase` est importé. Ajouter si absent :
```typescript
import { supabase } from '../services/supabaseClient';
```

Vérifier que `useAuth` est importé. Ajouter si absent :
```typescript
import { useAuth } from '../context/AuthContext';
```

- [ ] **Step 2 : Récupérer `user` depuis `useAuth()`**

Au début du composant `Planning`, ajouter si pas déjà présent :
```typescript
const { user } = useAuth();
```

- [ ] **Step 3 : Ajouter `useEffect` pour charger `density` au mount**

Juste après la déclaration `const [density, setDensity] = useState(...)` (ligne ~72) :

```typescript
useEffect(() => {
  if (!user?.id) return;
  supabase
    .from('profiles')
    .select('ui_prefs')
    .eq('id', user.id)
    .single()
    .then(({ data }) => {
      if (data?.ui_prefs?.planning_density) {
        setDensity(data.ui_prefs.planning_density as 'COMPACT' | 'COMFORTABLE');
      }
    })
    .catch(console.error);
}, [user?.id]);
```

- [ ] **Step 4 : Remplacer les `setDensity` directs par une fonction persistante**

Trouver les deux boutons qui appellent `setDensity` (lignes ~773 et ~779). Créer une fonction :

```typescript
const handleDensityChange = async (newDensity: 'COMPACT' | 'COMFORTABLE') => {
  setDensity(newDensity);
  if (!user?.id) return;
  try {
    const { data } = await supabase.from('profiles').select('ui_prefs').eq('id', user.id).single();
    const existing = data?.ui_prefs ?? {};
    await supabase.from('profiles')
      .update({ ui_prefs: { ...existing, planning_density: newDensity } })
      .eq('id', user.id);
  } catch (err) {
    console.error('Failed to persist density preference:', err);
  }
};
```

Puis remplacer `onClick={() => setDensity('COMPACT')}` par `onClick={() => handleDensityChange('COMPACT')}` et idem pour `'COMFORTABLE'`.

- [ ] **Step 5 : Vérifier dans le navigateur**

Aller Planning Global. Choisir Compact. Recharger la page → le mode Compact est restauré. Idem pour Aéré.

- [ ] **Step 6 : Commit**

```bash
git add pages/Planning.tsx
git commit -m "feat(planning): persist compact/airy density preference in Supabase ui_prefs"
```

---

## Task 13 — Feature 4 : Planning global mobile — dropdown Affichage non tronqué

**Files:**
- Modify: `pages/Planning.tsx` — ligne ~724

- [ ] **Step 1 : Corriger le positionnement du dropdown**

Trouver la div du dropdown (ligne ~724) :
```typescript
className="absolute top-full mt-2 right-0 w-64 bg-surface rounded-card shadow-modal border border-border p-4 z-[50] animate-in fade-in zoom-in-95 duration-150"
```

Remplacer par :
```typescript
className="absolute top-full mt-2 right-0 left-0 sm:left-auto w-auto sm:w-64 max-w-[calc(100vw-1rem)] bg-surface rounded-card shadow-modal border border-border p-4 z-[50] animate-in fade-in zoom-in-95 duration-150"
```

- [ ] **Step 2 : Vérifier sur mobile (navigateur en mode responsive)**

DevTools → mobile view (ex: iPhone SE 375px). Cliquer "Affichage" → le panneau doit s'afficher entièrement dans le viewport, ancré à gauche sur mobile. Sur desktop → ancré à droite comme avant.

- [ ] **Step 3 : Commit**

```bash
git add pages/Planning.tsx
git commit -m "fix(planning): prevent display dropdown overflow on mobile"
```

---

## Task 14 — Feature 5 : Dashboard mobile — noms médecins lisibles

**Files:**
- Modify: `pages/Dashboard.tsx`

- [ ] **Step 1 : Ajouter le helper `shortName` en haut du fichier**

Juste avant `const Dashboard: React.FC = () => {`, ajouter :

```typescript
const shortName = (name: string): string => {
  const parts = name.split(' ');
  if (parts.length <= 1) return name;
  const title = parts[0]; // "Dr." ou "Pr."
  const rest = parts.slice(1).join(' ');
  return rest.length > 8 ? `${title} ${rest.substring(0, 7)}…` : name;
};
```

- [ ] **Step 2 : Corriger les 5 sites de troncature**

**Site 1 — Astreinte (~ligne 555) :**
```typescript
// Remplacer :
<span className="text-[8px] md:text-[9px] text-text-base truncate max-w-[40px] md:max-w-[60px]">{docAstreinte.name}</span>
// Par :
<span className="text-[8px] md:text-[9px] text-text-base truncate max-w-[56px] sm:max-w-[80px]" title={docAstreinte.name}>{shortName(docAstreinte.name)}</span>
```

**Site 2 — Unity (~ligne 561) :** Même correction pour `docUnity.name`.

**Site 3 — Workflow (~ligne 579) :** Même correction pour `docWorkflow.name`.

**Site 4 — RCP doctor (~ligne 600) :** Localiser le span du nom pour le médecin RCP et appliquer `shortName()` + `max-w-[56px] sm:max-w-[80px]`.

**Site 5 — RCP second doctor (~ligne 624) :** Même correction.

- [ ] **Step 3 : Vérifier sur mobile**

DevTools → iPhone view. Vue Semaine du Dashboard → les noms de médecins s'affichent en abrégé (ex: "Dr. Belkacem…" → "Dr. Belkace…"). Hover sur le span → tooltip avec le nom complet (via `title`).

- [ ] **Step 4 : Commit**

```bash
git add pages/Dashboard.tsx
git commit -m "fix(dashboard): improve doctor name display on mobile (shortName helper)"
```

---

## Checklist finale

- [ ] Tous les commits créés (14 commits au total)
- [ ] `npm run build` passe sans erreurs TypeScript
- [ ] Tester sur mobile (DevTools) : Planning dropdown OK, Dashboard noms OK
- [ ] Tester Profile → absences : delete button J-30 OK
- [ ] Tester Profile → conflits : vert quand résolu OK
- [ ] Tester Profile → RCP : dates filtrées correctement OK
- [ ] Tester Profile → RCP : boutons remplacement OK
- [ ] Tester Mon Planning → semaine : clic consult + RCP OK
- [ ] Tester Mon Planning → mois : modale flottante OK
- [ ] Tester Profile → notifications : bouton test OK
- [ ] Tester Planning global : densité persistée après reload OK
- [ ] Tester Configuration → RCP : annuler auto-affectations OK

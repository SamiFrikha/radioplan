# RadioPlan — Améliorations v2 : Design Spec
**Date :** 2026-04-05
**Révision :** 2 (post-review)
**Approche :** Option C — migration DB en premier, puis features par domaine logique
**Scope :** 12 corrections/fonctionnalités sur l'application existante

---

## Contexte

Application React 19 + Supabase (PostgreSQL) de gestion de planning médical (radiothérapie). Stack : Vite, Tailwind CSS, React Router v7, Context API. Pas de Redux.

---

## Migration DB requise (prérequis — Migration 22)

```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ui_prefs JSONB DEFAULT '{}';
```

Cette migration est ajoutée comme `22_add_ui_prefs_to_profiles.sql` (migrations 19-21 déjà occupées). Utilisée pour persister la préférence de densité du planning global par utilisateur.

---

## Feature 1 — Absence modifiable jusqu'à J-30

**Fichier :** `pages/Profile.tsx` — onglet `absences`

**Comportement actuel :** Les absences sont en ajout uniquement pour les médecins. Un message permanent indique de contacter un admin. Aucun bouton de suppression visible pour les médecins.

**Comportement cible :**
- Calculer `daysUntilStart = (new Date(abs.startDate).getTime() - Date.now()) / 86_400_000`
- Si `daysUntilStart > 30` → afficher bouton poubelle → appel **`removeUnavailability(abs.id)`** (fonction exposée par AppContext, pas `deleteUnavailability` qui n'existe pas)
- Si `daysUntilStart ≤ 30` (inclut les absences en cours ou passées — comportement correct, on ne supprime pas une absence déjà commencée) → afficher icône cadenas + tooltip "Suppression impossible — moins de 30 jours avant le début"
- Admin (`isAdmin`) → bouton poubelle toujours visible sans contrainte de délai
- Supprimer le message hardcodé "Pour modifier ou supprimer une absence, contactez un administrateur" ; le remplacer par un message conditionnel visible uniquement si toutes les absences listées sont verrouillées

---

## Feature 2 — Conflit dans profil → vert quand résolu

**Fichier :** `pages/Profile.tsx` — onglet `conflits`

**Comportement actuel :** Tous les conflits dans `profileConflicts` s'affichent en rouge/amber. Une fois résolus via `ConflictResolverModal`, `manualOverrides` est mis à jour mais le visuel ne change pas.

**Comportement cible :**
Pour chaque conflit de `profileConflicts`, inspecter `manualOverrides[conflict.slotId]` :

| Valeur override | Affichage |
|---|---|
| UUID ou `auto:UUID` | Fond vert, "Résolu — remplacé par Dr. [nom]" |
| `__CLOSED__` | Fond gris, "Créneau fermé" |
| absent/undefined | Fond rouge/amber (comportement actuel) |

**Extraction du nom :** Avant le lookup dans `doctors`, retirer le préfixe `auto:` si présent :
```typescript
const rawValue = manualOverrides[conflict.slotId] ?? '';
const resolvedId = rawValue.startsWith('auto:') ? rawValue.substring(5) : rawValue;
const replacingDoctor = doctors.find(d => d.id === resolvedId);
```

Les conflits résolus restent visibles dans la liste (traçabilité) — ils ne disparaissent pas.

---

## Feature 3 — Planning global : préférence compact/aéré persistée

**Fichiers :** `pages/Planning.tsx`

**Comportement actuel :** `density` est un state local React. Non persisté entre sessions.

**Comportement cible :**

**Lecture au mount :** Effectuer un appel Supabase direct dans `Planning.tsx` (ne pas modifier AuthContext, `ui_prefs` n'est pas sélectionné dans `AuthContext.fetchProfile()`).
```typescript
useEffect(() => {
  if (!user?.id) return;
  supabase.from('profiles').select('ui_prefs').eq('id', user.id).single()
    .then(({ data }) => {
      if (data?.ui_prefs?.planning_density) {
        setDensity(data.ui_prefs.planning_density);
      }
    });
}, [user?.id]);
```

**Écriture à chaque changement :**
```typescript
const handleDensityChange = async (newDensity: 'COMPACT' | 'COMFORTABLE') => {
  setDensity(newDensity);
  if (!user?.id) return;
  // Fetch existing prefs first to not overwrite other future keys
  const { data } = await supabase.from('profiles').select('ui_prefs').eq('id', user.id).single();
  const existing = data?.ui_prefs ?? {};
  await supabase.from('profiles')
    .update({ ui_prefs: { ...existing, planning_density: newDensity } })
    .eq('id', user.id);
};
```

Erreur silencieuse (log uniquement) — la valeur locale reste utilisée en cas d'échec.

---

## Feature 4 — Planning global mobile : dropdown Affichage non tronqué

**Fichier :** `pages/Planning.tsx` — ligne ~724

**Problème :** Le panneau `absolute top-full mt-2 right-0 w-64` déborde à gauche du viewport sur petit écran.

**Correction CSS :**
```diff
- "absolute top-full mt-2 right-0 w-64 bg-surface ..."
+ "absolute top-full mt-2 right-0 left-0 sm:left-auto w-auto sm:w-64 max-w-[calc(100vw-1rem)] bg-surface ..."
```

`left-0 sm:left-auto` : ancré au bord gauche sur mobile, aligné à droite sur desktop.
`w-auto sm:w-64 max-w-[calc(100vw-1rem)]` : largeur fluide sur mobile, fixe sur desktop.

---

## Feature 5 — Dashboard mobile : noms médecins non tronqués

**Fichier :** `pages/Dashboard.tsx`

**Problème :** 5 sites de troncature dans la vue semaine.

**Helper à ajouter en tête de fichier :**
```typescript
const shortName = (name: string): string => {
  const parts = name.split(' ');
  if (parts.length <= 1) return name;
  // Keep title (Dr./Pr.) + first 6 chars of last name
  const title = parts[0]; // "Dr." or "Pr."
  const rest = parts.slice(1).join(' ');
  return rest.length > 8 ? `${title} ${rest.substring(0, 7)}…` : name;
};
```

**Sites à corriger (tous dans la vue semaine) :**
- Ligne ~555 (Astreinte) : `max-w-[40px]` → `max-w-[56px] sm:max-w-[80px]` + utiliser `shortName(docAstreinte.name)`
- Ligne ~561 (Unity) : même correction
- Ligne ~579 (Workflow) : même correction
- Ligne ~600 (RCP doctor) : même correction sur le span du nom
- Ligne ~624 (RCP second doctor) : même correction

---

## Feature 6 — Profil RCP : afficher uniquement les dates réellement prévues

**Fichier :** `pages/Profile.tsx` — fonction `getUpcomingRcps()`

**Problème :** La fonction a 3 branches (`standardRcps`, `manualRcps`, `exceptionalRcps`). La branche `standardRcps` itère sur les templates sans vérifier si la fréquence BIWEEKLY/MONTHLY correspond à la semaine affichée. **Ne pas remplacer la fonction entière** — cela casserait les branches MANUAL et exceptional.

**Correction ciblée sur `standardRcps` uniquement :**

Après calcul de `slotDate` (date dans la semaine cible), vérifier si le RCP est réellement prévu cette semaine-là en utilisant la même logique que `generateScheduleForWeek` (déjà implémentée dans `scheduleService.ts` autour de la ligne 695) :

```typescript
// Vérification fréquence BIWEEKLY
if (rcpDef.frequency === 'BIWEEKLY') {
  const baseDate = new Date(rcpDef.createdAt || '2024-01-01');
  const weeksSinceBase = Math.floor(
    (targetMonday.getTime() - baseDate.getTime()) / (7 * 24 * 60 * 60 * 1000)
  );
  if (weeksSinceBase % 2 !== 0) continue; // skip odd weeks
}
// Vérification fréquence MONTHLY
if (rcpDef.frequency === 'MONTHLY') {
  const targetWeekOfMonth = Math.ceil(targetMonday.getDate() / 7);
  if (targetWeekOfMonth !== (rcpDef.monthlyWeekNumber || 1)) continue;
}
// Vérification isCancelled
if (exception?.isCancelled) continue;
```

**Important :** Copier exactement la logique de parité BIWEEKLY de `scheduleService.ts` (lignes ~695-710) pour garantir la cohérence — ne pas recalculer différemment.

---

## Feature 7 — Profil RCP : demander/assigner un remplacement

**Fichier :** `pages/Profile.tsx` — onglet `rcp`

**Comportement cible :** Sur chaque carte RCP (visible quand `myStatus !== 'PRESENT'`), ajouter :
- Bouton "Demander un remplacement" → ouvre `ConflictResolverModal`
- Bouton "Assigner directement" → ouvre `ConflictResolverModal`
- Ces boutons sont disponibles à tous (pas admin only)

**Construction du ScheduleSlot synthétique** (pattern déjà utilisé ligne ~1453 de Profile.tsx pour le bouton "Déplacer") :
```typescript
const syntheticSlot: ScheduleSlot = {
  id: rcp.generatedId,
  type: SlotType.RCP,
  day: rcp.template.day,
  period: Period.MORNING,
  date: rcp.date,
  location: rcp.template.location ?? rcp.template.id,
  subType: rcp.template.location,
  assignedDoctorId: currentDoctor.id,
  secondaryDoctorIds: [],
  backupDoctorId: rcp.template.backupDoctorId,
  isUnconfirmed: rcp.myStatus !== 'PRESENT',
};
```

**Prop `slots` pour ConflictResolverModal :** Générer le schedule pour la semaine du RCP affiché :
```typescript
// Calculer une seule fois par semaine affichée (useMemo sur notifWeekOffset)
const rcpWeekSlots = useMemo(() => {
  return generateScheduleForWeek(targetMonday, template, unavailabilities, doctors, activityDefinitions, rcpTypes, false, {}, rcpAttendance, rcpExceptions);
}, [targetMonday, template, unavailabilities, doctors, activityDefinitions, rcpTypes, rcpAttendance, rcpExceptions]);
```

Passer `rcpWeekSlots` comme `slots` au modal. `onResolve` met à jour `rcpAttendance` dans le contexte.

---

## Feature 8 — Vue semaine Mon Planning : clic sur Consultation

**Fichiers :** `components/PersonalAgendaWeek.tsx`, `pages/MonPlanning.tsx`

**Architecture :** Lever l'état modal dans `MonPlanning.tsx` (pas dans `PersonalAgendaWeek` qui reste un composant d'affichage). Ajouter une prop optionnelle :
```typescript
// PersonalAgendaWeek.tsx — nouvelles props
onConsultClick?: (slot: ScheduleSlot) => void;
onRcpClick?: (slot: ScheduleSlot) => void;
```

`MonPlanning.tsx` : consommer `AppContext` (doctors, unavailabilities, manualOverrides, setManualOverrides), gérer l'état `selectedConsultSlot` et `selectedRcpSlot`, rendre `ConflictResolverModal` et `RcpAttendanceModal` conditionnellement.

**Callbacks `onResolve` et `onCloseSlot`** dans MonPlanning.tsx :
```typescript
const handleConsultResolve = (slotId: string, newDoctorId: string) => {
  setManualOverrides(prev => ({ ...prev, [slotId]: newDoctorId }));
  setSelectedConsultSlot(null);
};
const handleConsultClose = (slotId: string) => {
  setManualOverrides(prev => ({ ...prev, [slotId]: '__CLOSED__' }));
  setSelectedConsultSlot(null);
};
```

---

## Feature 9 — Vue semaine Mon Planning : clic sur RCP → Présent/Absent

**Fichiers :** `components/PersonalAgendaWeek.tsx`, `components/RcpAttendanceModal.tsx` (nouveau), `pages/MonPlanning.tsx`

**Nouveau composant `RcpAttendanceModal`** — léger (~60 lignes) :
```
Props: slot: ScheduleSlot, doctorId: string, currentStatus: 'PRESENT'|'ABSENT'|null, onClose: () => void
```
Deux boutons : ✓ Présent / ✗ Absent. Logique Supabase + mise à jour `setRcpAttendance` du contexte.

**Réutilisation du pattern existant** (Profile.tsx `handleAttendanceToggle`) — copier la logique upsert/delete, ne pas créer de hook séparé (YAGNI) :
```typescript
// Présent :
await supabase.from('rcp_attendance')
  .upsert({ slot_id: slot.id, doctor_id: doctorId, status: 'PRESENT' },
           { onConflict: 'slot_id,doctor_id' });
setRcpAttendance(prev => ({
  ...prev,
  [slot.id]: { ...(prev[slot.id] ?? {}), [doctorId]: 'PRESENT' }
}));

// Absent (clear) :
await supabase.from('rcp_attendance')
  .delete().eq('slot_id', slot.id).eq('doctor_id', doctorId);
setRcpAttendance(prev => {
  const updated = { ...(prev[slot.id] ?? {}) };
  delete updated[doctorId];
  return { ...prev, [slot.id]: updated };
});
```

`setRcpAttendance` est récupéré depuis `AppContext` (exposé comme `setRcpAttendance`).

---

## Feature 10 — Vue mois Mon Planning : fenêtre flottante

**Fichier :** `components/PersonalAgendaMonth.tsx`

**Architecture :** Gérer le modal dans `PersonalAgendaMonth` lui-même (self-contained, pas de lift nécessaire — le mois est un composant autonome).

**Remplacement du panneau bas par une modale centrée :**
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
        <p className="font-semibold text-text-base capitalize">...</p>
        <button onClick={() => setSelectedDate(null)}>✕</button>
      </div>
      {/* contenu identique à l'actuel */}
    </div>
  </div>
)}
```

---

## Feature 11 — Bouton test notifications push

**Fichier :** `pages/Profile.tsx` — composant `NotificationSection`

**Mécanisme :** Utiliser `createNotification()` pour créer une notification in-app (pas un vrai push edge function — infrastructure trop complexe pour un test). Le médecin verra la notification apparaître dans sa cloche de notifications.

```typescript
const handleTestNotification = async (notifType: string) => {
  if (!userId) return;
  await createNotification({
    user_id: userId,
    type: notifType,
    title: `[TEST] ${NOTIFICATION_TYPE_LABELS[notifType]}`,
    body: 'Ceci est une notification de test. Elle apparaît dans votre liste de notifications.',
  });
};
```

Bouton ▶ à côté de chaque toggle :
- Désactivé si `!isEnabled(notifType)` ou `prefsLoading`
- Feedback : `sending...` pendant l'appel, `✓` 2s après succès, retour à ▶
- Ne déclenche PAS un vrai push web/mobile — uniquement in-app (cloche)

---

## Feature 12 — Annuler toutes les auto-affectations RCP

**Fichier :** `pages/Configuration.tsx` — section RCP auto-affectation

**Logique :** Scope strictement limité aux slots RCP (exclut les auto-affectations d'activités comme l'Astreinte).

```typescript
const handleCancelAllRcpAutoAssignments = () => {
  if (!window.confirm('Annuler toutes les auto-affectations RCP ? Les affectations manuelles sont conservées.')) return;

  // IDs des template slots de type RCP uniquement
  const rcpTemplateIds = template
    .filter(t => t.type === SlotType.RCP)
    .map(t => t.id);

  const newOverrides = Object.fromEntries(
    Object.entries(manualOverrides).filter(([key, value]) => {
      if (!(value as string).startsWith('auto:')) return true; // garder les manuels
      // Vérifier si la clé correspond à un template RCP
      const isRcpSlot = rcpTemplateIds.some(id => key.startsWith(id + '-'));
      return !isRcpSlot; // supprimer uniquement les RCP auto
    })
  );

  setManualOverrides(newOverrides);
  // setManualOverrides persiste via AppContext → app_settings.manual_overrides
};
```

Bouton dans la section "Auto-affectation RCP" : rouge destructif, icône RotateCcw, avec confirmation.

---

## Ordre d'implémentation

1. **Migration DB (19)** — `ui_prefs` dans `profiles`
2. **Feature 6** — RCP dates filtrées (prérequis logique de Feature 7)
3. **Feature 7** — RCP remplacement/assignation directe dans profil
4. **Feature 1** — Absence J-30 (removeUnavailability)
5. **Feature 2** — Conflits verts dans profil
6. **Feature 12** — Annulation auto-affectations RCP
7. **Features 8+9** — Clic consultation + RCP vue semaine (MonPlanning.tsx + AppContext ensemble)
8. **Feature 10** — Fenêtre flottante vue mois
9. **Feature 11** — Bouton test notifications
10. **Feature 3** — Préférence densité persistée
11. **Features 4+5** — Corrections mobile Planning dropdown + Dashboard noms

---

## Fichiers impactés (résumé)

| Fichier | Features |
|---|---|
| `pages/Profile.tsx` | 1, 2, 6, 7, 11 |
| `pages/MonPlanning.tsx` | 8, 9 |
| `pages/Planning.tsx` | 3, 4 |
| `pages/Dashboard.tsx` | 5 |
| `pages/Configuration.tsx` | 12 |
| `components/PersonalAgendaWeek.tsx` | 8, 9 |
| `components/PersonalAgendaMonth.tsx` | 10 |
| `components/RcpAttendanceModal.tsx` | 9 (nouveau, ~60 lignes) |
| Supabase migration 22 | 3 |

---

## Contraintes transversales

- **Pas de nouvelles tables Supabase** — seule la colonne `ui_prefs` dans `profiles` est ajoutée
- **Pas de nouveaux services** — réutiliser l'existant
- **Cohérence logique BIWEEKLY** — Feature 6 doit copier exactement la logique de parité de `scheduleService.ts` (~ligne 695)
- **Pas de feature flags** — code direct

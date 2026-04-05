# RadioPlan — Améliorations v2 : Design Spec
**Date :** 2026-04-05
**Approche :** Option C — migration DB en premier, puis features par domaine logique
**Scope :** 12 corrections/fonctionnalités sur l'application existante

---

## Contexte

Application React 19 + Supabase (PostgreSQL) de gestion de planning médical (radiothérapie). Stack : Vite, Tailwind CSS, React Router v7, Context API. Pas de Redux.

---

## Migration DB requise (prérequis)

**Migration unique :** Ajouter colonne `ui_prefs JSONB DEFAULT '{}'` dans la table `profiles`.

```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ui_prefs JSONB DEFAULT '{}';
```

Utilisée pour persister la préférence de densité du planning global par utilisateur.

---

## Feature 1 — Absence modifiable jusqu'à J-30

**Fichier :** `pages/Profile.tsx` — onglet `absences`

**Comportement actuel :** Les absences sont en ajout uniquement pour les médecins. Un message permanent indique de contacter un admin pour toute modification. Aucun bouton de suppression n'est visible pour les médecins.

**Comportement cible :**
- Calculer `daysUntilStart = (new Date(abs.startDate).getTime() - Date.now()) / 86_400_000`
- Si `daysUntilStart > 30` → afficher bouton poubelle → appel `deleteUnavailability(abs.id)`
- Si `daysUntilStart ≤ 30` → afficher icône cadenas + tooltip "Suppression impossible — moins de 30 jours avant le début"
- Admin (`isAdmin`) → bouton poubelle toujours visible, sans contrainte de délai
- Le message "contactez un admin" devient conditionnel (visible uniquement si toutes les absences listées sont verrouillées)

**Contraintes :** `deleteUnavailability` existe dans `AppContext` (à vérifier dans `unavailabilityService`). Pas de call Supabase direct ici, passer par le service existant.

---

## Feature 2 — Conflit dans profil → vert quand résolu

**Fichier :** `pages/Profile.tsx` — onglet `conflits`

**Comportement actuel :** Tous les conflits dans `profileConflicts` s'affichent en rouge/amber. Une fois résolus via `ConflictResolverModal`, `manualOverrides` est mis à jour mais le visuel du conflit ne change pas.

**Comportement cible :**
Pour chaque conflit de `profileConflicts`, inspecter `manualOverrides[conflict.slotId]` :

| Valeur override | Affichage |
|---|---|
| UUID ou `auto:UUID` | Fond vert, "Résolu — remplacé par Dr. [nom]" |
| `__CLOSED__` | Fond gris, "Créneau fermé" |
| absent/undefined | Fond rouge/amber (comportement actuel) |

Le nom du médecin remplaçant est résolu depuis `doctors.find(d => d.id === resolvedId)`.

Les conflits résolus restent visibles dans la liste (traçabilité) — ils ne disparaissent pas.

---

## Feature 3 — Planning global : préférence compact/aéré persistée

**Fichiers :** `pages/Planning.tsx`, `services/settingsService.ts` ou appel Supabase direct

**Comportement actuel :** `density` est un state local React. Non persisté entre sessions.

**Comportement cible :**
- Au mount de `Planning.tsx` : lire `profile.ui_prefs?.planning_density ?? 'COMFORTABLE'`
  → appel `supabase.from('profiles').select('ui_prefs').eq('id', user.id).single()`
- À chaque changement de densité : persister
  → `supabase.from('profiles').update({ ui_prefs: { ...existingPrefs, planning_density: newDensity } }).eq('id', user.id)`
- `existingPrefs` = objet courant pour ne pas écraser d'autres préférences futures
- Gestion d'erreur silencieuse (fallback sur la valeur locale)

---

## Feature 4 — Planning global mobile : dropdown Affichage non tronqué

**Fichier :** `pages/Planning.tsx` — ligne ~724

**Problème :** Le panneau `absolute top-full mt-2 right-0 w-64` déborde à gauche du viewport sur petit écran.

**Correction CSS :**
```
avant : "absolute top-full mt-2 right-0 w-64 bg-surface ..."
après : "absolute top-full mt-2 right-0 left-0 sm:left-auto w-auto sm:w-64 max-w-[calc(100vw-1rem)] bg-surface ..."
```

`left-0 sm:left-auto` : ancré au bord gauche sur mobile, aligné à droite sur desktop.
`w-auto sm:w-64 max-w-[calc(100vw-1rem)]` : largeur fluide sur mobile, fixe sur desktop.

---

## Feature 5 — Dashboard mobile : noms médecins non tronqués

**Fichier :** `pages/Dashboard.tsx`

**Problème :** `max-w-[40px]` pour les noms de médecins dans la vue semaine (~4 caractères visibles).

**Corrections :**
- `max-w-[40px] md:max-w-[60px]` → `max-w-[56px] sm:max-w-[80px]`
- Ajouter un helper `shortName(doctor: Doctor): string` retournant les 8 premiers caractères ou initiales pour les cas très courts :
  `name.length > 8 ? name.split(' ').map(w => w[0]).join('').toUpperCase() : name`
- Ce helper peut être utilisé dans Planning.tsx également si besoin

---

## Feature 6 — Profil RCP : afficher uniquement les dates réellement prévues

**Fichier :** `pages/Profile.tsx` — fonction `getUpcomingRcps()`

**Problème :** La fonction itère directement sur les templates RCP sans vérifier la fréquence (BIWEEKLY, MONTHLY). Résultat : un RCP bimensuel s'affiche toutes les semaines.

**Correction :** Remplacer l'itération sur les templates par un appel à `generateScheduleForWeek(targetMonday, ...)` pour la semaine affichée. Extraire les slots RCP depuis le résultat, puis enrichir avec les données de statut (myStatus, colleaguesStatus) comme actuellement.

```typescript
const weekSlots = generateScheduleForWeek(
  targetMonday, template, unavailabilities, doctors,
  activityDefinitions, rcpTypes, false, {}, rcpAttendance, rcpExceptions
);
const rcpSlots = weekSlots.filter(s =>
  s.type === SlotType.RCP && (
    s.assignedDoctorId === currentDoctor.id ||
    s.secondaryDoctorIds?.includes(currentDoctor.id) ||
    rcpAttendance[s.id]?.[currentDoctor.id] === 'PRESENT'
  )
);
```

Puis construire les objets `rcp` affichés à partir de ces slots (date, time, myStatus, colleaguesStatus). Les RCP manuels et exceptionnels sont inclus via le service (déjà géré).

---

## Feature 7 — Profil RCP : demander/assigner un remplacement

**Fichier :** `pages/Profile.tsx` — onglet `rcp`, rendu des cartes RCP

**Comportement cible :** Ajouter une section d'actions sur chaque carte RCP (visible quand `myStatus !== 'PRESENT'`) :
- Bouton "Demander un remplacement" → ouvre `ConflictResolverModal` en mode REQUEST
- Bouton "Assigner directement" → ouvre `ConflictResolverModal` en mode DIRECT
- Ces boutons sont disponibles à tous (pas admin only) — le médecin gère son propre RCP
- Le slot synthétique à passer au modal est construit depuis les données du RCP calculé (via Feature 6)

**Construction du ScheduleSlot synthétique :**
```typescript
const syntheticSlot: ScheduleSlot = {
  id: rcp.generatedId,
  type: SlotType.RCP,
  day: rcp.template.day,
  period: Period.MORNING, // RCPs are typically AM
  date: rcp.date,
  location: rcp.template.location,
  assignedDoctorId: currentDoctor.id,
  // ...other required fields with defaults
};
```

**Propagation :** `ConflictResolverModal` gère déjà l'envoi de la demande + notification. On passe `onResolve` qui met à jour `rcpAttendance` dans le contexte.

---

## Feature 8 — Vue semaine Mon Planning : clic sur Consultation

**Fichier :** `components/PersonalAgendaWeek.tsx`

**Comportement cible :** Les cartes Consultation deviennent cliquables. Au clic, `ConflictResolverModal` s'ouvre avec le slot (sans conflict, permettant de demander un remplacement).

**Props supplémentaires nécessaires dans PersonalAgendaWeek :**
- `schedule` (slots de la semaine) — déjà calculé localement dans le composant
- `onResolve: (slotId: string, newDoctorId: string) => void` — callback depuis `MonPlanning.tsx`
- `onCloseSlot: (slotId: string) => void` — callback depuis `MonPlanning.tsx`

Ajouter `onClick={() => setSelectedConsultSlot(slot)}` sur les cartes consultation.
State local : `const [selectedConsultSlot, setSelectedConsultSlot] = useState<ScheduleSlot | null>(null)`.

---

## Feature 9 — Vue semaine Mon Planning : clic sur RCP → Présent/Absent

**Fichier :** `components/PersonalAgendaWeek.tsx` + nouveau composant `RcpAttendanceModal`

**Comportement cible :** Les cartes RCP deviennent cliquables. Au clic → modale légère avec :
- Titre : nom du RCP + date
- Bouton ✓ **Présent** (vert)
- Bouton ✗ **Absent** (rouge)
- Bouton Annuler

**Logique Présent/Absent :**
```typescript
// Présent :
await supabase.from('rcp_attendance')
  .upsert({ slot_id: slot.id, doctor_id: doctorId, status: 'PRESENT' });
setRcpAttendance(prev => ({
  ...prev,
  [slot.id]: { ...(prev[slot.id] ?? {}), [doctorId]: 'PRESENT' }
}));

// Absent : delete from rcp_attendance where slot_id and doctor_id
await supabase.from('rcp_attendance')
  .delete().eq('slot_id', slot.id).eq('doctor_id', doctorId);
setRcpAttendance(prev => {
  const updated = { ...(prev[slot.id] ?? {}) };
  delete updated[doctorId];
  return { ...prev, [slot.id]: updated };
});
```

`setRcpAttendance` doit être récupéré depuis `AppContext`.

---

## Feature 10 — Vue mois Mon Planning : fenêtre flottante

**Fichier :** `components/PersonalAgendaMonth.tsx`

**Comportement actuel :** Un panneau s'affiche en bas du calendrier après la grille.

**Comportement cible :** Modale centrée avec overlay semi-transparent. Le contenu (matin/après-midi, codes couleur, icônes) est identique. La modale :
- Overlay : `fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4`
- Panneau : `bg-surface rounded-xl shadow-modal max-w-sm w-full p-5`
- Bouton ✕ en haut à droite
- Fermeture au clic sur l'overlay ou le bouton ✕
- `setSelectedDate(null)` à la fermeture

---

## Feature 11 — Bouton test notifications push

**Fichier :** `pages/Profile.tsx` — composant `NotificationSection`

**Comportement cible :** À côté de chaque toggle de type de notification (`ALL_NOTIFICATION_TYPES`), ajouter un bouton ▶ "Tester" :
- Appelle `createNotification({ user_id: userId, type: notifType, title: '[TEST] ' + NOTIFICATION_TYPE_LABELS[notifType], body: 'Notification de test.' })`
- Désactivé (`disabled`) si `!isEnabled(notifType)` ou si notifications globalement désactivées
- Feedback visuel : le bouton passe à "✓ Envoyé" pendant 2s après succès

---

## Feature 12 — Annuler toutes les auto-affectations RCP

**Fichier :** `pages/Configuration.tsx` — section RCP auto-affectation

**Comportement cible :** Bouton "Annuler toutes les auto-affectations RCP" avec confirmation.

**Logique :**
1. Collecter les IDs des template slots de type RCP : `rcpTemplateIds = template.filter(t => t.type === SlotType.RCP).map(t => t.id)`
2. Construire le nouveau `manualOverrides` en filtrant les entrées auto-RCP :
```typescript
const newOverrides = Object.fromEntries(
  Object.entries(manualOverrides).filter(([key, value]) => {
    const isAutoAssigned = (value as string).startsWith('auto:');
    if (!isAutoAssigned) return true; // keep manual assignments
    const templateId = rcpTemplateIds.find(id => key.startsWith(id + '-'));
    return !templateId; // remove if it's an RCP auto-assignment
  })
);
```
3. Appeler `setManualOverrides(newOverrides)` → persiste via le mécanisme existant dans AppContext

---

## Ordre d'implémentation recommandé

1. **Migration DB** — `ui_prefs` dans `profiles`
2. **Feature 6** — RCP dates filtrées (prérequis logique de Feature 7)
3. **Feature 7** — RCP remplacement/assignation directe
4. **Feature 1** — Absence J-30
5. **Feature 2** — Conflits verts
6. **Feature 12** — Annulation auto-affectations RCP
7. **Feature 8** — Clic consultation vue semaine
8. **Feature 9** — Clic RCP vue semaine + `RcpAttendanceModal`
9. **Feature 10** — Fenêtre flottante vue mois
10. **Feature 11** — Bouton test notifications
11. **Feature 3** — Préférence densité persistée
12. **Feature 4 + 5** — Corrections mobile Planning dropdown + Dashboard noms

---

## Fichiers impactés (résumé)

| Fichier | Features |
|---|---|
| `pages/Profile.tsx` | 1, 2, 6, 7, 11 |
| `pages/Planning.tsx` | 3, 4 |
| `pages/Dashboard.tsx` | 5 |
| `pages/Configuration.tsx` | 12 |
| `components/PersonalAgendaWeek.tsx` | 8, 9 |
| `components/PersonalAgendaMonth.tsx` | 10 |
| `components/RcpAttendanceModal.tsx` | 9 (nouveau) |
| Supabase migration | 3 |

---

## Pas de nouvelles tables Supabase

Seule la colonne `ui_prefs` dans `profiles` est ajoutée. Toutes les autres features utilisent les tables existantes (`rcp_attendance`, `replacement_requests`, `notifications`, `manual_overrides` dans `app_settings`).

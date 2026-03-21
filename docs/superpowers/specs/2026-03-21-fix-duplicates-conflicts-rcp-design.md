# Design: Fix doublons, conflits profil, remplacement RCP

**Date**: 2026-03-21
**Statut**: Validé

## Problèmes identifiés

### P1 — Doublons d'indisponibilités (critique)
- **Cause racine**: `TeamManagement.tsx` ligne 775 appelle `addUnavailability(savedUnavail)` après avoir déjà inséré en DB via `unavailabilityService.create()`. La fonction `addUnavailability()` dans `App.tsx` réinsère en DB → double insertion systématique.
- **Aggravant**: Aucune contrainte UNIQUE sur la table `unavailabilities` en DB.
- **Impact**: Tous les médecins ont leurs absences doublées → conflits gonflés, liste "Médecins Absents" polluée.

### P2 — Pas d'onglet Conflits dans le profil médecin
- Le médecin ne peut pas voir ni résoudre ses propres conflits depuis son profil.

### P3 — Pas de distinction référent/exceptionnel dans le remplacement RCP
- Quand on choisit un remplaçant RCP, tous les médecins sont présentés à plat sans distinction.
- Un médecin exceptionnel sélectionné ne voit pas la RCP dans son profil/agenda.

### P4 — Bugs anciens
- Dashboard ligne 826 : `'AM'` affiché au lieu de `'Après-midi'` pour la période afternoon.
- Dedup DOUBLE_BOOKING dans `detectConflicts()` : la clé `type-doctorId-date-period` est identique pour les 2 slots d'une paire, donc un des deux est perdu.

---

## Chantier 1 : Fix doublons d'indisponibilités

### 1.1 Fix bug racine — TeamManagement.tsx

**Fichier**: `pages/admin/TeamManagement.tsx` (ligne 775)

**Avant** (bugué):
```typescript
unavailabilityService.create(newUnavail).then(savedUnavail => {
    setLocalDoctorUnavails(prev =>
        prev.map(u => u.id === newUnavail.id ? savedUnavail : u)
    );
    // BUG: addUnavailability() réinsère en DB !
    addUnavailability(savedUnavail);
});
```

**Après** (corrigé):
```typescript
unavailabilityService.create(newUnavail).then(savedUnavail => {
    setLocalDoctorUnavails(prev =>
        prev.map(u => u.id === newUnavail.id ? savedUnavail : u)
    );
    // Sync context state WITHOUT re-inserting in DB
    setUnavailabilities(prev => {
        // Prevent duplicates in state
        if (prev.some(u => u.id === savedUnavail.id)) return prev;
        return [...prev, savedUnavail];
    });
});
```

**Problème**: `setUnavailabilities` n'est pas exposé dans le contexte. Solution : ajouter une nouvelle fonction `syncUnavailability(u: Unavailability)` dans le contexte qui met à jour le state sans toucher à la DB.

**Nouvelle fonction dans App.tsx**:
```typescript
const syncUnavailability = (u: Unavailability) => {
    setUnavailabilities(prev => {
        if (prev.some(existing => existing.id === u.id)) return prev;
        return [...prev, u];
    });
};
```

Exposer `syncUnavailability` dans `AppContext` et l'utiliser dans TeamManagement.

### 1.2 Migration DB — Nettoyage + contrainte UNIQUE

**Fichier**: `supabase/migrations/20_fix_duplicate_unavailabilities.sql`

```sql
-- 1. Remove duplicate unavailabilities, keeping the oldest (smallest created_at)
DELETE FROM public.unavailabilities
WHERE id NOT IN (
    SELECT DISTINCT ON (doctor_id, start_date, end_date, COALESCE(period, 'ALL_DAY'))
        id
    FROM public.unavailabilities
    ORDER BY doctor_id, start_date, end_date, COALESCE(period, 'ALL_DAY'), created_at ASC
);

-- 2. Add UNIQUE constraint to prevent future duplicates
CREATE UNIQUE INDEX IF NOT EXISTS unavailabilities_unique_entry
ON public.unavailabilities(doctor_id, start_date, end_date, COALESCE(period, 'ALL_DAY'));
```

### 1.3 Dedup côté service — unavailabilityService.create()

**Fichier**: `services/unavailabilityService.ts`

Ajouter un `upsert` ou un check avant insert :
```typescript
async create(unavailability: Omit<Unavailability, 'id'>): Promise<Unavailability> {
    // Use upsert with the unique constraint to prevent DB-level duplicates
    const { data, error } = await supabase
        .from('unavailabilities')
        .upsert({
            doctor_id: unavailability.doctorId,
            start_date: unavailability.startDate,
            end_date: unavailability.endDate,
            period: unavailability.period || 'ALL_DAY',
            reason: unavailability.reason
        }, {
            onConflict: 'doctor_id,start_date,end_date,period',
            ignoreDuplicates: true
        })
        .select()
        .single();

    if (error) throw error;
    // ... map response
}
```

**Note**: Si `upsert` avec `ignoreDuplicates` pose des problèmes avec Supabase, fallback sur un SELECT avant INSERT.

---

## Chantier 2 : Onglet Conflits dans le profil médecin

### 2.1 Ajout de l'onglet

**Fichier**: `pages/Profile.tsx`

**Changements** :
1. Ajouter `'conflits'` au type de tab : `useState<'notifications' | 'absences' | 'preferences' | 'rcp' | 'conflits'>('rcp')`
2. Ajouter le bouton d'onglet avec icône `AlertTriangle`
3. Ajouter le contenu de l'onglet

### 2.2 Logique de détection

Réutiliser le même pattern que le Dashboard :
```typescript
const profileConflicts = useMemo(() => {
    if (!currentDoctor) return [];

    // Generate schedule for the current profile week
    const weekStart = new Date();
    const day = weekStart.getDay();
    weekStart.setDate(weekStart.getDate() - day + (day === 0 ? -6 : 1) + (notifWeekOffset * 7));
    weekStart.setHours(0, 0, 0, 0);

    const weekSchedule = generateScheduleForWeek(
        weekStart, template, unavailabilities, doctors,
        activityDefinitions, rcpTypes, false, {},
        rcpAttendance, rcpExceptions
    );

    const allConflicts = detectConflicts(weekSchedule, unavailabilities, doctors, activityDefinitions);

    // Filter only conflicts concerning the current doctor
    return allConflicts.filter(c => c.doctorId === currentDoctor.id);
}, [currentDoctor, notifWeekOffset, template, unavailabilities, doctors, activityDefinitions, rcpTypes, rcpAttendance, rcpExceptions]);
```

### 2.3 Rendu

- Réutiliser la navigation semaine existante (même `notifWeekOffset` que l'onglet RCP)
- Chaque conflit : carte cliquable avec type (badge), date, période, lieu, description
- Au clic → ouvrir `ConflictResolverModal` avec le slot correspondant
- État pour le modal : `conflictModalSlot` / `conflictModalConflict`
- Message vide : "Aucun conflit sur cette semaine"

---

## Chantier 3 : Remplacement RCP — référents vs exceptionnels

### 3.1 Séparation de la liste dans ConflictResolverModal

**Fichier**: `components/ConflictResolverModal.tsx`

Pour les modes `REQUEST` et `DIRECT` d'un conflit RCP :

```typescript
// Get the RCP definition to know who are the referent doctors
const rcpDef = rcpTypes.find(r => r.name === slot.location);
const referentDoctorIds = new Set<string>([
    ...(rcpDef?.doctorIds || []),
    ...(rcpDef?.secondaryDoctorIds || []),
    ...(rcpDef?.backupDoctorId ? [rcpDef.backupDoctorId] : []),
].filter(Boolean));

// Split available doctors into two groups
const referentDoctors = availableDocs.filter(d => referentDoctorIds.has(d.id));
const exceptionalDoctors = availableDocs.filter(d => !referentDoctorIds.has(d.id));
```

**Rendu** :
- Section "Médecins référents (N)" avec badge vert par médecin
- Section "Autres médecins — sélection exceptionnelle (N)" avec badge orange + texte "Ce médecin n'est pas assigné à cette RCP"
- Ordre : référents d'abord (triés par score d'équité), puis exceptionnels (même tri)

### 3.2 Contexte nécessaire

`ConflictResolverModal` a déjà accès à `rcpAttendance` via `AppContext`. Il faut aussi accéder à `rcpTypes` pour trouver la définition de la RCP. Vérifier si `rcpTypes` est dans le contexte (oui, il l'est).

### 3.3 Affichage des RCPs exceptionnelles dans le profil

**Fichier**: `pages/Profile.tsx` — onglet RCP

**Logique actuelle** (filtre par template) :
```typescript
// Affiche seulement les RCPs où le médecin est dans doctorIds/secondaryDoctorIds/backupDoctorId
```

**Logique ajoutée** :
```typescript
// AUSSI inclure les RCPs où le médecin a PRESENT dans rcpAttendance
// mais n'est PAS dans le template (= remplacement exceptionnel)
const slotKey = `${templateSlotId}-${dateStr}`;
const attendanceMap = rcpAttendance[slotKey] || {};
const isExceptionalPresent = attendanceMap[currentDoctor.id] === 'PRESENT'
    && !templateDoctorIds.includes(currentDoctor.id);
```

Ces RCPs exceptionnelles s'affichent avec un badge "Exceptionnel" (orange) dans la liste.

**Comportement** (déjà garanti par le code existant via `rcpAttendance`) :
- Demi-journée bloquée (`isBlocking = true`, `isUnconfirmed = false` dans `generateScheduleForWeek`)
- RCP verrouillée (présence confirmée = personne d'autre ne peut choisir)
- Conflits détectés normalement (double-booking, indisponibilité)

---

## Chantier 4 : Fix bugs anciens

### 4.1 Fix AM/PM inversé

**Fichier**: `pages/Dashboard.tsx` ligne 826

**Avant**: `{slot?.period === Period.MORNING ? 'Matin' : 'AM'}`
**Après**: `{slot?.period === Period.MORNING ? 'Matin' : 'Après-midi'}`

### 4.2 Fix dedup DOUBLE_BOOKING

**Fichier**: `services/scheduleService.ts` lignes 1146-1153

**Avant** : clé `${c.type}-${c.doctorId}-${slot?.date}-${slot?.period}` → les 2 entrées d'une paire ont la même clé, l'une est perdue.

**Après** : inclure `slotId` dans la clé pour les DOUBLE_BOOKING :
```typescript
const key = c.type === 'DOUBLE_BOOKING'
    ? `${c.type}-${c.doctorId}-${c.slotId}`
    : `${c.type}-${c.doctorId}-${slot?.date ?? 'unknown'}-${slot?.period ?? 'unknown'}`;
```

Ainsi les 2 entrées d'une paire double-booking survivent (elles référencent 2 slots différents), mais les vrais doublons (même slot, même type, même médecin) sont toujours éliminés.

---

## Fichiers impactés

| Fichier | Chantier | Changement |
|---------|----------|------------|
| `pages/admin/TeamManagement.tsx` | 1 | Fix double insertion → `syncUnavailability()` |
| `App.tsx` | 1 | Ajouter `syncUnavailability()` au contexte |
| `types.ts` | 1, 2 | Ajouter `syncUnavailability` au type AppContextType |
| `supabase/migrations/20_fix_duplicate_unavailabilities.sql` | 1 | Nettoyage + contrainte UNIQUE |
| `services/unavailabilityService.ts` | 1 | Upsert / dedup côté service |
| `pages/Profile.tsx` | 2, 3 | Onglet conflits + RCPs exceptionnelles dans onglet RCP |
| `components/ConflictResolverModal.tsx` | 3 | Séparation référents/exceptionnels |
| `pages/Dashboard.tsx` | 4 | Fix AM/PM |
| `services/scheduleService.ts` | 4 | Fix dedup DOUBLE_BOOKING |

## Ordre d'exécution

1. Chantier 1 (doublons) — priorité critique, débloque tout le reste
2. Chantier 4 (bugs anciens) — quick wins
3. Chantier 2 (onglet conflits)
4. Chantier 3 (référents/exceptionnels)

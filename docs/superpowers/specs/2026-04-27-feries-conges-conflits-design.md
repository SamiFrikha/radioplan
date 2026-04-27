# Design Spec — Jours fériés, congés enrichis, corrections MonPlanning & Conflits

**Date :** 2026-04-27  
**Périmètre :** Mon Planning (PersonalAgendaWeek, PersonalAgendaMonth) + onglet Conflits du profil  
**Planning Global (Planning.tsx) : inchangé**

---

## 1. Jours fériés français dans Mon Planning

### Contexte
`isFrenchHoliday(dateStr)` existe déjà dans `scheduleService.ts` et calcule dynamiquement tous les jours fériés français (fixes + mobiles : Pâques, Ascension, Pentecôte). Il n'y a rien à ajouter côté données.

### PersonalAgendaWeek — vue semaine (desktop + mobile)
- Dans le header de chaque colonne-jour, appel à `isFrenchHoliday(dateStr)`.
- Si férié :
  - Fond `bg-red-50` sur le header, texte rouge (`text-red-600`)
  - Nom du jour férié affiché sous le numéro du jour (tronqué à ~12 chars si nécessaire)
  - Sur mobile (cercle de date) : contour rouge + micro-label rouge sous le cercle

### PersonalAgendaMonth — vue mois
- Dans chaque cellule-jour, appel à `isFrenchHoliday(key)`.
- Si férié :
  - Numéro du jour en rouge
  - Micro-étiquette `text-[8px]` rouge affichant le nom (ex. "Noël") sous le numéro
  - Pas de fond plein pour ne pas masquer les slots existants

---

## 2. Gestion des congés enrichie dans Mon Planning

### Contexte
Quand un médecin est en congé, les activités initialement prévues sur ce créneau doivent rester visibles avec leur statut de remplacement. Les données de statut sont dérivées de `manualOverrides` :
- Clé absente **ou** valeur vide `''` → **Non résolu** (les deux cas sont équivalents)
- `'__CLOSED__'` → **Fermé**
- `doctorId` ou `'auto:doctorId'` → **Remplacé par Dr. X** (nom récupéré depuis `doctors`)

**Cas particulier — jour férié ET congé :** le header du jour garde le style "férié" (rouge). Dans la colonne, le badge "Congé" reste affiché normalement — les deux informations ne se cumulent pas visuellement puisqu'un jour férié n'a généralement aucun slot.

**Cas secondaryDoctorIds :** si le médecin est assigné en secondaire (`secondaryDoctorIds`), le mini-modal de détail indique "Médecin secondaire absent" plutôt que "Médecin absent" pour clarifier son rôle.

### PersonalAgendaWeek — enrichissement des `conflictSlots`

**Affichage :**
Chaque carte `conflictSlot` affiche :
1. Icône de type (Consultation / RCP / Unity / Astreinte…)
2. Nom de l'activité (`slot.subType || slot.location`)
3. Badge statut :
   - Orange dashed + "⚠ Non résolu" si non résolu
   - Vert + "✓ Fermé" si `__CLOSED__`
   - Vert + "✓ Remplacé par [Nom]" si remplacé

**Clickabilité :**
- **Non résolu** : le clic appelle `onConflictClick(slot)` (nouveau prop passé depuis `MonPlanning.tsx`) → ouvre le `ConflictResolverModal` existant
- **Résolu / Fermé** : le clic ouvre un **mini-modal de détail** (state `resolvedDetailSlot` dans `MonPlanning.tsx`)

**Mini-modal de détail (résolu/fermé) dans MonPlanning.tsx :**
- Titre : "Détail du remplacement"
- Activité initiale
- Médecin absent : le médecin connecté
- Remplaçant : nom du médecin ou "Créneau fermé"
- Statut : Résolu / Fermé
- Date + créneau (matin/après-midi)
- Bouton "Fermer"
- Style : overlay + `max-w-sm` centré, même pattern que le popup de détail mois

**Nouveaux props `PersonalAgendaWeek` :**
```typescript
onConflictClick?: (slot: ScheduleSlot) => void;
onResolvedConflictClick?: (slot: ScheduleSlot, replacementDoctorId: string | null) => void;
```

### PersonalAgendaMonth — vue mois

**Nouveaux props `PersonalAgendaMonth` :**
```typescript
onConflictClick?: (slot: ScheduleSlot) => void;
onResolvedConflictClick?: (slot: ScheduleSlot, replacementDoctorId: string | null) => void;
```

**Cellule en congé :**
Sous le badge "Congé" existant, ajouter des micro-indicateurs par demi-journée impactée (max 2 visible, +N si plus) :
- Point coloré (orange si non résolu, vert si résolu/fermé) + label ultra-court ("⚠ Consult." / "✓ Unity")

**Popup de détail (clic sur date en congé) :**
La section congé existante ("Congé / Indisponibilité") est enrichie :
- Liste des activités impactées avec statut (même logique que semaine)
- Cliquables si non résolu → via les props `onConsultClick` / `onActivityClick` existants
- Cliquables si résolu → via nouveau prop `onResolvedConflictClick`

---

## 3. Correction MonPlanning — suppression des `missedRcps`

### Problème
Le calcul `missedRcps` affiche en bas de chaque colonne toutes les RCP gérées par d'autres médecins pendant l'absence du médecin connecté. Ces créneaux ne concernent pas le médecin et créent de la confusion.

### Fix
- Supprimer le useMemo `missedRcps` (~ligne 140 de PersonalAgendaWeek.tsx)
- Supprimer le bloc de rendu correspondant (~ligne 699)
- Les `conflictSlots` (section 2) remplacent avantageusement ce besoin pour les activités réellement affectées au médecin

---

## 4. Correctif onglet Conflits (Profile.tsx) — auto-remplacement invalide

### Problème
Un médecin absent voit son conflit d'activité (ex. Unity) affiché comme "résolu par lui-même" et non cliquable. Cause : `manualOverrides[slotId]` contient l'ID du médecin absent lui-même (template default ou auto-fill avant la pose d'absence), ce qui satisfait à tort la condition `isResolved`.

### Fix (Profile.tsx ~ligne 1944)

**Note :** Profile.tsx ligne ~1947 extrait déjà `resolvedDoctorId`. Le bloc complet à remplacer (lignes 1944–1948) :

**Avant :**
```typescript
const rawOverride = manualOverrides[conflict.slotId] ?? '';
const isResolved = rawOverride !== '' && rawOverride !== '__CLOSED__';
const isClosed = rawOverride === '__CLOSED__';
const resolvedDoctorId = rawOverride.startsWith('auto:') ? rawOverride.substring(5) : rawOverride;
const resolvedDoctor = isResolved ? doctors.find(d => d.id === resolvedDoctorId) : null;
```

**Après :**
```typescript
const rawOverride = manualOverrides[conflict.slotId] ?? '';
const isClosed = rawOverride === '__CLOSED__';
const resolvedDoctorId = rawOverride.startsWith('auto:') ? rawOverride.substring(5) : rawOverride;
const isResolved = rawOverride !== '' && !isClosed && resolvedDoctorId !== conflict.doctorId;
const resolvedDoctor = isResolved ? doctors.find(d => d.id === resolvedDoctorId) : null;
```

**Effet :** si l'override désigne le médecin absent lui-même, le conflit reste "non résolu", cliquable, et le médecin peut désigner un vrai remplaçant. Élimine aussi le risque de double déclaration `const resolvedDoctorId`.

---

## Fichiers touchés

| Fichier | Changements |
|---|---|
| `components/PersonalAgendaWeek.tsx` | Jours fériés headers, conflictSlots enrichis + cliquables, suppression missedRcps, nouveaux props |
| `components/PersonalAgendaMonth.tsx` | Jours fériés cellules, congé enrichi avec indicateurs + popup |
| `pages/MonPlanning.tsx` | Gestion des nouveaux props, mini-modal détail résolu, ConflictResolverModal pour non-résolu |
| `pages/Profile.tsx` | Fix isResolved ligne ~1944 |

**Planning.tsx : inchangé.**

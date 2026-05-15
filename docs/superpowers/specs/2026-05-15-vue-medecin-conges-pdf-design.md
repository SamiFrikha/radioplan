# Design : Vue par Médecin — Congés + PDF adaptatif

**Date :** 2026-05-15  
**Fichier principal :** `pages/Planning.tsx`  
**Approche retenue :** A — Inline dans les composants existants

---

## Contexte

Le planning global dispose d'une vue par médecin (`viewMode === 'DOCTOR'`) qui affiche les créneaux assignés à chaque médecin par jour et période. Cette vue ne montre pas actuellement les congés/indisponibilités des médecins. De plus, le téléchargement PDF génère toujours la vue par poste, quelle que soit la vue active.

---

## Fonctionnalité 1 : Affichage des congés dans la vue par médecin

### Données disponibles

- `unavailabilities: Unavailability[]` — déjà dans le contexte Planning (ligne 18)
- `isAbsent(doctor, dateStr, period, unavailabilities)` — dans `scheduleService.ts`, à ajouter à l'import ligne 6
- `Unavailability.reason` — texte libre décrivant le motif (congé, maladie, formation…)
- `Unavailability.period` — `'ALL_DAY' | 'Matin' | 'Après-midi'`

### Import requis

Ajouter `isAbsent` à l'import existant ligne 6 de `Planning.tsx` :
```ts
import { getDateForDayOfWeek, isFrenchHoliday, generateScheduleForWeek, detectConflicts, isAbsent } from '../services/scheduleService';
```

### Logique

Dans `renderDoctorCell(doc, day, period)` (`pages/Planning.tsx`, ~ligne 726) :

La variable `date` (date string ISO) est déjà calculée en début de fonction via :
```ts
const date = getDateForDayOfWeek(currentWeekStart, day); // ligne 709
```

Priorité de rendu (ordre décroissant) :
1. **Absent** → cellule rouge avec raison (prioritaire sur jour férié)
2. **Slot présent** → rendu normal
3. **Vide** → cellule vide normale

Insertion du check absence **avant** le rendu des slots :
```ts
if (isAbsent(doc, date, period, unavailabilities)) {
  const unaNav = unavailabilities.find(u =>
    u.doctorId === doc.id &&
    date >= u.startDate &&
    date <= u.endDate &&
    (u.period === 'ALL_DAY' || u.period === period)
  );
  return <AbsenceCellUI reason={unaNav?.reason ?? 'Absent'} />;
}
```

### Apparence de la cellule absente (UI)

| Propriété | Valeur |
|---|---|
| Fond | `#FEF2F2` (Tailwind `bg-red-50`) |
| Bordure | `border border-red-200` |
| Texte | `reason` tronqué à 20 caractères, `text-red-600 text-xs font-semibold` |
| Hauteur | Identique aux cellules normales |
| Portée | Uniquement la période concernée (`Matin` ou `Après-midi`) ; si `ALL_DAY` → les deux (gérée nativement par `isAbsent`) |

### Priorité : absent vs jour férié

Si un médecin est marqué absent sur un jour férié, la cellule affiche **l'absence** (rouge + raison). Le rendu jour férié n'est affiché que si le médecin n'est pas absent.

---

## Fonctionnalité 2 : PDF adaptatif selon la vue active

### Dispatch

Au début de `handleDownloadPDF()` (`pages/Planning.tsx`, ~ligne 220), avant le bloc jsPDF existant :

```ts
if (viewMode === 'DOCTOR') {
  generateDoctorViewPDF();
  return;
}
// ... code existant vue par poste inchangé
```

### Fonction `generateDoctorViewPDF()`

Définie juste avant `handleDownloadPDF()`, fermeture sur les variables du composant (`doctors`, `schedule`, `days`, `unavailabilities`, `currentWeekStart`…).

#### Setup jsPDF

Identique à la vue poste :
```ts
const pdf = new jsPDF('l', 'pt', 'a4');
const PW = 841.89, PH = 595.28, M = 20;
// helpers hexRgb / fill / stroke / tc — copie identique
```

#### Colonnes

| Colonne | Largeur |
|---|---|
| `Médecin` | 70 pt |
| `Créneau` | 32 pt |
| Chaque jour (×5) | `(PW - 2*M - 70 - 32) / days.length` |

#### Hauteur de ligne

```ts
const TITLE_H = 36;
const HDR_H   = 20;
const DOC_W   = 70;   // colonne Médecin
const PER_W   = 32;   // colonne Créneau
const CELL_W  = (PW - 2*M - DOC_W - PER_W) / days.length;
const N_ROWS  = doctors.length * 2;          // 2 périodes par médecin
const DATA_H  = PH - 2*M - TITLE_H - HDR_H;
const ROW_H   = DATA_H / N_ROWS;
const TABLE_X = M + DOC_W + PER_W;
const TABLE_Y = M + TITLE_H + HDR_H;
```

#### En-tête

- Titre : `PLANNING RADIOTHÉRAPIE — VUE PAR MÉDECIN` (même style bleu `#4F46E5` bande + `#0F172A` texte)
- Sous-titre : semaine + date range, identique vue poste
- En-têtes colonnes jours : noms + dates (jours fériés en rouge, même logique `isFrenchHoliday`)

#### Lignes de données

Pour chaque médecin (`doctors.map(doc => ...)`), 2 lignes :

**Colonne Médecin :**
- Ligne Matin : disque coloré (couleur `getDoctorHexColor(doc.color)`, rayon 5pt) + nom du médecin (font bold 7pt)
- Ligne Après-midi : cellule vide (pas de répétition du nom)

**Colonne Créneau :** `Matin` / `AM` (6pt gris `#64748B`)

**Cellules jour :**

| État | Fond | Texte |
|---|---|---|
| Absent | `#FEE2E2` | Raison (`reason`) en `#DC2626`, 7pt, centré |
| Slot présent | Même palette `slotBg()` que vue poste | Abréviation type + lieu, 7pt |
| Vide | `#F8FAFC` | — |

**Logique cellule (PDF) :**
```ts
const dateStr = getDateForDayOfWeek(currentWeekStart, day);
const absent  = isAbsent(doc, dateStr, period, unavailabilities);
if (absent) {
  const u = unavailabilities.find(u =>
    u.doctorId === doc.id &&
    dateStr >= u.startDate && dateStr <= u.endDate &&
    (u.period === 'ALL_DAY' || u.period === period)
  );
  // draw #FEE2E2 cell + u.reason text in #DC2626
} else {
  const slot = schedule.find(s => s.date === dateStr && s.period === period && s.assignedDoctorId === doc.id);
  // draw slot or empty cell
}
```

#### Légende bas de page

Même légende que vue poste + entrée supplémentaire à la fin :
- `■ Absent / Congé` en `#DC2626`

#### Nommage fichier

```ts
const dateLabel = currentWeekStart.toISOString().split('T')[0];
pdf.save(`Planning_Medecins_${dateLabel}.pdf`);
```

---

## Fichiers modifiés

| Fichier | Modification |
|---|---|
| `pages/Planning.tsx` | Import `isAbsent` ajouté ligne 6 ; `renderDoctorCell()` : check absence + cellule rouge avant rendu normal ; `handleDownloadPDF()` : dispatch + nouvelle `generateDoctorViewPDF()` |

## Fichiers non modifiés

- `scheduleService.ts` — `isAbsent()` réutilisée telle quelle
- `types.ts` — aucun nouveau type nécessaire
- Tous les autres composants

---

## Non-objectifs (hors scope)

- Modifier la vue par poste (comportement PDF inchangé)
- Ajouter des congés à la vue par poste
- Refactoriser `handleDownloadPDF` en fichier séparé

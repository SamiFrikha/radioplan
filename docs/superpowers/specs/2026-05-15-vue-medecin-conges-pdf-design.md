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
- `isAbsent(doctor, dateStr, period, unavailabilities)` — dans `scheduleService.ts`
- `Unavailability.reason` — texte libre (congé, maladie, formation…)
- `Unavailability.period` — `'ALL_DAY' | 'Matin' | 'Après-midi'`

### Import requis

Ajouter `isAbsent` à l'import existant ligne 6 :
```ts
import { getDateForDayOfWeek, isFrenchHoliday, generateScheduleForWeek, detectConflicts, isAbsent } from '../services/scheduleService';
```

### Modification de `renderDoctorCell` (ligne 708)

**Ordre de priorité des rendus (du plus prioritaire au moins prioritaire) :**
1. Absent → cellule rouge + raison
2. Jour férié sans slot → cellule "Férié" (comportement actuel)
3. Slot(s) présent(s) → badges normaux
4. Vide → fond gris

**Implémentation :** Insérer le bloc absence **avant** la garde `isHoliday` (ligne 716). Le nouveau corps de la fonction :

```ts
const renderDoctorCell = (doctor: any, day: DayOfWeek, period: Period) => {
    const date = getDateForDayOfWeek(currentWeekStart, day);

    // 1. Absence (prioritaire sur tout le reste)
    if (isAbsent(doctor, date, period, unavailabilities)) {
        const u = unavailabilities.find(u =>
            u.doctorId === doctor.id &&
            date >= u.startDate &&
            date <= u.endDate &&
            (u.period === 'ALL_DAY' || u.period === period)
        );
        const reason = u?.reason ?? 'Absent';
        return (
            <div className="bg-red-50 border border-red-200 h-full flex items-center justify-center px-1">
                <span className="text-red-600 text-xs font-semibold truncate max-w-full">
                    {reason.length > 20 ? reason.slice(0, 20) + '…' : reason}
                </span>
            </div>
        );
    }

    const slots = schedule.filter(s =>
        s.date === date && s.period === period && s.assignedDoctorId === doctor.id
    );

    // 2. Jour férié (garde existante, inchangée)
    const isHoliday = isFrenchHoliday(date);
    if (isHoliday && slots.length === 0) {
        return <div className="bg-danger/5 h-full text-[10px] text-danger/40 flex items-center justify-center">Férié</div>;
    }

    // 3. Vide
    if (slots.length === 0) return <div className="bg-muted h-full"></div>;

    // 4. Slots
    return (
        <div className="flex flex-col gap-1 p-1">
            {slots.map(s => {
                let variant: 'gray' | 'blue' | 'amber' = 'gray';
                if (colorMode === 'ACTIVITY') {
                    if (s.type === SlotType.RCP) variant = 'blue';
                    if (s.type === SlotType.ACTIVITY) variant = 'amber';
                }
                return (
                    <Badge key={s.id} variant={variant} className="text-[10px] px-1 py-0.5 truncate">
                        <span className="font-bold mr-1">
                            {s.type === SlotType.CONSULTATION ? 'CS' : s.type === SlotType.RCP ? 'RCP' : 'ACT'}
                        </span>
                        {s.location}
                    </Badge>
                );
            })}
        </div>
    );
};
```

Note : le filtre `slots` est déplacé avant la garde `isHoliday` pour que cette garde puisse vérifier `slots.length === 0`.

---

## Fonctionnalité 2 : PDF adaptatif selon la vue active

### Emplacement de `generateDoctorViewPDF()`

La fonction est définie **à l'intérieur de `handleDownloadPDF()`**, juste après les helpers locaux (`hexRgb`, `fill`, `stroke`, `tc`, `slotBg`, `slotAccent`) et **avant** le dispatch. Elle ferme sur tous ces helpers et sur les variables du composant.

Structure dans `handleDownloadPDF()` :
```ts
const handleDownloadPDF = () => {
    try {
        setIsGeneratingPdf(true);
        const pdf = new jsPDF('l', 'pt', 'a4');
        const PW = 841.89, PH = 595.28, M = 20;

        // helpers existants (hexRgb, fill, stroke, tc, slotBg, slotAccent) — inchangés

        // ── Nouvelle fonction, définie ICI, ferme sur pdf, fill, stroke, tc, slotBg, etc.
        const generateDoctorViewPDF = () => {
            // ... voir ci-dessous
        };

        // ── Dispatch
        if (viewMode === 'DOCTOR') {
            generateDoctorViewPDF();
            return;
        }

        // ... code existant vue par poste inchangé ...
    }
};
```

### Layout de `generateDoctorViewPDF()`

#### Colonnes

| Constante | Valeur |
|---|---|
| `DOC_W` | 70 pt (colonne Médecin) |
| `PER_W` | 32 pt (colonne Créneau) |
| `CELL_W` | `(PW - 2*M - DOC_W - PER_W) / days.length` |
| `TITLE_H` | 36 (identique vue poste) |
| `HDR_H` | 20 (identique vue poste) |

#### Hauteur de ligne

```ts
const N_ROWS  = doctors.length * 2;
const DATA_H  = PH - 2*M - TITLE_H - HDR_H;
const ROW_H   = DATA_H / N_ROWS;
const TABLE_X = M + DOC_W + PER_W;
const TABLE_Y = M + TITLE_H + HDR_H;
```

#### En-tête

- Bande bleue `#4F46E5` (3pt, identique vue poste)
- Titre : `PLANNING RADIOTHÉRAPIE — VUE PAR MÉDECIN`, font bold 15pt, `#0F172A`
- Sous-titre : semaine + `formatWeekRange(currentWeekStart)`, font normal 9pt, `#475569`
- En-têtes colonnes jours : noms + dates ; jours fériés surlignés en rouge (même logique `isFrenchHoliday`)

#### Lignes de données

Pour chaque médecin, 2 lignes itérées sur `['Matin', 'Après-midi']` :

**Colonne Médecin (`x = M`, largeur `DOC_W`) :**
- Sur la ligne Matin uniquement : disque coloré `getDoctorHexColor(doc.color)` rayon 5pt + nom médecin (font bold 7pt, `#0F172A`)
- Sur la ligne Après-midi : cellule vide

**Colonne Créneau (`x = M + DOC_W`, largeur `PER_W`) :**
- `Matin` (ligne Matin) / `Après-m.` (ligne Après-midi), font normal 6pt, `#64748B`

**Cellules jour (`x = TABLE_X + colIndex * CELL_W`) :**

| État | Fond | Texte | Couleur texte |
|---|---|---|---|
| Absent | `#FEE2E2` | `reason` (≤20 chars), 7pt, centré | `#DC2626` |
| Slot présent | `slotBg(slot)` (même palette vue poste) | abbr type + lieu, 7pt | accent `slotAccent(slot)` |
| Vide | `#F8FAFC` | — | — |

**Logique cellule (pseudo-code) :**
```ts
const dateStr = getDateForDayOfWeek(currentWeekStart, day);
if (isAbsent(doc, dateStr, period, unavailabilities)) {
    const u = unavailabilities.find(u =>
        u.doctorId === doc.id && dateStr >= u.startDate && dateStr <= u.endDate &&
        (u.period === 'ALL_DAY' || u.period === period)
    );
    // draw cell: fill #FEE2E2, text u?.reason ?? 'Absent' in #DC2626
} else {
    const slot = schedule.find(s =>
        s.date === dateStr && s.period === period && s.assignedDoctorId === doc.id
    );
    // draw cell: fill slotBg(slot) or #F8FAFC, text abbr+location
}
```

#### Légende bas de page

Même structure que vue poste (`legendItems.forEach(...)`) avec entrée supplémentaire à la fin :
```ts
{ accent: '#DC2626', bg: '#FEE2E2', label: 'Absent / Congé' }
```

Rendu identique aux autres entrées : rectangle `bg` + bande gauche `accent` + label texte.

#### Nommage fichier

```ts
pdf.save(`Planning_Medecins_${currentWeekStart.toISOString().split('T')[0]}.pdf`);
```

---

## Fichiers modifiés

| Fichier | Modification |
|---|---|
| `pages/Planning.tsx` | Import `isAbsent` ajouté ligne 6 ; `renderDoctorCell()` réécrit avec check absence prioritaire ; `handleDownloadPDF()` : `generateDoctorViewPDF()` définie à l'intérieur + dispatch `if (viewMode === 'DOCTOR')` |

## Fichiers non modifiés

- `scheduleService.ts` — `isAbsent()` réutilisée telle quelle
- `types.ts` — aucun nouveau type nécessaire
- Tous les autres composants

---

## Non-objectifs (hors scope)

- Modifier la vue par poste (comportement PDF inchangé)
- Ajouter des congés à la vue par poste
- Refactoriser `handleDownloadPDF` en fichier séparé

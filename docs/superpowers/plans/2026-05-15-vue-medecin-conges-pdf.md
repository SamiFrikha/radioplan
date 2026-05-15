# Vue par Médecin — Congés + PDF adaptatif — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Afficher les congés/indisponibilités en rouge dans la vue par médecin, et générer un PDF adapté à la vue active (par poste ou par médecin).

**Architecture:** Modification unique de `pages/Planning.tsx` — réécriture de `renderDoctorCell` pour prioriser l'affichage des absences, et ajout de `generateDoctorViewPDF` à l'intérieur de `handleDownloadPDF` avec dispatch selon `viewMode`.

**Tech Stack:** React 19, TypeScript, jsPDF (déjà installé), `isAbsent` de `scheduleService.ts` (déjà exporté)

---

## File Map

| Fichier | Changement |
|---|---|
| `pages/Planning.tsx` | Import `isAbsent` (ligne 6) ; réécriture `renderDoctorCell` (ligne 708) ; ajout `generateDoctorViewPDF` + dispatch dans `handleDownloadPDF` (ligne 220) |

Aucun autre fichier n'est modifié.

---

## Task 1 : Affichage des congés dans `renderDoctorCell`

**Files:**
- Modify: `pages/Planning.tsx:6` (import)
- Modify: `pages/Planning.tsx:708-743` (renderDoctorCell)

- [ ] **Step 1 : Ajouter `isAbsent` à l'import de `scheduleService`**

À la ligne 6, remplacer :
```ts
import { getDateForDayOfWeek, isFrenchHoliday, generateScheduleForWeek, detectConflicts } from '../services/scheduleService';
```
par :
```ts
import { getDateForDayOfWeek, isFrenchHoliday, generateScheduleForWeek, detectConflicts, isAbsent } from '../services/scheduleService';
```

- [ ] **Step 2 : Réécrire `renderDoctorCell` (lignes 708-743)**

Remplacer le corps complet de la fonction (de la ligne 708 jusqu'au `};` de clôture à la ligne 743) par :

```tsx
const renderDoctorCell = (doctor: any, day: DayOfWeek, period: Period) => {
    const date = getDateForDayOfWeek(currentWeekStart, day);

    // Absence prioritaire sur tout le reste
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
        s.date === date &&
        s.period === period &&
        s.assignedDoctorId === doctor.id
    );

    const isHoliday = isFrenchHoliday(date);
    if (isHoliday && slots.length === 0) {
        return <div className="bg-danger/5 h-full text-[10px] text-danger/40 flex items-center justify-center">Férié</div>;
    }

    if (slots.length === 0) return <div className="bg-muted h-full"></div>;

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

- [ ] **Step 3 : Vérifier que le build TypeScript compile sans erreur**

```powershell
cd C:\Users\jaste\OneDrive\Bureau\radioplan
npx tsc --noEmit
```
Résultat attendu : aucune erreur. Si erreur sur `isAbsent` → vérifier que l'export existe dans `services/scheduleService.ts` (chercher `export const isAbsent`).

- [ ] **Step 4 : Test manuel — vue par médecin avec un médecin ayant un congé cette semaine**

1. Lancer le dev server : `npm run dev`
2. Aller sur Planning Global → sélectionner "Par Médecin"
3. Pour un médecin ayant une indisponibilité cette semaine : la ou les cellules concernées doivent afficher un fond rouge clair avec la raison en texte rouge
4. Un médecin sans indisponibilité → comportement inchangé (slots normaux ou vide)
5. Si aucun médecin n'a de congé cette semaine → en créer un temporairement via la page Indisponibilités pour vérifier

- [ ] **Step 5 : Commit**

```bash
git add pages/Planning.tsx
git commit -m "feat: afficher congés/indisponibilités en rouge dans vue par médecin"
```

---

## Task 2 : PDF adaptatif — `generateDoctorViewPDF`

**Files:**
- Modify: `pages/Planning.tsx:220-503` (handleDownloadPDF)

- [ ] **Step 1 : Définir `generateDoctorViewPDF` à l'intérieur de `handleDownloadPDF`**

Dans `handleDownloadPDF` (ligne 220), **après** les helpers `slotBg` et `slotAccent` (vers la ligne 261) et **avant** le bloc `// ── layout ────` (ligne 262), insérer la fonction suivante + le dispatch :

```ts
// ── Vue par médecin ───────────────────────────────────────────────
const generateDoctorViewPDF = () => {
    const DOC_W  = 70;
    const DPER_W = 32;
    const DCELL_W = (PW - 2*M - DOC_W - DPER_W) / days.length;
    const DTITLE_H = 36;
    const DHDR_H   = 20;
    const DN_ROWS  = doctors.length * 2;
    const DDATA_H  = PH - 2*M - DTITLE_H - DHDR_H;
    const DROW_H   = DDATA_H / DN_ROWS;
    const DTABLE_X = M + DOC_W + DPER_W;
    const DTABLE_Y = M + DTITLE_H + DHDR_H;

    // 1. Titre
    fill('#4F46E5');
    pdf.rect(M, M, PW - 2*M, 3, 'F');
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(15); tc('#0F172A');
    pdf.text('PLANNING RADIOTHÉRAPIE — VUE PAR MÉDECIN', M, M + 18);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); tc('#64748B');
    pdf.text(formatWeekRange(currentWeekStart), M, M + 30);
    pdf.setFontSize(8); tc('#94A3B8');
    pdf.text(
        `Généré le ${new Date().toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit', year:'numeric' })}`,
        PW - M, M + 18, { align: 'right' }
    );

    // 2. En-têtes colonnes
    fill('#0F172A'); stroke('#1E293B'); pdf.setLineWidth(0.4);
    pdf.rect(M, M + DTITLE_H, DOC_W + DPER_W, DHDR_H, 'FD');
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7.5); tc('#FFFFFF');
    pdf.text('Médecin / Créneau', M + (DOC_W + DPER_W)/2, M + DTITLE_H + DHDR_H/2 + 2.5, { align: 'center' });

    days.forEach((day, di) => {
        const dateStr    = getDateForDayOfWeek(currentWeekStart, day);
        const holiday    = isFrenchHoliday(dateStr);
        const [, mo, dd] = dateStr.split('-');
        const x = DTABLE_X + di * DCELL_W;
        fill(holiday ? '#FEF2F2' : '#1E293B');
        stroke(holiday ? '#FECACA' : '#334155');
        pdf.rect(x, M + DTITLE_H, DCELL_W, DHDR_H, 'FD');
        pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9);
        tc(holiday ? '#DC2626' : '#FFFFFF');
        pdf.text(`${day}  ${dd}/${mo}`, x + DCELL_W/2, M + DTITLE_H + DHDR_H/2 + 3, { align: 'center' });
    });

    // 3. Lignes de données
    doctors.forEach((doc, ri) => {
        const rowY0 = DTABLE_Y + ri * 2 * DROW_H;
        const rowY1 = DTABLE_Y + (ri * 2 + 1) * DROW_H;
        const stripBg = ri % 2 === 0 ? '#FFFFFF' : '#F9FAFB';

        // Colonne médecin (span 2 lignes)
        fill('#F1F5F9'); stroke('#CBD5E1'); pdf.setLineWidth(0.5);
        pdf.rect(M, rowY0, DOC_W, DROW_H * 2, 'FD');

        const docHex = getDoctorHexColor(doc.color) || '#64748B';
        const { r: dr, g: dg, b: db } = hexRgb(docHex);
        const CR = 5;
        const CX = M + CR + 4;
        const CY = rowY0 + DROW_H / 2;
        pdf.setFillColor(dr, dg, db);
        pdf.ellipse(CX, CY, CR, CR, 'F');
        pdf.setFont('helvetica', 'bold'); pdf.setFontSize(4.5); tc('#FFFFFF');
        pdf.text(doc.name.substring(0, 2).toUpperCase(), CX, CY + 1.6, { align: 'center' });

        const nameX = CX + CR + 3;
        let dName = doc.name;
        pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7);
        while (pdf.getTextWidth(dName) > DOC_W - nameX + M - 2 && dName.length > 3) dName = dName.slice(0, -1);
        if (dName !== doc.name) dName += '…';
        tc('#0F172A');
        pdf.text(dName, nameX, CY + 2.5);

        // Séparateur entre médecins
        if (ri < doctors.length - 1) {
            fill('#E2E8F0');
            pdf.rect(M, rowY1 + DROW_H - 0.8, PW - 2*M, 1.6, 'F');
        }

        [Period.MORNING, Period.AFTERNOON].forEach((period, pi) => {
            const rowY = pi === 0 ? rowY0 : rowY1;

            // Colonne créneau
            fill('#F8FAFC'); stroke('#E2E8F0'); pdf.setLineWidth(0.35);
            pdf.rect(M + DOC_W, rowY, DPER_W, DROW_H, 'FD');
            pdf.setFont('helvetica', 'normal'); pdf.setFontSize(6.5); tc('#64748B');
            pdf.text(
                period === Period.MORNING ? 'Matin' : 'Après-m.',
                M + DOC_W + DPER_W/2, rowY + DROW_H/2 + 2.3, { align: 'center' }
            );

            if (pi === 0) {
                stroke('#E2E8F0'); pdf.setLineWidth(0.3);
                pdf.line(M + DOC_W, rowY + DROW_H, PW - M, rowY + DROW_H);
            }

            // Cellules jours
            days.forEach((day, di) => {
                const cellX   = DTABLE_X + di * DCELL_W;
                const dateStr = getDateForDayOfWeek(currentWeekStart, day);

                fill(stripBg); stroke('#E2E8F0'); pdf.setLineWidth(0.3);
                pdf.rect(cellX, rowY, DCELL_W, DROW_H, 'FD');

                if (isAbsent(doc, dateStr, period, unavailabilities)) {
                    const u = unavailabilities.find(u =>
                        u.doctorId === doc.id &&
                        dateStr >= u.startDate &&
                        dateStr <= u.endDate &&
                        (u.period === 'ALL_DAY' || u.period === period)
                    );
                    const reason = u?.reason ?? 'Absent';
                    fill('#FEE2E2'); stroke('#FECACA');
                    pdf.rect(cellX, rowY, DCELL_W, DROW_H, 'FD');
                    fill('#DC2626'); pdf.rect(cellX, rowY, 2.5, DROW_H, 'F');
                    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7); tc('#DC2626');
                    const r = reason.length > 18 ? reason.slice(0, 17) + '…' : reason;
                    pdf.text(r, cellX + DCELL_W/2, rowY + DROW_H/2 + 2.3, { align: 'center' });
                    return;
                }

                const slot = schedule.find(s =>
                    s.date === dateStr &&
                    s.period === period &&
                    s.assignedDoctorId === doc.id &&
                    !s.isCancelled
                );

                if (!slot) return;

                const bg     = slotBg(slot);
                const accent = slotAccent(slot);
                fill(bg); stroke('#E2E8F0');
                pdf.rect(cellX, rowY, DCELL_W, DROW_H, 'FD');
                fill(accent); pdf.rect(cellX, rowY, 2.5, DROW_H, 'F');

                const abbr = slot.type === SlotType.CONSULTATION ? 'CS'
                    : slot.type === SlotType.RCP ? 'RCP' : 'ACT';
                pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7); tc('#0F172A');
                pdf.text(abbr, cellX + 5, rowY + DROW_H/2 + 2.3);

                if (slot.location) {
                    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(6); tc('#475569');
                    let loc = slot.location;
                    while (pdf.getTextWidth(loc) > DCELL_W - 18 && loc.length > 2) loc = loc.slice(0, -1);
                    if (loc !== slot.location) loc += '…';
                    pdf.text(loc, cellX + 16, rowY + DROW_H/2 + 2.3);
                }
            });
        });
    });

    // 4. Légende + footer
    const LY = DTABLE_Y + DN_ROWS * DROW_H + 6;
    const dLegendItems = [
        { accent: '#3B6FD4', bg: '#EEF4FF', label: 'Consultation' },
        { accent: '#7C3AED', bg: '#F5F0FF', label: 'RCP' },
        { accent: '#DC4E3A', bg: '#FFF0EE', label: 'Astreinte' },
        { accent: '#0F766E', bg: '#ECFDF5', label: 'Workflow' },
        { accent: '#6D28D9', bg: '#F3F0FF', label: 'Unity' },
        { accent: '#F59E0B', bg: '#FFFBEB', label: 'Activité' },
        { accent: '#DC2626', bg: '#FEE2E2', label: 'Absent / Congé' },
    ];
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7); tc('#64748B');
    pdf.text('LÉGENDE :', M, LY + 5.5);
    let lx = M + 44;
    dLegendItems.forEach(({ accent, bg, label }) => {
        fill(bg); stroke(accent); pdf.setLineWidth(0.5);
        pdf.rect(lx, LY, 10, 8, 'FD');
        fill(accent); pdf.rect(lx, LY, 2.5, 8, 'F');
        pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7); tc('#0F172A');
        pdf.text(label, lx + 12, LY + 5.5);
        lx += pdf.getTextWidth(label) + 20;
    });

    stroke('#E2E8F0'); pdf.setLineWidth(0.5);
    pdf.line(M, LY + 14, PW - M, LY + 14);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7); tc('#CBD5E1');
    pdf.text('RadioPlan AI — document généré automatiquement', M, LY + 20);
    pdf.text(formatWeekRange(currentWeekStart), PW - M, LY + 20, { align: 'right' });

    pdf.save(`Planning_Medecins_${currentWeekStart.toISOString().split('T')[0]}.pdf`);
};

// ── Dispatch selon la vue active ─────────────────────────────────
if (viewMode === 'DOCTOR') {
    generateDoctorViewPDF();
    return;
}
```

Ce bloc s'insère **après** la définition de `slotAccent` (fin vers ligne 260) et **avant** le commentaire `// ── layout ────` (ligne 262).

- [ ] **Step 2 : Vérifier que le build TypeScript compile sans erreur**

```powershell
npx tsc --noEmit
```
Résultat attendu : aucune erreur.

- [ ] **Step 3 : Test manuel — téléchargement PDF en vue par poste**

1. Aller sur Planning Global → vue "Par Poste" (comportement par défaut)
2. Cliquer sur le bouton de téléchargement PDF
3. Vérifier que le PDF téléchargé est le même format qu'avant (vue par poste, nom `Planning_YYYY-MM-DD.pdf`)

- [ ] **Step 4 : Test manuel — téléchargement PDF en vue par médecin**

1. Basculer sur vue "Par Médecin"
2. Cliquer sur le bouton de téléchargement PDF
3. Vérifier :
   - Le fichier s'appelle `Planning_Medecins_YYYY-MM-DD.pdf`
   - Le titre affiche "VUE PAR MÉDECIN"
   - Les lignes sont organisées par médecin (2 lignes : Matin + Après-midi)
   - Les médecins absents ont des cellules rouges avec leur raison
   - Les médecins avec des créneaux voient les abréviations (CS/RCP/ACT) + lieu
   - La légende inclut "Absent / Congé" en rouge

- [ ] **Step 5 : Commit**

```bash
git add pages/Planning.tsx
git commit -m "feat: PDF adaptatif vue par médecin avec congés en rouge"
```

---

## Vérification finale

- [ ] Vue par médecin : cellules rouges visibles pour les absences
- [ ] Vue par médecin : comportement inchangé pour les médecins sans absence
- [ ] PDF vue par poste : comportement inchangé (régression nulle)
- [ ] PDF vue par médecin : layout correct, congés en rouge, légende complète
- [ ] Build TypeScript sans erreur

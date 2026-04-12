# Manuel Utilisateur Médecin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Générer un fichier Word (.docx) de 15–20 pages servant de manuel d'utilisation complet pour les médecins du Service de Radiothérapie de l'Hôpital Henri Mondor.

**Architecture:** Un seul script Node.js (`scripts/generate-manuel-medecin.js`) utilise la bibliothèque `docx` (déjà installée globalement en v9.6.1) pour construire et écrire le document. Le script est exécuté avec `node scripts/generate-manuel-medecin.js`. Chaque tâche ajoute un ou plusieurs chapitres au script puis régénère le document pour vérification.

**Tech Stack:** Node.js, `docx@9.6.1` (global), pas de framework de test — validation = exécution sans erreur + vérification manuelle dans Word/LibreOffice.

**Spec:** `docs/superpowers/specs/2026-04-12-manuel-utilisateur-medecin-design.md`

---

## File Structure

| Fichier | Action | Rôle |
|---------|--------|------|
| `scripts/generate-manuel-medecin.js` | Créer | Script Node.js de génération du .docx |
| `docs/Manuel_Utilisateur_Medecin_RadioPlan.docx` | Créer (généré) | Document final |

---

## Task 1 — Scaffold : styles, header/footer, structure de base

**Files:**
- Create: `scripts/generate-manuel-medecin.js`

Mettre en place la structure du document : imports, styles, en-tête, pied de page, numérotation des listes. Le script doit générer un `.docx` valide (même vide) sans erreur.

- [ ] **Step 1: Créer le script avec scaffold complet**

Créer `scripts/generate-manuel-medecin.js` avec le contenu suivant :

```javascript
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
  ShadingType, VerticalAlign, PageNumber, PageBreak, TableOfContents,
  LevelFormat, ExternalHyperlink, ImageRun
} = require('docx');
const fs = require('fs');
const path = require('path');

// ─── Couleurs ────────────────────────────────────────────────────────────────
const COLORS = {
  primary:    '3B5BDB', // bleu RadioPlan
  secondary:  '495057',
  accent:     '1971C2',
  lightBg:    'EBF4FF',
  tableBg:    'F1F3F9',
  headerBg:   '1E3A5F',
  border:     'C5D3E8',
  coral:      'DC4E3A',
  violet:     '6D28D9',
  teal:       '0F766E',
  text:       '212529',
  muted:      '6C757D',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
const border1 = (color = COLORS.border) => ({
  style: BorderStyle.SINGLE, size: 1, color
});
const cellBorders = (color = COLORS.border) => ({
  top: border1(color), bottom: border1(color),
  left: border1(color), right: border1(color),
});
const cellMargins = { top: 80, bottom: 80, left: 140, right: 140 };

function heading1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    pageBreakBefore: true,
    children: [new TextRun({ text, font: 'Arial', size: 32, bold: true, color: COLORS.primary })],
    spacing: { before: 0, after: 240 },
  });
}

function heading2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    children: [new TextRun({ text, font: 'Arial', size: 26, bold: true, color: COLORS.accent })],
    spacing: { before: 280, after: 120 },
  });
}

function heading3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    children: [new TextRun({ text, font: 'Arial', size: 22, bold: true, color: COLORS.secondary })],
    spacing: { before: 200, after: 80 },
  });
}

function para(text, opts = {}) {
  return new Paragraph({
    children: [new TextRun({
      text,
      font: 'Arial',
      size: 22,
      color: opts.color || COLORS.text,
      bold: opts.bold || false,
      italics: opts.italic || false,
    })],
    spacing: { before: opts.spaceBefore || 60, after: opts.spaceAfter || 100 },
    indent: opts.indent ? { left: opts.indent } : undefined,
  });
}

function bullet(text, level = 0) {
  return new Paragraph({
    numbering: { reference: 'bullets', level },
    children: [new TextRun({ text, font: 'Arial', size: 22, color: COLORS.text })],
    spacing: { before: 40, after: 40 },
  });
}

function numbered(text, level = 0) {
  return new Paragraph({
    numbering: { reference: 'numbers', level },
    children: [new TextRun({ text, font: 'Arial', size: 22, color: COLORS.text })],
    spacing: { before: 40, after: 40 },
  });
}

function tip(text) {
  return new Paragraph({
    children: [
      new TextRun({ text: '💡 ', font: 'Arial', size: 22 }),
      new TextRun({ text, font: 'Arial', size: 22, italics: true, color: COLORS.accent }),
    ],
    spacing: { before: 80, after: 80 },
    indent: { left: 360 },
    border: {
      left: { style: BorderStyle.SINGLE, size: 8, color: COLORS.primary, space: 8 },
    },
  });
}

function note(text) {
  return new Paragraph({
    children: [
      new TextRun({ text: '⚠️ ', font: 'Arial', size: 22 }),
      new TextRun({ text, font: 'Arial', size: 22, italics: true, color: '856404' }),
    ],
    spacing: { before: 80, after: 80 },
    indent: { left: 360 },
    border: {
      left: { style: BorderStyle.SINGLE, size: 8, color: 'FFC107', space: 8 },
    },
  });
}

function separator() {
  return new Paragraph({
    spacing: { before: 120, after: 120 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: COLORS.border, space: 1 } },
    children: [],
  });
}

function makeTable(headers, rows, colWidths) {
  const totalWidth = colWidths.reduce((a, b) => a + b, 0);
  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map((h, i) => new TableCell({
      borders: cellBorders(COLORS.primary),
      width: { size: colWidths[i], type: WidthType.DXA },
      shading: { fill: COLORS.headerBg, type: ShadingType.CLEAR },
      margins: cellMargins,
      children: [new Paragraph({
        children: [new TextRun({ text: h, font: 'Arial', size: 20, bold: true, color: 'FFFFFF' })],
        spacing: { before: 0, after: 0 },
      })],
    })),
  });

  const dataRows = rows.map((row, ri) => new TableRow({
    children: row.map((cell, ci) => new TableCell({
      borders: cellBorders(),
      width: { size: colWidths[ci], type: WidthType.DXA },
      shading: { fill: ri % 2 === 0 ? 'FFFFFF' : COLORS.tableBg, type: ShadingType.CLEAR },
      margins: cellMargins,
      children: [new Paragraph({
        children: [new TextRun({ text: cell, font: 'Arial', size: 20, color: COLORS.text })],
        spacing: { before: 0, after: 0 },
      })],
    })),
  }));

  return new Table({
    width: { size: totalWidth, type: WidthType.DXA },
    columnWidths: colWidths,
    rows: [headerRow, ...dataRows],
    spacing: { before: 120, after: 160 },
  });
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const docStyles = {
  default: {
    document: { run: { font: 'Arial', size: 22, color: COLORS.text } },
  },
  paragraphStyles: [
    {
      id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
      run: { size: 32, bold: true, font: 'Arial', color: COLORS.primary },
      paragraph: { spacing: { before: 0, after: 240 }, outlineLevel: 0 },
    },
    {
      id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
      run: { size: 26, bold: true, font: 'Arial', color: COLORS.accent },
      paragraph: { spacing: { before: 280, after: 120 }, outlineLevel: 1 },
    },
    {
      id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
      run: { size: 22, bold: true, font: 'Arial', color: COLORS.secondary },
      paragraph: { spacing: { before: 200, after: 80 }, outlineLevel: 2 },
    },
  ],
};

// ─── Numbering ───────────────────────────────────────────────────────────────
const numberingConfig = {
  config: [
    {
      reference: 'bullets',
      levels: [
        {
          level: 0, format: LevelFormat.BULLET, text: '\u2022', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } },
        },
        {
          level: 1, format: LevelFormat.BULLET, text: '\u25E6', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 1080, hanging: 360 } } },
        },
      ],
    },
    {
      reference: 'numbers',
      levels: [
        {
          level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } },
        },
      ],
    },
  ],
};

// ─── Header / Footer ─────────────────────────────────────────────────────────
function makeHeader() {
  return new Header({
    children: [
      new Paragraph({
        children: [
          new TextRun({ text: 'RadioPlan AI', font: 'Arial', size: 18, bold: true, color: COLORS.primary }),
          new TextRun({ text: '  —  ', font: 'Arial', size: 18, color: COLORS.muted }),
          new TextRun({ text: 'H\u00f4pital Henri Mondor, Service Radioth\u00e9rapie', font: 'Arial', size: 18, color: COLORS.muted }),
        ],
        border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: COLORS.border, space: 4 } },
        spacing: { after: 120 },
      }),
    ],
  });
}

function makeFooter() {
  return new Footer({
    children: [
      new Paragraph({
        children: [
          new TextRun({ text: 'Manuel Utilisateur \u2014 M\u00e9decin \u2014 v1.0 \u2014 2026', font: 'Arial', size: 16, color: COLORS.muted }),
          new TextRun({ text: '          Page ', font: 'Arial', size: 16, color: COLORS.muted }),
          new TextRun({ children: [PageNumber.CURRENT], font: 'Arial', size: 16, color: COLORS.muted }),
        ],
        border: { top: { style: BorderStyle.SINGLE, size: 4, color: COLORS.border, space: 4 } },
        spacing: { before: 80 },
      }),
    ],
  });
}

// ─── SECTIONS ────────────────────────────────────────────────────────────────

// Placeholder — les sections seront ajoutées dans les tâches suivantes
const allChildren = [
  new Paragraph({ children: [new TextRun({ text: 'PLACEHOLDER', font: 'Arial', size: 22 })] }),
];

// ─── Document assembly ───────────────────────────────────────────────────────
const doc = new Document({
  styles: docStyles,
  numbering: numberingConfig,
  sections: [{
    properties: {
      page: {
        size: { width: 11906, height: 16838 }, // A4
        margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 }, // ~2cm
      },
    },
    headers: { default: makeHeader() },
    footers: { default: makeFooter() },
    children: allChildren,
  }],
});

// ─── Write ───────────────────────────────────────────────────────────────────
const outputPath = path.join(__dirname, '..', 'docs', 'Manuel_Utilisateur_Medecin_RadioPlan.docx');
Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync(outputPath, buffer);
  console.log('✅ Manuel genere :', outputPath);
}).catch(err => {
  console.error('❌ Erreur:', err.message);
  process.exit(1);
});
```

- [ ] **Step 2: Vérifier que le script tourne sans erreur**

```bash
node scripts/generate-manuel-medecin.js
```

Résultat attendu : `✅ Manuel genere : docs/Manuel_Utilisateur_Medecin_RadioPlan.docx`
Si erreur `Cannot find module 'docx'` : `npm install -g docx` puis relancer.

- [ ] **Step 3: Commit scaffold**

```bash
git add scripts/generate-manuel-medecin.js docs/Manuel_Utilisateur_Medecin_RadioPlan.docx
git commit -m "feat(docs): add scaffold for manuel utilisateur médecin"
```

---

## Task 2 — Page de couverture + Table des matières

**Files:**
- Modify: `scripts/generate-manuel-medecin.js`

Remplacer le `PLACEHOLDER` par la page de couverture et la Table des matières.

- [ ] **Step 1: Remplacer `allChildren` dans le script**

Trouver le bloc `const allChildren = [...]` et le remplacer par :

```javascript
// ─── Page de couverture ───────────────────────────────────────────────────────
function makeCoverPage() {
  return [
    new Paragraph({ spacing: { before: 2400, after: 0 }, children: [] }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: 'RadioPlan AI', font: 'Arial', size: 72, bold: true, color: COLORS.primary })],
      spacing: { before: 0, after: 200 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: 'Manuel Utilisateur', font: 'Arial', size: 44, bold: false, color: COLORS.secondary })],
      spacing: { before: 0, after: 80 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: 'R\u00f4le : M\u00e9decin', font: 'Arial', size: 32, color: COLORS.muted })],
      spacing: { before: 0, after: 480 },
    }),
    separator(),
    new Paragraph({ spacing: { before: 240, after: 0 }, children: [] }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: 'H\u00f4pital Henri Mondor', font: 'Arial', size: 28, bold: true, color: COLORS.text })],
      spacing: { before: 0, after: 80 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: 'Service Radioth\u00e9rapie', font: 'Arial', size: 26, color: COLORS.secondary })],
      spacing: { before: 0, after: 80 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: 'Avril 2026 \u2014 Version 1.0', font: 'Arial', size: 22, color: COLORS.muted })],
      spacing: { before: 0, after: 480 },
    }),
    new Paragraph({ children: [new PageBreak()] }),
  ];
}

// ─── Table des matières ───────────────────────────────────────────────────────
function makeTOC() {
  return [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: 'Table des mati\u00e8res', font: 'Arial', size: 32, bold: true, color: COLORS.primary })],
      pageBreakBefore: false,
      spacing: { before: 0, after: 240 },
    }),
    new TableOfContents('Table des mati\u00e8res', {
      hyperlink: true,
      headingStyleRange: '1-3',
    }),
    new Paragraph({ children: [new PageBreak()] }),
  ];
}

const allChildren = [
  ...makeCoverPage(),
  ...makeTOC(),
  // Chapitres ajoutés dans les tâches suivantes
];
```

- [ ] **Step 2: Vérifier la génération**

```bash
node scripts/generate-manuel-medecin.js
```

Résultat attendu : `✅ Manuel genere : docs/Manuel_Utilisateur_Medecin_RadioPlan.docx`
Ouvrir le fichier dans Word/LibreOffice : la page de couverture et la page de table des matières doivent être présentes.

- [ ] **Step 3: Commit**

```bash
git add scripts/generate-manuel-medecin.js docs/Manuel_Utilisateur_Medecin_RadioPlan.docx
git commit -m "feat(docs): add cover page and TOC to manuel médecin"
```

---

## Task 3 — Chapitre 1 : Premiers pas

**Files:**
- Modify: `scripts/generate-manuel-medecin.js`

- [ ] **Step 1: Ajouter la fonction `makeChapter1()` avant `allChildren`**

```javascript
function makeChapter1() {
  return [
    heading1('1. Premiers pas'),
    para('Bienvenue dans RadioPlan AI. Ce manuel te guide dans l\'utilisation de l\'application au quotidien. En quelques minutes, tu seras op\u00e9rationnel.'),

    heading2('1.1 Se connecter'),
    numbered('Ouvre ton navigateur et acc\u00e8de \u00e0 l\'URL de l\'application (fournie par ton administrateur).', 0),
    numbered('Saisis ton adresse email et ton mot de passe, puis clique sur Connexion.', 0),
    numbered('Si tu as oubli\u00e9 ton mot de passe : clique sur "Mot de passe oubli\u00e9" \u2192 un email de r\u00e9initialisation te sera envoy\u00e9.', 0),
    tip('L\'application fonctionne sur tous les navigateurs modernes (Chrome, Firefox, Safari, Edge). Aucune installation requise.'),

    heading2('1.2 D\u00e9couvrir l\'interface'),
    para('L\'interface s\'adapte automatiquement \u00e0 ton \u00e9cran :'),
    bullet('Sur desktop/tablette : une barre lat\u00e9rale (sidebar) \u00e0 gauche contient tous les liens de navigation et la cloche de notifications.'),
    bullet('Sur mobile : la navigation se trouve en bas de l\'\u00e9cran (barre d\'ic\u00f4nes). La cloche de notifications est accessible en haut \u00e0 droite.'),

    heading2('1.3 Pages accessibles au m\u00e9decin'),
    makeTable(
      ['Page', 'Acc\u00e8s', 'R\u00f4le'],
      [
        ['Tableau de bord', 'Toujours', 'Vue g\u00e9n\u00e9rale de la semaine'],
        ['Mon Planning', 'Toujours', 'Ton agenda personnel semaine/mois'],
        ['Planning Global', 'Si autoris\u00e9 par l\'admin', 'Planning de toute l\'\u00e9quipe'],
        ['Activit\u00e9s', 'Toujours', 'R\u00e9partition des gardes et activit\u00e9s'],
        ['Mon Profil', 'Toujours', 'Absences, pr\u00e9f\u00e9rences, notifications'],
      ],
      [3400, 2200, 3400]
    ),

    heading2('1.4 Installer l\'app sur mobile (optionnel)'),
    para('RadioPlan AI peut fonctionner comme une application native sur ton smartphone :'),
    para('Sur iPhone/iPad (Safari) :', { bold: true }),
    numbered('Tap le bouton "Partager" (carr\u00e9 avec fl\u00e8che vers le haut).', 0),
    numbered('Choisis "Sur l\'\u00e9cran d\'accueil".', 0),
    numbered('Confirme \u2192 l\'ic\u00f4ne RadioPlan AI appara\u00eet sur ton \u00e9cran d\'accueil.', 0),
    para('Sur Android (Chrome) :', { bold: true }),
    numbered('Tape les 3 points en haut \u00e0 droite.', 0),
    numbered('Choisis "Ajouter \u00e0 l\'\u00e9cran d\'accueil".', 0),
    tip('Une fois install\u00e9e, l\'app s\'ouvre en plein \u00e9cran sans barre du navigateur, exactement comme une app native.'),

    heading2('1.5 Se d\u00e9connecter'),
    para('Clique sur le bouton de d\u00e9connexion (ic\u00f4ne de sortie) en bas de la sidebar. Sur mobile, acc\u00e8de \u00e0 "Mon Profil" puis "D\u00e9connexion".'),
  ];
}
```

Ajouter `...makeChapter1(),` dans `allChildren` après `...makeTOC(),`.

- [ ] **Step 2: Vérifier la génération**

```bash
node scripts/generate-manuel-medecin.js
```

Ouvrir le docx : le chapitre 1 doit apparaître avec ses sous-sections, le tableau des pages accessibles, et les astuces visuelles.

- [ ] **Step 3: Commit**

```bash
git add scripts/generate-manuel-medecin.js docs/Manuel_Utilisateur_Medecin_RadioPlan.docx
git commit -m "feat(docs): add chapter 1 - Premiers pas"
```

---

## Task 4 — Chapitre 2 : Tableau de bord

**Files:**
- Modify: `scripts/generate-manuel-medecin.js`

- [ ] **Step 1: Ajouter la fonction `makeChapter2()` et l'appeler dans `allChildren`**

```javascript
function makeChapter2() {
  return [
    heading1('2. Tableau de bord'),
    para('Le tableau de bord est la page d\'accueil de RadioPlan AI. Il te donne une vue instantan\u00e9e de l\'\u00e9tat du planning.'),

    heading2('2.1 Vue jour / Vue semaine'),
    para('Utilise le bouton bascule en haut \u00e0 droite pour choisir l\'affichage :'),
    bullet('Vue jour : d\u00e9tail de la journ\u00e9e s\u00e9lectionn\u00e9e (matin + apr\u00e8s-midi), avec tous les m\u00e9decins assign\u00e9s.'),
    bullet('Vue semaine : r\u00e9sum\u00e9 des 5 jours avec les statistiques cl\u00e9s.'),
    para('Les fl\u00e8ches ← → te permettent de naviguer semaine par semaine.'),

    heading2('2.2 Cartes de statistiques'),
    para('En haut de chaque vue, des cartes t\'informent d\'un coup d\'\u0153il :'),
    makeTable(
      ['Carte', 'Ce qu\'elle indique'],
      [
        ['M\u00e9decins pr\u00e9sents', 'Nombre de m\u00e9decins disponibles ce jour / cette semaine'],
        ['Absences', 'Nombre d\'absences d\u00e9clar\u00e9es sur la p\u00e9riode'],
        ['Conflits', 'Nombre de conflits d\u00e9tect\u00e9s (voir section 2.3)'],
        ['Activit\u00e9s planifi\u00e9es', 'Nombre d\'activit\u00e9s (gardes, Unity, Workflow) sur la semaine'],
      ],
      [3000, 6000]
    ),

    heading2('2.3 Les conflits'),
    para('Un conflit se produit quand un m\u00e9decin est assign\u00e9 \u00e0 un slot alors qu\'il est absent ou non disponible. Il est signal\u00e9 par une ic\u00f4ne triangle orange \u26a0\ufe0f sur le slot concern\u00e9.'),
    note('Si tu d\u00e9tectes un conflit qui te concerne, contacte ton administrateur. Lui seul peut modifier le planning ou demander un remplacement en ton nom.'),

    heading2('2.4 Jours f\u00e9ri\u00e9s'),
    para('Les jours f\u00e9ri\u00e9s fran\u00e7ais sont automatiquement d\u00e9tect\u00e9s et gris\u00e9s. Le syst\u00e8me ne g\u00e9n\u00e8re aucun slot ce jour-l\u00e0. Si un RCP tombe un jour f\u00e9ri\u00e9, l\'administrateur peut le d\u00e9placer manuellement.'),

    heading2('2.5 Semaines verrouill\u00e9es'),
    para('Une ic\u00f4ne cadenas 🔒 pr\u00e8s du num\u00e9ro de semaine signifie que cette semaine a \u00e9t\u00e9 valid\u00e9e par l\'administrateur. Le planning est fig\u00e9 : aucune modification n\'est possible.'),
  ];
}
```

Ajouter `...makeChapter2(),` dans `allChildren`.

- [ ] **Step 2: Générer et vérifier**

```bash
node scripts/generate-manuel-medecin.js
```

- [ ] **Step 3: Commit**

```bash
git add scripts/generate-manuel-medecin.js docs/Manuel_Utilisateur_Medecin_RadioPlan.docx
git commit -m "feat(docs): add chapter 2 - Tableau de bord"
```

---

## Task 5 — Chapitre 3 : Mon Planning

**Files:**
- Modify: `scripts/generate-manuel-medecin.js`

- [ ] **Step 1: Ajouter `makeChapter3()` et l'appeler dans `allChildren`**

```javascript
function makeChapter3() {
  return [
    heading1('3. Mon Planning'),
    para('Cette page est ton agenda personnel. Elle affiche uniquement tes slots \u2014 consultations, RCP et activit\u00e9s \u2014 mis en \u00e9vidence avec ta couleur de badge.'),

    heading2('3.1 Vue semaine'),
    para('La vue semaine affiche tes cr\u00e9neaux du lundi au vendredi, organis\u00e9s par demi-journ\u00e9e (matin / apr\u00e8s-midi). Chaque slot indique :'),
    bullet('Le type de cr\u00e9neau : Consultation (Box 1/2/3), RCP, Activit\u00e9 (Astreinte, Unity, Workflow)'),
    bullet('Le lieu ou l\'intitul\u00e9'),
    bullet('Les co-m\u00e9decins \u00e9ventuellement partag\u00e9s sur ce slot'),
    para('Clique sur un slot pour en voir le d\u00e9tail complet.'),
    tip('Les fl\u00e8ches ← → te permettent de naviguer semaine par semaine. Le bouton "Aujourd\'hui" te ram\u00e8ne \u00e0 la semaine en cours.'),

    heading2('3.2 Vue mois'),
    para('La vue mois affiche un calendrier de tes slots sur tout le mois. Utile pour avoir une vision d\'ensemble de ta charge. Clique sur "Mois" en haut de la page pour basculer.'),

    heading2('3.3 Modifier une consultation'),
    para('Si tu es assign\u00e9 \u00e0 un slot de consultation (Box 1, 2 ou 3), tu peux demander un remplacement :'),
    numbered('Clique sur le slot de consultation concern\u00e9.', 0),
    numbered('Dans le panneau de d\u00e9tail, clique sur "Demander un remplacement".', 0),
    numbered('S\u00e9lectionne le m\u00e9decin cible dans la liste.', 0),
    numbered('Confirme \u2192 le m\u00e9decin re\u00e7oit une notification.', 0),
    note('Les demandes de remplacement ne modifient pas le planning automatiquement. Le planning est mis \u00e0 jour uniquement si le m\u00e9decin cible accepte.'),

    heading2('3.4 Confirmer sa pr\u00e9sence \u00e0 un RCP'),
    para('Les RCP (R\u00e9unions de Concertation Pluridisciplinaire) apparaissent dans ton planning hebdomadaire. Pour confirmer ou d\u00e9cliner ta pr\u00e9sence :'),
    numbered('Clique sur le slot RCP.', 0),
    numbered('Dans le modal, s\u00e9lectionne PR\u00c9SENT ou ABSENT.', 0),
    numbered('Valide.', 0),
    tip('Le premier m\u00e9decin \u00e0 confirmer PR\u00c9SENT "verrouille" le slot \u2014 le RCP est confirm\u00e9 comme tenu. Les autres m\u00e9decins peuvent toujours renseigner leur pr\u00e9sence ensuite.'),
  ];
}
```

Ajouter `...makeChapter3(),` dans `allChildren`.

- [ ] **Step 2: Générer et vérifier**

```bash
node scripts/generate-manuel-medecin.js
```

- [ ] **Step 3: Commit**

```bash
git add scripts/generate-manuel-medecin.js docs/Manuel_Utilisateur_Medecin_RadioPlan.docx
git commit -m "feat(docs): add chapter 3 - Mon Planning"
```

---

## Task 6 — Chapitre 4 : Planning Global

**Files:**
- Modify: `scripts/generate-manuel-medecin.js`

- [ ] **Step 1: Ajouter `makeChapter4()` et l'appeler dans `allChildren`**

```javascript
function makeChapter4() {
  return [
    heading1('4. Planning Global'),
    para('Le Planning Global affiche le planning complet de toute l\'\u00e9quipe sur une semaine. Cette page peut n\u00e9cessiter une autorisation de l\'administrateur pour \u00eatre accessible.'),

    heading2('4.1 Lire le tableau'),
    para('Le tableau est organis\u00e9 ainsi :'),
    bullet('Lignes : cr\u00e9neaux temporels (Lundi matin, Lundi apr\u00e8s-midi, etc.)'),
    bullet('Colonnes : postes / salles (Box 1, Box 2, Box 3, Machine, RCP...)'),
    bullet('Cellules : m\u00e9decin assign\u00e9, affich\u00e9 avec sa couleur unique'),
    para('Chaque m\u00e9decin a une couleur de badge unique, visible dans la l\u00e9gende en bas de page.'),

    heading2('4.2 Types de slots'),
    makeTable(
      ['Type', 'Description'],
      [
        ['Consultation', 'Consultation patient en salle Box (Box 1, 2, 3)'],
        ['RCP', 'R\u00e9union de Concertation Pluridisciplinaire'],
        ['Activit\u00e9', 'Astreinte, Unity ou Supervision Workflow'],
        ['Machine', 'Supervision d\'un appareil de traitement'],
      ],
      [2800, 6200]
    ),

    heading2('4.3 Semaine verrouill\u00e9e'),
    para('Quand un cadenas 🔒 appara\u00eet sur la semaine, le planning a \u00e9t\u00e9 valid\u00e9 par l\'administrateur. Aucune interaction n\'est possible \u2014 le planning est en lecture seule.'),

    heading2('4.4 Exporter le planning'),
    bullet('Bouton "PDF" : g\u00e9n\u00e8re un PDF imprimable de la semaine affich\u00e9e.'),
    bullet('Bouton "Image" : t\u00e9l\u00e9charge une capture PNG du tableau.'),
    tip('Ces exports sont pratiques pour partager ou afficher le planning de la semaine dans le service.'),
  ];
}
```

Ajouter `...makeChapter4(),` dans `allChildren`.

- [ ] **Step 2: Générer et vérifier**

```bash
node scripts/generate-manuel-medecin.js
```

- [ ] **Step 3: Commit**

```bash
git add scripts/generate-manuel-medecin.js docs/Manuel_Utilisateur_Medecin_RadioPlan.docx
git commit -m "feat(docs): add chapter 4 - Planning Global"
```

---

## Task 7 — Chapitre 5 : Activités & Répartition automatique

**Files:**
- Modify: `scripts/generate-manuel-medecin.js`

C'est le chapitre le plus important : il explique la logique d'équité de manière accessible.

- [ ] **Step 1: Ajouter `makeChapter5()` et l'appeler dans `allChildren`**

```javascript
function makeChapter5() {
  return [
    heading1('5. Activit\u00e9s & R\u00e9partition automatique'),
    para('La page Activit\u00e9s g\u00e8re les gardes et activit\u00e9s sp\u00e9cialis\u00e9es. Le syst\u00e8me les r\u00e9partit automatiquement de fa\u00e7on \u00e9quitable entre tous les m\u00e9decins du service.'),

    heading2('5.1 Les trois types d\'activit\u00e9s'),
    makeTable(
      ['Activit\u00e9', 'Description'],
      [
        ['Astreinte', 'Garde sur site ou \u00e0 distance. Pool commun avec Unity.'],
        ['Unity', 'Supervision de la machine Unity. Pool commun avec Astreinte.'],
        ['Supervision Workflow', 'Supervision du circuit patients/workflow. Pool ind\u00e9pendant.'],
      ],
      [2400, 6600]
    ),

    heading2('5.2 Comment fonctionne la r\u00e9partition automatique'),
    para('Chaque semaine, le syst\u00e8me d\u00e9signe automatiquement le m\u00e9decin pour chaque activit\u00e9. Voici la logique, \u00e9tape par \u00e9tape :'),
    numbered('\u00c9tape 1 \u2014 Filtrer les absents : tout m\u00e9decin absent ce jour-l\u00e0 est exclu de la s\u00e9lection.', 0),
    numbered('\u00c9tape 2 \u2014 Calculer le score d\'\u00e9quit\u00e9 pour chaque m\u00e9decin disponible :', 0),
    new Paragraph({
      children: [
        new TextRun({ text: 'Score = Nombre d\'activit\u00e9s effectu\u00e9es \u00f7 Taux de travail', font: 'Arial', size: 22, bold: true, italics: true, color: COLORS.primary }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { before: 120, after: 120 },
      border: {
        top: border1(COLORS.border), bottom: border1(COLORS.border),
        left: border1(COLORS.primary), right: border1(COLORS.border),
      },
      indent: { left: 720, right: 720 },
    }),
    numbered('\u00c9tape 3 \u2014 D\u00e9signer le m\u00e9decin ayant le score le plus bas (il a le moins fait proportionnellement \u00e0 son temps de travail).', 0),
    numbered('\u00c9tape 4 \u2014 En cas d\'\u00e9galit\u00e9, tirage al\u00e9atoire entre les ex-\u00e6quo.', 0),
    para('Exemple concret :', { bold: true }),
    makeTable(
      ['M\u00e9decin', 'Taux de travail', 'Activit\u00e9s effectu\u00e9es', 'Score'],
      [
        ['Dr. Martin', '100% (1.0)', '6', '6.0'],
        ['Dr. Dupont', '50% (0.5)', '2', '4.0 \u2190 d\u00e9sign\u00e9'],
        ['Dr. Leroy', '100% (1.0)', '5', '5.0'],
      ],
      [2200, 2200, 2600, 2000]
    ),
    tip('Un m\u00e9decin \u00e0 mi-temps voit son score divis\u00e9 par 2, ce qui le prot\u00e8ge d\'une sur-attribution.'),

    heading2('5.3 Groupes d\'\u00e9quit\u00e9'),
    para('Les activit\u00e9s sont regroup\u00e9es pour que les compteurs soient partag\u00e9s :'),
    bullet('Groupe 1 \u2014 Unity + Astreinte : faire une astreinte "compte" autant que faire une Unity. Les deux activit\u00e9s partagent le m\u00eame compteur.'),
    bullet('Groupe 2 \u2014 Supervision Workflow : compteur ind\u00e9pendant.'),
    para('Pourquoi des groupes ? Pour \u00e9viter qu\'un m\u00e9decin qui fait beaucoup d\'astreintes soit \u00e9pargn\u00e9 sur les Unity, ou inversement.'),

    heading2('5.4 Semaine verrouill\u00e9e'),
    para('Une fois qu\'un administrateur valide une semaine (cadenas 🔒), le planning des activit\u00e9s est fig\u00e9. Plus aucun recalcul automatique ne peut modifier les attributions.'),

    heading2('5.5 Signaler une attribution incorrecte'),
    note('Si tu penses qu\'une attribution est incorrecte (ex. : absence non enregistr\u00e9e, erreur de taux de travail), contacte ton administrateur avant que la semaine soit verrouill\u00e9e. Apr\u00e8s verrouillage, aucune correction n\'est possible.'),
  ];
}
```

Ajouter `...makeChapter5(),` dans `allChildren`.

- [ ] **Step 2: Générer et vérifier**

```bash
node scripts/generate-manuel-medecin.js
```

Vérifier que le tableau d'exemple et la formule sont bien mis en forme.

- [ ] **Step 3: Commit**

```bash
git add scripts/generate-manuel-medecin.js docs/Manuel_Utilisateur_Medecin_RadioPlan.docx
git commit -m "feat(docs): add chapter 5 - Activités et répartition automatique"
```

---

## Task 8 — Chapitre 6 : Mon Profil & Absences

**Files:**
- Modify: `scripts/generate-manuel-medecin.js`

- [ ] **Step 1: Ajouter `makeChapter6()` et l'appeler dans `allChildren`**

```javascript
function makeChapter6() {
  return [
    heading1('6. Mon Profil & Absences'),
    para('La page Mon Profil te permet de g\u00e9rer tes disponibilit\u00e9s, tes informations personnelles et tes pr\u00e9f\u00e9rences de notification.'),

    heading2('6.1 D\u00e9clarer une absence'),
    numbered('Acc\u00e8de \u00e0 "Mon Profil" depuis la sidebar ou la navigation mobile.', 0),
    numbered('Clique sur "Ajouter une absence".', 0),
    numbered('Renseigne la date de d\u00e9but, la date de fin et le type d\'absence (cong\u00e9, formation, autre).', 0),
    numbered('Valide \u2192 l\'absence est imm\u00e9diatement prise en compte.', 0),
    tip('D\u00e9clare tes absences d\u00e8s que possible. Le syst\u00e8me les prend en compte lors du prochain calcul de planning.'),
    para('Pour supprimer une absence : clique sur l\'ic\u00f4ne poubelle \ud83d\uddd1\ufe0f \u00e0 c\u00f4t\u00e9 de l\'entr\u00e9e concern\u00e9e.'),

    heading2('6.2 Exclure des demi-journ\u00e9es r\u00e9currentes'),
    para('Si tu n\'es jamais disponible certains cr\u00e9neaux fixes (ex. : mercredi matin tous les semaines), tu peux les exclure de fa\u00e7on permanente :'),
    numbered('Dans "Mon Profil", section "Demi-journ\u00e9es exclues".', 0),
    numbered('S\u00e9lectionne le jour et la p\u00e9riode (matin / apr\u00e8s-midi).', 0),
    numbered('Enregistre.', 0),
    note('Ces exclusions sont prioritaires sur les attributions automatiques. Le syst\u00e8me ne t\'assignera jamais d\'activit\u00e9 sur ces cr\u00e9neaux.'),

    heading2('6.3 Modifier sa photo de profil'),
    para('Clique sur l\'ic\u00f4ne appareil photo sur ton avatar \u2192 s\u00e9lectionne une image depuis ton appareil. La photo est mise \u00e0 jour imm\u00e9diatement.'),

    heading2('6.4 Changer de mot de passe'),
    para('Clique sur "Modifier le mot de passe" \u2192 un email de r\u00e9initialisation te sera envoy\u00e9. Suis le lien re\u00e7u pour d\u00e9finir un nouveau mot de passe.'),

    heading2('6.5 Notifications push (mobile)'),
    para('Pour recevoir des alertes sur ton mobile m\u00eame quand l\'application est ferm\u00e9e :'),
    numbered('Dans "Mon Profil", section "Notifications".', 0),
    numbered('Active l\'option "Notifications push".', 0),
    numbered('Accepte la permission demand\u00e9e par ton navigateur mobile.', 0),
    para('Tu peux activer ou d\u00e9sactiver chaque type de notification individuellement (RCP, remplacements, rappels).'),
    tip('Les notifications push ne fonctionnent que si l\'application est install\u00e9e sur l\'\u00e9cran d\'accueil (voir section 1.4).'),
  ];
}
```

Ajouter `...makeChapter6(),` dans `allChildren`.

- [ ] **Step 2: Générer et vérifier**

```bash
node scripts/generate-manuel-medecin.js
```

- [ ] **Step 3: Commit**

```bash
git add scripts/generate-manuel-medecin.js docs/Manuel_Utilisateur_Medecin_RadioPlan.docx
git commit -m "feat(docs): add chapter 6 - Mon Profil et Absences"
```

---

## Task 9 — Chapitre 7 : Notifications & Remplacements

**Files:**
- Modify: `scripts/generate-manuel-medecin.js`

- [ ] **Step 1: Ajouter `makeChapter7()` et l'appeler dans `allChildren`**

```javascript
function makeChapter7() {
  return [
    heading1('7. Notifications & Remplacements'),
    para('Le syst\u00e8me de notifications te tient inform\u00e9 en temps r\u00e9el des \u00e9v\u00e9nements qui te concernent : RCP, remplacements, rappels.'),

    heading2('7.1 La cloche de notifications'),
    para('L\'ic\u00f4ne cloche 🔔 est toujours visible :'),
    bullet('Sur desktop : dans la sidebar en haut \u00e0 droite.'),
    bullet('Sur mobile : dans le coin sup\u00e9rieur droit de l\'\u00e9cran.'),
    para('Un badge rouge indique le nombre de notifications non lues. Clique sur la cloche pour ouvrir le panneau.'),
    para('Dans le panneau, tu peux :'),
    bullet('"Tout marquer comme lu" \u2192 efface le badge rouge sur toutes les notifications.'),
    bullet('"Tout effacer" \u2192 supprime toutes les notifications de la liste.'),

    heading2('7.2 Types de notifications'),
    makeTable(
      ['Ic\u00f4ne', 'Type', 'Quand tu la re\u00e7ois'],
      [
        ['\ud83c\udfb2 RCP auto-assign\u00e9', 'Tu as \u00e9t\u00e9 d\u00e9sign\u00e9 pour un RCP', 'Apr\u00e8s l\'attribution automatique'],
        ['\u2705 RCP confirm\u00e9', 'Un RCP est maintenant confirm\u00e9', 'Un m\u00e9decin a dit PR\u00c9SENT'],
        ['\u23f0 Rappel RCP 24h', 'Un RCP a lieu demain', 'La veille du RCP'],
        ['\u26a0\ufe0f Rappel RCP 12h', 'Un RCP a lieu dans 12h', '12h avant le RCP'],
        ['\ud83d\udea8 RCP sans assign\u00e9', 'Alerte : un RCP n\'a personne', 'Si aucun m\u00e9decin n\'est confirm\u00e9'],
        ['\ud83d\udd04 Demande de remplacement', 'Un coll\u00e8gue te demande de le remplacer', 'D\u00e8s la demande envoy\u00e9e'],
        ['\u2705 Remplacement accept\u00e9', 'Quelqu\'un a accept\u00e9 ta demande', 'Apr\u00e8s acceptation'],
        ['\u274c Remplacement refus\u00e9', 'Ta demande a \u00e9t\u00e9 refus\u00e9e', 'Apr\u00e8s refus'],
      ],
      [2400, 3000, 3600]
    ),

    heading2('7.3 R\u00e9pondre \u00e0 une demande de remplacement'),
    para('Quand tu re\u00e7ois une notification \ud83d\udd04 Demande de remplacement :'),
    numbered('Ouvre la cloche \u2192 clique sur la notification.', 0),
    numbered('Les d\u00e9tails du cr\u00e9neau s\'affichent : date, heure, type, lieu.', 0),
    numbered('Clique Accepter ou Refuser.', 0),
    para('Si tu acceptes : le planning est mis \u00e0 jour automatiquement et le m\u00e9decin demandeur est notifi\u00e9.'),
    para('Si tu refuses : le m\u00e9decin demandeur re\u00e7oit une notification de refus et peut contacter un autre coll\u00e8gue.'),
    note('Une fois accept\u00e9, le remplacement est imm\u00e9diatement visible dans le Planning Global et dans ton propre planning.'),

    heading2('7.4 Demander un remplacement'),
    para('Tu peux demander un remplacement pour tes slots de consultation (Box) et tes activit\u00e9s (Astreinte, Unity, Workflow) :'),
    numbered('Acc\u00e8de \u00e0 "Mon Planning" ou au "Tableau de bord".', 0),
    numbered('Clique sur le slot concern\u00e9.', 0),
    numbered('Dans le panneau de d\u00e9tail, clique sur "Demander un remplacement".', 0),
    numbered('S\u00e9lectionne le m\u00e9decin cible dans la liste (tous les m\u00e9decins de l\'\u00e9quipe sont listables).', 0),
    numbered('Confirme \u2192 le m\u00e9decin re\u00e7oit une notification \ud83d\udd04.', 0),
    tip('Pense \u00e0 contacter le m\u00e9decin directement en parall\u00e8le pour le pr\u00e9venir. La notification peut parfois \u00eatre vue avec un l\u00e9ger d\u00e9lai.'),
  ];
}
```

Ajouter `...makeChapter7(),` dans `allChildren`.

- [ ] **Step 2: Générer et vérifier**

```bash
node scripts/generate-manuel-medecin.js
```

Vérifier : 7 chapitres présents, tableau des notifications complet, le document fait bien 15-20 pages dans Word.

- [ ] **Step 3: Commit**

```bash
git add scripts/generate-manuel-medecin.js docs/Manuel_Utilisateur_Medecin_RadioPlan.docx
git commit -m "feat(docs): add chapter 7 - Notifications et Remplacements"
```

---

## Task 10 — Finalisation : page de fin, vérification complète, commit final

**Files:**
- Modify: `scripts/generate-manuel-medecin.js`

- [ ] **Step 1: Ajouter une page de fin dans `allChildren`**

Ajouter après le dernier chapitre dans `allChildren` :

```javascript
new Paragraph({ children: [new PageBreak()] }),
new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { before: 2400, after: 0 },
  children: [new TextRun({ text: 'Fin du manuel', font: 'Arial', size: 22, italics: true, color: COLORS.muted })],
}),
new Paragraph({
  alignment: AlignmentType.CENTER,
  children: [new TextRun({ text: 'Pour toute question, contactez votre administrateur RadioPlan AI.', font: 'Arial', size: 20, color: COLORS.muted })],
  spacing: { before: 80, after: 0 },
}),
```

- [ ] **Step 2: Régénérer le document final**

```bash
node scripts/generate-manuel-medecin.js
```

- [ ] **Step 3: Vérification manuelle dans Word/LibreOffice**

Ouvrir `docs/Manuel_Utilisateur_Medecin_RadioPlan.docx` et vérifier :
- [ ] Page de couverture affichée correctement (titre, établissement, version)
- [ ] Table des matières présente (mettre à jour manuellement dans Word si nécessaire : clic droit → Mettre à jour les champs)
- [ ] 7 chapitres présents et bien numérotés
- [ ] En-têtes et pieds de page sur toutes les pages (sauf couverture)
- [ ] Tableaux lisibles et bien formatés
- [ ] Formule d'équité au chapitre 5 visuellement distincte
- [ ] Environ 15-20 pages au total

- [ ] **Step 4: Commit final**

```bash
git add scripts/generate-manuel-medecin.js docs/Manuel_Utilisateur_Medecin_RadioPlan.docx
git commit -m "feat(docs): finalize Manuel Utilisateur Médecin v1.0"
```

---

## Récapitulatif des fichiers

| Fichier | Statut |
|---------|--------|
| `scripts/generate-manuel-medecin.js` | Créé |
| `docs/Manuel_Utilisateur_Medecin_RadioPlan.docx` | Généré |

## Commande de régénération rapide

À tout moment, pour regénérer le document après modification du script :

```bash
node scripts/generate-manuel-medecin.js
```

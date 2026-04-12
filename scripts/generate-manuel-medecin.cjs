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
  primary:    '3B5BDB',
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

  const table = new Table({
    width: { size: totalWidth, type: WidthType.DXA },
    columnWidths: colWidths,
    rows: [headerRow, ...dataRows],
  });

  return [
    new Paragraph({ children: [], spacing: { before: 0, after: 120 } }),
    table,
    new Paragraph({ children: [], spacing: { before: 0, after: 160 } }),
  ];
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
      children: [new TextRun({ text: 'Rôle : Médecin', font: 'Arial', size: 32, color: COLORS.muted })],
      spacing: { before: 0, after: 480 },
    }),
    separator(),
    new Paragraph({ spacing: { before: 240, after: 0 }, children: [] }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: 'Hôpital Henri Mondor', font: 'Arial', size: 28, bold: true, color: COLORS.text })],
      spacing: { before: 0, after: 80 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: 'Service Radiothérapie', font: 'Arial', size: 26, color: COLORS.secondary })],
      spacing: { before: 0, after: 80 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: 'Avril 2026 — Version 1.0', font: 'Arial', size: 22, color: COLORS.muted })],
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
      children: [new TextRun({ text: 'Table des matières', font: 'Arial', size: 32, bold: true, color: COLORS.primary })],
      pageBreakBefore: false,
      spacing: { before: 0, after: 240 },
    }),
    new TableOfContents('Table des matières', {
      hyperlink: true,
      headingStyleRange: '1-3',
    }),
    new Paragraph({ children: [new PageBreak()] }),
  ];
}

// ─── SECTIONS ────────────────────────────────────────────────────────────────
function makeChapter1() {
  return [
    heading1('1. Premiers pas'),
    para('Bienvenue dans RadioPlan AI. Ce manuel te guide dans l\'utilisation de l\'application au quotidien. En quelques minutes, tu seras opérationnel.'),

    heading2('1.1 Se connecter'),
    numbered('Ouvre ton navigateur et accède à l\'URL de l\'application (fournie par ton administrateur).', 0),
    numbered('Saisis ton adresse email et ton mot de passe, puis clique sur Connexion.', 0),
    numbered('Si tu as oublié ton mot de passe : clique sur "Mot de passe oublié" \u2192 un email de réinitialisation te sera envoyé.', 0),
    tip('L\'application fonctionne sur tous les navigateurs modernes (Chrome, Firefox, Safari, Edge). Aucune installation requise.'),

    heading2('1.2 Découvrir l\'interface'),
    para('L\'interface s\'adapte automatiquement à ton écran :'),
    bullet('Sur desktop/tablette : une barre latérale (sidebar) à gauche contient tous les liens de navigation et la cloche de notifications.'),
    bullet('Sur mobile : la navigation se trouve en bas de l\'écran (barre d\'icônes). La cloche de notifications est accessible en haut à droite.'),

    heading2('1.3 Pages accessibles au médecin'),
    ...makeTable(
      ['Page', 'Accès', 'Rôle'],
      [
        ['Tableau de bord', 'Toujours', 'Vue générale de la semaine'],
        ['Mon Planning', 'Toujours', 'Ton agenda personnel semaine/mois'],
        ['Planning Global', 'Si autorisé par l\'admin', 'Planning de toute l\'équipe'],
        ['Activités', 'Toujours', 'Répartition des gardes et activités'],
        ['Mon Profil', 'Toujours', 'Absences, préférences, notifications'],
      ],
      [3400, 2200, 3400]
    ),

    heading2('1.4 Installer l\'app sur mobile (optionnel)'),
    para('RadioPlan AI peut fonctionner comme une application native sur ton smartphone :'),
    para('Sur iPhone/iPad (Safari) :', { bold: true }),
    numbered('Tap le bouton "Partager" (carré avec flèche vers le haut).', 0),
    numbered('Choisis "Sur l\'écran d\'accueil".', 0),
    numbered('Confirme \u2192 l\'icône RadioPlan AI apparaît sur ton écran d\'accueil.', 0),
    para('Sur Android (Chrome) :', { bold: true }),
    numbered('Tape les 3 points en haut à droite.', 0),
    numbered('Choisis "Ajouter à l\'écran d\'accueil".', 0),
    tip('Une fois installée, l\'app s\'ouvre en plein écran sans barre du navigateur, exactement comme une app native.'),

    heading2('1.5 Se déconnecter'),
    para('Clique sur le bouton de déconnexion (icône de sortie) en bas de la sidebar. Sur mobile, accède à "Mon Profil" puis "Déconnexion".'),
  ];
}

const allChildren = [
  ...makeCoverPage(),
  ...makeTOC(),
  ...makeChapter1(),
  // Chapitres ajoutés dans les tâches suivantes
];

// ─── Document assembly ───────────────────────────────────────────────────────
const doc = new Document({
  styles: docStyles,
  numbering: numberingConfig,
  sections: [{
    properties: {
      page: {
        size: { width: 11906, height: 16838 },
        margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 },
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

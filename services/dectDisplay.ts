import { Doctor, DectDisplaySettings, DectSurface, DectPosition, DectStyle } from '../types';

/**
 * DECT display — the single place that decides how a number is rendered next to a name.
 *
 * The number is a 5-digit internal extension stored on the doctor profile.
 * Admins choose per-surface where it appears, plus a position and a style
 * (Gestion d'Équipe → Affichage DECT). Nothing shows until a surface is enabled.
 */

export const DEFAULT_DECT_DISPLAY: DectDisplaySettings = {
    planningGlobal: false,
    planningGlobalPdf: false,
    monPlanning: false,
    dashboard: false,
    position: 'before',
    style: 'brackets',
};

/** Labels for the settings tab — order here drives the checkbox order. */
export const DECT_SURFACES: { key: DectSurface; label: string; description: string }[] = [
    {
        key: 'planningGlobal',
        label: 'Planning global',
        description: 'Vues « Lieu / Créneau » et « Médecin » à l\'écran',
    },
    {
        key: 'planningGlobalPdf',
        label: 'Planning global — PDF téléchargé',
        description: 'Export PDF du planning global, dans les deux vues',
    },
    {
        key: 'monPlanning',
        label: 'Mon Planning',
        description: 'Agenda personnel : remplaçants et médecins absents',
    },
    {
        key: 'dashboard',
        label: 'Tableau de bord',
        description: 'Listes de médecins : conflits, alertes, présences RCP',
    },
];

export const DECT_POSITIONS: { key: DectPosition; label: string }[] = [
    { key: 'before', label: 'Avant le nom' },
    { key: 'after', label: 'Après le nom' },
];

export const DECT_STYLES: { key: DectStyle; label: string; note?: string }[] = [
    { key: 'brackets', label: 'Crochets' },
    { key: 'parentheses', label: 'Parenthèses' },
    { key: 'plain', label: 'Sans habillage' },
    { key: 'dot', label: 'Point médian' },
    { key: 'dash', label: 'Tiret' },
    { key: 'label', label: 'Préfixe « Tél. »' },
    {
        key: 'phone',
        label: 'Icône téléphone',
        note: 'Le PDF ne sait pas dessiner ce symbole : il y affiche « Tél. » à la place.',
    },
];

const DECT_PATTERN = /^\d{5}$/;

/** True when the value is a usable 5-digit DECT extension. */
export const isValidDect = (value: string | null | undefined): boolean =>
    !!value && DECT_PATTERN.test(value);

/** Keep only digits, capped at 5 — for controlled input fields. */
export const sanitizeDectInput = (value: string): string =>
    value.replace(/\D/g, '').slice(0, 5);

const isPosition = (v: unknown): v is DectPosition => v === 'before' || v === 'after';
const isStyle = (v: unknown): v is DectStyle =>
    DECT_STYLES.some(s => s.key === v);

/** Read stored settings, tolerating a missing column, null, or partial JSON. */
export const normalizeDectDisplay = (raw: unknown): DectDisplaySettings => {
    const source = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {};
    return {
        planningGlobal: source.planningGlobal === true,
        planningGlobalPdf: source.planningGlobalPdf === true,
        monPlanning: source.monPlanning === true,
        dashboard: source.dashboard === true,
        // Settings saved before these fields existed fall back to the original format.
        position: isPosition(source.position) ? source.position : DEFAULT_DECT_DISPLAY.position,
        style: isStyle(source.style) ? source.style : DEFAULT_DECT_DISPLAY.style,
    };
};

/**
 * The number with its visual treatment, e.g. "[12345]" or "☎ 12345".
 *
 * `pdfSafe` restricts output to WinAnsi, the encoding used by jsPDF's standard
 * fonts. U+260E is outside it and would be dropped or drawn as garbage, so the
 * phone style degrades to its text equivalent in the PDF export only.
 */
const renderNumber = (dect: string, style: DectStyle, pdfSafe: boolean): string => {
    switch (style) {
        case 'brackets': return `[${dect}]`;
        case 'parentheses': return `(${dect})`;
        case 'label': return `Tél. ${dect}`;
        case 'phone': return pdfSafe ? `Tél. ${dect}` : `☎ ${dect}`;
        default: return dect;
    }
};

/** What sits between the number and the name. */
const separatorFor = (style: DectStyle): string => {
    switch (style) {
        case 'dot': return ' · ';
        case 'dash': return ' — ';
        default: return ' ';
    }
};

/**
 * Compose a name and a number using the given position/style. Returns the bare
 * name when the number is missing or malformed, so no empty brackets ever appear.
 *
 * Pass `pdfSafe` when the result is drawn by jsPDF rather than the browser.
 */
export const formatDectName = (
    name: string,
    dect: string | null | undefined,
    position: DectPosition,
    style: DectStyle,
    pdfSafe = false
): string => {
    if (!isValidDect(dect)) return name;
    const chip = renderNumber(dect as string, style, pdfSafe);
    const sep = separatorFor(style);
    return position === 'after' ? `${name}${sep}${chip}` : `${chip}${sep}${name}`;
};

/** The only surface rendered by jsPDF instead of the browser. */
const PDF_SURFACES: DectSurface[] = ['planningGlobalPdf'];

/**
 * The doctor's display name for a given surface: formatted with the number when
 * that surface is enabled, bare otherwise.
 */
export const withDect = (
    doctor: Pick<Doctor, 'name' | 'dect'> | null | undefined,
    settings: DectDisplaySettings | undefined,
    surface: DectSurface
): string => {
    if (!doctor) return '';
    if (settings?.[surface] !== true) return doctor.name;
    return formatDectName(
        doctor.name, doctor.dect, settings.position, settings.style,
        PDF_SURFACES.includes(surface)
    );
};

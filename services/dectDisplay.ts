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
        note: 'Une icône ne peut pas être dessinée dans le PDF : il y affiche « Tél. » à la place.',
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
 * The number with its visual treatment, e.g. "[12345]" or "Tél. 12345".
 *
 * The 'phone' style has no text form: its icon is an SVG drawn by <DoctorName>.
 * Contexts that can only take a string — the jsPDF export, and labels built with
 * template literals — get 'Tél.' instead. No Unicode phone glyph is emitted: the
 * UI font renders U+260E as tofu, and jsPDF's WinAnsi fonts cannot draw it at all.
 */
const renderNumber = (dect: string, style: DectStyle): string => {
    switch (style) {
        case 'brackets': return `[${dect}]`;
        case 'parentheses': return `(${dect})`;
        case 'label':
        case 'phone': return `Tél. ${dect}`;
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
 */
export const formatDectName = (
    name: string,
    dect: string | null | undefined,
    position: DectPosition,
    style: DectStyle
): string => {
    if (!isValidDect(dect)) return name;
    const chip = renderNumber(dect as string, style);
    const sep = separatorFor(style);
    return position === 'after' ? `${name}${sep}${chip}` : `${chip}${sep}${name}`;
};

/** True when this surface should show the number at all. */
export const isDectEnabled = (
    settings: DectDisplaySettings | undefined,
    surface: DectSurface
): boolean => settings?.[surface] === true;

export const resolvePosition = (settings: DectDisplaySettings | undefined): DectPosition =>
    settings?.position ?? DEFAULT_DECT_DISPLAY.position;

export const resolveStyle = (settings: DectDisplaySettings | undefined): DectStyle =>
    settings?.style ?? DEFAULT_DECT_DISPLAY.style;

/**
 * The doctor's display name as plain text. Use <DoctorName> instead wherever JSX
 * is possible — only that component can draw the 'phone' style's icon.
 */
export const withDect = (
    doctor: Pick<Doctor, 'name' | 'dect'> | null | undefined,
    settings: DectDisplaySettings | undefined,
    surface: DectSurface
): string => {
    if (!doctor) return '';
    if (!isDectEnabled(settings, surface)) return doctor.name;
    return formatDectName(doctor.name, doctor.dect, resolvePosition(settings), resolveStyle(settings));
};

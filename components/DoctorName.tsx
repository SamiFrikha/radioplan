import React from 'react';
import { Phone } from 'lucide-react';
import { Doctor, DectDisplaySettings, DectSurface } from '../types';
import {
    formatDectName, isDectEnabled, isValidDect, resolvePosition, resolveStyle,
} from '../services/dectDisplay';

interface DoctorNameProps {
    doctor: Pick<Doctor, 'name' | 'dect'> | null | undefined;
    settings: DectDisplaySettings | undefined;
    surface: DectSurface;
    /** Styling for the number chip. Defaults to the muted treatment used in the admin list. */
    numberClassName?: string;
    /** Tailwind size for the phone icon. Shrink it inside dense planning cells. */
    iconClassName?: string;
}

/**
 * A doctor's name with its DECT number, for HTML surfaces.
 *
 * The 'phone' style needs a real SVG icon — no Unicode phone glyph survives the
 * UI font (it renders as tofu) or jsPDF's WinAnsi encoding. So the icon lives
 * here rather than in the string formatter, and only this component can draw it.
 * Text-only contexts (the PDF export, labels built with template literals) call
 * `withDect` instead and get 'Tél.' for that style.
 */
export const DoctorName: React.FC<DoctorNameProps> = ({
    doctor,
    settings,
    surface,
    numberClassName = 'text-text-muted font-normal',
    iconClassName = 'w-3 h-3',
}) => {
    if (!doctor) return null;

    if (!isDectEnabled(settings, surface) || !isValidDect(doctor.dect)) {
        return <>{doctor.name}</>;
    }

    const position = resolvePosition(settings);
    const style = resolveStyle(settings);

    if (style !== 'phone') {
        return <>{formatDectName(doctor.name, doctor.dect, position, style)}</>;
    }

    const chip = (
        <span className={`inline-flex items-center gap-0.5 align-baseline whitespace-nowrap ${numberClassName}`}>
            <Phone className={`${iconClassName} flex-shrink-0`} aria-hidden="true" />
            <span>{doctor.dect}</span>
        </span>
    );

    return position === 'after'
        ? <>{doctor.name}{' '}{chip}</>
        : <>{chip}{' '}{doctor.name}</>;
};

export default DoctorName;

import React from 'react';
import { Phone } from 'lucide-react';
import { Doctor, DectDisplaySettings, DectSurface } from '../types';
import {
    dectChipText, dectSeparator, isDectEnabled, isValidDect, resolvePosition, resolveStyle,
} from '../services/dectDisplay';

interface DoctorNameProps {
    doctor: Pick<Doctor, 'name' | 'dect'> | null | undefined;
    settings: DectDisplaySettings | undefined;
    surface: DectSurface;
    /** Styling for the number chip. Defaults to the muted treatment used in the admin list. */
    numberClassName?: string;
    /** Tailwind size for the phone icon. Shrink it inside dense planning cells. */
    iconClassName?: string;
    /**
     * Drop the number below the md breakpoint, keeping the bare name.
     * Set on dense grids — planning cells and dashboard lists — where the extra
     * characters would wrap the name onto several lines on a phone.
     */
    hideNumberOnMobile?: boolean;
}

/**
 * A doctor's name with its DECT number, for HTML surfaces.
 *
 * The 'phone' style needs a real SVG icon — no Unicode phone glyph survives the
 * UI font (it renders as tofu) or jsPDF's WinAnsi encoding. So the icon lives
 * here rather than in the string formatter, and only this component can draw it.
 * Text-only contexts (the PDF export, labels built with template literals) call
 * `withDect` instead and get 'Tél.' for that style.
 *
 * Name and number are separate nodes rather than one formatted string, so the
 * number can be hidden responsively.
 */
export const DoctorName: React.FC<DoctorNameProps> = ({
    doctor,
    settings,
    surface,
    numberClassName = 'text-text-muted font-normal',
    iconClassName = 'w-3 h-3',
    hideNumberOnMobile = false,
}) => {
    if (!doctor) return null;

    if (!isDectEnabled(settings, surface) || !isValidDect(doctor.dect)) {
        return <>{doctor.name}</>;
    }

    const position = resolvePosition(settings);
    const style = resolveStyle(settings);
    const separator = dectSeparator(style);

    const number = style === 'phone'
        ? (
            <span className={`inline-flex items-center gap-0.5 align-baseline whitespace-nowrap ${numberClassName}`}>
                <Phone className={`${iconClassName} flex-shrink-0`} aria-hidden="true" />
                <span>{doctor.dect}</span>
            </span>
        )
        : <span className={`whitespace-nowrap ${numberClassName}`}>{dectChipText(doctor.dect as string, style)}</span>;

    const chip = (
        <span className={hideNumberOnMobile ? 'hidden md:inline' : 'inline'}>
            {position === 'after' && separator}
            {number}
            {position === 'before' && separator}
        </span>
    );

    return position === 'after'
        ? <>{doctor.name}{chip}</>
        : <>{chip}{doctor.name}</>;
};

export default DoctorName;

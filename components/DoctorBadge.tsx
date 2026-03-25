import React from 'react';
import { Doctor } from '../types';

// Color map for converting Tailwind classes to hex
const COLOR_MAP: Record<string, string> = {
    'blue': '#3b82f6',
    'green': '#22c55e',
    'purple': '#a855f7',
    'yellow': '#eab308',
    'red': '#ef4444',
    'indigo': '#6366f1',
    'pink': '#ec4899',
    'orange': '#f97316',
    'teal': '#14b8a6',
    'cyan': '#06b6d4',
    'gray': '#6b7280',
    'slate': '#64748b',
    'emerald': '#10b981',
    'amber': '#f59e0b',
    'lime': '#84cc16',
    'rose': '#f43f5e',
    'violet': '#8b5cf6',
    'fuchsia': '#d946ef',
    'sky': '#0ea5e9',
};

/**
 * Get hex color from a doctor's color field
 * Supports both hex colors (#FFFFFF) and Tailwind classes (bg-blue-500)
 */
export const getDoctorHexColor = (colorValue: string | undefined | null): string => {
    if (!colorValue) return '#64748b';

    // If it's already a hex color, return it
    if (colorValue.startsWith('#')) {
        return colorValue;
    }

    // Try to extract color name from Tailwind class (bg-blue-500, bg-red-100, etc.)
    const match = colorValue.match(/bg-(\w+)-\d+/);
    if (match && COLOR_MAP[match[1]]) {
        return COLOR_MAP[match[1]];
    }

    // Try to find any color name in the string
    for (const [name, hex] of Object.entries(COLOR_MAP)) {
        if (colorValue.toLowerCase().includes(name)) {
            return hex;
        }
    }

    return '#64748b';
};

interface DoctorBadgeProps {
    doctor: Doctor | null | undefined;
    size?: 'sm' | 'md' | 'lg';
    showName?: boolean;
    showDrPrefix?: boolean;
    className?: string;
}

/**
 * Reusable Doctor Badge component
 * Shows a colored circle with "Dr" and optionally the doctor's name
 */
export const DoctorBadge: React.FC<DoctorBadgeProps> = ({
    doctor,
    size = 'md',
    showName = true,
    showDrPrefix = true,
    className = ''
}) => {
    if (!doctor) return null;

    const hexColor = getDoctorHexColor(doctor.color);

    const sizeClasses = {
        sm: 'w-5 h-5 text-[8px]',
        md: 'w-6 h-6 text-[10px]',
        lg: 'w-9 h-9 text-xs'
    };

    const textSizeClasses = {
        sm: 'text-[10px]',
        md: 'text-[11px]',
        lg: 'text-sm'
    };

    return (
        <div className={`flex items-center gap-1.5 ${className}`}>
            <span
                className={`${sizeClasses[size]} inline-flex items-center justify-center rounded-full gradient-primary text-white font-bold font-heading shadow-sm flex-shrink-0 select-none`}
                aria-label={`Dr ${doctor.name}`}
                title={`Dr ${doctor.name}`}
            >
                {doctor.name.substring(0, 2)}
            </span>
            {showName && (
                <span className={`${textSizeClasses[size]} font-semibold text-text-base truncate`}>
                    {showDrPrefix ? '' : 'Dr '}{doctor.name}
                </span>
            )}
        </div>
    );
};

interface DoctorBadgeListProps {
    doctorIds: string[];
    doctors: Doctor[];
    size?: 'sm' | 'md' | 'lg';
    showNames?: boolean;
    maxDisplay?: number;
    className?: string;
}

/**
 * List of doctor badges
 */
export const DoctorBadgeList: React.FC<DoctorBadgeListProps> = ({
    doctorIds,
    doctors,
    size = 'md',
    showNames = true,
    maxDisplay = 5,
    className = ''
}) => {
    const displayIds = doctorIds.slice(0, maxDisplay);
    const remaining = doctorIds.length - maxDisplay;

    return (
        <div className={`flex flex-col gap-1 ${className}`}>
            {displayIds.map((id, idx) => {
                const doc = doctors.find(d => d.id === id);
                return (
                    <DoctorBadge
                        key={id}
                        doctor={doc}
                        size={size}
                        showName={showNames}
                    />
                );
            })}
            {remaining > 0 && (
                <span className="text-xs text-text-muted italic">+{remaining} autres</span>
            )}
        </div>
    );
};

export default DoctorBadge;

import React, { useContext, useState, useRef, useMemo } from 'react';
import { AppContext } from '../App';
import { DayOfWeek, Period, SlotType } from '../types';
import SlotDetailsModal from '../components/SlotDetailsModal';
import { AlertCircle, ChevronLeft, ChevronRight, Calendar, UserCheck, Users, LayoutGrid, Printer, Loader2, ImageIcon, Lock, Ban, Settings, Palette, Eye, ShieldAlert } from 'lucide-react';
import { getDateForDayOfWeek, isFrenchHoliday, generateScheduleForWeek, detectConflicts } from '../services/scheduleService';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { getDoctorHexColor } from '../components/DoctorBadge';
import { useAuth } from '../context/AuthContext';
import { Card, CardHeader, CardTitle, CardBody, Badge, Button } from '../src/components/ui';

const Planning: React.FC = () => {
    const {
        doctors,
        unavailabilities,
        activityDefinitions,
        postes,
        manualOverrides,
        setManualOverrides,
        template,
        rcpTypes,
        effectiveHistory, // Use effectiveHistory instead of shiftHistory for equity calculations
        rcpAttendance,
        rcpExceptions,
        validatedWeeks
    } = useContext(AppContext);

    // --- AUTH & ACCESS CONTROL ---
    const { profile, isAdmin, isDoctor } = useAuth();
    const [accessDeniedMessage, setAccessDeniedMessage] = useState<string | null>(null);

    // Get the current user's doctor ID from their profile
    const currentDoctorId = profile?.doctor_id;

    // Check if the current user can interact with a slot (click to edit)
    // Admin: can interact with everything
    // Doctor: can only interact with their own consultation slots (Box 1, 2, 3)
    const canInteractWithSlot = (slot: { type: SlotType; location: string; assignedDoctorId: string | null; secondaryDoctorIds?: string[] }) => {
        // Admin has full access
        if (isAdmin) return true;

        // For doctors, only allow interaction with their own consultation slots
        if (isDoctor && currentDoctorId) {
            // Check if slot type is consultation and location is a "Box" (consultation rooms)
            const isConsultationBox = slot.type === SlotType.CONSULTATION && slot.location.toLowerCase().startsWith('box');

            // Check if the doctor is assigned to this slot
            const isAssigned = slot.assignedDoctorId === currentDoctorId ||
                (slot.secondaryDoctorIds && slot.secondaryDoctorIds.includes(currentDoctorId));

            return isConsultationBox && isAssigned;
        }

        // By default, no interaction allowed for other roles
        return false;
    };

    // Local Week State
    const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() => {
        const d = new Date();
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        d.setDate(diff);
        d.setHours(0, 0, 0, 0);
        return d;
    });

    // --- VISUAL SETTINGS STATE ---
    const [viewMode, setViewMode] = useState<'ROOM' | 'DOCTOR'>('ROOM');
    const [colorMode, setColorMode] = useState<'DOCTOR' | 'ACTIVITY'>('ACTIVITY');
    const [density, setDensity] = useState<'COMPACT' | 'COMFORTABLE'>('COMFORTABLE');
    const [showSettings, setShowSettings] = useState(false);

    // Check if current week is validated/locked in Activities page
    const currentWeekKey = currentWeekStart.toISOString().split('T')[0];
    const isCurrentWeekValidated = validatedWeeks?.includes(currentWeekKey) || false;

    // Local Schedule Generation
    const schedule = useMemo(() => {
        const generated = generateScheduleForWeek(
            currentWeekStart,
            template,
            unavailabilities,
            doctors,
            activityDefinitions,
            rcpTypes,
            true,
            effectiveHistory,
            rcpAttendance,
            rcpExceptions
        );
        // Apply Overrides Locally
        return generated.map(slot => {
            const overrideValue = manualOverrides[slot.id];
            if (overrideValue) {
                if (overrideValue === '__CLOSED__') {
                    return { ...slot, assignedDoctorId: null, isLocked: true, isClosed: true };
                } else {
                    // Handle 'auto:' prefix - extract actual doctor ID
                    const isAuto = overrideValue.startsWith('auto:');
                    const doctorId = isAuto ? overrideValue.substring(5) : overrideValue;
                    return { ...slot, assignedDoctorId: doctorId, isLocked: true, isAutoAssigned: isAuto };
                }
            }
            // If week is NOT validated, clear activity assignments so they don't show in Planning Global
            if (!isCurrentWeekValidated && slot.type === SlotType.ACTIVITY) {
                return { ...slot, assignedDoctorId: null };
            }
            return slot;
        });
    }, [currentWeekStart, template, unavailabilities, doctors, activityDefinitions, rcpTypes, effectiveHistory, rcpAttendance, rcpExceptions, manualOverrides, isCurrentWeekValidated]);

    const conflicts = useMemo(() => {
        return detectConflicts(schedule, unavailabilities, doctors, activityDefinitions);
    }, [schedule, unavailabilities, doctors, activityDefinitions]);


    const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    const tableContainerRef = useRef<HTMLDivElement>(null);

    const days = Object.values(DayOfWeek);

    // Always show all Postes and Activities rows. NO RCPs.
    // Activity content will be empty if the week is not validated in Activities.
    const displayRows = [...postes, ...activityDefinitions.map(a => a.name)];

    const handleResolve = (slotId: string, newDoctorId: string) => {
        if (newDoctorId === "") {
            const newOverrides = { ...manualOverrides };
            delete newOverrides[slotId];
            setManualOverrides(newOverrides);
        } else {
            setManualOverrides({
                ...manualOverrides,
                [slotId]: newDoctorId
            });
        }
        setSelectedSlotId(null);
    };

    const handleCloseSlot = (slotId: string) => {
        setManualOverrides({
            ...manualOverrides,
            [slotId]: '__CLOSED__'
        });
        setSelectedSlotId(null);
    }

    const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedDate = new Date(e.target.value);
        const day = selectedDate.getDay();
        const diff = selectedDate.getDate() - day + (day === 0 ? -6 : 1);
        selectedDate.setDate(diff);
        selectedDate.setHours(0, 0, 0, 0);
        setCurrentWeekStart(selectedDate);
    }

    const handleWeekChange = (direction: 'prev' | 'next') => {
        const newDate = new Date(currentWeekStart);
        newDate.setDate(newDate.getDate() + (direction === 'next' ? 7 : -7));
        setCurrentWeekStart(newDate);
    };

    const handleDownloadPDF = async () => {
        try {
            setIsGeneratingPdf(true);

            // Helper: get slot background color based on type
            const getSlotBg = (slot: typeof schedule[0] | undefined): string => {
                if (!slot || slot.isClosed) return '#F1F5F9';
                if (slot.type === SlotType.CONSULTATION) return '#EEF4FF';
                if (slot.type === SlotType.RCP) return '#F5F0FF';
                if (slot.type === SlotType.ACTIVITY) {
                    const name = (slot.subType || '').toLowerCase();
                    if (name.includes('astreinte')) return '#FFF0EE';
                    if (name.includes('workflow')) return '#ECFDF5';
                    if (name.includes('unity')) return '#F3F0FF';
                    return '#FFFBEB';
                }
                return '#F8FAFC';
            };

            // Helper: get slot left-border color
            const getSlotBorder = (slot: typeof schedule[0] | undefined): string => {
                if (!slot || slot.isClosed) return '#CBD5E1';
                if (slot.type === SlotType.CONSULTATION) return '#3B6FD4';
                if (slot.type === SlotType.RCP) return '#7C3AED';
                if (slot.type === SlotType.ACTIVITY) {
                    const name = (slot.subType || '').toLowerCase();
                    if (name.includes('astreinte')) return '#DC4E3A';
                    if (name.includes('workflow')) return '#0F766E';
                    if (name.includes('unity')) return '#6D28D9';
                    return '#F59E0B';
                }
                return '#CBD5E1';
            };

            // Column headers: one per day with date
            const dayHeadersHtml = days.map(day => {
                const dateStr = getDateForDayOfWeek(currentWeekStart, day);
                const [yr, mo, dd] = dateStr.split('-');
                const holiday = isFrenchHoliday(dateStr);
                const bg = holiday ? '#FEF2F2' : '#1E293B';
                const color = holiday ? '#DC2626' : '#FFFFFF';
                return `<th colspan="2" style="padding:10px 6px;text-align:center;background:${bg};color:${color};font-size:12px;font-weight:800;border:1px solid #334155;min-width:180px;">
                    ${day}<br/><span style="font-size:10px;font-weight:500;opacity:0.75;">${dd}/${mo}/${yr}</span>
                </th>`;
            }).join('');

            // Sub-headers: AM / PM per day
            const subHeadersHtml = days.map(() =>
                `<th style="padding:5px 4px;text-align:center;background:#334155;color:#94A3B8;font-size:10px;font-weight:700;border:1px solid #475569;">Matin</th>
                 <th style="padding:5px 4px;text-align:center;background:#334155;color:#94A3B8;font-size:10px;font-weight:700;border:1px solid #475569;">Après-m.</th>`
            ).join('');

            // Build data rows: one row per location
            let rowsHtml = '';
            displayRows.forEach((loc, rowIdx) => {
                const rowBg = rowIdx % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
                let cellsHtml = '';

                days.forEach(day => {
                    [Period.MORNING, Period.AFTERNOON].forEach(period => {
                        const dateStr = getDateForDayOfWeek(currentWeekStart, day);
                        const holiday = isFrenchHoliday(dateStr);

                        if (holiday) {
                            cellsHtml += `<td style="padding:6px;background:#FEF2F2;border:1px solid #E2E8F0;text-align:center;font-size:10px;color:#DC2626;font-weight:600;">${holiday.name}</td>`;
                            return;
                        }

                        if (day === DayOfWeek.MONDAY && period === Period.MORNING && loc.startsWith('Box')) {
                            cellsHtml += `<td style="padding:6px;background:#F1F5F9;border:1px solid #E2E8F0;text-align:center;font-size:10px;color:#94A3B8;font-style:italic;">Fermé</td>`;
                            return;
                        }

                        const slot = schedule.find(s =>
                            s.date === dateStr &&
                            s.period === period &&
                            (s.location === loc || s.subType === loc)
                        );

                        if (!slot) {
                            cellsHtml += `<td style="padding:6px;background:${rowBg};border:1px solid #E2E8F0;text-align:center;font-size:10px;color:#CBD5E1;">—</td>`;
                            return;
                        }

                        if (slot.isClosed) {
                            cellsHtml += `<td style="padding:6px;background:#F1F5F9;border:1px solid #E2E8F0;text-align:center;font-size:10px;color:#94A3B8;font-weight:600;">Fermé</td>`;
                            return;
                        }

                        const doc = doctors.find(d => d.id === slot.assignedDoctorId);
                        const hasConflict = conflicts.some(c => c.slotId === slot.id);
                        const bg = hasConflict ? '#FEF2F2' : getSlotBg(slot);
                        const borderColor = hasConflict ? '#DC2626' : getSlotBorder(slot);
                        const docColor = doc ? (getDoctorHexColor(doc.color) || '#64748B') : '#64748B';

                        let content = '';
                        if (doc) {
                            content = `<div style="display:flex;align-items:center;gap:5px;">
                                <div style="width:18px;height:18px;border-radius:50%;background:${docColor};color:white;font-size:7px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${doc.name.substring(0, 2)}</div>
                                <span style="font-weight:700;font-size:11px;color:#0F172A;line-height:1.3;">${doc.name}</span>
                            </div>
                            ${slot.type === SlotType.ACTIVITY && slot.subType ? `<div style="font-size:9px;color:#64748B;margin-top:2px;padding-left:23px;">${slot.subType}</div>` : ''}
                            ${hasConflict ? '<div style="font-size:9px;color:#DC2626;font-weight:700;margin-top:2px;">⚠ Conflit</div>' : ''}`;
                        } else {
                            content = `<span style="font-size:10px;color:#94A3B8;font-style:italic;">Non assigné</span>`;
                        }

                        cellsHtml += `<td style="padding:6px 8px;background:${bg};border:1px solid #E2E8F0;border-left:3px solid ${borderColor};vertical-align:middle;">${content}</td>`;
                    });
                });

                rowsHtml += `<tr>
                    <td style="padding:8px;font-size:11px;font-weight:700;text-align:center;background:#F8FAFC;border:1px solid #E2E8F0;border-right:2px solid #CBD5E1;vertical-align:middle;min-width:80px;">${loc}</td>
                    ${cellsHtml}
                </tr>`;
            });

            // Legend
            const legendItems = [
                { bg: '#EEF4FF', border: '#3B6FD4', label: 'Consultation' },
                { bg: '#F5F0FF', border: '#7C3AED', label: 'RCP' },
                { bg: '#FFF0EE', border: '#DC4E3A', label: 'Astreinte' },
                { bg: '#ECFDF5', border: '#0F766E', label: 'Workflow' },
                { bg: '#FFFBEB', border: '#F59E0B', label: 'Activité' },
                { bg: '#FEF2F2', border: '#DC2626', label: 'Conflit' },
            ].map(({ bg, border, label }) =>
                `<span style="display:inline-flex;align-items:center;gap:5px;font-size:10px;color:#0F172A;margin-right:14px;">
                    <span style="display:inline-block;width:13px;height:13px;background:${bg};border-left:3px solid ${border};border-radius:2px;flex-shrink:0;"></span>${label}
                </span>`
            ).join('');

            const todayStr = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

            const fullHtml = `<div style="font-family:Arial,Helvetica,sans-serif;background:#ffffff;padding:32px;width:1500px;box-sizing:border-box;">
                <!-- Header -->
                <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:20px;padding-bottom:14px;border-bottom:3px solid #4F46E5;">
                    <div>
                        <div style="font-size:10px;font-weight:700;color:#7C3AED;text-transform:uppercase;letter-spacing:2px;margin-bottom:3px;">SERVICE DE RADIOTHÉRAPIE</div>
                        <div style="font-size:26px;font-weight:800;color:#0F172A;letter-spacing:-0.5px;">Planning Hebdomadaire</div>
                        <div style="font-size:14px;color:#64748B;margin-top:3px;">${formatWeekRange(currentWeekStart)}</div>
                    </div>
                    <div style="text-align:right;">
                        <div style="font-size:10px;color:#94A3B8;">Généré le ${todayStr}</div>
                        <div style="font-size:10px;color:#CBD5E1;margin-top:2px;">RadioPlan AI</div>
                    </div>
                </div>
                <!-- Table -->
                <table style="width:100%;border-collapse:collapse;border:1px solid #E2E8F0;">
                    <thead>
                        <tr>
                            <th rowspan="2" style="padding:10px 8px;text-align:center;background:#0F172A;color:white;font-size:11px;font-weight:800;border:1px solid #334155;min-width:80px;vertical-align:middle;">Poste</th>
                            ${dayHeadersHtml}
                        </tr>
                        <tr>${subHeadersHtml}</tr>
                    </thead>
                    <tbody>${rowsHtml}</tbody>
                </table>
                <!-- Legend -->
                <div style="margin-top:14px;padding:10px 14px;background:#F8FAFC;border-radius:6px;border:1px solid #E2E8F0;">
                    <span style="font-size:10px;font-weight:700;color:#64748B;margin-right:10px;">LÉGENDE :</span>
                    ${legendItems}
                </div>
                <!-- Footer -->
                <div style="margin-top:12px;display:flex;justify-content:space-between;font-size:9px;color:#94A3B8;border-top:1px solid #E2E8F0;padding-top:8px;">
                    <span>Document généré automatiquement — RadioPlan AI</span>
                    <span>${formatWeekRange(currentWeekStart)}</span>
                </div>
            </div>`;

            const printContainer = document.createElement('div');
            printContainer.style.cssText = 'position:absolute;left:-9999px;top:0;';
            printContainer.innerHTML = fullHtml;
            document.body.appendChild(printContainer);

            await new Promise(resolve => setTimeout(resolve, 300));

            const canvas = await html2canvas(printContainer.firstElementChild as HTMLElement, {
                scale: 2,
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff',
            });

            document.body.removeChild(printContainer);

            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF('l', 'mm', 'a4');
            const margin = 8;
            const pageWidth = 297 - 2 * margin;
            const pageHeight = 210 - 2 * margin;
            const ratio = pageWidth / canvas.width;
            const scaledH = canvas.height * ratio;

            if (scaledH <= pageHeight) {
                pdf.addImage(imgData, 'PNG', margin, margin, pageWidth, scaledH);
            } else {
                let heightLeft = scaledH;
                let page = 0;
                while (heightLeft > 0) {
                    if (page > 0) pdf.addPage();
                    pdf.addImage(imgData, 'PNG', margin, margin - page * pageHeight, pageWidth, scaledH);
                    heightLeft -= pageHeight;
                    page++;
                }
            }

            pdf.save(`Planning_${currentWeekStart.toISOString().split('T')[0]}.pdf`);

        } catch (err) {
            console.error('PDF Generation failed', err);
            alert('Erreur lors de la génération du PDF.');
        } finally {
            setIsGeneratingPdf(false);
        }
    };

    const formatWeekRange = (start: Date) => {
        const end = new Date(start);
        end.setDate(end.getDate() + 4);
        return `Semaine du ${start.getDate()} ${start.toLocaleString('default', { month: 'short' })} au ${end.getDate()} ${end.toLocaleString('default', { month: 'short' })} ${start.getFullYear()}`;
    };

    const renderCell = (day: DayOfWeek, period: Period, location: string) => {
        const slotDate = getDateForDayOfWeek(currentWeekStart, day);
        const holiday = isFrenchHoliday(slotDate);

        if (holiday) {
            return (
                <div className="h-full w-full bg-danger/5 flex items-center justify-center border-l-4 border-danger/20 flex-col opacity-80">
                    <span className="text-[10px] text-danger/60 font-bold uppercase tracking-wider">Férié</span>
                    <span className="text-[9px] text-danger/40">{holiday.name}</span>
                </div>
            );
        }

        if (day === DayOfWeek.MONDAY && period === Period.MORNING && location.startsWith('Box')) {
            return (
                <div className="h-full w-full bg-muted flex items-center justify-center border-l-4 border-border">
                    <span className="text-[10px] text-text-muted font-bold uppercase tracking-wider">Fermé</span>
                </div>
            );
        }

        const slot = schedule.find(s =>
            s.date === slotDate &&
            s.period === period &&
            (s.location === location || s.subType === location)
        );

        // For activity slots in non-validated weeks: show empty non-clickable cell
        if (slot && slot.type === SlotType.ACTIVITY && !isCurrentWeekValidated) {
            return (
                <div className="h-full w-full bg-muted/50 min-h-[60px] flex items-center justify-center cursor-default">
                    <span className="text-[10px] text-text-muted italic">—</span>
                </div>
            );
        }

        if (!slot) return <div className="h-full w-full bg-muted min-h-[60px] flex items-center justify-center text-[10px] text-text-muted border-l border-border">--</div>;

        if (slot.isClosed) {
            const canClick = canInteractWithSlot(slot);
            return (
                <div
                    className={`relative h-full w-full bg-muted border-l-4 border-border min-h-[60px] flex flex-col items-center justify-center opacity-80 ${canClick ? 'cursor-pointer hover:opacity-100' : 'cursor-default'}`}
                    style={{ backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 10px, var(--color-border) 10px, var(--color-border) 20px)' }}
                    onClick={() => {
                        if (canClick) {
                            setSelectedSlotId(slot.id);
                        } else if (!isAdmin) {
                            setAccessDeniedMessage("Vous ne pouvez modifier que vos propres créneaux de consultation.");
                            setTimeout(() => setAccessDeniedMessage(null), 3000);
                        }
                    }}
                >
                    <div className="bg-white/80 p-1 rounded shadow-sm flex items-center">
                        <Ban className="w-4 h-4 text-text-muted mr-1" />
                        <span className="text-[10px] font-bold text-text-muted uppercase">Fermé</span>
                    </div>
                </div>
            )
        }

        const doc = doctors.find(d => d.id === slot.assignedDoctorId);
        const secondaryDocs = slot.secondaryDoctorIds?.map(id => doctors.find(d => d.id === id)).filter(Boolean);
        const conflict = conflicts.find(c => c.slotId === slot.id);

        // Access control check
        const canClick = canInteractWithSlot(slot);

        let baseClasses = `relative h-full w-full p-2 border-l-4 flex flex-col justify-center transition-all ${canClick ? 'cursor-pointer hover:brightness-95' : 'cursor-default'}`;
        let bgClass = "";
        let borderClass = "";
        let slotInlineStyle: React.CSSProperties = {};

        if (doc) {
            bgClass = "bg-surface";
            if (doc.color.includes('blue')) borderClass = "border-blue-500";
            else if (doc.color.includes('green')) borderClass = "border-green-500";
            else if (doc.color.includes('red')) borderClass = "border-red-500";
            else if (doc.color.includes('yellow')) borderClass = "border-yellow-500";
            else if (doc.color.includes('purple')) borderClass = "border-purple-500";
            else if (doc.color.includes('indigo')) borderClass = "border-indigo-500";
            else if (doc.color.includes('pink')) borderClass = "border-pink-500";
            else if (doc.color.includes('orange')) borderClass = "border-orange-500";
            else borderClass = "border-border";
        } else {
            bgClass = "bg-muted";
            borderClass = "border-border";
        }

        if (colorMode === 'ACTIVITY') {
            if (slot.type === SlotType.ACTIVITY) {
                const def = activityDefinitions.find(a => a.id === slot.activityId);
                if (def) {
                    const name = (slot.subType || def.name || '').toLowerCase();
                    let actHex: string;
                    if (name.includes('astreinte')) actHex = '#DC4E3A';
                    else if (name.includes('workflow')) actHex = '#0F766E';
                    else if (name.includes('unity')) actHex = '#6D28D9';
                    else actHex = getDoctorHexColor(def.color) || '#F59E0B';
                    bgClass = '';
                    borderClass = '';
                    slotInlineStyle = {
                        backgroundColor: actHex + '26', // ~15% opacity
                        borderLeftColor: actHex,
                    };
                }
            } else if (slot.type === SlotType.RCP) {
                bgClass = '';
                borderClass = '';
                slotInlineStyle = {
                    backgroundColor: 'rgba(124,58,237,0.10)',
                    borderLeftColor: '#7C3AED',
                };
            } else if (slot.type === SlotType.CONSULTATION) {
                bgClass = '';
                borderClass = '';
                slotInlineStyle = {
                    backgroundColor: 'rgba(59,111,212,0.08)',
                    borderLeftColor: '#3B6FD4',
                };
            }
        }

        if (conflict) {
            bgClass = "bg-danger/10";
            borderClass = "border-danger";
            slotInlineStyle = {};
        }

        // Handle click based on access control
        const handleSlotClick = () => {
            if (canClick) {
                setSelectedSlotId(slot.id);
            } else if (!isAdmin) {
                setAccessDeniedMessage("Vous ne pouvez modifier que vos propres créneaux de consultation.");
                setTimeout(() => setAccessDeniedMessage(null), 3000);
            }
        };

        return (
            <div
                className={`${baseClasses} ${bgClass} ${borderClass}`}
                style={slotInlineStyle}
                onClick={handleSlotClick}
            >
                {conflict && (
                    <div className="absolute top-1 right-1 text-danger animate-pulse">
                        <AlertCircle className="w-4 h-4" />
                    </div>
                )}

                {/* Show lock icon for non-editable slots (for doctors) */}
                {!canClick && !isAdmin && (
                    <div className="absolute top-1 left-1 text-text-muted">
                        <Lock className="w-3 h-3" />
                    </div>
                )}

                {doc ? (
                    <>
                        <div className="flex items-center space-x-2">
                            <div
                                className="w-4 h-4 md:w-5 md:h-5 rounded-full flex-shrink-0 flex items-center justify-center text-[7px] md:text-[8px] font-bold text-white shadow-sm border border-black/5"
                                style={{ backgroundColor: getDoctorHexColor(doc.color) }}
                            >
                                {doc.name.substring(0, 2)}
                            </div>
                            <div className="font-bold text-[10px] md:text-sm text-text-base leading-tight break-words">{doc.name}</div>
                        </div>

                        {secondaryDocs && secondaryDocs.length > 0 && (
                            <div className="text-xs text-text-muted mt-1 pl-7">
                                + {secondaryDocs.map(d => d?.name).join(', ')}
                            </div>
                        )}
                        {slot.type === SlotType.ACTIVITY && colorMode === 'DOCTOR' && (
                            <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-warning/10 text-warning-text ml-7">
                                {slot.subType}
                            </span>
                        )}
                        {colorMode === 'ACTIVITY' && slot.type === SlotType.ACTIVITY && (
                            <div className="text-[10px] font-bold opacity-60 ml-7 uppercase tracking-wider mt-0.5">{slot.subType}</div>
                        )}
                    </>
                ) : (
                    <div className="text-center">
                        <span className="text-xs text-text-muted italic">Non assigné</span>
                        {conflict && <div className="text-[10px] text-danger font-bold mt-1">Absent</div>}
                    </div>
                )}
            </div>
        );
    };

    const renderDoctorCell = (doctor: any, day: DayOfWeek, period: Period) => {
        const date = getDateForDayOfWeek(currentWeekStart, day);
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

    const selectedSlot = schedule.find(s => s.id === selectedSlotId);
    const selectedConflict = conflicts.find(c => c.slotId === selectedSlotId);
    const rowHeightClass = density === 'COMPACT' ? 'h-20' : 'h-28';

    return (
        <div className="h-full flex flex-col gap-4">
            {/* Access Denied Toast */}
            {accessDeniedMessage && (
                <div className="fixed top-4 right-4 z-[60] animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="bg-warning/10 border border-warning/30 text-warning-text px-4 py-3 rounded-lg shadow-lg flex items-center">
                        <ShieldAlert className="w-5 h-5 mr-2 text-warning-text" />
                        <span className="font-medium text-sm">{accessDeniedMessage}</span>
                    </div>
                </div>
            )}

            {/* Page header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                    <h1 className="font-heading font-extrabold text-2xl text-text-base">Planning Global</h1>
                    <p className="text-xs text-text-muted mt-0.5 hidden sm:block">Généré automatiquement selon les règles de configuration</p>
                </div>

                <div className="flex flex-wrap gap-2 items-center">
                    {/* Settings dropdown */}
                    <div className="relative">
                        <button
                            onClick={() => setShowSettings(!showSettings)}
                            className={`p-2 rounded-btn border flex items-center text-sm font-medium transition-colors ${showSettings ? 'bg-primary/10 border-primary/30 text-primary-text' : 'bg-surface border-border text-text-muted hover:bg-muted'}`}
                        >
                            <Settings className="w-4 h-4 mr-2" />
                            Affichage
                        </button>

                        {showSettings && (
                            <div className="absolute top-full mt-2 right-0 w-64 bg-surface rounded-card shadow-modal border border-border p-4 z-[50] animate-in fade-in zoom-in-95 duration-150">
                                <div className="mb-4">
                                    <h4 className="text-xs font-bold text-text-muted uppercase mb-2 flex items-center">
                                        <LayoutGrid className="w-3 h-3 mr-1" /> Mode de Vue
                                    </h4>
                                    <div className="flex bg-muted p-1 rounded-btn">
                                        <button
                                            onClick={() => setViewMode('ROOM')}
                                            className={`flex-1 py-1.5 text-xs font-bold rounded ${viewMode === 'ROOM' ? 'bg-surface shadow text-primary' : 'text-text-muted'}`}
                                        >
                                            Par Poste
                                        </button>
                                        <button
                                            onClick={() => setViewMode('DOCTOR')}
                                            className={`flex-1 py-1.5 text-xs font-bold rounded ${viewMode === 'DOCTOR' ? 'bg-surface shadow text-primary' : 'text-text-muted'}`}
                                        >
                                            Par Médecin
                                        </button>
                                    </div>
                                </div>

                                <div className="mb-4">
                                    <h4 className="text-xs font-bold text-text-muted uppercase mb-2 flex items-center">
                                        <Palette className="w-3 h-3 mr-1" /> Couleurs
                                    </h4>
                                    <div className="space-y-2">
                                        <button
                                            onClick={() => setColorMode('DOCTOR')}
                                            className={`w-full flex items-center p-2 rounded text-xs font-bold border ${colorMode === 'DOCTOR' ? 'bg-primary/10 border-primary/20 text-primary-text' : 'bg-surface border-border text-text-muted hover:bg-muted'}`}
                                        >
                                            <div className="w-3 h-3 rounded-full bg-primary mr-2"></div>
                                            Par Médecin
                                        </button>
                                        <button
                                            onClick={() => setColorMode('ACTIVITY')}
                                            className={`w-full flex items-center p-2 rounded text-xs font-bold border ${colorMode === 'ACTIVITY' ? 'bg-primary/10 border-primary/20 text-primary-text' : 'bg-surface border-border text-text-muted hover:bg-muted'}`}
                                        >
                                            <div className="w-3 h-3 rounded-full bg-warning mr-2"></div>
                                            Par Activité
                                        </button>
                                    </div>
                                </div>

                                <div>
                                    <h4 className="text-xs font-bold text-text-muted uppercase mb-2 flex items-center">
                                        <Eye className="w-3 h-3 mr-1" /> Densité
                                    </h4>
                                    <div className="flex bg-muted p-1 rounded-btn">
                                        <button
                                            onClick={() => setDensity('COMPACT')}
                                            className={`flex-1 py-1.5 text-xs font-bold rounded ${density === 'COMPACT' ? 'bg-surface shadow text-text-base' : 'text-text-muted'}`}
                                        >
                                            Compact
                                        </button>
                                        <button
                                            onClick={() => setDensity('COMFORTABLE')}
                                            className={`flex-1 py-1.5 text-xs font-bold rounded ${density === 'COMFORTABLE' ? 'bg-surface shadow text-text-base' : 'text-text-muted'}`}
                                        >
                                            Aéré
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Week navigation */}
                    <div className="flex items-center space-x-1 bg-surface p-1 rounded-btn shadow-card border border-border">
                        <Button variant="ghost" size="sm" onClick={() => handleWeekChange('prev')} className="p-1.5">
                            <ChevronLeft className="w-4 h-4" />
                        </Button>

                        <input
                            type="date"
                            className="border-none text-text-base font-medium text-xs focus:ring-0 bg-transparent w-28"
                            value={currentWeekStart.toISOString().split('T')[0]}
                            onChange={handleDateChange}
                        />

                        <Button variant="ghost" size="sm" onClick={() => handleWeekChange('next')} className="p-1.5">
                            <ChevronRight className="w-4 h-4" />
                        </Button>
                    </div>

                    {/* Validated week badge */}
                    {isCurrentWeekValidated && (
                        <Badge variant="green">Semaine validée</Badge>
                    )}

                    {/* PDF download */}
                    <Button
                        variant="primary"
                        size="sm"
                        onClick={handleDownloadPDF}
                        disabled={isGeneratingPdf}
                        className="flex items-center gap-1.5"
                    >
                        {isGeneratingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
                        <span>{isGeneratingPdf ? 'Génération...' : 'PDF'}</span>
                    </Button>
                </div>
            </div>

            {/* Planning grid card */}
            <Card className="flex-1 min-h-0 flex flex-col">
                {/* Dual-axis scroll container */}
                <div
                    ref={tableContainerRef}
                    className="flex-1 overflow-x-auto overflow-y-auto overscroll-contain"
                    style={{ touchAction: 'pan-x pan-y' }}
                >
                    <table className="w-full border-collapse" style={{ minWidth: '600px' }}>
                        <thead>
                            <tr className="sticky top-0 z-table-header bg-surface border-b-2 border-border">
                                {/* Sticky top-left corner cell */}
                                <th className="sticky left-0 z-[12] bg-surface px-3 py-3 border-r border-border border-b-2 border-border min-w-[80px] max-w-[100px] text-left text-[9px] md:text-xs font-bold text-text-muted uppercase">
                                    <span className="hidden md:inline">{viewMode === 'ROOM' ? 'Lieu / Créneau' : 'Médecin'}</span>
                                    <span className="md:hidden">{viewMode === 'ROOM' ? 'Lieu' : 'Dr'}</span>
                                </th>
                                {days.map(day => {
                                    const date = getDateForDayOfWeek(currentWeekStart, day);
                                    const holiday = isFrenchHoliday(date);
                                    const [dYear, dMonth, dDay] = date.split('-');
                                    const displayDate = `${dDay}/${dMonth}`;
                                    const todayStr = new Date().toISOString().split('T')[0];
                                    const isToday = date === todayStr;

                                    return (
                                        <th key={day} className={isToday
                                            ? "text-[11px] font-bold text-white uppercase tracking-wider px-3 py-3 min-w-[80px] text-center bg-gradient-primary border-r border-primary/20"
                                            : "text-[11px] font-semibold text-text-muted uppercase tracking-wider px-3 py-3 min-w-[80px] text-center border-r border-border"
                                        }>
                                            {day.substring(0, 3)}
                                            <div className="text-[9px] font-normal mt-0.5 flex justify-center items-center opacity-80">
                                                {displayDate}
                                            </div>
                                        </th>
                                    );
                                })}
                            </tr>
                        </thead>
                        <tbody>
                            {viewMode === 'ROOM' ? (
                                // ROOM VIEW
                                displayRows.map((loc, index) => (
                                    <React.Fragment key={loc}>
                                        <tr className="border-b border-border/50 hover:bg-primary/[0.02] transition-colors">
                                            <td rowSpan={2} className={`sticky left-0 z-sticky p-1 md:p-3 border-r border-b border-border text-[9px] md:text-xs text-center font-bold shadow-card
                                                ${postes.includes(loc) ? 'bg-surface text-text-base' : 'bg-warning/10 text-warning-text'}
                                            `}>
                                                <span className="text-[8px] md:text-[10px] leading-tight break-words">{loc}</span>
                                            </td>
                                            {days.map(day => (
                                                <td key={`${day}-matin`} className={`border-r border-b border-border relative ${rowHeightClass} align-top p-0 overflow-hidden`}>
                                                    <div className="absolute top-0 left-0 right-0 bg-warning/10 text-[9px] px-1 text-warning-text uppercase font-bold tracking-wider z-0 border-b border-warning/20">Matin</div>
                                                    <div className="pt-4 h-full">
                                                        {renderCell(day, Period.MORNING, loc)}
                                                    </div>
                                                </td>
                                            ))}
                                        </tr>
                                        <tr className="border-b border-border/50 hover:bg-primary/[0.02] transition-colors">
                                            {days.map(day => (
                                                <td key={`${day}-apres-midi`} className={`border-r border-b-2 border-border relative ${rowHeightClass} align-top p-0 overflow-hidden`}>
                                                    <div className="absolute top-0 left-0 right-0 bg-primary/10 text-[9px] px-1 text-primary-text uppercase font-bold tracking-wider z-0 border-b border-primary/20">A.Midi</div>
                                                    <div className="pt-4 h-full">
                                                        {renderCell(day, Period.AFTERNOON, loc)}
                                                    </div>
                                                </td>
                                            ))}
                                        </tr>
                                    </React.Fragment>
                                ))
                            ) : (
                                // DOCTOR VIEW
                                doctors.map(doc => (
                                    <React.Fragment key={doc.id}>
                                        <tr className="border-b border-border/50 hover:bg-primary/[0.02] transition-colors">
                                            <td rowSpan={2} className="sticky left-0 z-sticky px-3 py-3 border-r border-b border-border bg-surface text-center shadow-card font-semibold text-text-base text-sm min-w-[80px]">
                                                <div
                                                    className="w-6 h-6 md:w-8 md:h-8 rounded-full mx-auto flex items-center justify-center text-[8px] md:text-xs font-bold text-white"
                                                    style={{ backgroundColor: getDoctorHexColor(doc.color) }}
                                                >
                                                    {doc.name.substring(0, 2)}
                                                </div>
                                                <div className="text-[8px] md:text-[10px] font-bold text-text-base mt-0.5 md:mt-1 leading-tight break-words text-center">{doc.name}</div>
                                            </td>
                                            {days.map(day => (
                                                <td key={`${day}-matin`} className="border-r border-b border-border relative h-11 align-top p-0 overflow-hidden">
                                                    <div className="h-full">
                                                        {renderDoctorCell(doc, day, Period.MORNING)}
                                                    </div>
                                                </td>
                                            ))}
                                        </tr>
                                        <tr className="border-b border-border/50 hover:bg-primary/[0.02] transition-colors">
                                            {days.map(day => (
                                                <td key={`${day}-apres-midi`} className="border-r border-b-2 border-border relative h-11 align-top p-0 overflow-hidden">
                                                    <div className="h-full bg-muted/30">
                                                        {renderDoctorCell(doc, day, Period.AFTERNOON)}
                                                    </div>
                                                </td>
                                            ))}
                                        </tr>
                                    </React.Fragment>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>

            {selectedSlot && (
                <SlotDetailsModal
                    slot={selectedSlot}
                    conflict={selectedConflict}
                    doctors={doctors}
                    slots={schedule}
                    unavailabilities={unavailabilities}
                    onClose={() => setSelectedSlotId(null)}
                    onResolve={handleResolve}
                    onCloseSlot={handleCloseSlot}
                />
            )}
        </div>
    );
};

export default Planning;
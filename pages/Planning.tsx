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
        if (!tableContainerRef.current) return;
        try {
            setIsGeneratingPdf(true);
            const originalTable = tableContainerRef.current.querySelector('table');
            if (!originalTable) return;

            const printContainer = document.createElement('div');
            printContainer.style.position = 'absolute';
            printContainer.style.left = '-9999px';
            printContainer.style.top = '0';
            printContainer.style.width = '2200px';
            printContainer.style.backgroundColor = '#ffffff';
            printContainer.style.padding = '40px';
            printContainer.style.boxSizing = 'border-box';

            const header = document.createElement('div');
            header.innerHTML = `
             <div style="margin-bottom: 20px; border-bottom: 3px solid #1e293b; padding-bottom: 10px; display: flex; justify-content: space-between; align-items: flex-end;">
                <div>
                    <h1 style="font-size: 32px; font-weight: bold; color: #1e293b; margin: 0; text-transform: uppercase; letter-spacing: 1px;">Planning Radiothérapie</h1>
                    <p style="font-size: 16px; color: #64748b; margin: 5px 0 0 0;">${formatWeekRange(currentWeekStart)}</p>
                </div>
                <div style="text-align: right;">
                    <span style="font-size: 12px; color: #94a3b8;">Généré le ${new Date().toLocaleDateString('fr-FR')}</span>
                </div>
            </div>
          `;
            printContainer.appendChild(header);

            const clone = originalTable.cloneNode(true) as HTMLElement;
            const stickyElements = clone.querySelectorAll('.sticky');
            stickyElements.forEach(el => {
                (el as HTMLElement).style.position = 'static';
                (el as HTMLElement).style.left = 'auto';
                (el as HTMLElement).style.top = 'auto';
                (el as HTMLElement).style.boxShadow = 'none';
            });

            const truncatedElements = clone.querySelectorAll('.truncate');
            truncatedElements.forEach(el => {
                el.classList.remove('truncate');
                (el as HTMLElement).style.whiteSpace = 'normal';
                (el as HTMLElement).style.overflow = 'visible';
                (el as HTMLElement).style.wordBreak = 'break-word';
            });

            const nameElements = clone.querySelectorAll('.font-bold');
            nameElements.forEach(el => {
                const currentFontSize = window.getComputedStyle(el).fontSize;
                if (parseFloat(currentFontSize) < 18) {
                    (el as HTMLElement).style.fontSize = '16px';
                    (el as HTMLElement).style.lineHeight = '1.3';
                }
            });

            const avatars = clone.querySelectorAll('.w-5.h-5, .w-8.h-8');
            avatars.forEach(el => {
                (el as HTMLElement).style.width = '24px';
                (el as HTMLElement).style.height = '24px';
                (el as HTMLElement).style.minWidth = '24px';
                (el as HTMLElement).style.fontSize = '12px';
                (el as HTMLElement).style.marginRight = '8px';
            });

            const cells = clone.querySelectorAll('td, th');
            cells.forEach(el => {
                (el as HTMLElement).style.padding = '10px';
                (el as HTMLElement).style.height = 'auto';
            });

            const headers = clone.querySelectorAll('th');
            headers.forEach(el => {
                (el as HTMLElement).style.fontSize = '14px';
            });

            clone.style.width = '100%';
            clone.style.borderCollapse = 'collapse';
            clone.style.backgroundColor = 'white';

            printContainer.appendChild(clone);
            document.body.appendChild(printContainer);

            await new Promise(resolve => setTimeout(resolve, 500));

            const canvas = await html2canvas(printContainer, {
                scale: 2,
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff',
                width: 2200,
                height: printContainer.offsetHeight
            });

            document.body.removeChild(printContainer);

            const imgData = canvas.toDataURL('image/jpeg', 0.9);
            const pdf = new jsPDF('l', 'mm', 'a4');

            const pageWidth = 297;
            const pageHeight = 210;
            const margin = 10;
            const contentWidth = pageWidth - (2 * margin);
            const contentHeight = pageHeight - (2 * margin);

            const imgWidth = canvas.width;
            const imgHeight = canvas.height;

            const ratio = contentWidth / imgWidth;
            const scaledHeight = imgHeight * ratio;

            if (scaledHeight <= contentHeight) {
                pdf.addImage(imgData, 'JPEG', margin, margin, contentWidth, scaledHeight);
            } else {
                let heightLeft = scaledHeight;
                let page = 0;

                while (heightLeft > 0) {
                    if (page > 0) pdf.addPage();
                    const y = margin - (page * contentHeight);
                    pdf.addImage(imgData, 'JPEG', margin, y, contentWidth, scaledHeight);

                    heightLeft -= contentHeight;
                    page++;
                }
            }

            const filename = `Planning_${currentWeekStart.toISOString().split('T')[0]}.pdf`;
            pdf.save(filename);

        } catch (err) {
            console.error("PDF Generation failed", err);
            alert("Erreur lors de la génération du PDF.");
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
                <div className="h-full w-full bg-pink-50 flex items-center justify-center border-l-4 border-pink-200 flex-col opacity-80">
                    <span className="text-[10px] text-pink-400 font-bold uppercase tracking-wider">Férié</span>
                    <span className="text-[9px] text-pink-300">{holiday.name}</span>
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
                    className={`relative h-full w-full bg-gray-100 border-l-4 border-gray-300 min-h-[60px] flex flex-col items-center justify-center opacity-80 ${canClick ? 'cursor-pointer hover:opacity-100' : 'cursor-default'}`}
                    style={{ backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 10px, #e5e7eb 10px, #e5e7eb 20px)' }}
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
                        <Ban className="w-4 h-4 text-gray-500 mr-1" />
                        <span className="text-[10px] font-bold text-gray-600 uppercase">Fermé</span>
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
                    const colorParts = def.color.split(' ');
                    bgClass = colorParts.find(c => c.startsWith('bg-')) || 'bg-gray-100';
                    borderClass = "border-transparent";
                }
            } else if (slot.type === SlotType.RCP) {
                bgClass = "bg-purple-100";
                borderClass = "border-purple-500";
            }
        }

        if (conflict) {
            bgClass = "bg-red-50";
            borderClass = "border-red-500";
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
                onClick={handleSlotClick}
            >
                {conflict && (
                    <div className="absolute top-1 right-1 text-red-500 animate-pulse">
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
                            <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-100 text-orange-800 ml-7">
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
                        {conflict && <div className="text-[10px] text-red-500 font-bold mt-1">Absent</div>}
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
            return <div className="bg-pink-50 h-full text-[10px] text-pink-300 flex items-center justify-center">Férié</div>;
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
        <div className="flex flex-col gap-4">
            {/* Access Denied Toast */}
            {accessDeniedMessage && (
                <div className="fixed top-4 right-4 z-[60] animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="bg-orange-50 border border-orange-200 text-orange-800 px-4 py-3 rounded-lg shadow-lg flex items-center">
                        <ShieldAlert className="w-5 h-5 mr-2 text-orange-600" />
                        <span className="font-medium text-sm">{accessDeniedMessage}</span>
                    </div>
                </div>
            )}

            {/* Page header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                    <h1 className="font-heading font-bold text-xl text-text-base">Planning Global</h1>
                    <p className="text-xs text-text-muted mt-0.5 hidden sm:block">Généré automatiquement selon les règles de configuration</p>
                </div>

                <div className="flex flex-wrap gap-2 items-center">
                    {/* Settings dropdown */}
                    <div className="relative">
                        <button
                            onClick={() => setShowSettings(!showSettings)}
                            className={`p-2 rounded-btn border flex items-center text-sm font-medium transition-colors ${showSettings ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-surface border-border text-text-muted hover:bg-muted'}`}
                        >
                            <Settings className="w-4 h-4 mr-2" />
                            Affichage
                        </button>

                        {showSettings && (
                            <div className="absolute top-full mt-2 right-0 w-64 bg-surface rounded-xl shadow-modal border border-border p-4 z-[50] animate-in fade-in zoom-in-95 duration-150">
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
                                            className={`w-full flex items-center p-2 rounded text-xs font-bold border ${colorMode === 'DOCTOR' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-surface border-border text-text-muted hover:bg-muted'}`}
                                        >
                                            <div className="w-3 h-3 rounded-full bg-blue-400 mr-2"></div>
                                            Par Médecin
                                        </button>
                                        <button
                                            onClick={() => setColorMode('ACTIVITY')}
                                            className={`w-full flex items-center p-2 rounded text-xs font-bold border ${colorMode === 'ACTIVITY' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-surface border-border text-text-muted hover:bg-muted'}`}
                                        >
                                            <div className="w-3 h-3 rounded-full bg-orange-400 mr-2"></div>
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
                        <span className="hidden md:inline">{isGeneratingPdf ? 'Génération...' : 'PDF'}</span>
                    </Button>
                </div>
            </div>

            {/* Planning grid card */}
            <Card>
                {/* Dual-axis scroll container */}
                <div
                    ref={tableContainerRef}
                    className="overflow-x-auto overflow-y-auto overscroll-contain"
                    style={{
                        touchAction: 'pan-x pan-y',
                        maxHeight: 'calc(100dvh - var(--header-height, 56px) - var(--bottom-nav-height, 64px) - 140px)'
                    }}
                >
                    <table className="w-full border-collapse" style={{ minWidth: '600px' }}>
                        <thead>
                            <tr className="sticky top-0 z-[11] bg-app-bg">
                                {/* Sticky top-left corner cell */}
                                <th className="sticky left-0 z-[12] bg-app-bg p-1 md:p-3 border-b border-r border-border min-w-[80px] max-w-[100px] text-left text-[9px] md:text-xs font-bold text-text-muted uppercase">
                                    <span className="hidden md:inline">{viewMode === 'ROOM' ? 'Lieu / Créneau' : 'Médecin'}</span>
                                    <span className="md:hidden">{viewMode === 'ROOM' ? 'Lieu' : 'Dr'}</span>
                                </th>
                                {days.map(day => {
                                    const date = getDateForDayOfWeek(currentWeekStart, day);
                                    const holiday = isFrenchHoliday(date);
                                    const [dYear, dMonth, dDay] = date.split('-');
                                    const displayDate = `${dDay}/${dMonth}`;

                                    return (
                                        <th key={day} className={`p-1 md:p-3 border-b border-r border-border text-text-base font-bold uppercase text-[10px] md:text-sm min-w-[72px] ${holiday ? 'bg-pink-50' : 'bg-muted'}`}>
                                            {day.substring(0, 3)}
                                            <div className="text-[8px] md:text-[10px] text-text-muted font-normal mt-0.5 md:mt-1 flex justify-center items-center">
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
                                        <tr>
                                            <td rowSpan={2} className={`sticky left-0 z-sticky p-1 md:p-3 border-r border-b border-border text-[9px] md:text-xs text-center font-bold shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]
                                                ${postes.includes(loc) ? 'bg-muted text-text-base' : 'bg-orange-50 text-orange-800'}
                                            `}>
                                                <span className="text-[8px] md:text-[10px] leading-tight break-words">{loc}</span>
                                            </td>
                                            {days.map(day => (
                                                <td key={`${day}-matin`} className={`border-r border-b border-border relative ${rowHeightClass} align-top p-0`}>
                                                    <div className="absolute top-0 left-0 right-0 bg-yellow-50/80 text-[9px] px-1 text-yellow-700 uppercase font-bold tracking-wider z-0 border-b border-yellow-100">Matin</div>
                                                    <div className="pt-4 h-full">
                                                        {renderCell(day, Period.MORNING, loc)}
                                                    </div>
                                                </td>
                                            ))}
                                        </tr>
                                        <tr>
                                            {days.map(day => (
                                                <td key={`${day}-apres-midi`} className={`border-r border-b-2 border-border relative ${rowHeightClass} align-top p-0`}>
                                                    <div className="absolute top-0 left-0 right-0 bg-indigo-50/80 text-[9px] px-1 text-indigo-700 uppercase font-bold tracking-wider z-0 border-b border-indigo-100">A.Midi</div>
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
                                        <tr>
                                            <td rowSpan={2} className="sticky left-0 z-sticky p-1 md:p-3 border-r border-b border-border bg-muted text-center shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                                                <div
                                                    className="w-6 h-6 md:w-8 md:h-8 rounded-full mx-auto flex items-center justify-center text-[8px] md:text-xs font-bold text-white"
                                                    style={{ backgroundColor: getDoctorHexColor(doc.color) }}
                                                >
                                                    {doc.name.substring(0, 2)}
                                                </div>
                                                <div className="text-[8px] md:text-[10px] font-bold text-text-base mt-0.5 md:mt-1 leading-tight break-words text-center">{doc.name}</div>
                                            </td>
                                            {days.map(day => (
                                                <td key={`${day}-matin`} className="border-r border-b border-border relative h-11 align-top p-0">
                                                    <div className="h-full">
                                                        {renderDoctorCell(doc, day, Period.MORNING)}
                                                    </div>
                                                </td>
                                            ))}
                                        </tr>
                                        <tr>
                                            {days.map(day => (
                                                <td key={`${day}-apres-midi`} className="border-r border-b-2 border-border relative h-11 align-top p-0">
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
import React, { useContext, useState, useRef, useMemo, useEffect } from 'react';
import { AppContext } from '../App';
import { DayOfWeek, Period, SlotType } from '../types';
import SlotDetailsModal from '../components/SlotDetailsModal';
import { AlertCircle, ChevronLeft, ChevronRight, Calendar, UserCheck, Users, LayoutGrid, Printer, Loader2, ImageIcon, Lock, Ban, Settings, Palette, Eye, ShieldAlert } from 'lucide-react';
import { getDateForDayOfWeek, isFrenchHoliday, generateScheduleForWeek, detectConflicts } from '../services/scheduleService';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { getDoctorHexColor } from '../components/DoctorBadge';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../services/supabaseClient';
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
    const { user, profile, isAdmin, isDoctor } = useAuth();
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
    useEffect(() => {
      if (!user?.id) return;
      const loadDensity = async () => {
        try {
          const { data } = await supabase
            .from('profiles')
            .select('ui_prefs')
            .eq('id', user.id)
            .single();
          if (data?.ui_prefs?.planning_density) {
            setDensity(data.ui_prefs.planning_density as 'COMPACT' | 'COMFORTABLE');
          }
        } catch (err) {
          console.error(err);
        }
      };
      loadDensity();
    }, [user?.id]);
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

    const handleDownloadPDF = () => {
        try {
            setIsGeneratingPdf(true);

            // ── jsPDF native — A4 landscape (841.89 × 595.28 pt) ─────────────
            // Layout mirrors Planning Global exactly:
            //   rows  = location × period (2 rows per location: Matin then Après-midi)
            //   cols  = Lieu (rowspan 2) | Créneau | Lun | Mar | Mer | Jeu | Ven
            const pdf = new jsPDF('l', 'pt', 'a4');
            const PW = 841.89, PH = 595.28, M = 20;

            // ── helpers ───────────────────────────────────────────────────────
            const hexRgb = (hex: string) => ({
                r: parseInt(hex.slice(1, 3), 16),
                g: parseInt(hex.slice(3, 5), 16),
                b: parseInt(hex.slice(5, 7), 16),
            });
            const fill   = (h: string) => { const { r, g, b } = hexRgb(h); pdf.setFillColor(r, g, b); };
            const stroke = (h: string) => { const { r, g, b } = hexRgb(h); pdf.setDrawColor(r, g, b); };
            const tc     = (h: string) => { const { r, g, b } = hexRgb(h); pdf.setTextColor(r, g, b); };

            const slotBg = (s?: typeof schedule[0]) => {
                if (!s || s.isClosed) return '#F1F5F9';
                if (s.type === SlotType.CONSULTATION) return '#EEF4FF';
                if (s.type === SlotType.RCP)          return '#F5F0FF';
                const n = (s.subType || '').toLowerCase();
                if (n.includes('astreinte')) return '#FFF0EE';
                if (n.includes('workflow'))  return '#ECFDF5';
                if (n.includes('unity'))     return '#F3F0FF';
                return '#FFFBEB';
            };
            const slotAccent = (s?: typeof schedule[0]) => {
                if (!s || s.isClosed) return '#CBD5E1';
                if (s.type === SlotType.CONSULTATION) return '#3B6FD4';
                if (s.type === SlotType.RCP)          return '#7C3AED';
                const n = (s.subType || '').toLowerCase();
                if (n.includes('astreinte')) return '#DC4E3A';
                if (n.includes('workflow'))  return '#0F766E';
                if (n.includes('unity'))     return '#6D28D9';
                return '#F59E0B';
            };

            // ── layout ────────────────────────────────────────────────────────
            const TITLE_H = 36;   // title block height
            const HDR_H   = 20;   // day-column header height
            const LOC_W   = 52;   // "Lieu" column width (spans 2 rows)
            const PER_W   = 32;   // "Créneau" column width (Matin / Après-m.)
            const CELL_W  = (PW - 2*M - LOC_W - PER_W) / days.length; // one col per day
            const N_ROWS  = displayRows.length * 2;                    // 2 periods per loc
            const DATA_H  = PH - 2*M - TITLE_H - HDR_H;
            const ROW_H   = DATA_H / N_ROWS;
            const TABLE_X = M + LOC_W + PER_W;     // x where day columns start
            const TABLE_Y = M + TITLE_H + HDR_H;   // y where data rows start

            // ── 1. Title block ────────────────────────────────────────────────
            fill('#4F46E5');
            pdf.rect(M, M, PW - 2*M, 3, 'F');

            pdf.setFont('helvetica', 'bold'); pdf.setFontSize(15); tc('#0F172A');
            pdf.text('PLANNING RADIOTHÉRAPIE', M, M + 18);

            pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); tc('#64748B');
            pdf.text(formatWeekRange(currentWeekStart), M, M + 30);

            pdf.setFontSize(8); tc('#94A3B8');
            pdf.text(
                `Généré le ${new Date().toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit', year:'numeric' })}`,
                PW - M, M + 18, { align: 'right' }
            );

            // ── 2. Column headers ─────────────────────────────────────────────
            // "Lieu / Créneau" cell spans across LOC_W + PER_W, full header height
            fill('#0F172A'); stroke('#1E293B'); pdf.setLineWidth(0.4);
            pdf.rect(M, M + TITLE_H, LOC_W + PER_W, HDR_H, 'FD');
            pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7.5); tc('#FFFFFF');
            pdf.text('Lieu / Créneau', M + (LOC_W + PER_W)/2, M + TITLE_H + HDR_H/2 + 2.5, { align: 'center' });

            days.forEach((day, di) => {
                const dateStr      = getDateForDayOfWeek(currentWeekStart, day);
                const holiday      = isFrenchHoliday(dateStr);
                const [, mo, dd]   = dateStr.split('-');
                const x = TABLE_X + di * CELL_W;

                fill(holiday ? '#FEF2F2' : '#1E293B');
                stroke(holiday ? '#FECACA' : '#334155');
                pdf.rect(x, M + TITLE_H, CELL_W, HDR_H, 'FD');

                pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9);
                tc(holiday ? '#DC2626' : '#FFFFFF');
                pdf.text(`${day}  ${dd}/${mo}`, x + CELL_W/2, M + TITLE_H + HDR_H/2 + 3, { align: 'center' });
            });

            // ── 3. Data rows — 2 rows per location ────────────────────────────
            displayRows.forEach((loc, ri) => {
                const rowY0  = TABLE_Y + ri * 2 * ROW_H;       // Matin row top
                const rowY1  = TABLE_Y + (ri * 2 + 1) * ROW_H; // Après-midi row top
                const stripBg = ri % 2 === 0 ? '#FFFFFF' : '#F9FAFB';

                // ── location cell (spans both period rows) ──────────────────
                fill('#F1F5F9'); stroke('#CBD5E1');
                pdf.setLineWidth(0.5);
                pdf.rect(M, rowY0, LOC_W, ROW_H * 2, 'FD');

                pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7); tc('#0F172A');
                const locLines = pdf.splitTextToSize(loc, LOC_W - 8);
                const lineH    = 8;
                const locCY    = rowY0 + ROW_H; // vertical center of 2-row block
                locLines.forEach((line: string, li: number) => {
                    const y = locCY + (li - (locLines.length - 1) / 2) * lineH + 2.5;
                    pdf.text(line, M + LOC_W / 2, y, { align: 'center' });
                });

                // ── thin separator between location groups ──────────────────
                if (ri < displayRows.length - 1) {
                    fill('#E2E8F0');
                    pdf.rect(M, rowY1 + ROW_H - 0.8, PW - 2*M, 1.6, 'F');
                }

                // ── period rows ─────────────────────────────────────────────
                [Period.MORNING, Period.AFTERNOON].forEach((period, pi) => {
                    const rowY = pi === 0 ? rowY0 : rowY1;

                    // Period label cell
                    fill('#F8FAFC'); stroke('#E2E8F0');
                    pdf.setLineWidth(0.35);
                    pdf.rect(M + LOC_W, rowY, PER_W, ROW_H, 'FD');
                    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(6.5); tc('#64748B');
                    pdf.text(
                        period === Period.MORNING ? 'Matin' : 'Après-m.',
                        M + LOC_W + PER_W/2, rowY + ROW_H/2 + 2.3, { align: 'center' }
                    );

                    // Thin separator between Matin and Après-midi
                    if (pi === 0) {
                        stroke('#E2E8F0'); pdf.setLineWidth(0.3);
                        pdf.line(M + LOC_W, rowY + ROW_H, PW - M, rowY + ROW_H);
                    }

                    // ── day cells ───────────────────────────────────────────
                    days.forEach((day, di) => {
                        const cellX   = TABLE_X + di * CELL_W;
                        const dateStr = getDateForDayOfWeek(currentWeekStart, day);
                        const holiday = isFrenchHoliday(dateStr);

                        // Holiday
                        if (holiday) {
                            fill('#FEF2F2'); stroke('#FECACA');
                            pdf.rect(cellX, rowY, CELL_W, ROW_H, 'FD');
                            if (pi === 0) {
                                const hn = holiday.name.length > 16 ? holiday.name.slice(0, 15) + '…' : holiday.name;
                                pdf.setFont('helvetica', 'bold'); pdf.setFontSize(6.5); tc('#DC2626');
                                pdf.text(hn, cellX + CELL_W/2, rowY + ROW_H/2 + 2.3, { align: 'center' });
                            }
                            return;
                        }

                        // Monday morning Box → closed
                        if (day === DayOfWeek.MONDAY && period === Period.MORNING && loc.startsWith('Box')) {
                            fill('#F1F5F9'); stroke('#E2E8F0');
                            pdf.rect(cellX, rowY, CELL_W, ROW_H, 'FD');
                            pdf.setFont('helvetica', 'italic'); pdf.setFontSize(6.5); tc('#94A3B8');
                            pdf.text('Fermé', cellX + CELL_W/2, rowY + ROW_H/2 + 2.3, { align: 'center' });
                            return;
                        }

                        const slot = schedule.find(s =>
                            s.date === dateStr &&
                            s.period === period &&
                            (s.location === loc || s.subType === loc)
                        );

                        if (!slot) {
                            fill(stripBg); stroke('#E2E8F0');
                            pdf.rect(cellX, rowY, CELL_W, ROW_H, 'FD');
                            tc('#CBD5E1'); pdf.setFontSize(9);
                            pdf.text('—', cellX + CELL_W/2, rowY + ROW_H/2 + 3, { align: 'center' });
                            return;
                        }

                        if (slot.isClosed) {
                            fill('#F1F5F9'); stroke('#E2E8F0');
                            pdf.rect(cellX, rowY, CELL_W, ROW_H, 'FD');
                            pdf.setFont('helvetica', 'italic'); pdf.setFontSize(6.5); tc('#94A3B8');
                            pdf.text('Fermé', cellX + CELL_W/2, rowY + ROW_H/2 + 2.3, { align: 'center' });
                            return;
                        }

                        const doc         = doctors.find(d => d.id === slot.assignedDoctorId);
                        const hasConflict = conflicts.some(c => c.slotId === slot.id);
                        const bg          = hasConflict ? '#FFF0EE' : slotBg(slot);
                        const accent      = hasConflict ? '#DC2626' : slotAccent(slot);

                        fill(bg); stroke('#E2E8F0'); pdf.setLineWidth(0.3);
                        pdf.rect(cellX, rowY, CELL_W, ROW_H, 'FD');
                        fill(accent);
                        pdf.rect(cellX, rowY, 2.5, ROW_H, 'F');

                        if (!doc) {
                            pdf.setFont('helvetica', 'italic'); pdf.setFontSize(6.5); tc('#94A3B8');
                            pdf.text('Non assigné', cellX + CELL_W/2, rowY + ROW_H/2 + 2.3, { align: 'center' });
                            return;
                        }

                        // Doctor avatar circle
                        const docHex = getDoctorHexColor(doc.color) || '#64748B';
                        const { r: dr, g: dg, b: db } = hexRgb(docHex);
                        const CR = 5.5;
                        const CX = cellX + 2.5 + 4 + CR;
                        const CY = rowY + ROW_H / 2;

                        pdf.setFillColor(dr, dg, db);
                        pdf.ellipse(CX, CY, CR, CR, 'F');

                        pdf.setFont('helvetica', 'bold'); pdf.setFontSize(4.5); tc('#FFFFFF');
                        pdf.text(doc.name.substring(0, 2).toUpperCase(), CX, CY + 1.6, { align: 'center' });

                        // Doctor name (truncated to fit)
                        const nameX  = CX + CR + 3;
                        const maxW   = cellX + CELL_W - nameX - 2;
                        const hasAct = slot.type === SlotType.ACTIVITY && slot.subType;

                        pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7.5);
                        tc(hasConflict ? '#DC2626' : '#0F172A');

                        let dName = doc.name;
                        while (pdf.getTextWidth(dName) > maxW && dName.length > 3) dName = dName.slice(0, -1);
                        if (dName !== doc.name) dName += '…';

                        pdf.text(dName, nameX, hasAct ? CY - 1.5 : CY + 2.5);

                        // Activity sub-type
                        if (hasAct) {
                            pdf.setFont('helvetica', 'normal'); pdf.setFontSize(6); tc('#64748B');
                            let sub = slot.subType || '';
                            while (pdf.getTextWidth(sub) > maxW && sub.length > 3) sub = sub.slice(0, -1);
                            pdf.text(sub, nameX, CY + 5.5);
                        }

                        if (hasConflict) {
                            pdf.setFont('helvetica', 'bold'); pdf.setFontSize(5.5); tc('#DC2626');
                            pdf.text('CONFLIT', cellX + CELL_W - 2, rowY + ROW_H - 4, { align: 'right' });
                        }
                    });
                });
            });

            // ── 4. Legend + footer ────────────────────────────────────────────
            const LY = TABLE_Y + N_ROWS * ROW_H + 6;
            const legendItems = [
                { accent: '#3B6FD4', bg: '#EEF4FF', label: 'Consultation' },
                { accent: '#7C3AED', bg: '#F5F0FF', label: 'RCP' },
                { accent: '#DC4E3A', bg: '#FFF0EE', label: 'Astreinte' },
                { accent: '#0F766E', bg: '#ECFDF5', label: 'Workflow' },
                { accent: '#6D28D9', bg: '#F3F0FF', label: 'Unity' },
                { accent: '#F59E0B', bg: '#FFFBEB', label: 'Activité' },
                { accent: '#DC2626', bg: '#FFF0EE', label: 'Conflit' },
            ];
            pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7); tc('#64748B');
            pdf.text('LÉGENDE :', M, LY + 5.5);
            let lx = M + 44;
            legendItems.forEach(({ accent, bg, label }) => {
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

    const handleDensityChange = async (newDensity: 'COMPACT' | 'COMFORTABLE') => {
      setDensity(newDensity);
      if (!user?.id) return;
      try {
        const { data, error: fetchError } = await supabase.from('profiles').select('ui_prefs').eq('id', user.id).single();
        if (fetchError) throw fetchError;
        const existing = data?.ui_prefs ?? {};
        const { error: updateError } = await supabase.from('profiles')
          .update({ ui_prefs: { ...existing, planning_density: newDensity } })
          .eq('id', user.id);
        if (updateError) throw updateError;
      } catch (err) {
        console.error('Failed to persist density preference:', err);
      }
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
                            <div className="absolute top-full mt-2 right-0 left-0 sm:left-auto w-auto sm:w-64 max-w-[calc(100vw-1rem)] bg-surface rounded-card shadow-modal border border-border p-4 z-[50] animate-in fade-in zoom-in-95 duration-150">
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
                                            onClick={() => handleDensityChange('COMPACT')}
                                            className={`flex-1 py-1.5 text-xs font-bold rounded ${density === 'COMPACT' ? 'bg-surface shadow text-text-base' : 'text-text-muted'}`}
                                        >
                                            Compact
                                        </button>
                                        <button
                                            onClick={() => handleDensityChange('COMFORTABLE')}
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
import React, { useContext, useState, useEffect, useMemo, useRef } from 'react';
import { AppContext } from '../App';
import { DayOfWeek, Period, SlotType, RcpException, ScheduleSlot, RcpManualInstance, RcpAutoConfig } from '../types';
import { Save, RefreshCw, LayoutTemplate, PlusCircle, Clock, Trash2, Check, X, MapPin, AlertCircle, Shield, Settings, Unlock, Lock, Calendar, ChevronLeft, ChevronRight, Edit3, AlertTriangle, UserPlus, Maximize2, Minimize2, RotateCcw } from 'lucide-react';
import { generateScheduleForWeek, getDateForDayOfWeek, isFrenchHoliday } from '../services/scheduleService';
import RcpExceptionModal from '../components/RcpExceptionModal';
import { DoctorBadge, getDoctorHexColor } from '../components/DoctorBadge';
import { getRcpAutoConfigs, upsertRcpAutoConfig, triggerAutoAssignNow, cancelWeekAutoAssign, deleteRcpAutoConfig } from '../services/rcpAutoConfigService';
import { useAuth } from '../context/AuthContext';
import { Card, CardHeader, CardTitle, CardBody, Button, Badge } from '../src/components/ui';


const Configuration: React.FC = () => {
    const {
        template,
        doctors,
        updateTemplate,
        rcpTypes,
        addRcpType,
        removeRcpType,
        updateRcpDefinition,
        renameRcpType,
        postes,
        addPoste,
        removePoste,
        activitiesStartDate,
        setActivitiesStartDate,
        unavailabilities,
        activityDefinitions,
        rcpExceptions,
        addRcpException,
        removeRcpException,
        configActiveTab,
        setConfigActiveTab,
        configRcpWeekOffset,
        setConfigRcpWeekOffset,
        configRcpViewMode,
        setConfigRcpViewMode,
        configRcpFullscreen,
        setConfigRcpFullscreen,
        countingPeriods,
        createNewCountingPeriod,
        manualOverrides,
        setManualOverrides
    } = useContext(AppContext);

    const { profile } = useAuth();

    const tableContainerRef = useRef<HTMLDivElement>(null);
    const isSavingRef = useRef(false);
    const savedTabRef = useRef<SlotType>(SlotType.CONSULTATION);

    // Use context state for activeTab (survives re-renders)
    const activeTab = (configActiveTab || 'CONSULTATION') as SlotType;
    const setActiveTab = (tab: SlotType) => setConfigActiveTab(tab);

    // Use context state for RCP view mode (survives re-renders)
    const rcpViewMode = configRcpViewMode;
    const setRcpViewMode = setConfigRcpViewMode;

    // Rule Editor State
    const [editMode, setEditMode] = useState(false);
    const [tempTemplate, setTempTemplate] = useState(template);

    // Calendar View State - use context offset
    const currentCalendarDate = useMemo(() => {
        const d = new Date();
        d.setDate(d.getDate() + (configRcpWeekOffset * 7));
        return d;
    }, [configRcpWeekOffset]);

    const setCurrentCalendarDate = (newDate: Date) => {
        const today = new Date();
        const weekDiff = Math.round((newDate.getTime() - today.getTime()) / (7 * 24 * 60 * 60 * 1000));
        setConfigRcpWeekOffset(weekDiff);
    };

    const [selectedExceptionSlot, setSelectedExceptionSlot] = useState<ScheduleSlot | null>(null);
    // isFullscreen now uses context for persistence
    const isFullscreen = configRcpFullscreen;
    const setIsFullscreen = setConfigRcpFullscreen;
    const [showNewPeriodModal, setShowNewPeriodModal] = useState(false);
    const [newPeriodDate, setNewPeriodDate] = useState('');
    const [newPeriodName, setNewPeriodName] = useState('');

    useEffect(() => {
        console.log('📋 Template changed, syncing tempTemplate. Length:', template.length, 'isSaving:', isSavingRef.current);
        setTempTemplate(template);

        // If we were saving, restore the tab
        if (isSavingRef.current) {
            console.log('🔄 Restoring tab to:', savedTabRef.current);
            setActiveTab(savedTabRef.current);
            isSavingRef.current = false;
        }
    }, [template]);

    useEffect(() => {
        getRcpAutoConfigs().then(setRcpAutoConfigs).catch(console.error);
    }, []);

    // RCP State
    const [newRcpName, setNewRcpName] = useState("");
    const [selectedRcpId, setSelectedRcpId] = useState<string>("");
    const [tempRcpName, setTempRcpName] = useState("");

    // RCP Manual Instance Input
    const [manualDateInput, setManualDateInput] = useState("");
    const [manualTimeInput, setManualTimeInput] = useState("14:00");
    const [manualLeadId, setManualLeadId] = useState("");
    const [manualAssoc1Id, setManualAssoc1Id] = useState("");
    const [manualAssoc2Id, setManualAssoc2Id] = useState("");
    const [manualBackupId, setManualBackupId] = useState("");
    const [manualHolidayWarning, setManualHolidayWarning] = useState<string | null>(null);

    // Postes State
    const [newPosteName, setNewPosteName] = useState("");

    // RCP Auto-assignment Config State
    const [rcpAutoConfigs, setRcpAutoConfigs] = useState<RcpAutoConfig[]>([]);
    const [autoConfigDay, setAutoConfigDay] = useState('Vendredi');
    const [autoConfigTime, setAutoConfigTime] = useState('14:00');
    const [savingAutoConfig, setSavingAutoConfig] = useState(false);
    const [launchWeekDate, setLaunchWeekDate] = useState<string>('');
    const [cancellingWeek, setCancellingWeek] = useState<string | null>(null);
    const [deletingWeek, setDeletingWeek] = useState<string | null>(null);

    const days = Object.values(DayOfWeek);

    // --- CALENDAR DATA GENERATION ---
    const currentCalendarWeekStart = useMemo(() => {
        const d = new Date(currentCalendarDate);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        d.setDate(diff);
        d.setHours(0, 0, 0, 0);
        return d;
    }, [currentCalendarDate]);

    const calendarSlots = useMemo(() => {
        if (rcpViewMode !== 'CALENDAR') return [];
        // Generate schedule specifically for RCPs
        const slots = generateScheduleForWeek(
            currentCalendarWeekStart,
            template,
            unavailabilities,
            doctors,
            activityDefinitions,
            rcpTypes,
            false, // No auto-fill needed
            {},
            {},
            rcpExceptions
        );
        return slots.filter(s => s.type === SlotType.RCP);
    }, [currentCalendarWeekStart, template, unavailabilities, doctors, activityDefinitions, rcpTypes, rcpViewMode, rcpExceptions]);


    const handleUpdateSlot = (
        day: DayOfWeek,
        period: Period,
        location: string,
        field: string,
        value: any
    ) => {
        if (!editMode) return;

        setTempTemplate(prev => {
            // For RCPs, match by location OR subType (some RCPs use subType as identifier)
            const existingIndex = prev.findIndex(t =>
                t.day === day &&
                t.period === period &&
                (t.location === location || t.subType === location) &&
                (activeTab === SlotType.CONSULTATION ? t.type === SlotType.CONSULTATION || t.type === SlotType.RCP : t.type === activeTab)
            );

            let newSlot: any;
            let newTemplate = [...prev];

            if (existingIndex >= 0) {
                newSlot = { ...newTemplate[existingIndex] };

                // Handle complex fields
                if (field === 'doctorIds') {
                    newSlot.doctorIds = value; // expects array
                    // Sync legacy fields for compatibility
                    newSlot.defaultDoctorId = value[0] || null;
                    newSlot.secondaryDoctorIds = value.slice(1);
                    console.log('📝 Updated doctorIds for slot:', newSlot.id, 'doctors:', value);
                } else {
                    newSlot[field] = value === "" ? null : value;
                    console.log('📝 Updated field', field, 'for slot:', newSlot.id, 'value:', value);
                }

                newTemplate[existingIndex] = newSlot;
            } else {
                // Create new slot
                if (value === "") return prev;

                newSlot = {
                    id: `temp_${Date.now()}_${Math.random()}`,
                    day,
                    period,
                    location,
                    type: activeTab,
                    time: undefined,
                    isRequired: true,
                    isBlocking: true,
                    frequency: 'WEEKLY',
                    doctorIds: [],
                    subType: activeTab === SlotType.RCP ? location : activeTab // Default subType to location name
                };

                if (field === 'doctorIds') {
                    newSlot.doctorIds = value;
                    newSlot.defaultDoctorId = value[0] || null;
                    newSlot.secondaryDoctorIds = value.slice(1);
                } else {
                    newSlot[field] = value;
                }

                newTemplate = [...prev, newSlot];
            }
            return newTemplate;
        });
    };

    const handleDeleteSlot = (day: DayOfWeek, period: Period, location: string) => {
        setTempTemplate(prev => prev.filter(t => !(
            t.day === day &&
            t.period === period &&
            (t.location === location || t.subType === location) &&
            (activeTab === SlotType.CONSULTATION ? t.type === SlotType.CONSULTATION || t.type === SlotType.RCP : t.type === activeTab)
        )));
    };

    const saveChanges = () => {
        console.log('💾 Saving changes, current tab:', activeTab);
        // Save the current tab so we can restore it after template update
        isSavingRef.current = true;
        savedTabRef.current = activeTab;
        updateTemplate(tempTemplate);
        setEditMode(false);
    };

    const cancelChanges = () => {
        setTempTemplate(template);
        setEditMode(false);
    };

    // --- RCP HANDLERS ---
    const handleAddRcp = () => {
        if (newRcpName.trim()) {
            addRcpType(newRcpName.trim());
            setNewRcpName("");
        }
    }

    const saveEditRcp = (rcp: any) => {
        if (tempRcpName.trim() && tempRcpName !== rcp.name) {
            renameRcpType(rcp.name, tempRcpName.trim());
        }
    }

    const handleDeleteRcp = (id: string) => {
        removeRcpType(id);
        if (selectedRcpId === id) setSelectedRcpId("");
    }

    const handleManualDateChange = (date: string) => {
        setManualDateInput(date);
        const holiday = isFrenchHoliday(date);
        if (holiday) {
            setManualHolidayWarning(`Attention : Le ${date.split('-').reverse().join('/')} est férié (${holiday.name}).`);
        } else {
            setManualHolidayWarning(null);
        }
    };

    const handleAddManualInstance = (rcp: any) => {
        if (manualDateInput && manualTimeInput) {
            const doctorIds = [manualLeadId, manualAssoc1Id, manualAssoc2Id].filter(Boolean);

            const newInstance: RcpManualInstance = {
                id: Date.now().toString(),
                date: manualDateInput,
                time: manualTimeInput,
                doctorIds: doctorIds,
                backupDoctorId: manualBackupId || null
            };

            updateRcpDefinition({
                ...rcp,
                manualInstances: [...(rcp.manualInstances || []), newInstance].sort((a, b) => a.date.localeCompare(b.date))
            });

            // Reset
            setManualDateInput("");
            setManualLeadId("");
            setManualAssoc1Id("");
            setManualAssoc2Id("");
            setManualBackupId("");
            setManualHolidayWarning(null);
        }
    };

    const handleRemoveManualInstance = (rcp: any, instanceId: string) => {
        updateRcpDefinition({
            ...rcp,
            manualInstances: rcp.manualInstances?.filter((i: RcpManualInstance) => i.id !== instanceId)
        });
    };

    // --- POSTE HANDLERS ---
    const handleAddPoste = () => {
        if (newPosteName.trim()) {
            addPoste(newPosteName.trim());
            setNewPosteName("");
        }
    }

    const handleDeletePoste = (location: string) => {
        if (window.confirm(`Supprimer définitivement le poste "${location}" ?`)) {
            removePoste(location);
        }
    }

    const handleSaveException = (ex: RcpException) => {
        addRcpException(ex);
        setSelectedExceptionSlot(null);
    }

    const handleSaveAutoConfig = async () => {
        if (!profile?.id) return;
        setSavingAutoConfig(true);
        try {
            const DAY_OFFSET: Record<string, number> = {
                'Lundi': 0, 'Mardi': 1, 'Mercredi': 2, 'Jeudi': 3, 'Vendredi': 4,
            };
            const today = new Date();
            const dow = today.getDay();
            const diff = today.getDate() - dow + (dow === 0 ? -6 : 1);
            const currentMonday = new Date(today);
            currentMonday.setDate(diff);
            currentMonday.setHours(0, 0, 0, 0);

            const [h, m] = autoConfigTime.split(':').map(Number);
            for (let w = 0; w < 8; w++) {
                const monday = new Date(currentMonday);
                monday.setDate(currentMonday.getDate() + w * 7);
                const deadlineDay = new Date(monday);
                // deadline = same day-of-week but PREVIOUS week (week before the RCP)
                deadlineDay.setDate(monday.getDate() + (DAY_OFFSET[autoConfigDay] ?? 4) - 7);
                deadlineDay.setHours(h, m, 0, 0);
                const weekStr = `${monday.getFullYear()}-${String(monday.getMonth()+1).padStart(2,'0')}-${String(monday.getDate()).padStart(2,'0')}`;
                await upsertRcpAutoConfig(weekStr, deadlineDay.toISOString(), profile.id);
            }
            const updated = await getRcpAutoConfigs();
            setRcpAutoConfigs(updated);
        } catch (e) {
            console.error(e);
        } finally {
            setSavingAutoConfig(false);
        }
    };

    const getRcpTemplateIds = () => template.filter(t => t.type === SlotType.RCP).map(t => t.id);

    const handleCancelWeek = async (weekStartDate: string) => {
        const weekLabel = new Date(weekStartDate + 'T12:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
        if (!window.confirm(`Réinitialiser les auto-affectations RCP pour la semaine du ${weekLabel} ?\n\nLes assignations automatiques (PRÉSENT) de cette semaine seront supprimées. Les absences déclarées sont conservées.`)) return;
        setCancellingWeek(weekStartDate);
        try {
            await cancelWeekAutoAssign(weekStartDate, getRcpTemplateIds());
            const updated = await getRcpAutoConfigs();
            setRcpAutoConfigs(updated);
        } catch (e) {
            console.error(e);
            alert('Erreur lors de la réinitialisation.');
        } finally {
            setCancellingWeek(null);
        }
    };

    const handleDeleteWeekConfig = async (weekStartDate: string) => {
        const weekLabel = new Date(weekStartDate + 'T12:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
        if (!window.confirm(`Supprimer la configuration de la semaine du ${weekLabel} ?\n\nLes assignations automatiques de cette semaine seront également supprimées.`)) return;
        setDeletingWeek(weekStartDate);
        try {
            await cancelWeekAutoAssign(weekStartDate, getRcpTemplateIds());
            await deleteRcpAutoConfig(weekStartDate);
            const updated = await getRcpAutoConfigs();
            setRcpAutoConfigs(updated);
        } catch (e) {
            console.error(e);
            alert('Erreur lors de la suppression.');
        } finally {
            setDeletingWeek(null);
        }
    };

    const handleCancelAllRcpAutoAssignments = async () => {
        const executedWeeks = rcpAutoConfigs.filter(c => c.executedAt);
        if (executedWeeks.length === 0) {
            alert('Aucune auto-affectation exécutée à annuler.');
            return;
        }
        if (!window.confirm(
            `Annuler toutes les auto-affectations RCP ?\n\n${executedWeeks.length} semaine(s) exécutée(s) seront réinitialisées. Les absences déclarées sont conservées.`
        )) return;
        setCancellingWeek('all');
        try {
            const ids = getRcpTemplateIds();
            for (const c of executedWeeks) {
                await cancelWeekAutoAssign(c.weekStartDate, ids);
            }
            const updated = await getRcpAutoConfigs();
            setRcpAutoConfigs(updated);
        } catch (e) {
            console.error(e);
            alert('Erreur lors de l\'annulation.');
        } finally {
            setCancellingWeek(null);
        }
    };

    // --- RENDER HELPERS ---
    const renderConfigCell = (day: DayOfWeek, period: Period, location: string) => {
        const isConsultTab = activeTab === SlotType.CONSULTATION;
        // Match by location OR subType (RCPs may use subType)
        const slot = tempTemplate.find(t =>
            t.day === day &&
            t.period === period &&
            (t.location === location || t.subType === location) &&
            (isConsultTab ? (t.type === SlotType.CONSULTATION || t.type === SlotType.RCP) : t.type === activeTab)
        );

        const isMondayMorning = day === DayOfWeek.MONDAY && period === Period.MORNING;
        const isBox = location.startsWith('Box');

        if (isConsultTab && isMondayMorning && isBox) {
            return (
                <div className="bg-muted h-full flex items-center justify-center p-2 text-center border border-border">
                    <span className="text-[10px] text-text-muted uppercase font-bold">Fermé (RCP Service)</span>
                </div>
            );
        }

        const currentDocIds = slot?.doctorIds || (slot?.defaultDoctorId ? [slot?.defaultDoctorId, ...(slot?.secondaryDoctorIds || [])] : []);
        const isTimeWarning = slot?.time && (
            (period === Period.MORNING && parseInt(slot.time.split(':')[0]) >= 13) ||
            (period === Period.AFTERNOON && parseInt(slot.time.split(':')[0]) < 12)
        );

        if (editMode) {
            return (
                <div className={`p-2 h-full flex flex-col justify-start items-center space-y-2 border min-h-[160px] relative group ${slot ? 'bg-surface border-primary/30' : 'bg-muted border-dashed border-border'}`}>
                    {slot && (
                        <button
                            onClick={() => handleDeleteSlot(day, period, location)}
                            className="absolute top-1 right-1 text-danger/40 hover:text-danger opacity-0 group-hover:opacity-100 transition-opacity p-1 z-20 bg-surface rounded-full shadow-sm"
                            title="Supprimer ce créneau"
                        >
                            <Trash2 className="w-3 h-3" />
                        </button>
                    )}

                    {!slot && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <span className="text-[9px] text-text-muted font-medium">+ Ajouter</span>
                        </div>
                    )}

                    {activeTab === SlotType.RCP ? (
                        <div className="w-full space-y-2 pt-1 z-10">
                            {[0, 1, 2].map(idx => (
                                <select
                                    key={idx}
                                    value={currentDocIds[idx] || ''}
                                    onChange={(e) => {
                                        const newIds = [...currentDocIds];
                                        newIds[idx] = e.target.value;
                                        handleUpdateSlot(day, period, location, 'doctorIds', newIds.filter(Boolean));
                                    }}
                                    className="w-full text-[10px] p-1 border rounded-input bg-surface focus:ring-1 focus:ring-primary/20 h-6"
                                >
                                    <option value="">{idx === 0 ? '-- Responsable --' : '-- Autre --'}</option>
                                    {doctors.map(d => (
                                        <option key={d.id} value={d.id}>{d.name}</option>
                                    ))}
                                </select>
                            ))}
                            <div className="flex items-center space-x-1 border-t pt-1 border-border">
                                <Shield className="w-3 h-3 text-text-muted" />
                                <select
                                    value={slot?.backupDoctorId || ''}
                                    onChange={(e) => handleUpdateSlot(day, period, location, 'backupDoctorId', e.target.value)}
                                    className="w-full text-[10px] p-1 border rounded-input bg-muted focus:ring-1 focus:ring-primary/20 h-6 text-text-muted"
                                >
                                    <option value="">-- Backup --</option>
                                    {doctors.map(d => (
                                        <option key={d.id} value={d.id}>{d.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex items-center space-x-1 pt-1">
                                <Clock className={`w-3 h-3 ${isTimeWarning ? 'text-warning' : 'text-text-muted'}`} />
                                <input
                                    type="time"
                                    value={slot?.time || ''}
                                    onChange={(e) => handleUpdateSlot(day, period, location, 'time', e.target.value)}
                                    className={`w-full text-xs p-1 border rounded-input ${isTimeWarning ? 'border-warning/40 bg-warning/10' : ''}`}
                                />
                            </div>
                            <div className="flex items-center space-x-2 pt-1">
                                <button
                                    onClick={() => handleUpdateSlot(day, period, location, 'isBlocking', slot?.isBlocking === false ? true : false)}
                                    className={`flex items-center text-[9px] px-2 py-1 rounded border w-full justify-center transition-colors ${slot?.isBlocking !== false
                                        ? 'bg-danger/10 text-danger border-danger/20 font-bold'
                                        : 'bg-success/10 text-success border-success/20'
                                        }`}
                                >
                                    {slot?.isBlocking !== false ? <Lock className="w-3 h-3 mr-1" /> : <Unlock className="w-3 h-3 mr-1" />}
                                    {slot?.isBlocking !== false ? 'Obligatoire' : 'Optionnel'}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <select
                            value={currentDocIds[0] || ''}
                            onChange={(e) => handleUpdateSlot(day, period, location, 'doctorIds', [e.target.value].filter(Boolean))}
                            className="w-full text-xs p-1 border rounded-input bg-surface focus:ring-2 focus:ring-primary/20 z-10"
                        >
                            <option value="">-- Libre --</option>
                            {doctors.map(d => (
                                <option key={d.id} value={d.id}>{d.name}</option>
                            ))}
                        </select>
                    )}
                </div>
            );
        }

        if (!slot) return <div className="text-[10px] text-text-muted text-center py-4">--</div>;

        return (
            <div className="p-2 h-full flex flex-col justify-center items-center">
                {currentDocIds.length > 0 ? (
                    <div className="flex flex-col space-y-1.5 w-full">
                        {currentDocIds.map((docId, idx) => {
                            const doc = doctors.find(d => d.id === docId);
                            if (!doc) return null;
                            return (
                                <div key={docId} className="flex items-center justify-start px-2 py-1.5 rounded-btn-sm bg-surface border border-border shadow-sm">
                                    <div
                                        className="w-6 h-6 rounded-full mr-2 flex-shrink-0 flex items-center justify-center text-white text-[9px] font-bold"
                                        style={{ backgroundColor: getDoctorHexColor(doc.color) }}
                                    >
                                        {doc.name.substring(0, 2)}
                                    </div>
                                    <span className={`text-[11px] font-semibold leading-tight truncate ${idx === 0 ? 'text-text-base' : 'text-text-muted'}`}>
                                        {doc.name}
                                    </span>
                                </div>
                            )
                        })}
                        {slot.backupDoctorId && (
                            <div className="flex items-center justify-center space-x-1 mt-1 pt-1 border-t border-border">
                                <Shield className="w-3 h-3 text-warning" />
                                <span className="text-[9px] text-warning font-medium">
                                    Backup: {doctors.find(d => d.id === slot.backupDoctorId)?.name || '?'}
                                </span>
                            </div>
                        )}
                        {slot.type === SlotType.RCP && (
                            <div className="mt-1 flex flex-col items-center">
                                <span className="text-[9px] bg-secondary/10 text-secondary px-1 rounded border border-secondary/20 mb-0.5">
                                    {slot.time || 'N/A'}
                                </span>
                            </div>
                        )}
                    </div>
                ) : (
                    <span className="text-xs text-text-muted italic">Libre</span>
                )}
            </div>
        );
    };

    const renderCalendarCell = (day: DayOfWeek, period: Period, location: string) => {
        const date = getDateForDayOfWeek(currentCalendarWeekStart, day);
        // Match by location OR subType for RCPs
        const slot = calendarSlots.find(s => s.date === date && s.period === period && (s.location === location || s.subType === location));

        const holiday = isFrenchHoliday(date);

        // If it's a holiday but there's no slot, show holiday indicator
        if (holiday && !slot) {
            return (
                <div className="h-full w-full bg-danger/5 flex items-center justify-center border border-danger/20 flex-col opacity-80 min-h-[70px]">
                    <span className="text-[10px] text-danger/60 font-bold uppercase tracking-wider">Férié</span>
                    <span className="text-[9px] text-danger/40 text-center px-1 leading-tight">{holiday.name}</span>
                </div>
            )
        }

        if (!slot) return <div className="text-xs text-text-muted p-2 text-center h-full flex items-center justify-center bg-muted/50 min-h-[70px]">--</div>;

        // If RCP falls on a holiday, show it with a warning indicator (allows admin to move it)
        if (holiday && slot) {
            const allDoctorIds = [slot.assignedDoctorId, ...(slot.secondaryDoctorIds || [])].filter(Boolean);
            return (
                <div
                    onClick={() => setSelectedExceptionSlot(slot)}
                    className="p-2 h-full border-2 rounded-card cursor-pointer transition-all hover:shadow-lg group relative flex flex-col bg-gradient-to-br from-warning/10 to-danger/5 border-warning/40 hover:border-warning min-h-[70px] animate-pulse-subtle"
                >
                    {/* Holiday warning badge */}
                    <div className="absolute -top-1 -right-1 z-10">
                        <div className="bg-warning text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full shadow-sm">
                            ⚠️ FÉRIÉ
                        </div>
                    </div>

                    <div className="absolute top-1 left-1 opacity-0 group-hover:opacity-100 transition-opacity text-xs text-warning font-bold">
                        Déplacer →
                    </div>

                    {/* Holiday name */}
                    <div className="text-[9px] font-bold text-warning bg-warning/10 px-1 py-0.5 rounded self-start mb-1 border border-warning/20">
                        📅 {holiday.name}
                    </div>

                    {/* Time badge */}
                    <div className="text-[10px] font-bold text-secondary mb-1 flex items-center bg-secondary/10 px-1.5 py-0.5 rounded self-start">
                        <Clock className="w-3 h-3 mr-1" /> {slot.time || '--:--'}
                    </div>

                    {/* Doctors */}
                    <div className="flex flex-col gap-0.5">
                        {allDoctorIds.slice(0, 2).map((id, idx) => {
                            const d = doctors.find(doc => doc.id === id);
                            if (!d) return null;
                            return (
                                <div key={id} className="flex items-center gap-1">
                                    <div
                                        className="w-4 h-4 rounded-full flex items-center justify-center text-[7px] font-bold text-white shadow-sm"
                                        style={{ backgroundColor: getDoctorHexColor(d.color) }}
                                    >
                                        {d.name.substring(0, 2)}
                                    </div>
                                    <span className={`text-[9px] truncate ${idx === 0 ? 'font-bold text-text-base' : 'text-text-muted'}`}>
                                        {d.name}
                                    </span>
                                </div>
                            )
                        })}
                        {allDoctorIds.length > 2 && (
                            <span className="text-[8px] text-text-muted">+{allDoctorIds.length - 2} autre(s)</span>
                        )}
                    </div>

                    {/* Action hint */}
                    <div className="mt-auto pt-1 border-t border-warning/20">
                        <span className="text-[8px] text-warning font-medium">Cliquer pour déplacer</span>
                    </div>
                </div>
            );
        }

        // Handle cancelled RCPs
        if (slot.isCancelled) {
            return (
                <div
                    onClick={() => setSelectedExceptionSlot(slot)}
                    className="p-2 h-full border-2 rounded-card cursor-pointer transition-all hover:shadow-lg group relative flex flex-col items-center justify-center bg-gradient-to-br from-danger/10 to-surface border-danger/20 hover:border-danger/50 min-h-[70px] opacity-80"
                >
                    <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Edit3 className="w-3 h-3 text-danger/50" />
                    </div>
                    <X className="w-6 h-6 text-danger/50 mb-1" />
                    <span className="text-[10px] font-bold text-danger uppercase">Annulée</span>
                    <span className="text-[9px] text-danger/50 mt-1">Cliquer pour réactiver</span>
                </div>
            )
        }

        const allDoctorIds = [slot.assignedDoctorId, ...(slot.secondaryDoctorIds || [])].filter(Boolean);

        return (
            <div
                onClick={() => setSelectedExceptionSlot(slot)}
                className="p-2 h-full border-2 rounded-card cursor-pointer transition-all hover:shadow-lg group relative flex flex-col bg-gradient-to-br from-secondary/10 to-surface border-secondary/20 hover:border-secondary/50 min-h-[70px]"
            >
                <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Edit3 className="w-3 h-3 text-secondary/50" />
                </div>

                {/* Time badge */}
                <div className="text-[10px] font-bold text-secondary mb-2 flex items-center bg-secondary/10 px-1.5 py-0.5 rounded self-start">
                    <Clock className="w-3 h-3 mr-1" /> {slot.time || '--:--'}
                </div>

                {/* Doctors with Dr badges */}
                <div className="flex flex-col gap-1">
                    {allDoctorIds.map((id, idx) => {
                        const d = doctors.find(doc => doc.id === id);
                        if (!d) return null;
                        return (
                            <div key={id} className="flex items-center gap-1.5">
                                <div
                                    className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white shadow-sm border border-white/50"
                                    style={{ backgroundColor: getDoctorHexColor(d.color) }}
                                >
                                    {d.name.substring(0, 2)}
                                </div>
                                <span className={`text-[10px] truncate ${idx === 0 ? 'font-bold text-text-base' : 'text-text-muted'}`}>
                                    {d.name}
                                </span>
                            </div>
                        )
                    })}
                    {allDoctorIds.length === 0 && (
                        <span className="text-[9px] text-text-muted italic">Non assigné</span>
                    )}
                </div>
            </div>
        )
    };



    const getRows = () => {
        if (activeTab === SlotType.CONSULTATION) {
            return postes.map(p => ({ id: p, name: p, type: 'POSTE' }));
        } else {
            return rcpTypes.map(r => ({ id: r.id, name: r.name, type: 'RCP' }));
        }
    }
    const rows = getRows();

    return (
        <div className={`${activeTab === SlotType.RCP && rcpViewMode === 'RULES' ? 'min-h-full' : 'h-full'} flex flex-col space-y-4 pb-20`}>
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center">
                <div className="mb-4 md:mb-0">
                    <h1 className="text-2xl font-extrabold text-text-base tracking-tight flex items-center">
                        <LayoutTemplate className="w-5 h-5 md:w-6 md:h-6 mr-2 md:mr-3 text-secondary" />
                        Configuration
                    </h1>
                    <p className="text-xs md:text-sm text-text-muted mt-1 max-w-2xl hidden sm:block">
                        Définissez les postes fixes (Consultations) et les RCP hebdomadaires.
                    </p>
                </div>

                <div className="flex items-center space-x-2">
                    {rcpViewMode === 'RULES' && (
                        editMode ? (
                            <>
                                <button onClick={cancelChanges} className="px-4 py-2 text-sm text-text-muted hover:text-text-base">
                                    Annuler
                                </button>
                                <button onClick={saveChanges} className="px-4 py-2 bg-success text-white rounded-btn shadow hover:bg-success/90 flex items-center text-sm font-medium">
                                    <Save className="w-4 h-4 mr-2" />
                                    Sauvegarder
                                </button>
                            </>
                        ) : (
                            <button onClick={() => setEditMode(true)} className="px-4 py-2 bg-primary text-white rounded-btn shadow hover:bg-primary/90 flex items-center text-sm font-medium">
                                <RefreshCw className="w-4 h-4 mr-2" />
                                Modifier la Semaine Type
                            </button>
                        )
                    )}
                </div>
            </div>

            {/* START DATE SETTING */}
            <Card>
                <CardBody className="p-4">
                    <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                        <div className="flex items-center">
                            <Calendar className="w-5 h-5 mr-3 text-text-muted" />
                            <div>
                                <h3 className="text-sm font-bold text-text-base">Date de début de comptage des activités</h3>
                                <p className="text-xs text-text-muted mt-0.5">L'équité automatique (Unity/Astreinte/Workflow) sera calculée à partir de cette date.</p>
                            </div>
                        </div>
                        <div className="flex items-center space-x-2 w-full md:w-auto">
                            {activitiesStartDate ? (
                                <div className="flex items-center gap-3 bg-success/10 border border-success/20 px-4 py-2 rounded-btn">
                                    <div className="text-center">
                                        <div className="text-xs text-success font-bold uppercase">Date confirmée</div>
                                        <div className="text-lg font-bold text-success-text">
                                            {new Date(activitiesStartDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => {
                                            if (window.confirm('⚠️ ATTENTION !\n\nSupprimer la date de début réinitialisera le calcul d\'équité.\n\nÊtes-vous sûr de vouloir effacer cette date ?')) {
                                                setActivitiesStartDate(null);
                                            }
                                        }}
                                        className="text-danger hover:text-danger/80 p-1 hover:bg-danger/10 rounded"
                                        title="Effacer la date"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            ) : (
                                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full">
                                    <input
                                        type="date"
                                        id="pending-start-date"
                                        className="w-full h-11 px-3 rounded-input border border-border bg-surface text-text-base text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors flex-1"
                                        max={new Date().toISOString().split('T')[0]}
                                    />
                                    <button
                                        onClick={() => {
                                            const input = document.getElementById('pending-start-date') as HTMLInputElement;
                                            const dateValue = input?.value;
                                            if (!dateValue) {
                                                alert('Veuillez sélectionner une date.');
                                                return;
                                            }
                                            const formattedDate = new Date(dateValue).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
                                            if (window.confirm(`⚙️ CONFIRMATION\n\nVous allez définir la date de début du calcul d'équité au :\n\n📅 ${formattedDate}\n\n⚠️ Cette action ne peut pas être annulée facilement.\nL'équité sera recalculée à partir de cette date.\n\nConfirmer ?`)) {
                                                setActivitiesStartDate(dateValue);
                                            }
                                        }}
                                        className="bg-primary text-white px-4 py-2 rounded-btn text-sm font-bold hover:bg-primary/90 flex items-center justify-center gap-2 whitespace-nowrap"
                                    >
                                        <Check className="w-4 h-4" /> Confirmer la date
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                    {!activitiesStartDate && (
                        <div className="mt-3 p-3 bg-warning/10 border border-warning/20 rounded-card">
                            <div className="flex items-start gap-2">
                                <AlertCircle className="w-4 h-4 text-warning mt-0.5 flex-shrink-0" />
                                <div className="text-xs text-warning-text">
                                    <strong>Important :</strong> Sans date de début, l'équité ne sera pas calculée automatiquement.
                                    Définissez une date pour activer le calcul équitable des affectations.
                                </div>
                            </div>
                        </div>
                    )}
                </CardBody>
            </Card>

            <div className="flex items-center justify-between border-b border-border bg-surface">
                <div className="flex gap-1 border-b-2 border-border overflow-x-auto scrollbar-none -mx-4 px-4 mb-5" role="tablist">
                    {[
                        { id: SlotType.CONSULTATION, label: 'Consultations & Postes' },
                        { id: SlotType.RCP, label: 'RCP (Gestion)' },
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            role="tab"
                            aria-selected={activeTab === tab.id}
                            className={activeTab === tab.id
                                ? 'px-4 py-3 text-sm font-bold text-primary border-b-2 border-primary -mb-0.5 whitespace-nowrap transition-colors'
                                : 'px-4 py-3 text-sm font-medium text-text-muted hover:text-text-base whitespace-nowrap transition-colors'
                            }
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {activeTab === SlotType.RCP && (
                    <div className="flex bg-muted p-1 rounded-btn mr-2 flex-shrink-0">
                        <button
                            onClick={() => setRcpViewMode('RULES')}
                            className={`px-3 py-1 text-xs font-bold rounded ${rcpViewMode === 'RULES' ? 'bg-surface shadow text-primary' : 'text-text-muted'}`}
                        >
                            Vue Règles
                        </button>
                        <button
                            onClick={() => setRcpViewMode('CALENDAR')}
                            className={`px-3 py-1 text-xs font-bold rounded ${rcpViewMode === 'CALENDAR' ? 'bg-surface shadow text-primary' : 'text-text-muted'}`}
                        >
                            Vue Calendrier (Réel)
                        </button>
                    </div>
                )}
            </div>

            {activeTab === SlotType.CONSULTATION && editMode && (
                <Card className="animate-in fade-in slide-in-from-top-2">
                    <CardBody className="p-4">
                        <h3 className="font-bold text-text-base mb-3 flex items-center">
                            <MapPin className="w-4 h-4 mr-2" />
                            Gestion des Lieux / Postes
                        </h3>
                        <div className="flex flex-wrap gap-2">
                            {postes.map(poste => (
                                <div key={poste} className="flex items-center bg-primary/5 px-3 py-1 rounded-full border border-primary/20 text-sm">
                                    <span className="text-primary-text font-medium mr-2">{poste}</span>
                                    <button onClick={() => handleDeletePoste(poste)} className="text-primary/40 hover:text-danger">
                                        <X className="w-3 h-3" />
                                    </button>
                                </div>
                            ))}
                            <div className="flex items-center w-full md:w-auto mt-2 md:mt-0">
                                <input
                                    type="text"
                                    value={newPosteName}
                                    onChange={e => setNewPosteName(e.target.value)}
                                    placeholder="Nouveau (ex: Scanner)"
                                    className="text-sm border border-border rounded-l h-10 px-3 focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none w-32 md:w-40"
                                    onKeyDown={e => e.key === 'Enter' && handleAddPoste()}
                                />
                                <button onClick={handleAddPoste} disabled={!newPosteName} className="bg-primary text-white p-1.5 rounded-r hover:bg-primary/90 h-10 flex items-center">
                                    <PlusCircle className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </CardBody>
                </Card>
            )}

            {activeTab === SlotType.RCP && rcpViewMode === 'RULES' && (
                <Card className="mb-4">
                    <CardBody className="p-4">
                        <div className="flex justify-between items-center mb-4 border-b border-border pb-2">
                            <h3 className="font-bold text-text-base flex items-center">
                                <Settings className="w-4 h-4 mr-2" />
                                Gestion des Lignes RCP
                            </h3>
                        </div>

                        <div className="flex flex-col md:flex-row gap-6">
                            <div className="flex-1">
                                <h4 className="text-xs font-bold text-text-muted uppercase mb-2">Ajouter une nouvelle ligne</h4>
                                <div className="flex items-center space-x-2">
                                    <input
                                        type="text"
                                        placeholder="Nom de la RCP..."
                                        className="flex-1 text-sm border border-border rounded-btn h-10 px-3 focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
                                        value={newRcpName}
                                        onChange={e => setNewRcpName(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && handleAddRcp()}
                                    />
                                    <button onClick={handleAddRcp} disabled={!newRcpName} className="bg-secondary text-white p-2 rounded-btn hover:bg-secondary/90 disabled:opacity-50 transition-colors h-10 flex items-center">
                                        <PlusCircle className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>

                            <div className="w-px bg-border hidden md:block"></div>

                            <div className="flex-[2]">
                                <h4 className="text-xs font-bold text-text-muted uppercase mb-2">Modifier les propriétés</h4>

                                <div className="flex flex-col md:flex-row items-start md:space-x-4 space-y-4 md:space-y-0">
                                    <div className="flex-1 max-w-xs w-full">
                                        <select
                                            value={selectedRcpId}
                                            onChange={(e) => {
                                                setSelectedRcpId(e.target.value);
                                                const r = rcpTypes.find(x => x.id === e.target.value);
                                                if (r) setTempRcpName(r.name);
                                            }}
                                            className="w-full h-10 px-3 border border-border rounded-btn text-sm bg-muted font-medium focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none cursor-pointer"
                                        >
                                            <option value="">-- Sélectionner une RCP --</option>
                                            {rcpTypes.map(r => (
                                                <option key={r.id} value={r.id}>{r.name}</option>
                                            ))}
                                        </select>
                                    </div>

                                {selectedRcpId && (() => {
                                    const rcp = rcpTypes.find(r => r.id === selectedRcpId);
                                    if (!rcp) return null;
                                    return (
                                        <div className="flex-1 flex flex-col gap-3 animate-in fade-in slide-in-from-left-2 w-full">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                <div className="w-full">
                                                    <label className="block text-sm font-semibold text-text-base mb-1.5">Renommer</label>
                                                    <div className="flex items-center space-x-1">
                                                        <input
                                                            type="text"
                                                            value={tempRcpName}
                                                            onChange={e => setTempRcpName(e.target.value)}
                                                            className="flex-1 text-sm border border-border rounded-btn h-10 px-3 focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
                                                        />
                                                        <button onClick={() => saveEditRcp(rcp)} className="p-1.5 bg-success/10 text-success rounded hover:bg-success/20 h-10 flex items-center" title="Valider le nom"><Check className="w-4 h-4" /></button>
                                                    </div>
                                                </div>

                                                <div className="w-full">
                                                    <label className="block text-sm font-semibold text-text-base mb-1.5">Fréquence</label>
                                                    <select
                                                        value={rcp.frequency}
                                                        onChange={(e) => updateRcpDefinition({ ...rcp, frequency: e.target.value as any })}
                                                        className="text-sm border border-border rounded-btn h-10 px-3 bg-surface w-full cursor-pointer focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
                                                    >
                                                        <option value="WEEKLY">Hebdomadaire</option>
                                                        <option value="BIWEEKLY">1 Semaine sur 2</option>
                                                        <option value="MONTHLY">Mensuel (ex: 1er Lundi)</option>
                                                        <option value="MANUAL">Dates Manuelles</option>
                                                    </select>
                                                </div>
                                            </div>

                                            <div className="flex justify-end">
                                                <button
                                                    onClick={() => {
                                                        if (window.confirm(`Supprimer définitivement la RCP "${rcp.name}" et tout son historique ?`)) {
                                                            handleDeleteRcp(rcp.id);
                                                        }
                                                    }}
                                                    className="p-2 text-danger/50 hover:bg-danger/10 hover:text-danger rounded border border-transparent hover:border-danger/20 transition-colors"
                                                    title="Supprimer cette RCP"
                                                >
                                                    <Trash2 className="w-5 h-5" />
                                                </button>
                                            </div>

                                            {rcp.frequency === 'BIWEEKLY' && (
                                                <div className="bg-muted p-2 rounded-btn border border-border">
                                                    <label className="block text-sm font-semibold text-text-base mb-1.5">Parité Semaine (Annuelle)</label>
                                                    <div className="flex gap-2">
                                                        <button
                                                            onClick={() => updateRcpDefinition({ ...rcp, weekParity: 'ODD' })}
                                                            className={`px-3 py-1 text-xs rounded border ${rcp.weekParity === 'ODD' ? 'bg-surface border-secondary/30 text-secondary font-bold shadow-sm' : 'bg-transparent border-transparent text-text-muted hover:bg-surface'}`}
                                                        >
                                                            Impaire (Sem 1, 3...)
                                                        </button>
                                                        <button
                                                            onClick={() => updateRcpDefinition({ ...rcp, weekParity: 'EVEN' })}
                                                            className={`px-3 py-1 text-xs rounded border ${rcp.weekParity === 'EVEN' ? 'bg-surface border-secondary/30 text-secondary font-bold shadow-sm' : 'bg-transparent border-transparent text-text-muted hover:bg-surface'}`}
                                                        >
                                                            Paire (Sem 2, 4...)
                                                        </button>
                                                    </div>
                                                </div>
                                            )}

                                            {rcp.frequency === 'MONTHLY' && (
                                                <div className="bg-muted p-2 rounded-btn border border-border">
                                                    <label className="block text-sm font-semibold text-text-base mb-1.5">Occurrence dans le mois</label>
                                                    <div className="flex gap-1">
                                                        {[1, 2, 3, 4].map(num => (
                                                            <button
                                                                key={num}
                                                                onClick={() => updateRcpDefinition({ ...rcp, monthlyWeekNumber: num })}
                                                                className={`w-8 h-8 flex items-center justify-center text-xs rounded border ${rcp.monthlyWeekNumber === num ? 'bg-secondary border-secondary text-white font-bold' : 'bg-surface border-border text-text-muted hover:bg-muted'}`}
                                                            >
                                                                {num}
                                                            </button>
                                                        ))}
                                                    </div>
                                                    <p className="text-[10px] text-text-muted mt-1 italic">Ex: Si le créneau est le Lundi, "1" = 1er Lundi du mois.</p>
                                                </div>
                                            )}

                                            {rcp.frequency === 'MANUAL' && (
                                                <div className="bg-muted p-3 rounded-btn border border-border">
                                                    <h5 className="text-xs font-bold text-text-base mb-2 flex items-center">
                                                        <Calendar className="w-3 h-3 mr-1" /> Ajouter une date manuelle
                                                    </h5>

                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-2">
                                                        <div>
                                                            <label className="block text-sm font-semibold text-text-base mb-1.5">Date</label>
                                                            <input
                                                                type="date"
                                                                className={`text-sm border rounded-input h-10 px-3 w-full focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none ${manualHolidayWarning ? 'border-warning/40 bg-warning/10' : 'border-border'}`}
                                                                value={manualDateInput}
                                                                onChange={e => handleManualDateChange(e.target.value)}
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-sm font-semibold text-text-base mb-1.5">Heure</label>
                                                            <input
                                                                type="time"
                                                                className="text-sm border border-border rounded-btn h-10 px-3 w-full focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
                                                                value={manualTimeInput}
                                                                onChange={e => setManualTimeInput(e.target.value)}
                                                            />
                                                        </div>
                                                    </div>

                                                    {manualHolidayWarning && (
                                                        <div className="flex items-center text-[10px] text-warning mb-2 bg-warning/10 p-1 rounded border border-warning/20">
                                                            <AlertTriangle className="w-3 h-3 mr-1" />
                                                            {manualHolidayWarning}
                                                        </div>
                                                    )}

                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-2">
                                                        <div>
                                                            <label className="block text-sm font-semibold text-text-base mb-1.5">Responsable</label>
                                                            <select className="w-full text-sm border border-border rounded-btn h-10 px-3 focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none" value={manualLeadId} onChange={e => setManualLeadId(e.target.value)}>
                                                                <option value="">-- Choisir --</option>
                                                                {doctors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                                            </select>
                                                        </div>
                                                        <div>
                                                            <label className="block text-sm font-semibold text-text-base mb-1.5">Backup (Suppléant)</label>
                                                            <select className="w-full text-sm border border-border rounded-btn h-10 px-3 focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none" value={manualBackupId} onChange={e => setManualBackupId(e.target.value)}>
                                                                <option value="">-- Choisir --</option>
                                                                {doctors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                                            </select>
                                                        </div>
                                                        <div>
                                                            <label className="block text-sm font-semibold text-text-base mb-1.5">Intervenant 1</label>
                                                            <select className="w-full text-sm border border-border rounded-btn h-10 px-3 focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none" value={manualAssoc1Id} onChange={e => setManualAssoc1Id(e.target.value)}>
                                                                <option value="">-- Choisir --</option>
                                                                {doctors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                                            </select>
                                                        </div>
                                                        <div>
                                                            <label className="block text-sm font-semibold text-text-base mb-1.5">Intervenant 2</label>
                                                            <select className="w-full text-sm border border-border rounded-btn h-10 px-3 focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none" value={manualAssoc2Id} onChange={e => setManualAssoc2Id(e.target.value)}>
                                                                <option value="">-- Choisir --</option>
                                                                {doctors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                                            </select>
                                                        </div>
                                                    </div>

                                                    <button
                                                        onClick={() => handleAddManualInstance(rcp)}
                                                        disabled={!manualDateInput || !manualTimeInput || !manualLeadId}
                                                        className="w-full bg-primary text-white py-1.5 rounded-btn text-xs font-bold hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center mt-2"
                                                    >
                                                        <PlusCircle className="w-3 h-3 mr-1" /> Ajouter l'occurrence
                                                    </button>

                                                    <div className="mt-3 border-t border-border pt-2">
                                                        <label className="block text-sm font-semibold text-text-base mb-1.5">Dates Programmées</label>
                                                        <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
                                                            {rcp.manualInstances?.map((inst: RcpManualInstance) => (
                                                                <div key={inst.id} className="bg-surface px-2 py-1 rounded border border-border text-[10px] flex items-center shadow-sm w-full justify-between">
                                                                    <div className="flex items-center">
                                                                        <span className="font-bold mr-2 text-text-base">{inst.date.split('-').reverse().join('/')}</span>
                                                                        <span className="text-text-muted mr-2 flex items-center"><Clock className="w-3 h-3 mr-1" />{inst.time}</span>
                                                                        <span className="text-text-muted">({inst.doctorIds.length} méd.)</span>
                                                                    </div>
                                                                    <button
                                                                        onClick={() => handleRemoveManualInstance(rcp, inst.id)}
                                                                        className="text-text-muted hover:text-danger ml-2"
                                                                    >
                                                                        <X className="w-3 h-3" />
                                                                    </button>
                                                                </div>
                                                            ))}
                                                            {(!rcp.manualInstances || rcp.manualInstances.length === 0) && <span className="text-[10px] text-text-muted italic">Aucune occurrence planifiée</span>}
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )
                                })()}
                                </div>
                            </div>
                        </div>
                    </CardBody>
                </Card>
            )}

            {/* Auto-assignment global config */}
            {activeTab === SlotType.RCP && rcpViewMode === 'RULES' && (
                <Card className="mt-4">
                    <CardBody className="p-4 space-y-4">
                        <div>
                            <h3 className="font-heading font-bold text-xl text-text-base">Attribution automatique des RCP</h3>
                            <p className="text-sm text-text-muted mt-1">
                                Chaque semaine, si aucun médecin n'a confirmé avant l'heure limite,
                                le système tire au sort automatiquement. Ce planning s'applique aux 8 prochaines semaines.
                            </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
                            <div>
                                <label className="block text-sm font-semibold text-text-base mb-1.5">Jour du tirage</label>
                                <select value={autoConfigDay} onChange={e => setAutoConfigDay(e.target.value)}
                                    className="w-full border border-border rounded-btn h-12 md:h-10 px-3 text-sm bg-surface focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none">
                                    {['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'].map(d => (
                                        <option key={d}>{d}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-text-base mb-1.5">Heure du tirage</label>
                                <input type="time" value={autoConfigTime}
                                    onChange={e => setAutoConfigTime(e.target.value)}
                                    className="w-full border border-border rounded-btn h-12 md:h-10 px-3 text-sm bg-surface focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none" />
                            </div>
                            <button onClick={handleSaveAutoConfig} disabled={savingAutoConfig}
                                className="bg-primary text-white px-4 py-2 rounded-btn text-sm hover:bg-primary/90 disabled:opacity-50 font-medium whitespace-nowrap h-10 flex items-center justify-center md:col-span-2 w-full md:w-auto md:self-end">
                                {savingAutoConfig ? 'Application...' : 'Appliquer aux 8 prochaines semaines'}
                            </button>
                        </div>

                        <div className="border-t border-border pt-3">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-semibold text-text-muted uppercase tracking-wide">Planning configuré</span>
                                <button
                                    onClick={handleCancelAllRcpAutoAssignments}
                                    disabled={cancellingWeek !== null}
                                    className="flex items-center gap-1.5 text-xs bg-danger/10 text-danger border border-danger/20 px-3 py-1.5 rounded-btn hover:bg-danger/20 font-medium transition-colors disabled:opacity-50"
                                >
                                    <RotateCcw size={12} /> {cancellingWeek === 'all' ? 'Annulation...' : 'Annuler toutes'}
                                </button>
                            </div>
                            {rcpAutoConfigs.length > 0 && (
                                <div className="flex items-center gap-2 mb-3 p-2 bg-warning/5 border border-warning/20 rounded-btn">
                                    <select
                                        value={launchWeekDate}
                                        onChange={e => setLaunchWeekDate(e.target.value)}
                                        className="flex-1 border border-border rounded px-2 py-1.5 text-xs bg-surface focus:border-warning focus:outline-none"
                                    >
                                        <option value="">— Choisir une semaine —</option>
                                        {rcpAutoConfigs.map(c => (
                                            <option key={c.id} value={c.weekStartDate}>
                                                Semaine du {new Date(c.weekStartDate + 'T12:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                {c.executedAt ? ' ✓' : ''}
                                            </option>
                                        ))}
                                    </select>
                                    <button
                                        disabled={!launchWeekDate}
                                        onClick={async () => {
                                            if (!launchWeekDate) return;
                                            const weekLabel = new Date(launchWeekDate + 'T12:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
                                            const confirmed = window.confirm(
                                                `⚠️ Attribution automatique RCP\n\nVous allez lancer l'attribution automatique pour la semaine du ${weekLabel}.\n\nCette action assignera automatiquement les médecins aux créneaux RCP selon la configuration. Confirmez-vous ?`
                                            );
                                            if (!confirmed) return;
                                            try {
                                                await triggerAutoAssignNow(launchWeekDate);
                                                const updated = await getRcpAutoConfigs();
                                                setRcpAutoConfigs(updated);
                                                setLaunchWeekDate('');
                                                alert('✅ Attribution lancée avec succès.');
                                            } catch (err: any) {
                                                console.error('triggerAutoAssignNow error:', err);
                                                alert(`❌ Erreur lors du lancement : ${err?.message ?? 'Vérifiez la console pour plus de détails.'}`);
                                            }
                                        }}
                                        className="flex items-center gap-1.5 text-xs bg-warning text-white px-3 py-1.5 rounded-btn hover:bg-warning/90 font-medium disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap">
                                        <RefreshCw size={12} /> Lancer maintenant
                                    </button>
                                </div>
                            )}

                            <div className="space-y-1.5">
                                {rcpAutoConfigs.length === 0 && (
                                    <p className="text-sm text-text-muted italic">Aucune configuration. Cliquez sur "Appliquer aux 8 prochaines semaines".</p>
                                )}
                                {rcpAutoConfigs.map(c => (
                                    <div key={c.id}
                                        className="flex items-center justify-between bg-surface rounded-btn p-2.5 text-sm border border-border">
                                        <div>
                                            <span className="font-medium text-text-base">Semaine du {new Date(c.weekStartDate + 'T12:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                                            <span className="text-text-muted ml-3 text-xs">
                                                Tirage le {new Date(c.deadlineAt).toLocaleString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {c.executedAt
                                                ? <span className="text-success text-xs font-medium bg-success/10 px-2 py-0.5 rounded-full">✓ Exécuté</span>
                                                : <span className="text-text-muted text-xs bg-muted px-2 py-0.5 rounded-full">En attente</span>
                                            }
                                            {c.executedAt && (
                                                <button
                                                    onClick={() => handleCancelWeek(c.weekStartDate)}
                                                    disabled={cancellingWeek !== null || deletingWeek !== null}
                                                    title="Réinitialiser les assignations de cette semaine"
                                                    className="text-warning/70 hover:text-warning disabled:opacity-40 transition-colors"
                                                >
                                                    {cancellingWeek === c.weekStartDate
                                                        ? <RefreshCw size={13} className="animate-spin" />
                                                        : <RotateCcw size={13} />
                                                    }
                                                </button>
                                            )}
                                            <button
                                                onClick={() => handleDeleteWeekConfig(c.weekStartDate)}
                                                disabled={cancellingWeek !== null || deletingWeek !== null}
                                                title="Supprimer cette configuration"
                                                className="text-danger/50 hover:text-danger disabled:opacity-40 transition-colors"
                                            >
                                                {deletingWeek === c.weekStartDate
                                                    ? <RefreshCw size={13} className="animate-spin" />
                                                    : <Trash2 size={13} />
                                                }
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </CardBody>
                </Card>
            )}

            {/* CALENDAR CONTROLS */}
            {activeTab === SlotType.RCP && rcpViewMode === 'CALENDAR' && (
                <div className="bg-gradient-to-r from-secondary/10 to-surface p-3 rounded-card border border-secondary/20 mb-4 flex items-center justify-between shadow-sm">
                    <div className="flex items-center space-x-4">
                        <button
                            onClick={() => {
                                const d = new Date(currentCalendarDate);
                                d.setDate(d.getDate() - 7);
                                setCurrentCalendarDate(d);
                            }}
                            className="p-2 hover:bg-secondary/10 rounded-btn transition-colors"
                        >
                            <ChevronLeft className="w-5 h-5 text-secondary" />
                        </button>
                        <div className="text-center">
                            <h3 className="font-heading font-bold text-text-base text-sm capitalize">
                                Semaine du {currentCalendarWeekStart.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                            </h3>
                        </div>
                        <button
                            onClick={() => {
                                const d = new Date(currentCalendarDate);
                                d.setDate(d.getDate() + 7);
                                setCurrentCalendarDate(d);
                            }}
                            className="p-2 hover:bg-secondary/10 rounded-btn transition-colors"
                        >
                            <ChevronRight className="w-5 h-5 text-secondary" />
                        </button>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="text-xs text-text-muted italic hidden md:block">
                            Cliquez sur une RCP pour modifier
                        </div>
                        <button
                            onClick={() => setIsFullscreen(!isFullscreen)}
                            className="p-2 hover:bg-secondary/10 rounded-btn transition-colors text-secondary"
                            title={isFullscreen ? "Réduire" : "Agrandir"}
                        >
                            {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
                        </button>
                    </div>
                </div>
            )}

            {/* MAIN GRID - with fullscreen support (only for RCP Calendar view) */}
            <div
                className={`${isFullscreen && activeTab === SlotType.RCP && rcpViewMode === 'CALENDAR' ? 'fixed inset-0 z-50 p-4 bg-muted' : 'flex-1'} overflow-auto bg-surface rounded-card shadow border border-border`}
                ref={tableContainerRef}
            >
                {/* Fullscreen header - only shown for RCP Calendar */}
                {isFullscreen && activeTab === SlotType.RCP && rcpViewMode === 'CALENDAR' && (
                    <div className="flex justify-between items-center mb-4 gradient-primary text-white p-4 rounded-card shadow-lg">
                        <div>
                            <h2 className="text-xl font-bold">Vue RCP - Calendrier</h2>
                            <p className="text-white/70 text-sm">Semaine du {currentCalendarWeekStart.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                        </div>
                        <div className="flex items-center gap-4">
                            <button
                                onClick={() => {
                                    const d = new Date(currentCalendarDate);
                                    d.setDate(d.getDate() - 7);
                                    setCurrentCalendarDate(d);
                                }}
                                className="p-2 bg-white/20 hover:bg-white/30 rounded-btn"
                            >
                                <ChevronLeft className="w-5 h-5" />
                            </button>
                            <button
                                onClick={() => {
                                    const d = new Date(currentCalendarDate);
                                    d.setDate(d.getDate() + 7);
                                    setCurrentCalendarDate(d);
                                }}
                                className="p-2 bg-white/20 hover:bg-white/30 rounded-btn"
                            >
                                <ChevronRight className="w-5 h-5" />
                            </button>
                            <button
                                onClick={() => setIsFullscreen(false)}
                                className="p-2 bg-white/20 hover:bg-white/30 rounded-btn"
                            >
                                <Minimize2 className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                )}

                {rows.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-48 text-text-muted">
                        <AlertCircle className="w-8 h-8 mb-2 opacity-50" />
                        <p className="text-sm">Aucun élément à afficher.</p>
                        <p className="text-xs">Utilisez le panneau ci-dessus pour ajouter des RCP ou des Postes.</p>
                    </div>
                ) : (
                    <div className={`min-w-[800px] ${isFullscreen ? 'bg-surface rounded-card p-2' : ''}`}>
                        <table className="w-full border-collapse table-fixed">
                            <thead>
                                <tr>
                                    <th className={`p-3 border-b-2 border-r-2 bg-muted w-44 text-left text-xs font-bold text-text-muted uppercase sticky left-0 z-20 ${activeTab === SlotType.RCP ? 'border-secondary/20' : 'border-primary/20'}`}>
                                        {activeTab === SlotType.RCP ? 'RCP / Période' : 'Lieu / Période'}
                                    </th>
                                    {days.map(day => (
                                        <th key={day} className={`p-3 border-b-2 border-r bg-muted/50 text-text-base font-bold uppercase text-xs w-1/5 min-w-[160px] ${activeTab === SlotType.RCP ? 'border-secondary/20' : 'border-primary/20'}`}>
                                            {day}
                                            {activeTab === SlotType.RCP && rcpViewMode === 'CALENDAR' && (
                                                <div className="font-normal text-[10px] text-secondary/60 mt-1 bg-secondary/10 px-2 py-0.5 rounded inline-block">
                                                    {getDateForDayOfWeek(currentCalendarWeekStart, day).split('-').slice(1).reverse().join('/')}
                                                </div>
                                            )}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((row, rowIndex) => (
                                    <React.Fragment key={row.id}>
                                        {/* Morning */}
                                        <tr className={rowIndex > 0 && activeTab === SlotType.RCP ? 'border-t-4 border-secondary/20' : ''}>
                                            <td className={`p-3 border-r-2 text-xs sticky left-0 z-10 group relative ${activeTab === SlotType.RCP ? 'bg-secondary/10 border-secondary/20' : 'bg-primary/5 border-primary/20'}`}>
                                                <div className="flex justify-between items-start">
                                                    <span className={`font-bold ${activeTab === SlotType.RCP ? 'text-secondary-text' : 'text-primary-text'}`}>{row.name}</span>
                                                    {editMode && row.type === 'RCP' && (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                if (window.confirm(`Supprimer la RCP "${row.name}" ?`)) handleDeleteRcp(row.id);
                                                            }}
                                                            className="text-text-muted hover:text-danger p-1 z-50 relative bg-surface rounded-full shadow-sm"
                                                            title={`Supprimer la ligne ${row.name}`}
                                                        >
                                                            <Trash2 className="w-3 h-3" />
                                                        </button>
                                                    )}
                                                    {editMode && row.type === 'POSTE' && (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleDeletePoste(row.id);
                                                            }}
                                                            className="text-text-muted hover:text-danger p-1 z-50 relative bg-surface rounded-full shadow-sm"
                                                            title={`Supprimer la ligne ${row.name}`}
                                                        >
                                                            <Trash2 className="w-3 h-3" />
                                                        </button>
                                                    )}
                                                </div>
                                                <span className="block font-medium text-warning mt-1 bg-warning/10 px-1.5 py-0.5 rounded text-[10px] inline-block">☀️ Matin</span>
                                            </td>
                                            {days.map(day => (
                                                <td key={`${day}-matin`} className="border-r border-b p-1 h-24 relative bg-surface">
                                                    {activeTab === SlotType.RCP && rcpViewMode === 'CALENDAR'
                                                        ? renderCalendarCell(day, Period.MORNING, row.name)
                                                        : renderConfigCell(day, Period.MORNING, row.name)
                                                    }
                                                </td>
                                            ))}
                                        </tr>
                                        {/* Afternoon */}
                                        <tr>
                                            <td className={`p-3 border-r-2 text-xs sticky left-0 z-10 font-normal ${activeTab === SlotType.RCP ? 'bg-secondary/5 border-secondary/20' : 'bg-primary/5 border-primary/20'}`}>
                                                <span className="block font-medium text-primary px-1.5 py-0.5 rounded text-[10px] inline-block">🌙 Après-midi</span>
                                            </td>
                                            {days.map(day => (
                                                <td key={`${day}-apres-midi`} className="border-r p-1 h-24 bg-muted/50 relative">
                                                    {activeTab === SlotType.RCP && rcpViewMode === 'CALENDAR'
                                                        ? renderCalendarCell(day, Period.AFTERNOON, row.name)
                                                        : renderConfigCell(day, Period.AFTERNOON, row.name)
                                                    }
                                                </td>
                                            ))}
                                        </tr>
                                    </React.Fragment>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {selectedExceptionSlot && (
                <RcpExceptionModal
                    slot={selectedExceptionSlot}
                    doctors={doctors}
                    existingException={rcpExceptions.find(ex => {
                        const parts = selectedExceptionSlot.id.split('-');
                        const originalDate = parts.slice(parts.length - 3).join('-');
                        const templateId = parts.slice(0, parts.length - 3).join('-');
                        return ex.rcpTemplateId === templateId && ex.originalDate === originalDate;
                    })}
                    onSave={handleSaveException}
                    onClose={() => setSelectedExceptionSlot(null)}
                    onRemoveException={() => {
                        const parts = selectedExceptionSlot.id.split('-');
                        const originalDate = parts.slice(parts.length - 3).join('-');
                        const templateId = parts.slice(0, parts.length - 3).join('-');
                        removeRcpException(templateId, originalDate);
                        setSelectedExceptionSlot(null);
                    }}
                />
            )}
        </div>
    );
};

export default Configuration;
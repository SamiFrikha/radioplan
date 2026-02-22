import React, { useContext, useState, useEffect, useMemo, useRef } from 'react';
import { AppContext } from '../App';
import { DayOfWeek, Period, SlotType, RcpException, ScheduleSlot, RcpManualInstance } from '../types';
import { Save, RefreshCw, LayoutTemplate, PlusCircle, Clock, Trash2, Check, X, MapPin, AlertCircle, Shield, Settings, Unlock, Lock, Calendar, ChevronLeft, ChevronRight, Edit3, AlertTriangle, UserPlus, Maximize2, Minimize2 } from 'lucide-react';
import { generateScheduleForWeek, getDateForDayOfWeek, isFrenchHoliday } from '../services/scheduleService';
import RcpExceptionModal from '../components/RcpExceptionModal';
import { DoctorBadge, getDoctorHexColor } from '../components/DoctorBadge';


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
        createNewCountingPeriod
    } = useContext(AppContext);

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
                <div className="bg-gray-100 h-full flex items-center justify-center p-2 text-center border border-gray-200">
                    <span className="text-[10px] text-gray-400 uppercase font-bold">Fermé (RCP Service)</span>
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
                <div className={`p-2 h-full flex flex-col justify-start items-center space-y-2 border min-h-[160px] relative group ${slot ? 'bg-white border-blue-300' : 'bg-slate-50 border-dashed border-slate-300'}`}>
                    {slot && (
                        <button
                            onClick={() => handleDeleteSlot(day, period, location)}
                            className="absolute top-1 right-1 text-red-300 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity p-1 z-20 bg-white rounded-full shadow-sm"
                            title="Supprimer ce créneau"
                        >
                            <Trash2 className="w-3 h-3" />
                        </button>
                    )}

                    {!slot && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <span className="text-[9px] text-slate-300 font-medium">+ Ajouter</span>
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
                                    className="w-full text-[10px] p-1 border rounded bg-white focus:ring-1 focus:ring-blue-500 h-6"
                                >
                                    <option value="">{idx === 0 ? '-- Responsable --' : '-- Autre --'}</option>
                                    {doctors.map(d => (
                                        <option key={d.id} value={d.id}>{d.name}</option>
                                    ))}
                                </select>
                            ))}
                            <div className="flex items-center space-x-1 border-t pt-1 border-slate-100">
                                <Shield className="w-3 h-3 text-slate-400" />
                                <select
                                    value={slot?.backupDoctorId || ''}
                                    onChange={(e) => handleUpdateSlot(day, period, location, 'backupDoctorId', e.target.value)}
                                    className="w-full text-[10px] p-1 border rounded bg-slate-50 focus:ring-1 focus:ring-blue-500 h-6 text-slate-600"
                                >
                                    <option value="">-- Backup --</option>
                                    {doctors.map(d => (
                                        <option key={d.id} value={d.id}>{d.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex items-center space-x-1 pt-1">
                                <Clock className={`w-3 h-3 ${isTimeWarning ? 'text-orange-500' : 'text-slate-400'}`} />
                                <input
                                    type="time"
                                    value={slot?.time || ''}
                                    onChange={(e) => handleUpdateSlot(day, period, location, 'time', e.target.value)}
                                    className={`w-full text-xs p-1 border rounded ${isTimeWarning ? 'border-orange-300 bg-orange-50' : ''}`}
                                />
                            </div>
                            <div className="flex items-center space-x-2 pt-1">
                                <button
                                    onClick={() => handleUpdateSlot(day, period, location, 'isBlocking', slot?.isBlocking === false ? true : false)}
                                    className={`flex items-center text-[9px] px-2 py-1 rounded border w-full justify-center transition-colors ${slot?.isBlocking !== false
                                        ? 'bg-red-50 text-red-700 border-red-200 font-bold'
                                        : 'bg-green-50 text-green-700 border-green-200'
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
                            className="w-full text-xs p-1 border rounded bg-white focus:ring-2 focus:ring-blue-500 z-10"
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

        if (!slot) return <div className="text-[10px] text-slate-300 text-center py-4">--</div>;

        return (
            <div className="p-2 h-full flex flex-col justify-center items-center">
                {currentDocIds.length > 0 ? (
                    <div className="flex flex-col space-y-1.5 w-full">
                        {currentDocIds.map((docId, idx) => {
                            const doc = doctors.find(d => d.id === docId);
                            if (!doc) return null;
                            return (
                                <div key={docId} className="flex items-center justify-start px-2 py-1.5 rounded-lg bg-white border border-slate-200 shadow-sm">
                                    <div
                                        className="w-6 h-6 rounded-full mr-2 flex-shrink-0 flex items-center justify-center text-white text-[9px] font-bold"
                                        style={{ backgroundColor: getDoctorHexColor(doc.color) }}
                                    >
                                        {doc.name.substring(0, 2)}
                                    </div>
                                    <span className={`text-[11px] font-semibold leading-tight truncate ${idx === 0 ? 'text-slate-800' : 'text-slate-600'}`}>
                                        {doc.name}
                                    </span>
                                </div>
                            )
                        })}
                        {slot.backupDoctorId && (
                            <div className="flex items-center justify-center space-x-1 mt-1 pt-1 border-t border-slate-100">
                                <Shield className="w-3 h-3 text-amber-400" />
                                <span className="text-[9px] text-amber-600 font-medium">
                                    Backup: {doctors.find(d => d.id === slot.backupDoctorId)?.name || '?'}
                                </span>
                            </div>
                        )}
                        {slot.type === SlotType.RCP && (
                            <div className="mt-1 flex flex-col items-center">
                                <span className="text-[9px] bg-purple-50 text-purple-700 px-1 rounded border border-purple-100 mb-0.5">
                                    {slot.time || 'N/A'}
                                </span>
                            </div>
                        )}
                    </div>
                ) : (
                    <span className="text-xs text-slate-400 italic">Libre</span>
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
                <div className="h-full w-full bg-pink-50 flex items-center justify-center border border-pink-200 flex-col opacity-80 min-h-[70px]">
                    <span className="text-[10px] text-pink-400 font-bold uppercase tracking-wider">Férié</span>
                    <span className="text-[9px] text-pink-300 text-center px-1 leading-tight">{holiday.name}</span>
                </div>
            )
        }

        if (!slot) return <div className="text-xs text-slate-300 p-2 text-center h-full flex items-center justify-center bg-slate-50/50 min-h-[70px]">--</div>;

        // If RCP falls on a holiday, show it with a warning indicator (allows admin to move it)
        if (holiday && slot) {
            const allDoctorIds = [slot.assignedDoctorId, ...(slot.secondaryDoctorIds || [])].filter(Boolean);
            return (
                <div
                    onClick={() => setSelectedExceptionSlot(slot)}
                    className="p-2 h-full border-2 rounded-lg cursor-pointer transition-all hover:shadow-lg group relative flex flex-col bg-gradient-to-br from-orange-50 to-pink-50 border-orange-300 hover:border-orange-500 min-h-[70px] animate-pulse-subtle"
                >
                    {/* Holiday warning badge */}
                    <div className="absolute -top-1 -right-1 z-10">
                        <div className="bg-orange-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full shadow-sm">
                            ⚠️ FÉRIÉ
                        </div>
                    </div>

                    <div className="absolute top-1 left-1 opacity-0 group-hover:opacity-100 transition-opacity text-xs text-orange-600 font-bold">
                        Déplacer →
                    </div>

                    {/* Holiday name */}
                    <div className="text-[9px] font-bold text-orange-700 bg-orange-100 px-1 py-0.5 rounded self-start mb-1 border border-orange-200">
                        📅 {holiday.name}
                    </div>

                    {/* Time badge */}
                    <div className="text-[10px] font-bold text-purple-600 mb-1 flex items-center bg-purple-100 px-1.5 py-0.5 rounded self-start">
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
                                    <span className={`text-[9px] truncate ${idx === 0 ? 'font-bold text-slate-800' : 'text-slate-600'}`}>
                                        {d.name}
                                    </span>
                                </div>
                            )
                        })}
                        {allDoctorIds.length > 2 && (
                            <span className="text-[8px] text-slate-400">+{allDoctorIds.length - 2} autre(s)</span>
                        )}
                    </div>

                    {/* Action hint */}
                    <div className="mt-auto pt-1 border-t border-orange-200">
                        <span className="text-[8px] text-orange-600 font-medium">Cliquer pour déplacer</span>
                    </div>
                </div>
            );
        }

        // Handle cancelled RCPs
        if (slot.isCancelled) {
            return (
                <div
                    onClick={() => setSelectedExceptionSlot(slot)}
                    className="p-2 h-full border-2 rounded-lg cursor-pointer transition-all hover:shadow-lg group relative flex flex-col items-center justify-center bg-gradient-to-br from-red-50 to-white border-red-200 hover:border-red-400 min-h-[70px] opacity-80"
                >
                    <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Edit3 className="w-3 h-3 text-red-400" />
                    </div>
                    <X className="w-6 h-6 text-red-400 mb-1" />
                    <span className="text-[10px] font-bold text-red-600 uppercase">Annulée</span>
                    <span className="text-[9px] text-red-400 mt-1">Cliquer pour réactiver</span>
                </div>
            )
        }

        const allDoctorIds = [slot.assignedDoctorId, ...(slot.secondaryDoctorIds || [])].filter(Boolean);

        return (
            <div
                onClick={() => setSelectedExceptionSlot(slot)}
                className="p-2 h-full border-2 rounded-lg cursor-pointer transition-all hover:shadow-lg group relative flex flex-col bg-gradient-to-br from-purple-50 to-white border-purple-200 hover:border-purple-400 min-h-[70px]"
            >
                <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Edit3 className="w-3 h-3 text-purple-400" />
                </div>

                {/* Time badge */}
                <div className="text-[10px] font-bold text-purple-600 mb-2 flex items-center bg-purple-100 px-1.5 py-0.5 rounded self-start">
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
                                <span className={`text-[10px] truncate ${idx === 0 ? 'font-bold text-slate-800' : 'text-slate-600'}`}>
                                    {d.name}
                                </span>
                            </div>
                        )
                    })}
                    {allDoctorIds.length === 0 && (
                        <span className="text-[9px] text-slate-400 italic">Non assigné</span>
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
        <div className="h-full flex flex-col space-y-4 pb-20">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center">
                <div className="mb-4 md:mb-0">
                    <h1 className="text-lg md:text-2xl font-bold text-slate-800 flex items-center">
                        <LayoutTemplate className="w-5 h-5 md:w-6 md:h-6 mr-2 md:mr-3 text-purple-600" />
                        Règles & Postes
                    </h1>
                    <p className="text-xs md:text-sm text-slate-500 mt-1 max-w-2xl hidden sm:block">
                        Définissez les postes fixes (Consultations) et les RCP hebdomadaires.
                    </p>
                </div>

                <div className="flex items-center space-x-2">
                    {rcpViewMode === 'RULES' && (
                        editMode ? (
                            <>
                                <button onClick={cancelChanges} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">
                                    Annuler
                                </button>
                                <button onClick={saveChanges} className="px-4 py-2 bg-green-600 text-white rounded-lg shadow hover:bg-green-700 flex items-center text-sm font-medium">
                                    <Save className="w-4 h-4 mr-2" />
                                    Sauvegarder
                                </button>
                            </>
                        ) : (
                            <button onClick={() => setEditMode(true)} className="px-4 py-2 bg-blue-600 text-white rounded-lg shadow hover:bg-blue-700 flex items-center text-sm font-medium">
                                <RefreshCw className="w-4 h-4 mr-2" />
                                Modifier la Semaine Type
                            </button>
                        )
                    )}
                </div>
            </div>

            {/* START DATE SETTING */}
            <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div className="flex items-center">
                        <Calendar className="w-5 h-5 mr-3 text-slate-500" />
                        <div>
                            <h3 className="text-sm font-bold text-slate-700">Date de début de comptage des activités</h3>
                            <p className="text-xs text-slate-500 mt-0.5">L'équité automatique (Unity/Astreinte/Workflow) sera calculée à partir de cette date.</p>
                        </div>
                    </div>
                    <div className="flex items-center space-x-2 w-full md:w-auto">
                        {activitiesStartDate ? (
                            <div className="flex items-center gap-3 bg-green-50 border border-green-200 px-4 py-2 rounded-lg">
                                <div className="text-center">
                                    <div className="text-xs text-green-600 font-bold uppercase">Date confirmée</div>
                                    <div className="text-lg font-bold text-green-800">
                                        {new Date(activitiesStartDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                                    </div>
                                </div>
                                <button
                                    onClick={() => {
                                        if (window.confirm('⚠️ ATTENTION !\n\nSupprimer la date de début réinitialisera le calcul d\'équité.\n\nÊtes-vous sûr de vouloir effacer cette date ?')) {
                                            setActivitiesStartDate(null);
                                        }
                                    }}
                                    className="text-red-500 hover:text-red-700 p-1 hover:bg-red-100 rounded"
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
                                    className="border rounded-md px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 flex-1"
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
                                    className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-bold hover:bg-blue-700 flex items-center justify-center gap-2 whitespace-nowrap"
                                >
                                    <Check className="w-4 h-4" /> Confirmer la date
                                </button>
                            </div>
                        )}
                    </div>
                </div>
                {!activitiesStartDate && (
                    <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                        <div className="flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                            <div className="text-xs text-yellow-700">
                                <strong>Important :</strong> Sans date de début, l'équité ne sera pas calculée automatiquement.
                                Définissez une date pour activer le calcul équitable des affectations.
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-4 items-center justify-between">
                <div className="flex gap-2">
                    <button
                        onClick={() => setActiveTab(SlotType.CONSULTATION)}
                        className={`px-2 md:px-4 py-1.5 md:py-2 text-xs md:text-sm font-medium rounded-full transition-colors ${activeTab === SlotType.CONSULTATION ? 'bg-blue-100 text-blue-700' : 'text-slate-600 hover:bg-slate-100'}`}
                    >
                        <span className="hidden md:inline">Consultations & Postes</span>
                        <span className="md:hidden">Consult.</span>
                    </button>
                    <button
                        onClick={() => setActiveTab(SlotType.RCP)}
                        className={`px-2 md:px-4 py-1.5 md:py-2 text-xs md:text-sm font-medium rounded-full transition-colors ${activeTab === SlotType.RCP ? 'bg-purple-100 text-purple-700' : 'text-slate-600 hover:bg-slate-100'}`}
                    >
                        <span className="hidden md:inline">RCP (Gestion)</span>
                        <span className="md:hidden">RCP</span>
                    </button>
                </div>

                {activeTab === SlotType.RCP && (
                    <div className="flex bg-slate-100 p-1 rounded-lg mt-2 md:mt-0">
                        <button
                            onClick={() => setRcpViewMode('RULES')}
                            className={`px-3 py-1 text-xs font-bold rounded ${rcpViewMode === 'RULES' ? 'bg-white shadow text-purple-700' : 'text-slate-500'}`}
                        >
                            Vue Règles
                        </button>
                        <button
                            onClick={() => setRcpViewMode('CALENDAR')}
                            className={`px-3 py-1 text-xs font-bold rounded ${rcpViewMode === 'CALENDAR' ? 'bg-white shadow text-purple-700' : 'text-slate-500'}`}
                        >
                            Vue Calendrier (Réel)
                        </button>
                    </div>
                )}
            </div>

            {activeTab === SlotType.CONSULTATION && editMode && (
                <div className="bg-white rounded-lg border border-slate-200 p-4 mb-4 animate-in fade-in slide-in-from-top-2">
                    <h3 className="font-bold text-slate-700 mb-3 flex items-center">
                        <MapPin className="w-4 h-4 mr-2" />
                        Gestion des Lieux / Postes
                    </h3>
                    <div className="flex flex-wrap gap-2">
                        {postes.map(poste => (
                            <div key={poste} className="flex items-center bg-blue-50 px-3 py-1 rounded-full border border-blue-200 text-sm">
                                <span className="text-blue-800 font-medium mr-2">{poste}</span>
                                <button onClick={() => handleDeletePoste(poste)} className="text-blue-400 hover:text-red-600">
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
                                className="text-sm p-1 border rounded-l focus:outline-none focus:ring-1 focus:ring-blue-500 w-32 md:w-40"
                                onKeyDown={e => e.key === 'Enter' && handleAddPoste()}
                            />
                            <button onClick={handleAddPoste} disabled={!newPosteName} className="bg-blue-600 text-white p-1.5 rounded-r hover:bg-blue-700">
                                <PlusCircle className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === SlotType.RCP && rcpViewMode === 'RULES' && (
                <div className="bg-white rounded-lg border border-slate-200 p-4 mb-4 shadow-sm">
                    <div className="flex justify-between items-center mb-4 border-b pb-2">
                        <h3 className="font-bold text-slate-700 flex items-center">
                            <Settings className="w-4 h-4 mr-2" />
                            Gestion des Lignes RCP
                        </h3>
                    </div>

                    <div className="flex flex-col md:flex-row gap-6">
                        <div className="flex-1">
                            <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">Ajouter une nouvelle ligne</h4>
                            <div className="flex items-center space-x-2">
                                <input
                                    type="text"
                                    placeholder="Nom de la RCP..."
                                    className="flex-1 text-sm p-2 border rounded focus:ring-2 focus:ring-purple-500 outline-none"
                                    value={newRcpName}
                                    onChange={e => setNewRcpName(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleAddRcp()}
                                />
                                <button onClick={handleAddRcp} disabled={!newRcpName} className="bg-purple-600 text-white p-2 rounded hover:bg-purple-700 disabled:opacity-50 transition-colors">
                                    <PlusCircle className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        <div className="w-px bg-slate-200 hidden md:block"></div>

                        <div className="flex-[2]">
                            <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">Modifier les propriétés</h4>

                            <div className="flex flex-col md:flex-row items-start md:space-x-4 space-y-4 md:space-y-0">
                                <div className="flex-1 max-w-xs w-full">
                                    <select
                                        value={selectedRcpId}
                                        onChange={(e) => {
                                            setSelectedRcpId(e.target.value);
                                            const r = rcpTypes.find(x => x.id === e.target.value);
                                            if (r) setTempRcpName(r.name);
                                        }}
                                        className="w-full p-2 border rounded text-sm bg-slate-50 font-medium focus:ring-2 focus:ring-purple-500 outline-none cursor-pointer"
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
                                            <div className="flex flex-col md:flex-row items-end gap-3">
                                                <div className="w-full md:w-auto">
                                                    <label className="block text-[10px] text-slate-400 font-bold mb-1">Renommer</label>
                                                    <div className="flex items-center space-x-1">
                                                        <input
                                                            type="text"
                                                            value={tempRcpName}
                                                            onChange={e => setTempRcpName(e.target.value)}
                                                            className="w-full md:w-32 text-sm p-1.5 border rounded"
                                                        />
                                                        <button onClick={() => saveEditRcp(rcp)} className="p-1.5 bg-green-100 text-green-700 rounded hover:bg-green-200" title="Valider le nom"><Check className="w-4 h-4" /></button>
                                                    </div>
                                                </div>

                                                <div className="w-full md:w-auto">
                                                    <label className="block text-[10px] text-slate-400 font-bold mb-1">Fréquence</label>
                                                    <select
                                                        value={rcp.frequency}
                                                        onChange={(e) => updateRcpDefinition({ ...rcp, frequency: e.target.value as any })}
                                                        className="text-xs p-2 border rounded bg-white w-full md:w-36 cursor-pointer"
                                                    >
                                                        <option value="WEEKLY">Hebdomadaire</option>
                                                        <option value="BIWEEKLY">1 Semaine sur 2</option>
                                                        <option value="MONTHLY">Mensuel (ex: 1er Lundi)</option>
                                                        <option value="MANUAL">Dates Manuelles</option>
                                                    </select>
                                                </div>

                                                <div className="ml-auto">
                                                    <button
                                                        onClick={() => {
                                                            if (window.confirm(`Supprimer définitivement la RCP "${rcp.name}" et tout son historique ?`)) {
                                                                handleDeleteRcp(rcp.id);
                                                            }
                                                        }}
                                                        className="p-2 text-red-400 hover:bg-red-50 hover:text-red-600 rounded border border-transparent hover:border-red-200 transition-colors"
                                                        title="Supprimer cette RCP"
                                                    >
                                                        <Trash2 className="w-5 h-5" />
                                                    </button>
                                                </div>
                                            </div>

                                            {rcp.frequency === 'BIWEEKLY' && (
                                                <div className="bg-slate-50 p-2 rounded border border-slate-200">
                                                    <label className="block text-[10px] text-slate-400 font-bold mb-1">Parité Semaine (Annuelle)</label>
                                                    <div className="flex gap-2">
                                                        <button
                                                            onClick={() => updateRcpDefinition({ ...rcp, weekParity: 'ODD' })}
                                                            className={`px-3 py-1 text-xs rounded border ${rcp.weekParity === 'ODD' ? 'bg-white border-purple-300 text-purple-700 font-bold shadow-sm' : 'bg-transparent border-transparent text-slate-500 hover:bg-white'}`}
                                                        >
                                                            Impaire (Sem 1, 3...)
                                                        </button>
                                                        <button
                                                            onClick={() => updateRcpDefinition({ ...rcp, weekParity: 'EVEN' })}
                                                            className={`px-3 py-1 text-xs rounded border ${rcp.weekParity === 'EVEN' ? 'bg-white border-purple-300 text-purple-700 font-bold shadow-sm' : 'bg-transparent border-transparent text-slate-500 hover:bg-white'}`}
                                                        >
                                                            Paire (Sem 2, 4...)
                                                        </button>
                                                    </div>
                                                </div>
                                            )}

                                            {rcp.frequency === 'MONTHLY' && (
                                                <div className="bg-slate-50 p-2 rounded border border-slate-200">
                                                    <label className="block text-[10px] text-slate-400 font-bold mb-1">Occurrence dans le mois</label>
                                                    <div className="flex gap-1">
                                                        {[1, 2, 3, 4].map(num => (
                                                            <button
                                                                key={num}
                                                                onClick={() => updateRcpDefinition({ ...rcp, monthlyWeekNumber: num })}
                                                                className={`w-8 h-8 flex items-center justify-center text-xs rounded border ${rcp.monthlyWeekNumber === num ? 'bg-purple-600 border-purple-600 text-white font-bold' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'}`}
                                                            >
                                                                {num}
                                                            </button>
                                                        ))}
                                                    </div>
                                                    <p className="text-[10px] text-slate-400 mt-1 italic">Ex: Si le créneau est le Lundi, "1" = 1er Lundi du mois.</p>
                                                </div>
                                            )}

                                            {rcp.frequency === 'MANUAL' && (
                                                <div className="bg-slate-50 p-3 rounded border border-slate-200">
                                                    <h5 className="text-xs font-bold text-slate-700 mb-2 flex items-center">
                                                        <Calendar className="w-3 h-3 mr-1" /> Ajouter une date manuelle
                                                    </h5>

                                                    <div className="grid grid-cols-2 gap-2 mb-2">
                                                        <div>
                                                            <label className="text-[9px] text-slate-400 uppercase font-bold">Date</label>
                                                            <input
                                                                type="date"
                                                                className={`text-xs border rounded p-1 w-full ${manualHolidayWarning ? 'border-orange-300 bg-orange-50' : 'border-slate-300'}`}
                                                                value={manualDateInput}
                                                                onChange={e => handleManualDateChange(e.target.value)}
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="text-[9px] text-slate-400 uppercase font-bold">Heure</label>
                                                            <input
                                                                type="time"
                                                                className="text-xs border rounded p-1 w-full border-slate-300"
                                                                value={manualTimeInput}
                                                                onChange={e => setManualTimeInput(e.target.value)}
                                                            />
                                                        </div>
                                                    </div>

                                                    {manualHolidayWarning && (
                                                        <div className="flex items-center text-[10px] text-orange-600 mb-2 bg-orange-50 p-1 rounded border border-orange-100">
                                                            <AlertTriangle className="w-3 h-3 mr-1" />
                                                            {manualHolidayWarning}
                                                        </div>
                                                    )}

                                                    <div className="grid grid-cols-2 gap-2 mb-2">
                                                        <div>
                                                            <label className="text-[9px] text-slate-400 uppercase font-bold">Responsable</label>
                                                            <select className="w-full text-xs p-1 border rounded" value={manualLeadId} onChange={e => setManualLeadId(e.target.value)}>
                                                                <option value="">-- Choisir --</option>
                                                                {doctors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                                            </select>
                                                        </div>
                                                        <div>
                                                            <label className="text-[9px] text-slate-400 uppercase font-bold">Backup (Suppléant)</label>
                                                            <select className="w-full text-xs p-1 border rounded" value={manualBackupId} onChange={e => setManualBackupId(e.target.value)}>
                                                                <option value="">-- Choisir --</option>
                                                                {doctors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                                            </select>
                                                        </div>
                                                        <div>
                                                            <label className="text-[9px] text-slate-400 uppercase font-bold">Intervenant 1</label>
                                                            <select className="w-full text-xs p-1 border rounded" value={manualAssoc1Id} onChange={e => setManualAssoc1Id(e.target.value)}>
                                                                <option value="">-- Choisir --</option>
                                                                {doctors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                                            </select>
                                                        </div>
                                                        <div>
                                                            <label className="text-[9px] text-slate-400 uppercase font-bold">Intervenant 2</label>
                                                            <select className="w-full text-xs p-1 border rounded" value={manualAssoc2Id} onChange={e => setManualAssoc2Id(e.target.value)}>
                                                                <option value="">-- Choisir --</option>
                                                                {doctors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                                            </select>
                                                        </div>
                                                    </div>

                                                    <button
                                                        onClick={() => handleAddManualInstance(rcp)}
                                                        disabled={!manualDateInput || !manualTimeInput || !manualLeadId}
                                                        className="w-full bg-blue-600 text-white py-1.5 rounded text-xs font-bold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center mt-2"
                                                    >
                                                        <PlusCircle className="w-3 h-3 mr-1" /> Ajouter l'occurrence
                                                    </button>

                                                    <div className="mt-3 border-t pt-2">
                                                        <label className="text-[9px] text-slate-400 uppercase font-bold block mb-1">Dates Programmées</label>
                                                        <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
                                                            {rcp.manualInstances?.map((inst: RcpManualInstance) => (
                                                                <div key={inst.id} className="bg-white px-2 py-1 rounded border border-slate-200 text-[10px] flex items-center shadow-sm w-full justify-between">
                                                                    <div className="flex items-center">
                                                                        <span className="font-bold mr-2 text-slate-700">{inst.date.split('-').reverse().join('/')}</span>
                                                                        <span className="text-slate-500 mr-2 flex items-center"><Clock className="w-3 h-3 mr-1" />{inst.time}</span>
                                                                        <span className="text-slate-400">({inst.doctorIds.length} méd.)</span>
                                                                    </div>
                                                                    <button
                                                                        onClick={() => handleRemoveManualInstance(rcp, inst.id)}
                                                                        className="text-slate-400 hover:text-red-500 ml-2"
                                                                    >
                                                                        <X className="w-3 h-3" />
                                                                    </button>
                                                                </div>
                                                            ))}
                                                            {(!rcp.manualInstances || rcp.manualInstances.length === 0) && <span className="text-[10px] text-slate-400 italic">Aucune occurrence planifiée</span>}
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
                </div>
            )}

            {/* CALENDAR CONTROLS */}
            {activeTab === SlotType.RCP && rcpViewMode === 'CALENDAR' && (
                <div className="bg-gradient-to-r from-purple-50 to-white p-3 rounded-lg border border-purple-200 mb-4 flex items-center justify-between shadow-sm">
                    <div className="flex items-center space-x-4">
                        <button
                            onClick={() => {
                                const d = new Date(currentCalendarDate);
                                d.setDate(d.getDate() - 7);
                                setCurrentCalendarDate(d);
                            }}
                            className="p-2 hover:bg-purple-100 rounded-lg transition-colors"
                        >
                            <ChevronLeft className="w-5 h-5 text-purple-600" />
                        </button>
                        <div className="text-center">
                            <h3 className="font-bold text-slate-800 text-sm capitalize">
                                Semaine du {currentCalendarWeekStart.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                            </h3>
                        </div>
                        <button
                            onClick={() => {
                                const d = new Date(currentCalendarDate);
                                d.setDate(d.getDate() + 7);
                                setCurrentCalendarDate(d);
                            }}
                            className="p-2 hover:bg-purple-100 rounded-lg transition-colors"
                        >
                            <ChevronRight className="w-5 h-5 text-purple-600" />
                        </button>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="text-xs text-slate-500 italic hidden md:block">
                            Cliquez sur une RCP pour modifier
                        </div>
                        <button
                            onClick={() => setIsFullscreen(!isFullscreen)}
                            className="p-2 hover:bg-purple-100 rounded-lg transition-colors text-purple-600"
                            title={isFullscreen ? "Réduire" : "Agrandir"}
                        >
                            {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
                        </button>
                    </div>
                </div>
            )}

            {/* MAIN GRID - with fullscreen support (only for RCP Calendar view) */}
            <div
                className={`${isFullscreen && activeTab === SlotType.RCP && rcpViewMode === 'CALENDAR' ? 'fixed inset-0 z-50 p-4 bg-slate-100' : 'flex-1'} overflow-auto bg-white rounded-xl shadow border border-slate-200`}
                ref={tableContainerRef}
            >
                {/* Fullscreen header - only shown for RCP Calendar */}
                {isFullscreen && activeTab === SlotType.RCP && rcpViewMode === 'CALENDAR' && (
                    <div className="flex justify-between items-center mb-4 bg-gradient-to-r from-purple-600 to-purple-500 text-white p-4 rounded-lg shadow-lg">
                        <div>
                            <h2 className="text-xl font-bold">Vue RCP - Calendrier</h2>
                            <p className="text-purple-100 text-sm">Semaine du {currentCalendarWeekStart.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                        </div>
                        <div className="flex items-center gap-4">
                            <button
                                onClick={() => {
                                    const d = new Date(currentCalendarDate);
                                    d.setDate(d.getDate() - 7);
                                    setCurrentCalendarDate(d);
                                }}
                                className="p-2 bg-white/20 hover:bg-white/30 rounded-lg"
                            >
                                <ChevronLeft className="w-5 h-5" />
                            </button>
                            <button
                                onClick={() => {
                                    const d = new Date(currentCalendarDate);
                                    d.setDate(d.getDate() + 7);
                                    setCurrentCalendarDate(d);
                                }}
                                className="p-2 bg-white/20 hover:bg-white/30 rounded-lg"
                            >
                                <ChevronRight className="w-5 h-5" />
                            </button>
                            <button
                                onClick={() => setIsFullscreen(false)}
                                className="p-2 bg-white/20 hover:bg-white/30 rounded-lg"
                            >
                                <Minimize2 className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                )}

                {rows.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-48 text-slate-400">
                        <AlertCircle className="w-8 h-8 mb-2 opacity-50" />
                        <p className="text-sm">Aucun élément à afficher.</p>
                        <p className="text-xs">Utilisez le panneau ci-dessus pour ajouter des RCP ou des Postes.</p>
                    </div>
                ) : (
                    <div className={`min-w-[800px] ${isFullscreen ? 'bg-white rounded-lg p-2' : ''}`}>
                        <table className="w-full border-collapse table-fixed">
                            <thead>
                                <tr>
                                    <th className={`p-3 border-b-2 border-r-2 bg-slate-100 w-44 text-left text-xs font-bold text-slate-500 uppercase sticky left-0 z-20 ${activeTab === SlotType.RCP ? 'border-purple-200' : 'border-blue-200'}`}>
                                        {activeTab === SlotType.RCP ? 'RCP / Période' : 'Lieu / Période'}
                                    </th>
                                    {days.map(day => (
                                        <th key={day} className={`p-3 border-b-2 border-r bg-slate-50 text-slate-700 font-bold uppercase text-xs w-1/5 min-w-[160px] ${activeTab === SlotType.RCP ? 'border-purple-200' : 'border-blue-200'}`}>
                                            {day}
                                            {activeTab === SlotType.RCP && rcpViewMode === 'CALENDAR' && (
                                                <div className="font-normal text-[10px] text-purple-500 mt-1 bg-purple-50 px-2 py-0.5 rounded inline-block">
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
                                        <tr className={rowIndex > 0 && activeTab === SlotType.RCP ? 'border-t-4 border-purple-200' : ''}>
                                            <td className={`p-3 border-r-2 text-xs sticky left-0 z-10 group relative ${activeTab === SlotType.RCP ? 'bg-purple-50 border-purple-200' : 'bg-blue-50 border-blue-200'}`}>
                                                <div className="flex justify-between items-start">
                                                    <span className={`font-bold ${activeTab === SlotType.RCP ? 'text-purple-800' : 'text-blue-800'}`}>{row.name}</span>
                                                    {editMode && row.type === 'RCP' && (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                if (window.confirm(`Supprimer la RCP "${row.name}" ?`)) handleDeleteRcp(row.id);
                                                            }}
                                                            className="text-slate-300 hover:text-red-600 p-1 z-50 relative bg-white rounded-full shadow-sm"
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
                                                            className="text-slate-300 hover:text-red-600 p-1 z-50 relative bg-white rounded-full shadow-sm"
                                                            title={`Supprimer la ligne ${row.name}`}
                                                        >
                                                            <Trash2 className="w-3 h-3" />
                                                        </button>
                                                    )}
                                                </div>
                                                <span className="block font-medium text-yellow-600 mt-1 bg-yellow-50 px-1.5 py-0.5 rounded text-[10px] inline-block">☀️ Matin</span>
                                            </td>
                                            {days.map(day => (
                                                <td key={`${day}-matin`} className="border-r border-b p-1 h-24 relative bg-white">
                                                    {activeTab === SlotType.RCP && rcpViewMode === 'CALENDAR'
                                                        ? renderCalendarCell(day, Period.MORNING, row.name)
                                                        : renderConfigCell(day, Period.MORNING, row.name)
                                                    }
                                                </td>
                                            ))}
                                        </tr>
                                        {/* Afternoon */}
                                        <tr>
                                            <td className={`p-3 border-r-2 text-xs sticky left-0 z-10 font-normal ${activeTab === SlotType.RCP ? 'bg-purple-50/50 border-purple-200' : 'bg-blue-50/50 border-blue-200'}`}>
                                                <span className="block font-medium text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded text-[10px] inline-block">🌙 Après-midi</span>
                                            </td>
                                            {days.map(day => (
                                                <td key={`${day}-apres-midi`} className="border-r p-1 h-24 bg-slate-50/50 relative">
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
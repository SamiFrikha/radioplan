
import React, { useContext, useState, useMemo } from 'react';
import { AppContext } from '../App';
import StatCard from '../components/StatCard';
import ConflictResolverModal from '../components/ConflictResolverModal';
import { Users, AlertTriangle, Calendar, Activity, Clock, ChevronLeft, ChevronRight, LayoutList, LayoutGrid, UserX, CalendarDays, UserMinus } from 'lucide-react';
import { DayOfWeek, Period, SlotType, Doctor, ScheduleSlot, Conflict } from '../types';
import { getDateForDayOfWeek, isDateInRange, generateScheduleForWeek, detectConflicts } from '../services/scheduleService';

const Dashboard: React.FC = () => {
  const { 
      doctors, 
      unavailabilities, 
      template, 
      activityDefinitions, 
      rcpTypes, 
      shiftHistory, 
      rcpAttendance, 
      rcpExceptions, 
      manualOverrides,
      setManualOverrides
  } = useContext(AppContext);
  
  // Local State for Week Navigation (Isolated)
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() => {
      const d = new Date();
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      d.setDate(diff);
      d.setHours(0,0,0,0);
      return d;
  });

  const [viewMode, setViewMode] = useState<'DAY' | 'WEEK'>('DAY');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  // Resolver Modal State
  const [selectedConflict, setSelectedConflict] = useState<Conflict | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<ScheduleSlot | null>(null);

  // Generate Local Schedule based on Local Week
  const schedule = useMemo(() => {
      const generated = generateScheduleForWeek(
          currentWeekStart,
          template,
          unavailabilities,
          doctors,
          activityDefinitions,
          rcpTypes,
          true,
          shiftHistory,
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
                return { ...slot, assignedDoctorId: overrideValue, isLocked: true };
             }
          }
          return slot;
      });
  }, [currentWeekStart, template, unavailabilities, doctors, activityDefinitions, rcpTypes, shiftHistory, rcpAttendance, rcpExceptions, manualOverrides]);

  const conflicts = useMemo(() => {
     return detectConflicts(schedule, unavailabilities, doctors, activityDefinitions);
  }, [schedule, unavailabilities, doctors, activityDefinitions]);

  
  // Helpers for navigation
  const handleTimeChange = (direction: 'prev' | 'next') => {
      const newDate = new Date(selectedDate);
      if (viewMode === 'DAY') {
          newDate.setDate(newDate.getDate() + (direction === 'next' ? 1 : -1));
          // Skip weekends
          if (newDate.getDay() === 0) newDate.setDate(newDate.getDate() + (direction === 'next' ? 1 : -2)); // Skip Sun
          if (newDate.getDay() === 6) newDate.setDate(newDate.getDate() + (direction === 'next' ? 2 : -1)); // Skip Sat
      } else {
          newDate.setDate(newDate.getDate() + (direction === 'next' ? 7 : -7));
      }
      setSelectedDate(newDate);

      // If we move weeks, update the local currentWeekStart
      if (viewMode === 'WEEK' || (viewMode === 'DAY' && getWeekNumber(newDate) !== getWeekNumber(currentWeekStart))) {
          const day = newDate.getDay();
          const diff = newDate.getDate() - day + (day === 0 ? -6 : 1);
          const newMonday = new Date(newDate);
          newMonday.setDate(diff);
          newMonday.setHours(0,0,0,0);
          setCurrentWeekStart(newMonday);
      }
  };

  const getWeekNumber = (d: Date) => {
      const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
      const dayNum = date.getUTCDay() || 7;
      date.setUTCDate(date.getUTCDate() + 4 - dayNum);
      const yearStart = new Date(Date.UTC(date.getUTCFullYear(),0,1));
      return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1)/7);
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const d = new Date(e.target.value);
      setSelectedDate(d);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const newMonday = new Date(d);
      newMonday.setDate(diff);
      setCurrentWeekStart(newMonday);
  }

  // --- STATS CALCULATION ---
  const stats = useMemo(() => {
      let filteredSlots = [];
      const dateStr = selectedDate.toISOString().split('T')[0];

      if (viewMode === 'DAY') {
          filteredSlots = schedule.filter(s => s.date === dateStr);
      } else {
          const startOfWeek = new Date(currentWeekStart);
          const endOfWeek = new Date(currentWeekStart);
          endOfWeek.setDate(endOfWeek.getDate() + 5);
          
          filteredSlots = schedule.filter(s => {
             const d = new Date(s.date);
             return d >= startOfWeek && d < endOfWeek;
          });
      }

      // 1. PRESENT DOCTORS CALCULATION
      // Calculate how many doctors are available (not absent ALL_DAY)
      let presentDoctorsCount = 0;
      if (viewMode === 'DAY') {
          presentDoctorsCount = doctors.filter(d => {
              const isAbsentAllDay = unavailabilities.some(u => 
                  u.doctorId === d.id && 
                  isDateInRange(dateStr, u.startDate, u.endDate) &&
                  (!u.period || u.period === 'ALL_DAY')
              );
              return !isAbsentAllDay;
          }).length;
      } else {
          // In Week view, count doctors who are available for at least part of the week (not absent M-F)
          const weekStartStr = currentWeekStart.toISOString().split('T')[0];
          const weekEnd = new Date(currentWeekStart);
          weekEnd.setDate(weekEnd.getDate() + 4);
          const weekEndStr = weekEnd.toISOString().split('T')[0];

          presentDoctorsCount = doctors.filter(d => {
              const absentWholeWeek = unavailabilities.some(u => 
                  u.doctorId === d.id && 
                  u.startDate <= weekStartStr && u.endDate >= weekEndStr &&
                  (!u.period || u.period === 'ALL_DAY')
              );
              return !absentWholeWeek;
          }).length;
      }

      const totalActivities = filteredSlots.filter(s => s.assignedDoctorId).length;
      const totalSlots = filteredSlots.length;
      const filledSlots = filteredSlots.filter(s => s.assignedDoctorId).length;
      const occupancy = totalSlots > 0 ? Math.round((filledSlots / totalSlots) * 100) : 0;

      let relevantConflicts = [];
      if (viewMode === 'DAY') {
          relevantConflicts = conflicts.filter(c => {
             const slot = schedule.find(s => s.id === c.slotId);
             return slot && slot.date === dateStr;
          });
      } else {
          relevantConflicts = conflicts; 
      }

      let absentees = [];
      if (viewMode === 'DAY') {
          absentees = unavailabilities.filter(u => isDateInRange(dateStr, u.startDate, u.endDate));
      } else {
           const weekEnd = new Date(currentWeekStart);
           weekEnd.setDate(weekEnd.getDate() + 4);
           const weekStartStr = currentWeekStart.toISOString().split('T')[0];
           const weekEndStr = weekEnd.toISOString().split('T')[0];
           
           absentees = unavailabilities.filter(u => {
               return (u.startDate <= weekEndStr && u.endDate >= weekStartStr);
           });
      }

      return {
          presentDoctorsCount,
          totalActivities,
          occupancy,
          conflictCount: relevantConflicts.length,
          filteredConflicts: relevantConflicts,
          absentees
      };
  }, [schedule, viewMode, selectedDate, conflicts, currentWeekStart, unavailabilities, doctors]);

  // --- RESOLUTION HANDLERS ---
  const handleResolve = (slotId: string, newDoctorId: string) => {
    const newOverrides = { ...manualOverrides };
    
    if (newDoctorId === "") {
        delete newOverrides[slotId];
    } else {
        newOverrides[slotId] = newDoctorId;
    }
    setManualOverrides(newOverrides);
    
    // Auto-close modal after resolution
    setSelectedConflict(null);
    setSelectedSlot(null);
  };

  const handleCloseSlot = (slotId: string) => {
    setManualOverrides({ ...manualOverrides, [slotId]: '__CLOSED__' });
    setSelectedConflict(null);
    setSelectedSlot(null);
  }

  const handleAlertClick = (conflict: Conflict) => {
      const slot = schedule.find(s => s.id === conflict.slotId);
      if (slot) {
          setSelectedSlot(slot);
          setSelectedConflict(conflict);
      }
  }


  // --- RENDER HELPERS ---
  const renderDayView = () => {
      const dateStr = selectedDate.toISOString().split('T')[0];
      const daySlots = schedule.filter(s => s.date === dateStr);
      
      const morningSlots = daySlots.filter(s => s.period === Period.MORNING);
      const afternoonSlots = daySlots.filter(s => s.period === Period.AFTERNOON);

      const renderSlotList = (slots: typeof daySlots) => (
          <div className="space-y-2">
              {slots.length === 0 ? <p className="text-sm text-slate-400 italic">Aucune activité prévue.</p> : 
               slots.map(s => {
                   const doc = doctors.find(d => d.id === s.assignedDoctorId);
                   const isRcpUnconfirmed = s.type === SlotType.RCP && s.isUnconfirmed;
                   
                   return (
                       <div key={s.id} className="flex items-center justify-between p-2 bg-slate-50 rounded border border-slate-200">
                           <div className="flex items-center">
                               {isRcpUnconfirmed ? (
                                   <div className="flex flex-col">
                                       <span className="text-[10px] text-yellow-700 bg-yellow-100 px-1 rounded font-bold mb-1 w-fit">⚠️ À confirmer</span>
                                       <div className="text-xs text-slate-600">
                                            {[s.assignedDoctorId, ...(s.secondaryDoctorIds || [])].map(id => doctors.find(d => d.id === id)?.name).filter(Boolean).join(', ')}
                                       </div>
                                   </div>
                               ) : (
                                   <>
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold mr-3 ${doc ? doc.color : 'bg-slate-200 text-slate-400'}`}>
                                        {doc ? doc.name.substring(0,2) : '?'}
                                    </div>
                                    <div>
                                        <div className="text-sm font-bold text-slate-700 flex items-center">
                                            {doc ? doc.name : 'Non assigné'}
                                        </div>
                                        <div className="text-xs text-slate-500">{s.type} {s.subType && `• ${s.subType}`}</div>
                                    </div>
                                   </>
                               )}
                           </div>
                           <div className="text-xs font-bold bg-white px-2 py-1 rounded border border-slate-200 text-slate-600">
                               {s.location}
                           </div>
                       </div>
                   )
               })
              }
          </div>
      );

      return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-full overflow-hidden">
              <div className="bg-white rounded-xl border border-slate-200 flex flex-col overflow-hidden">
                   <div className="p-3 bg-yellow-50 border-b border-yellow-100 text-yellow-800 font-bold uppercase text-xs tracking-wider flex items-center">
                       <Clock className="w-4 h-4 mr-2" /> Matin
                   </div>
                   <div className="p-4 overflow-y-auto flex-1">
                       {renderSlotList(morningSlots)}
                   </div>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 flex flex-col overflow-hidden">
                   <div className="p-3 bg-indigo-50 border-b border-indigo-100 text-indigo-800 font-bold uppercase text-xs tracking-wider flex items-center">
                       <Clock className="w-4 h-4 mr-2" /> Après-midi
                   </div>
                   <div className="p-4 overflow-y-auto flex-1">
                       {renderSlotList(afternoonSlots)}
                   </div>
              </div>
          </div>
      )
  };

  const renderWeekView = () => {
      const days = Object.values(DayOfWeek);
      return (
          <div className="overflow-x-auto pb-2">
              <div className="grid grid-cols-5 gap-3 min-w-[700px]">
                  {days.map(day => {
                      const date = getDateForDayOfWeek(currentWeekStart, day);
                      const isToday = date === new Date().toISOString().split('T')[0];
                      const daySlots = schedule.filter(s => s.date === date);

                      // Summary logic
                      const astreinte = daySlots.find(s => s.activityId === 'act_astreinte');
                      const unity = daySlots.find(s => s.activityId === 'act_unity');
                      
                      const docAstreinte = doctors.find(d => d.id === astreinte?.assignedDoctorId);
                      const docUnity = doctors.find(d => d.id === unity?.assignedDoctorId);

                      // RCPs List
                      const rcps = daySlots.filter(s => s.type === SlotType.RCP);

                      return (
                          <div key={day} className={`flex flex-col border rounded-lg overflow-hidden ${isToday ? 'ring-2 ring-blue-400 border-blue-400' : 'bg-slate-50 border-slate-200'}`}>
                              <div className={`text-xs font-bold text-center py-2 uppercase ${isToday ? 'bg-blue-500 text-white' : 'bg-slate-200 text-slate-700'}`}>
                                  {day} <span className="block text-[9px] font-normal opacity-80">{date.split('-').slice(1).reverse().join('/')}</span>
                              </div>
                              <div className="p-2 space-y-2 flex-1 bg-white">
                                  {/* Key Roles Summary */}
                                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Clés</div>
                                  
                                  <div className="flex items-center justify-between bg-red-50 p-1.5 rounded border border-red-100">
                                      <span className="text-[9px] text-red-700 font-bold">Astreinte</span>
                                      <span className="text-[9px] text-slate-800 truncate max-w-[60px]">{docAstreinte?.name || '-'}</span>
                                  </div>
                                  <div className="flex items-center justify-between bg-orange-50 p-1.5 rounded border border-orange-100">
                                      <span className="text-[9px] text-orange-700 font-bold">UNITY</span>
                                      <span className="text-[9px] text-slate-800 truncate max-w-[60px]">{docUnity?.name || '-'}</span>
                                  </div>

                                  <div className="h-px bg-slate-100 my-2"></div>
                                  
                                  {/* RCPs Summary */}
                                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">RCPs</div>
                                  {rcps.length === 0 ? <span className="text-[9px] text-slate-300 italic">Aucune</span> : (
                                      <div className="space-y-1">
                                          {rcps.map(rcp => {
                                              const rcpDoc = doctors.find(d => d.id === rcp.assignedDoctorId);
                                              
                                              if (rcp.isUnconfirmed) {
                                                  // Show All eligible names
                                                  const allNames = [rcp.assignedDoctorId, ...(rcp.secondaryDoctorIds || [])]
                                                        .map(id => doctors.find(d => d.id === id)?.name)
                                                        .filter(Boolean);
                                                  
                                                  return (
                                                      <div key={rcp.id} className="flex flex-col bg-yellow-50 p-1 rounded border border-yellow-100">
                                                           <div className="flex justify-between items-center mb-1">
                                                                <span className="text-[8px] text-purple-700 font-bold truncate max-w-[50px]">{rcp.location}</span>
                                                                <span className="text-[8px] text-yellow-700 font-bold">⚠️ À confirmer</span>
                                                           </div>
                                                           <div className="flex flex-wrap gap-0.5">
                                                                {allNames.map(name => (
                                                                    <span key={name} className="text-[7px] bg-white border px-1 rounded text-slate-600">{name}</span>
                                                                ))}
                                                           </div>
                                                      </div>
                                                  )
                                              }

                                              return (
                                                  <div key={rcp.id} className="flex justify-between items-center bg-purple-50 p-1 rounded border border-purple-100">
                                                      <span className="text-[8px] text-purple-700 font-bold truncate max-w-[50px]">{rcp.location}</span>
                                                      <div className="flex items-center">
                                                          <span className="text-[8px] text-slate-700 font-medium truncate max-w-[60px]">{rcpDoc?.name || '-'}</span>
                                                          <span className="ml-1 text-[8px] text-green-600">✓</span>
                                                      </div>
                                                  </div>
                                              )
                                          })}
                                      </div>
                                  )}
                                  
                                  <div className="h-px bg-slate-100 my-2"></div>
                                  
                                  {/* Consult Activity Count */}
                                  <div className="flex justify-between items-center">
                                      <span className="text-[10px] text-slate-500">Consultations</span>
                                      <span className="text-[10px] font-bold bg-slate-100 px-1.5 rounded">
                                          {daySlots.filter(s => s.type === SlotType.CONSULTATION).length}
                                      </span>
                                  </div>

                              </div>
                          </div>
                      )
                  })}
              </div>
          </div>
      )
  };

  // --- UNASSIGNED DOCTORS CALCULATION ---
  const unassignedDoctors = useMemo(() => {
      const dateStr = selectedDate.toISOString().split('T')[0];
      const daySlots = schedule.filter(s => s.date === dateStr);
      
      const unassigned = {
          [Period.MORNING]: [] as Doctor[],
          [Period.AFTERNOON]: [] as Doctor[]
      };

      [Period.MORNING, Period.AFTERNOON].forEach(period => {
          const busyDocIds = daySlots
            .filter(s => s.period === period)
            .flatMap(s => [s.assignedDoctorId, ...(s.secondaryDoctorIds || [])])
            .filter(Boolean);
          
          unassigned[period] = doctors.filter(doc => {
              // Not busy
              if (busyDocIds.includes(doc.id)) return false;
              // Not Absent (Granular Check)
              const isAbsent = unavailabilities.some(u => {
                  if (u.doctorId !== doc.id) return false;
                  if (!isDateInRange(dateStr, u.startDate, u.endDate)) return false;
                  if (u.period && u.period !== 'ALL_DAY' && u.period !== period) return false; 
                  return true;
              });

              if (isAbsent) return false;
              
              // Day Exclusion Check
              const currentDayOfWeek = selectedDate.toLocaleDateString('fr-FR', { weekday: 'long' });
              const mappedDay = Object.values(DayOfWeek).find(d => d.toLowerCase() === currentDayOfWeek.toLowerCase());
              if (mappedDay && doc.excludedDays.includes(mappedDay)) return false;

              return true;
          });
      });
      return unassigned;
  }, [schedule, doctors, unavailabilities, selectedDate]);


  return (
    <div className="space-y-6 h-full flex flex-col">
      {/* Header Controls */}
      <div className="flex flex-col md:flex-row justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div className="flex items-center space-x-4 mb-4 md:mb-0">
             <div className="flex bg-slate-100 p-1 rounded-lg">
                <button 
                    onClick={() => setViewMode('DAY')}
                    className={`px-3 py-2 flex items-center text-xs font-bold rounded-md transition-all ${viewMode === 'DAY' ? 'bg-white shadow text-blue-700' : 'text-slate-500 hover:bg-slate-200'}`}
                >
                    <LayoutList className="w-4 h-4 mr-2" /> Vue Jour
                </button>
                <button 
                    onClick={() => setViewMode('WEEK')}
                    className={`px-3 py-2 flex items-center text-xs font-bold rounded-md transition-all ${viewMode === 'WEEK' ? 'bg-white shadow text-blue-700' : 'text-slate-500 hover:bg-slate-200'}`}
                >
                    <LayoutGrid className="w-4 h-4 mr-2" /> Vue Semaine
                </button>
            </div>
            <div>
                <h1 className="text-xl font-bold text-slate-800 capitalize">
                    {viewMode === 'DAY' 
                        ? selectedDate.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
                        : `Semaine du ${currentWeekStart.toLocaleDateString('fr-FR')}`
                    }
                </h1>
            </div>
        </div>

        <div className="flex items-center space-x-2">
            <button onClick={() => handleTimeChange('prev')} className="p-2 hover:bg-slate-100 rounded-full text-slate-600 border border-slate-200">
                <ChevronLeft className="w-5 h-5" />
            </button>
             <div className="relative">
                <input 
                    type="date" 
                    className="pl-8 pr-2 py-1.5 border border-slate-300 rounded-md text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={selectedDate.toISOString().split('T')[0]}
                    onChange={handleDateChange}
                />
                <Calendar className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
             </div>
            <button onClick={() => handleTimeChange('next')} className="p-2 hover:bg-slate-100 rounded-full text-slate-600 border border-slate-200">
                <ChevronRight className="w-5 h-5" />
            </button>
        </div>
      </div>

      {/* Dynamic Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title={viewMode === 'DAY' ? "Médecins Présents" : "Effectif Dispo (Semaine)"}
          value={stats.presentDoctorsCount}
          icon={Users}
          color="bg-blue-500"
          description={`Disponibles sur ${doctors.length} effectifs`}
        />
        <StatCard
          title={viewMode === 'DAY' ? "Conflits (Jour)" : "Conflits (Semaine)"}
          value={stats.conflictCount}
          icon={AlertTriangle}
          color={stats.conflictCount > 0 ? "bg-red-500" : "bg-green-500"}
          description={stats.conflictCount > 0 ? "Action requise" : "Tout est calme"}
        />
        <StatCard
          title={viewMode === 'DAY' ? "Activités Prévues" : "Total Créneaux"}
          value={stats.totalActivities}
          icon={Activity}
          color="bg-orange-500"
          description={viewMode === 'DAY' ? "Consultations & RCP" : "Charge globale"}
        />
        <StatCard
          title="Taux de Remplissage"
          value={`${stats.occupancy}%`}
          icon={Clock}
          color="bg-purple-500"
          description="Créneaux assignés"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
        {/* Left: Alerts, Absences & UNASSIGNED */}
        <div className="lg:col-span-1 flex flex-col gap-4 overflow-hidden max-h-[600px] overflow-y-auto">
            
            {/* ALERTES */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col shrink-0">
                <div className="p-4 border-b border-slate-100 bg-red-50/50">
                    <h2 className="font-bold text-slate-800 flex items-center justify-between">
                        <span className="flex items-center">
                            <AlertTriangle className="w-5 h-5 mr-2 text-red-500" />
                            Alertes {viewMode === 'DAY' ? 'du jour' : 'de la semaine'}
                        </span>
                        <span className="text-xs bg-red-200 text-red-800 px-2 py-0.5 rounded-full">{stats.filteredConflicts.length}</span>
                    </h2>
                </div>
                <div className="p-4 max-h-80 overflow-y-auto space-y-3">
                    {stats.filteredConflicts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-20 text-slate-400">
                        <span className="text-sm">Aucun conflit détecté.</span>
                    </div>
                    ) : (
                    stats.filteredConflicts.map(conflict => {
                        const doc = doctors.find(d => d.id === conflict.doctorId);
                        const slot = schedule.find(s => s.id === conflict.slotId);
                        
                        let locationDetail = "";
                        if(slot) {
                            locationDetail = `${slot.location || slot.subType}`;
                        }

                        return (
                        <div 
                            key={conflict.id} 
                            onClick={() => handleAlertClick(conflict)}
                            className="p-3 bg-white border border-red-100 rounded-lg shadow-sm hover:border-red-300 hover:shadow-md transition-all cursor-pointer relative group"
                        >
                            <div className="flex justify-between items-start mb-1">
                                <span className="text-[10px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full border border-red-100 uppercase">
                                    {conflict.type === 'DOUBLE_BOOKING' ? 'Double Réservation' : 'Indisponibilité'}
                                </span>
                                <span className="text-[10px] text-slate-400 font-mono">
                                    {slot?.day.substring(0,3)} {slot?.period === Period.MORNING ? 'AM' : 'PM'}
                                </span>
                            </div>
                            <div className="flex items-center mt-2">
                                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold mr-2 ${doc?.color}`}>
                                    {doc?.name.substring(0,2)}
                                </div>
                                <p className="text-sm font-bold text-slate-700">{doc?.name || 'Inconnu'}</p>
                            </div>
                            <p className="text-xs text-slate-500 mt-1 pl-8">{conflict.description}</p>
                            {locationDetail && (
                                <div className="mt-2 pl-8">
                                    <span className="text-[10px] font-medium text-slate-600 bg-slate-100 px-2 py-1 rounded">
                                        {locationDetail}
                                    </span>
                                </div>
                            )}
                            
                            <div className="absolute inset-0 bg-blue-500/0 group-hover:bg-blue-500/5 rounded-lg transition-colors pointer-events-none" />
                            <div className="absolute right-2 bottom-2 text-xs text-blue-600 font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                                Résoudre →
                            </div>
                        </div>
                        );
                    })
                    )}
                </div>
            </div>

            {/* NON-POSTED DOCTORS */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col shrink-0">
                <div className="p-3 border-b border-slate-100 bg-slate-50">
                    <h2 className="font-bold text-slate-700 flex items-center text-sm">
                    <UserMinus className="w-4 h-4 mr-2 text-slate-500" />
                    Médecins Non Postés (Ce jour)
                    </h2>
                </div>
                <div className="p-3 space-y-4">
                    <div>
                            <h4 className="text-[10px] font-bold text-slate-400 uppercase mb-2">Matin</h4>
                            <div className="flex flex-wrap gap-2">
                                {unassignedDoctors[Period.MORNING].length === 0 ? <span className="text-xs text-slate-400 italic">Tous occupés</span> : 
                                    unassignedDoctors[Period.MORNING].map(d => (
                                        <div key={d.id} className={`text-[10px] px-2 py-1 rounded border bg-white text-slate-600 border-slate-200`}>
                                            {d.name}
                                        </div>
                                    ))
                                }
                            </div>
                    </div>
                    <div>
                            <h4 className="text-[10px] font-bold text-slate-400 uppercase mb-2">Après-Midi</h4>
                            <div className="flex flex-wrap gap-2">
                                {unassignedDoctors[Period.AFTERNOON].length === 0 ? <span className="text-xs text-slate-400 italic">Tous occupés</span> : 
                                    unassignedDoctors[Period.AFTERNOON].map(d => (
                                        <div key={d.id} className={`text-[10px] px-2 py-1 rounded border bg-white text-slate-600 border-slate-200`}>
                                            {d.name}
                                        </div>
                                    ))
                                }
                            </div>
                    </div>
                </div>
            </div>

            {/* ABSENCES */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col shrink-0">
                <div className="p-3 border-b border-slate-100 bg-slate-50">
                    <h2 className="font-bold text-slate-700 flex items-center text-sm">
                    <UserX className="w-4 h-4 mr-2 text-slate-500" />
                    Médecins Absents
                    </h2>
                </div>
                <div className="p-3 max-h-40 overflow-y-auto space-y-2">
                    {stats.absentees.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-slate-400">
                            <span className="text-xs">Tout le monde est présent.</span>
                        </div>
                    ) : (
                        stats.absentees.map(abs => {
                            const doc = doctors.find(d => d.id === abs.doctorId);
                            return (
                                <div key={abs.id} className="flex items-center justify-between p-2 bg-slate-50 rounded border border-slate-100">
                                    <div className="flex items-center">
                                         <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold mr-2 opacity-50 ${doc?.color}`}>
                                            {doc?.name.substring(0,2)}
                                        </div>
                                        <div>
                                            <div className="text-xs font-bold text-slate-600">{doc?.name}</div>
                                            <div className="text-[10px] text-slate-400 uppercase font-bold flex items-center">
                                                {abs.reason}
                                                {abs.period && abs.period !== 'ALL_DAY' && (
                                                    <span className="ml-1 text-[9px] bg-slate-100 text-slate-500 px-1 rounded uppercase">
                                                        {abs.period === 'Matin' ? 'AM' : 'PM'}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-[10px] text-slate-500 bg-white px-2 py-1 rounded border">
                                        {abs.startDate === abs.endDate ? abs.startDate : `Jusqu'au ${abs.endDate.split('-').slice(1).reverse().join('/')}`}
                                    </div>
                                </div>
                            )
                        })
                    )}
                </div>
            </div>
        </div>

        {/* Right: Main Content (Day or Week View) */}
        <div className="lg:col-span-2 flex flex-col min-h-0">
           {viewMode === 'DAY' ? renderDayView() : renderWeekView()}
        </div>
      </div>

      {selectedSlot && (
          <ConflictResolverModal
            slot={selectedSlot}
            conflict={selectedConflict || undefined}
            doctors={doctors}
            slots={schedule}
            unavailabilities={unavailabilities}
            onClose={() => { setSelectedSlot(null); setSelectedConflict(null); }}
            onResolve={handleResolve}
            onCloseSlot={handleCloseSlot}
          />
      )}
    </div>
  );
};

export default Dashboard;

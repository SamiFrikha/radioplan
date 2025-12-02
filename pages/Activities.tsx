import React, { useContext, useState, useMemo, useRef } from 'react';
import { AppContext } from '../App';
import { DayOfWeek, Period, SlotType, Conflict, ScheduleSlot, Doctor } from '../types';
import { Activity, Plus, Settings, User, Wand2, ChevronLeft, ChevronRight, Calendar, LayoutGrid, AlertTriangle, Minimize2, Maximize2, Printer, Loader2, X, FileText } from 'lucide-react';
import { generateMonthSchedule, getDateForDayOfWeek, generateScheduleForWeek, detectConflicts, getDoctorWorkRate, computeHistoryFromDate, isFrenchHoliday } from '../services/scheduleService';
import ConflictResolverModal from '../components/ConflictResolverModal';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

const Activities: React.FC = () => {
  const { 
    activityDefinitions, 
    addActivityDefinition, 
    doctors, 
    template,
    unavailabilities,
    shiftHistory,
    rcpTypes,
    manualOverrides,
    setManualOverrides,
    rcpAttendance,
    rcpExceptions,
    activitiesStartDate // Consuming Start Date
  } = useContext(AppContext);

  // Local Week State
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() => {
      const d = new Date();
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      d.setDate(diff);
      d.setHours(0,0,0,0);
      return d;
  });

  // Compute Effective History Locally for Screen Stats if date is set
  // Note: The App Context `schedule` already uses the effective history for generation,
  // but for the "Stats Table" we need to calculate the "Total" which might differ from `shiftHistory` if date is set.
  const effectiveHistory = useMemo(() => {
    if (activitiesStartDate) {
        return computeHistoryFromDate(
            activitiesStartDate,
            currentWeekStart, // Calculate history UP TO current viewing week
            template,
            unavailabilities,
            doctors,
            activityDefinitions,
            rcpTypes,
            manualOverrides
        );
    }
    return shiftHistory;
  }, [activitiesStartDate, currentWeekStart, template, unavailabilities, doctors, activityDefinitions, rcpTypes, manualOverrides, shiftHistory]);


  // Local Schedule Generation (using the global effective logic passed via props implicitly or explicitly here)
  // Actually, we should use the same logic as App.tsx to ensure consistency in what is displayed vs calculated.
  const schedule = useMemo(() => {
      const generated = generateScheduleForWeek(
          currentWeekStart,
          template,
          unavailabilities,
          doctors,
          activityDefinitions,
          rcpTypes,
          true,
          effectiveHistory, // Use dynamic history
          rcpAttendance, 
          rcpExceptions
      );
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
  }, [currentWeekStart, template, unavailabilities, doctors, activityDefinitions, rcpTypes, effectiveHistory, rcpAttendance, rcpExceptions, manualOverrides]);

  const conflicts = useMemo(() => {
      return detectConflicts(schedule, unavailabilities, doctors, activityDefinitions);
  }, [schedule, unavailabilities, doctors, activityDefinitions]);


  const [activeTabId, setActiveTabId] = useState<string>(activityDefinitions[0]?.id || "");
  const [showSettings, setShowSettings] = useState(false);
  const [newActName, setNewActName] = useState("");
  const [newActType, setNewActType] = useState<'HALF_DAY' | 'WEEKLY'>('HALF_DAY');
  const [viewMode, setViewMode] = useState<'WEEK' | 'MONTH'>('WEEK');
  
  // Weekly Assignment Mode Toggle (Auto vs Manual)
  const [weeklyAssignmentMode, setWeeklyAssignmentMode] = useState<'AUTO' | 'MANUAL'>('AUTO');
  
  // Length Controls
  const [choiceSectionExpanded, setChoiceSectionExpanded] = useState(true);
  const [statsSectionExpanded, setStatsSectionExpanded] = useState(true);

  // Modal State
  const [selectedConflict, setSelectedConflict] = useState<Conflict | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<ScheduleSlot | null>(null);

  // PDF Report State
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [pdfStartDate, setPdfStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [pdfEndDate, setPdfEndDate] = useState(() => {
      const d = new Date();
      d.setMonth(d.getMonth() + 1);
      return d.toISOString().split('T')[0];
  });
  const [isGeneratingStatsPdf, setIsGeneratingStatsPdf] = useState(false);

  const days = Object.values(DayOfWeek);
  const currentActivity = activityDefinitions.find(a => a.id === activeTabId);
  const isWorkflowTab = activeTabId === 'act_workflow';

  // Month Generation Logic
  const monthSchedule = useMemo(() => {
      if (viewMode === 'WEEK') return [];
      const startOfMonth = new Date(currentWeekStart.getFullYear(), currentWeekStart.getMonth(), 1);
      // Adjust to start on a Monday for cleaner grid
      const day = startOfMonth.getDay();
      const diff = startOfMonth.getDate() - day + (day === 0 ? -6 : 1);
      const startOfGrid = new Date(startOfMonth);
      startOfGrid.setDate(diff);

      return generateMonthSchedule(
          startOfGrid,
          template,
          unavailabilities,
          doctors,
          activityDefinitions,
          rcpTypes,
          effectiveHistory, // Consistency
          {} 
      );
  }, [viewMode, currentWeekStart, template, unavailabilities, doctors, activityDefinitions, rcpTypes, effectiveHistory]);

  // Activity Specific Conflicts
  const activityConflicts = useMemo(() => {
      // Find all slots belonging to the current activity tab
      const activitySlotIds = schedule.filter(s => s.activityId === activeTabId).map(s => s.id);
      
      return conflicts.filter(c => activitySlotIds.includes(c.slotId));
  }, [conflicts, schedule, activeTabId]);

  const handleCreateActivity = (e: React.FormEvent) => {
      e.preventDefault();
      if(newActName.trim()) {
          addActivityDefinition({
              id: `act_${Date.now()}`,
              name: newActName,
              granularity: newActType,
              allowDoubleBooking: false,
              color: 'bg-gray-100 text-gray-800'
          });
          setNewActName("");
          setShowSettings(false);
      }
  }

  // Handle Manual Assignment with Persistence (Single Slot)
  const handleManualAssign = (slotId: string, doctorId: string) => {
      const newOverrides = { ...manualOverrides };
      
      if (doctorId === "") {
          // Revert to Auto (Delete override)
          delete newOverrides[slotId];
      } else {
          // Set Override
          newOverrides[slotId] = doctorId;
      }
      
      setManualOverrides(newOverrides);
      setSelectedConflict(null);
      setSelectedSlot(null);
  }

  // Handle Batch Assignment for Weekly Activity
  const handleWeeklyAssign = (doctorId: string) => {
      const weekSlots = schedule.filter(s => s.activityId === activeTabId);
      const newOverrides = { ...manualOverrides };
      
      weekSlots.forEach(s => {
          if (doctorId === "") {
              delete newOverrides[s.id];
          } else {
              newOverrides[s.id] = doctorId;
          }
      });
      
      setManualOverrides(newOverrides);
      if (doctorId !== "") {
          setWeeklyAssignmentMode('MANUAL');
      } else {
          setWeeklyAssignmentMode('AUTO');
      }
  }

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedDate = new Date(e.target.value);
      const day = selectedDate.getDay();
      const diff = selectedDate.getDate() - day + (day === 0 ? -6 : 1);
      selectedDate.setDate(diff);
      selectedDate.setHours(0,0,0,0);
      setCurrentWeekStart(selectedDate);
  }

  const handleWeekChange = (direction: 'prev' | 'next') => {
    const newDate = new Date(currentWeekStart);
    if (viewMode === 'WEEK') {
        newDate.setDate(newDate.getDate() + (direction === 'next' ? 7 : -7));
    } else {
        newDate.setMonth(newDate.getMonth() + (direction === 'next' ? 1 : -1));
    }
    setCurrentWeekStart(newDate);
  };

  const handleAlertClick = (conflict: Conflict) => {
      const slot = schedule.find(s => s.id === conflict.slotId);
      if (slot) {
          setSelectedSlot(slot);
          setSelectedConflict(conflict);
      }
  }
  
  const handleCloseSlot = (slotId: string) => {
      setManualOverrides({ ...manualOverrides, [slotId]: '__CLOSED__' });
      setSelectedConflict(null);
      setSelectedSlot(null);
  }

  // --- REPORT GENERATION LOGIC ---
  const generateReportData = (start: string, end: string) => {
      const stats: Record<string, { unity: number, astreinte: number, workflow: number, weighted: number }> = {};
      
      doctors.forEach(d => {
          stats[d.id] = { 
              unity: 0,
              astreinte: 0,
              workflow: 0,
              weighted: 0
          };
      });

      // Iterate through weeks
      const startDate = new Date(start);
      const endDate = new Date(end);
      // Adjust start to Monday
      const day = startDate.getDay();
      const diff = startDate.getDate() - day + (day === 0 ? -6 : 1);
      const current = new Date(startDate);
      current.setDate(diff);
      current.setHours(0,0,0,0);

      
      let runningHistory = { ...effectiveHistory }; 
      // Need deep copy
      runningHistory = JSON.parse(JSON.stringify(effectiveHistory));

      while(current <= endDate) {
          const weekSlots = generateScheduleForWeek(
              new Date(current),
              template,
              unavailabilities,
              doctors,
              activityDefinitions,
              rcpTypes,
              true, // Force regenerate
              runningHistory, // Pass history
              {}, 
              []
          );

          // Update Running History & Stats
          weekSlots.forEach(s => {
              if (s.assignedDoctorId) {
                  // Update running history for next iteration
                  if (!runningHistory[s.assignedDoctorId]) runningHistory[s.assignedDoctorId] = { 'act_unity': 0, 'act_astreinte': 0, 'act_workflow': 0 };
                  
                  if (s.activityId === 'act_unity') runningHistory[s.assignedDoctorId]['act_unity']++;
                  if (s.activityId === 'act_astreinte') runningHistory[s.assignedDoctorId]['act_astreinte']++;
                  if (s.activityId === 'act_workflow' && s.day === DayOfWeek.MONDAY && s.period === Period.MORNING) {
                       runningHistory[s.assignedDoctorId]['act_workflow']++;
                  }

                  // Update Report Stats (if within exact date range requested)
                  const dDate = new Date(s.date);
                  if (dDate >= startDate && dDate <= endDate && stats[s.assignedDoctorId]) {
                      if (s.activityId === 'act_unity') stats[s.assignedDoctorId].unity++;
                      if (s.activityId === 'act_astreinte') stats[s.assignedDoctorId].astreinte++;
                      
                      if (s.activityId === 'act_workflow' && s.day === DayOfWeek.MONDAY && s.period === Period.MORNING) {
                           stats[s.assignedDoctorId].workflow++;
                      }
                  }
              }
          });

          // Next week
          current.setDate(current.getDate() + 7);
      }

      // Calc Weighted
      doctors.forEach(d => {
          const rate = getDoctorWorkRate(d);
          stats[d.id].weighted = (stats[d.id].unity + stats[d.id].astreinte) / rate;
      });

      return stats;
  };

  const handleDownloadReport = async () => {
    try {
        setIsGeneratingStatsPdf(true);
        const reportStats = generateReportData(pdfStartDate, pdfEndDate);
        
        // Render a temporary hidden container
        const reportContainer = document.createElement('div');
        reportContainer.style.width = '1200px';
        reportContainer.style.padding = '40px';
        reportContainer.style.background = 'white';
        reportContainer.style.position = 'absolute';
        reportContainer.style.top = '-9999px';
        
        // SORTING
        const doctorsByWeighted = [...doctors].sort((a,b) => reportStats[a.id].weighted - reportStats[b.id].weighted);
        const doctorsByWorkflow = [...doctors].sort((a,b) => reportStats[a.id].workflow - reportStats[b.id].workflow);

        // Build HTML
        let html = `
            <div style="font-family: sans-serif; color: #1e293b;">
                <div style="display: flex; justify-content: space-between; align-items: border-bottom: 2px solid #cbd5e1; padding-bottom: 20px; margin-bottom: 30px;">
                    <div>
                        <h1 style="font-size: 24px; font-weight: bold; margin: 0; color: #0f172a;">Rapport d'Activité & Équité</h1>
                        <p style="color: #64748b; margin: 5px 0 0 0;">Période du <strong>${new Date(pdfStartDate).toLocaleDateString()}</strong> au <strong>${new Date(pdfEndDate).toLocaleDateString()}</strong></p>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-size: 12px; color: #94a3b8;">Généré le ${new Date().toLocaleDateString()}</div>
                        <div style="font-size: 14px; font-weight: bold; color: #3b82f6;">RadioPlan AI</div>
                    </div>
                </div>

                <h2 style="font-size: 18px; color: #ea580c; border-bottom: 2px solid #fdba74; padding-bottom: 5px; margin-top: 20px; margin-bottom: 10px;">1. Équité : Astreinte & Unity</h2>
                <table style="width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 30px;">
                    <thead>
                        <tr style="background-color: #fff7ed; border-bottom: 2px solid #fed7aa;">
                            <th style="padding: 10px; text-align: left; color: #9a3412;">Médecin</th>
                            <th style="padding: 10px; text-align: center; color: #9a3412;">Taux</th>
                            <th style="padding: 10px; text-align: center; color: #ea580c;">Unity</th>
                            <th style="padding: 10px; text-align: center; color: #dc2626;">Astreinte</th>
                            <th style="padding: 10px; text-align: center; color: #2563eb; font-size: 13px;">Score Pondéré (U+A)</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        doctorsByWeighted.forEach(d => {
            const s = reportStats[d.id];
            const rate = getDoctorWorkRate(d);
            html += `
                <tr style="border-bottom: 1px solid #e2e8f0;">
                    <td style="padding: 8px; font-weight: bold; color: #334155;">${d.name}</td>
                    <td style="padding: 8px; text-align: center; color: #64748b;">${Math.round(rate * 100)}%</td>
                    <td style="padding: 8px; text-align: center; font-weight: bold; color: #ea580c; background-color: #fff7ed;">${s.unity}</td>
                    <td style="padding: 8px; text-align: center; font-weight: bold; color: #dc2626; background-color: #fef2f2;">${s.astreinte}</td>
                    <td style="padding: 8px; text-align: center; font-weight: bold; color: #2563eb; background-color: #eff6ff;">${s.weighted.toFixed(1)}</td>
                </tr>
            `;
        });

        html += `
                    </tbody>
                </table>

                <h2 style="font-size: 18px; color: #059669; border-bottom: 2px solid #6ee7b7; padding-bottom: 5px; margin-top: 20px; margin-bottom: 10px;">2. Équité : Supervision Workflow</h2>
                <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
                    <thead>
                        <tr style="background-color: #ecfdf5; border-bottom: 2px solid #6ee7b7;">
                            <th style="padding: 10px; text-align: left; color: #065f46;">Médecin</th>
                            <th style="padding: 10px; text-align: center; color: #065f46;">Semaines Supervisées (Total)</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        doctorsByWorkflow.forEach(d => {
            const s = reportStats[d.id];
            html += `
                <tr style="border-bottom: 1px solid #e2e8f0;">
                    <td style="padding: 8px; font-weight: bold; color: #334155;">${d.name}</td>
                    <td style="padding: 8px; text-align: center; font-weight: bold; color: #059669; font-size: 13px;">${s.workflow}</td>
                </tr>
            `;
        });

        html += `
                    </tbody>
                </table>

                <div style="margin-top: 30px; padding: 15px; background-color: #f1f5f9; border-radius: 8px; font-size: 11px; color: #64748b;">
                    <p style="margin: 0;"><strong>Note :</strong> Les totaux sont calculés sur la période sélectionnée.</p>
                </div>
            </div>
        `;

        reportContainer.innerHTML = html;
        document.body.appendChild(reportContainer);

        const canvas = await html2canvas(reportContainer, { scale: 2 });
        document.body.removeChild(reportContainer);

        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF('p', 'mm', 'a4');
        const imgProps = pdf.getImageProperties(imgData);
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
        pdf.save(`Rapport_Activite_${pdfStartDate}_${pdfEndDate}.pdf`);
        setShowPdfModal(false);

    } catch (e) {
        console.error(e);
        alert("Erreur lors de la génération du rapport.");
    } finally {
        setIsGeneratingStatsPdf(false);
    }
  }

  // --- CURRENT VIEW STATS (For Screen) ---
  const calculateScreenStats = () => {
      const stats: Record<string, { unity: number, astreinte: number, workflow: number, weighted: number }> = {};
      
      doctors.forEach(d => {
          // History (Now Effective History based on start date)
          const hUnity = effectiveHistory[d.id]?.['act_unity'] || 0;
          const hAstreinte = effectiveHistory[d.id]?.['act_astreinte'] || 0;
          const hWorkflow = effectiveHistory[d.id]?.['act_workflow'] || 0;

          // Current Assignments in view
          const sourceSchedule = viewMode === 'WEEK' ? schedule : monthSchedule;
          const cUnity = sourceSchedule.filter(s => 
              s.assignedDoctorId === d.id && s.activityId === 'act_unity'
          ).length;
          const cAstreinte = sourceSchedule.filter(s => 
              s.assignedDoctorId === d.id && s.activityId === 'act_astreinte'
          ).length;
          
          // Count unique weeks for workflow in current view (Screen Logic)
          const cWorkflow = sourceSchedule.filter(s =>
              s.assignedDoctorId === d.id && s.activityId === 'act_workflow' &&
              s.day === DayOfWeek.MONDAY && s.period === Period.MORNING
          ).length;

          const totalUnity = hUnity + cUnity;
          const totalAstreinte = hAstreinte + cAstreinte;
          const totalWorkflow = hWorkflow + cWorkflow;

          const rate = getDoctorWorkRate(d);
          const weighted = (totalUnity + totalAstreinte) / rate;

          stats[d.id] = { 
              unity: totalUnity, 
              astreinte: totalAstreinte, 
              workflow: totalWorkflow,
              weighted: weighted 
          };
      });
      return stats;
  }
  const screenStats = calculateScreenStats();

  const renderSlot = (day: DayOfWeek, period: Period, weekDate?: Date) => {
      const dateStr = weekDate 
        ? weekDate.toISOString().split('T')[0] 
        : getDateForDayOfWeek(currentWeekStart, day);
      
      const holiday = isFrenchHoliday(dateStr);
      if (holiday) {
           return (
              <div className="h-full w-full bg-pink-50 flex items-center justify-center border border-pink-200 flex-col opacity-80 min-h-[60px]">
                   <span className="text-[10px] text-pink-400 font-bold uppercase tracking-wider">Férié</span>
                   <span className="text-[9px] text-pink-300 text-center px-1 leading-tight">{holiday.name}</span>
              </div>
          )
      }

      const sourceSchedule = viewMode === 'WEEK' ? schedule : monthSchedule;

      // Find the generated slot for this activity
      const slot = sourceSchedule.find(s => 
          s.date === dateStr && 
          s.period === period && 
          s.activityId === activeTabId
      );

      if (!slot) return <div className="text-xs text-slate-300 p-2">--</div>;

      const doc = doctors.find(d => d.id === slot.assignedDoctorId);
      
      // Check for conflict on this specific slot
      const hasConflict = conflicts.some(c => c.slotId === slot.id);

      // In month view, simplify display
      if (viewMode === 'MONTH') {
          return (
              <div className={`text-[10px] p-1 border rounded truncate min-h-[1.5rem] flex items-center ${hasConflict ? 'bg-red-50 border-red-300' : 'bg-slate-50'}`}>
                  {doc ? (
                      <span className={`font-bold ${hasConflict ? 'text-red-700' : 'text-slate-700'}`}>{doc.name}</span>
                  ) : <span className="text-slate-300">--</span>}
              </div>
          )
      }

      return (
          <div className={`p-2 rounded border h-full flex flex-col justify-center min-h-[60px] relative ${
              hasConflict ? 'border-red-400 bg-red-50' :
              slot.isLocked ? 'border-blue-400 bg-blue-50' : 'border-dashed border-slate-300'
          }`}>
              {hasConflict && (
                  <div className="absolute top-1 right-1 text-red-500 animate-pulse">
                      <AlertTriangle className="w-3 h-3" />
                  </div>
              )}
              <select 
                className={`w-full text-xs bg-transparent outline-none font-medium cursor-pointer ${
                    hasConflict ? 'text-red-800' :
                    slot.isLocked ? 'text-blue-800' : 'text-slate-700'
                }`}
                value={slot.isLocked ? slot.assignedDoctorId || "" : ""}
                onChange={(e) => handleManualAssign(slot.id, e.target.value)}
              >
                  <option value="">-- IA / Auto --</option>
                  {doctors.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
              </select>
              
              {/* If it's NOT locked, it's AI generated */}
              {!slot.isLocked && doc && (
                  <div className="mt-1 flex items-center justify-center">
                       <span className={`text-[10px] px-2 py-0.5 rounded flex items-center shadow-sm ${hasConflict ? 'bg-red-200 text-red-800' : 'bg-green-100 text-green-800'}`}>
                           <Wand2 className="w-3 h-3 mr-1" /> {doc.name}
                       </span>
                  </div>
              )}
          </div>
      )
  };

  const renderMonthGrid = () => {
      const startOfMonth = new Date(currentWeekStart.getFullYear(), currentWeekStart.getMonth(), 1);
      const day = startOfMonth.getDay();
      const diff = startOfMonth.getDate() - day + (day === 0 ? -6 : 1);
      const startOfGrid = new Date(startOfMonth);
      startOfGrid.setDate(diff);

      const gridWeeks = [];
      let currentDay = new Date(startOfGrid);

      for(let w=0; w<5; w++) {
          const weekDays = [];
          for(let d=0; d<5; d++) { // Mon-Fri
             weekDays.push(new Date(currentDay));
             currentDay.setDate(currentDay.getDate() + 1);
          }
          currentDay.setDate(currentDay.getDate() + 2); // Skip Sat/Sun
          gridWeeks.push(weekDays);
      }

      return (
          <div className="space-y-4">
              <div className="grid grid-cols-5 gap-2 font-bold text-center text-slate-600 mb-2">
                  {days.map(d => <div key={d}>{d}</div>)}
              </div>
              {gridWeeks.map((weekDays, i) => (
                  <div key={i} className="grid grid-cols-5 gap-2 border-b pb-4">
                      {weekDays.map(date => (
                          <div key={date.toISOString()} className="border rounded p-2 bg-white min-h-[100px] flex flex-col">
                               <div className="text-xs font-bold text-slate-400 mb-1 border-b border-slate-100 pb-1">{date.getDate()}</div>
                               <div className="flex-1 flex flex-col justify-center space-y-2">
                                   <div className="flex items-start text-[10px] text-slate-500">
                                       <span className="w-6 text-[9px] uppercase font-bold pt-1">Mat</span>
                                       <div className="flex-1 min-w-0">
                                          {renderSlot(DayOfWeek.MONDAY, Period.MORNING, date)} 
                                       </div>
                                   </div>
                                   <div className="flex items-start text-[10px] text-slate-500">
                                       <span className="w-6 text-[9px] uppercase font-bold pt-1">ApM</span>
                                       <div className="flex-1 min-w-0">
                                          {renderSlot(DayOfWeek.MONDAY, Period.AFTERNOON, date)}
                                       </div>
                                   </div>
                               </div>
                          </div>
                      ))}
                  </div>
              ))}
          </div>
      )
  }

  return (
    <div className="h-full flex flex-col space-y-4">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center">
        <div className="mb-4 md:mb-0">
             <h1 className="text-2xl font-bold text-slate-800 flex items-center">
                <Activity className="w-6 h-6 mr-3 text-orange-600" />
                Activités & Astreintes
            </h1>
        </div>
        
        <div className="flex flex-col sm:flex-row items-center space-y-2 sm:space-y-0 sm:space-x-2">
            
            {/* View Toggle */}
            <div className="flex bg-slate-200 p-1 rounded-lg mr-4">
                <button 
                    onClick={() => setViewMode('WEEK')}
                    className={`px-3 py-1 text-xs font-bold rounded ${viewMode === 'WEEK' ? 'bg-white shadow text-slate-800' : 'text-slate-500'}`}
                >
                    Semaine
                </button>
                <button 
                    onClick={() => setViewMode('MONTH')}
                    className={`px-3 py-1 text-xs font-bold rounded ${viewMode === 'MONTH' ? 'bg-white shadow text-slate-800' : 'text-slate-500'}`}
                >
                    Mois
                </button>
            </div>

            <div className="flex items-center bg-white rounded-lg shadow-sm border border-slate-200 p-1 mr-4">
                 <button onClick={() => handleWeekChange('prev')} className="p-1 hover:bg-slate-100 rounded">
                    <ChevronLeft className="w-5 h-5 text-slate-600" />
                </button>
                
                {viewMode === 'WEEK' ? (
                     <input 
                        type="date"
                        className="border-none text-slate-700 font-medium text-sm focus:ring-0 bg-transparent mx-2 w-32"
                        value={currentWeekStart.toISOString().split('T')[0]}
                        onChange={handleDateChange}
                    />
                ) : (
                    <span className="px-4 text-sm font-bold text-slate-700 capitalize w-32 text-center">
                        {currentWeekStart.toLocaleString('default', { month: 'long', year: 'numeric' })}
                    </span>
                )}

                <button onClick={() => handleWeekChange('next')} className="p-1 hover:bg-slate-100 rounded">
                    <ChevronRight className="w-5 h-5 text-slate-600" />
                </button>
            </div>

            <button 
                onClick={() => setShowSettings(!showSettings)}
                className="flex items-center px-3 py-2 bg-slate-200 hover:bg-slate-300 rounded text-slate-700 text-sm font-medium"
            >
                <Settings className="w-4 h-4 mr-2" />
                Gérer
            </button>
        </div>
      </div>

      {showSettings && (
          <div className="bg-white p-4 rounded-lg shadow border border-slate-200 mb-4 animate-in fade-in slide-in-from-top-2">
              <h3 className="font-bold text-sm mb-3">Créer une nouvelle activité</h3>
              <form onSubmit={handleCreateActivity} className="flex gap-4 items-end">
                  <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">Nom</label>
                      <input 
                        type="text" 
                        value={newActName}
                        onChange={e => setNewActName(e.target.value)}
                        className="border rounded px-2 py-1 text-sm" 
                        placeholder="Ex: Consult Douleur"
                        required
                      />
                  </div>
                  <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">Rythme</label>
                      <select 
                        value={newActType}
                        onChange={e => setNewActType(e.target.value as any)}
                        className="border rounded px-2 py-1 text-sm"
                      >
                          <option value="HALF_DAY">Demi-journée</option>
                          <option value="WEEKLY">Semaine entière</option>
                      </select>
                  </div>
                  <button type="submit" className="bg-blue-600 text-white px-3 py-1 rounded text-sm flex items-center">
                      <Plus className="w-4 h-4 mr-1" /> Ajouter
                  </button>
              </form>
          </div>
      )}

      {/* TABS */}
      <div className="flex space-x-2 border-b border-slate-200 pb-1 overflow-x-auto shrink-0">
          {activityDefinitions.map(act => (
              <button
                key={act.id}
                onClick={() => setActiveTabId(act.id)}
                className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors border-t border-l border-r whitespace-nowrap ${
                    activeTabId === act.id 
                    ? 'bg-white border-slate-300 text-blue-700 -mb-px' 
                    : 'bg-slate-50 border-transparent text-slate-500 hover:bg-slate-100'
                }`}
              >
                  {act.name}
              </button>
          ))}
      </div>

      {/* CONTENT */}
      <div className="flex-1 bg-white border border-slate-300 rounded-b-lg p-4 shadow-sm overflow-auto min-h-0">
          {viewMode === 'MONTH' ? (
              renderMonthGrid()
          ) : currentActivity?.granularity === 'WEEKLY' ? (
               // Weekly Single Assign View
              <div className="flex flex-col items-center">
                   <div className="w-full flex justify-end mb-2">
                       <button onClick={() => setChoiceSectionExpanded(!choiceSectionExpanded)} className="text-slate-400 hover:text-slate-600">
                           {choiceSectionExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                       </button>
                   </div>
                   
                   {choiceSectionExpanded && (
                      <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center justify-center max-w-md w-full transition-all">
                          
                          <div className="flex items-center space-x-4 mb-6 bg-white p-2 rounded-lg border border-slate-200">
                              <button 
                                onClick={() => setWeeklyAssignmentMode('AUTO')}
                                className={`px-4 py-2 text-sm font-bold rounded transition-colors ${weeklyAssignmentMode === 'AUTO' ? 'bg-blue-100 text-blue-800' : 'text-slate-500 hover:bg-slate-50'}`}
                              >
                                  <Wand2 className="w-4 h-4 inline-block mr-1" /> Auto / IA
                              </button>
                              <button 
                                onClick={() => setWeeklyAssignmentMode('MANUAL')}
                                className={`px-4 py-2 text-sm font-bold rounded transition-colors ${weeklyAssignmentMode === 'MANUAL' ? 'bg-blue-100 text-blue-800' : 'text-slate-500 hover:bg-slate-50'}`}
                              >
                                  <User className="w-4 h-4 inline-block mr-1" /> Manuel
                              </button>
                          </div>

                          <h3 className="text-lg font-bold text-slate-800 mb-4">Responsable de la Semaine</h3>
                          <div className="w-full">
                              {/* We use the first generated slot for this activity to control the logic */}
                              {(() => {
                                  const sampleSlot = schedule.find(s => s.activityId === activeTabId);
                                  if (!sampleSlot) return <div>Pas de créneau généré.</div>;

                                  return (
                                      <select 
                                            className={`w-full p-3 border rounded-lg text-lg text-center font-bold outline-none ring-2 ${sampleSlot.isLocked ? 'ring-blue-500 bg-white text-blue-800' : 'ring-transparent bg-slate-100 text-slate-500'}`}
                                            value={sampleSlot.isLocked ? sampleSlot.assignedDoctorId || "" : ""}
                                            onChange={(e) => handleWeeklyAssign(e.target.value)}
                                        >
                                            <option value="">-- {weeklyAssignmentMode === 'AUTO' ? 'Calcul Automatique' : 'Sélectionner'} --</option>
                                            {doctors.map(d => (
                                                <option key={d.id} value={d.id}>{d.name}</option>
                                            ))}
                                        </select>
                                  )
                              })()}
                          </div>
                          
                          <div className="mt-4 text-sm text-slate-500 text-center">
                              {weeklyAssignmentMode === 'AUTO' ? (
                                  <p className="flex items-center justify-center text-green-600 font-medium">
                                      <Wand2 className="w-4 h-4 mr-1"/>
                                      L'algorithme choisit automatiquement en équilibrant sur l'année.
                                  </p>
                              ) : (
                                  <p className="text-blue-600">
                                      Vous avez la main. Cette affectation s'appliquera à toute la semaine et bloquera les choix auto.
                                  </p>
                              )}
                              
                              {(() => {
                                  const sampleSlot = schedule.find(s => s.activityId === activeTabId);
                                  if (sampleSlot && !sampleSlot.isLocked && sampleSlot.assignedDoctorId) {
                                      const doc = doctors.find(d => d.id === sampleSlot.assignedDoctorId);
                                      return (
                                          <div className="mt-2 text-slate-400 font-bold text-xs">
                                              (Actuellement assigné : {doc?.name})
                                          </div>
                                      )
                                  }
                              })()}
                          </div>
                          
                          {/* Explicit AUTO trigger */}
                          {weeklyAssignmentMode === 'AUTO' && (
                              <div className="mt-2">
                                  <button 
                                        onClick={() => handleWeeklyAssign("")} // Clear Overrides
                                        className="text-xs underline text-slate-400 hover:text-blue-600"
                                    >
                                        Forcer le recalcul Auto
                                    </button>
                              </div>
                          )}
                      </div>
                   )}
              </div>
          ) : (
              // Standard Weekly Grid
              <div className="min-w-[700px]">
                <table className="w-full border-collapse table-fixed">
                  <thead>
                      <tr>
                          <th className="p-2 border bg-slate-100 text-xs font-bold text-slate-500 uppercase w-24">Période</th>
                          {days.map(d => {
                              const date = getDateForDayOfWeek(currentWeekStart, d);
                              const [year, month, day] = date.split('-');
                              return (
                                  <th key={d} className="p-2 border bg-slate-50 text-sm font-bold text-slate-700">
                                      {d} <span className="block text-xs font-normal text-slate-500">{day}/{month}</span>
                                  </th>
                              )
                          })}
                      </tr>
                  </thead>
                  <tbody>
                      <tr>
                          <td className="p-2 border bg-slate-50 text-xs font-bold text-center align-middle">Matin</td>
                          {days.map(d => (
                              <td key={`m-${d}`} className="p-2 border align-top h-auto">
                                  {renderSlot(d, Period.MORNING)}
                              </td>
                          ))}
                      </tr>
                      <tr>
                          <td className="p-2 border bg-slate-50 text-xs font-bold text-center align-middle">Après-midi</td>
                          {days.map(d => (
                              <td key={`am-${d}`} className="p-2 border align-top h-auto">
                                  {renderSlot(d, Period.AFTERNOON)}
                              </td>
                          ))}
                      </tr>
                  </tbody>
                </table>
              </div>
          )}
      </div>

      {/* COMPREHENSIVE ALERTS SECTION */}
      <div className="bg-red-50 rounded-lg border border-red-100 p-4 mt-4 shrink-0 shadow-sm">
          <h3 className="font-bold text-red-800 mb-3 text-sm flex items-center justify-between">
              <span className="flex items-center">
                 <AlertTriangle className="w-5 h-5 mr-2 text-red-600" />
                 Conflits Détectés ({currentActivity?.name})
              </span>
              <span className="text-xs bg-red-200 text-red-800 px-2 py-0.5 rounded-full">{activityConflicts.length}</span>
          </h3>
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {activityConflicts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-4 text-slate-500 italic">
                      <span className="text-sm">Aucun conflit avec d'autres activités ou RCP pour le moment.</span>
                      <span className="text-xs opacity-70 mt-1">L'application détecte en temps réel les chevauchements avec les Postes, RCP confirmées et autres activités.</span>
                  </div>
              ) : (
                  activityConflicts.map(conf => {
                      const doc = doctors.find(d => d.id === conf.doctorId);
                      const slot = schedule.find(s => s.id === conf.slotId);
                      return (
                          <div 
                                key={conf.id} 
                                onClick={() => handleAlertClick(conf)}
                                className="group flex items-start bg-white p-3 rounded-lg border border-red-200 shadow-sm hover:shadow-md hover:border-red-400 cursor-pointer transition-all"
                          >
                               <div className="mr-3 mt-0.5">
                                   <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center text-red-600">
                                       <AlertTriangle className="w-4 h-4" />
                                   </div>
                               </div>
                               <div className="flex-1">
                                   <div className="flex justify-between items-start">
                                       <span className="font-bold text-red-700 text-sm">
                                           {conf.type === 'DOUBLE_BOOKING' ? 'DOUBLE RÉSERVATION' : conf.type}
                                       </span>
                                       <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-mono">
                                            {slot?.day} {slot?.period === 'Matin' ? 'AM' : 'PM'}
                                       </span>
                                   </div>
                                   <div className="text-xs text-slate-700 mt-1">
                                       <span className="font-bold">{doc?.name}</span> : {conf.description}
                                   </div>
                                   <div className="mt-2 opacity-0 group-hover:opacity-100 transition-opacity flex justify-end">
                                       <span className="text-xs font-bold text-blue-600 flex items-center">
                                           Résoudre <ChevronRight className="w-3 h-3 ml-1" />
                                       </span>
                                   </div>
                               </div>
                          </div>
                      )
                  })
              )}
          </div>
      </div>

      {/* STATS TABLE with Global Equity */}
      <div className="bg-white rounded-lg shadow border border-slate-200 p-4 mt-4 shrink-0 transition-all">
          <div className="flex justify-between items-center mb-3">
              <h3 className="font-bold text-slate-800 text-sm flex items-center cursor-pointer" onClick={() => setStatsSectionExpanded(!statsSectionExpanded)}>
                  <span className="flex items-center">
                      Équité & Répartition Globale
                  </span>
                  <div className="ml-3 flex items-center space-x-2">
                     <span className="text-xs font-normal text-slate-500 hidden md:inline">Visualisation des scores indépendants</span>
                     {activitiesStartDate && (
                         <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold">
                             Depuis {new Date(activitiesStartDate).toLocaleDateString()}
                         </span>
                     )}
                     {statsSectionExpanded ? <Minimize2 className="w-4 h-4 text-slate-400" /> : <Maximize2 className="w-4 h-4 text-slate-400" />}
                  </div>
              </h3>
              
              {statsSectionExpanded && (
                  <button 
                      onClick={() => setShowPdfModal(true)} 
                      className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded flex items-center transition-colors"
                  >
                      <Printer className="w-3 h-3 mr-1"/>
                      Rapport PDF
                  </button>
              )}
          </div>
          
          {statsSectionExpanded && (
              <div className="space-y-6">
                  {/* TABLE 1: UNITY & ASTREINTE (Critical Load) - HIDE IF WORKFLOW TAB */}
                  {!isWorkflowTab && (
                    <div>
                        <h4 className="text-xs font-bold text-orange-600 uppercase mb-2 border-b border-orange-200 pb-1">1. Charge Critique : Astreinte + Unity</h4>
                        <div className="overflow-x-auto max-h-48 transition-all">
                            <table className="min-w-full text-xs text-left">
                                <thead className="bg-orange-50 border-b sticky top-0 z-10">
                                    <tr>
                                        <th className="p-2 font-bold text-slate-600">Médecin</th>
                                        <th className="p-2 font-bold text-slate-500">Taux Travail</th>
                                        <th className="p-2 font-bold text-orange-600">Unity (Total)</th>
                                        <th className="p-2 font-bold text-red-600">Astreinte (Total)</th>
                                        <th className="p-2 font-bold text-blue-600">Score Pondéré (U+A)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {doctors.sort((a,b) => {
                                        // Sort by Score Weighted (Ascending = Priority to assign)
                                        const scoreA = screenStats[a.id].weighted;
                                        const scoreB = screenStats[b.id].weighted;
                                        return scoreA - scoreB;
                                    }).map(d => {
                                        const stats = screenStats[d.id];
                                        const rate = getDoctorWorkRate(d);
                                        
                                        return (
                                            <tr key={d.id} className="border-b hover:bg-slate-50">
                                                <td className="p-2 font-medium text-slate-700 flex items-center">
                                                    <div className={`w-5 h-5 rounded-full mr-2 ${d.color} flex items-center justify-center text-[8px]`}>
                                                        {d.name.substring(0,2)}
                                                    </div>
                                                    {d.name}
                                                </td>
                                                <td className="p-2 text-slate-500">
                                                    {Math.round(rate * 100)}%
                                                </td>
                                                <td className="p-2 font-bold text-orange-600 bg-orange-50/30">
                                                    {stats.unity}
                                                </td>
                                                <td className="p-2 font-bold text-red-600 bg-red-50/30">
                                                    {stats.astreinte}
                                                </td>
                                                <td className="p-2 font-bold text-blue-600">
                                                    {stats.weighted.toFixed(1)}
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                  )}

                  {/* TABLE 2: SUPERVISION WORKFLOW (Independent) - SHOW ONLY IF WORKFLOW TAB */}
                  {isWorkflowTab && (
                    <div>
                        <h4 className="text-xs font-bold text-emerald-600 uppercase mb-2 border-b border-emerald-200 pb-1">2. Tâche de Fond : Supervision Workflow</h4>
                        <div className="overflow-x-auto max-h-48 transition-all">
                            <table className="min-w-full text-xs text-left">
                                <thead className="bg-emerald-50 border-b sticky top-0 z-10">
                                    <tr>
                                        <th className="p-2 font-bold text-slate-600">Médecin</th>
                                        <th className="p-2 font-bold text-emerald-600">Supervision (Semaines Cumulées)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {doctors.sort((a,b) => {
                                        // Sort by Workflow count (Ascending)
                                        const wfA = screenStats[a.id].workflow;
                                        const wfB = screenStats[b.id].workflow;
                                        return wfA - wfB;
                                    }).map(d => {
                                        const stats = screenStats[d.id];
                                        return (
                                            <tr key={d.id} className="border-b hover:bg-slate-50">
                                                <td className="p-2 font-medium text-slate-700 flex items-center">
                                                    <div className={`w-5 h-5 rounded-full mr-2 ${d.color} flex items-center justify-center text-[8px]`}>
                                                        {d.name.substring(0,2)}
                                                    </div>
                                                    {d.name}
                                                </td>
                                                <td className="p-2 font-bold text-emerald-600 bg-emerald-50/30">
                                                    {stats.workflow}
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                  )}
              </div>
          )}
      </div>

       {/* PDF DATE RANGE MODAL */}
       {showPdfModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
                  <div className="flex justify-between items-center mb-6">
                      <h3 className="text-lg font-bold text-slate-800 flex items-center">
                          <FileText className="w-5 h-5 mr-2 text-blue-600" />
                          Générer Rapport PDF
                      </h3>
                      <button onClick={() => setShowPdfModal(false)} className="text-slate-400 hover:text-slate-600">
                          <X className="w-5 h-5" />
                      </button>
                  </div>
                  
                  <div className="space-y-4 mb-6">
                      <div>
                          <label className="block text-xs font-bold text-slate-500 mb-1">Date de début</label>
                          <input 
                              type="date" 
                              className="w-full border rounded p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                              value={pdfStartDate}
                              onChange={e => setPdfStartDate(e.target.value)}
                          />
                      </div>
                      <div>
                          <label className="block text-xs font-bold text-slate-500 mb-1">Date de fin</label>
                          <input 
                              type="date" 
                              className="w-full border rounded p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                              value={pdfEndDate}
                              min={pdfStartDate}
                              onChange={e => setPdfEndDate(e.target.value)}
                          />
                      </div>
                      <div className="text-xs text-slate-500 bg-slate-50 p-3 rounded italic">
                          Le rapport calculera les statistiques consolidées (Unity, Astreinte, Supervision) sur cette période précise.
                      </div>
                  </div>

                  <button 
                      onClick={handleDownloadReport}
                      disabled={isGeneratingStatsPdf}
                      className="w-full py-2.5 bg-blue-600 text-white rounded-lg font-bold text-sm hover:bg-blue-700 flex items-center justify-center disabled:opacity-50 transition-all shadow-md"
                  >
                      {isGeneratingStatsPdf ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Printer className="w-4 h-4 mr-2" />}
                      {isGeneratingStatsPdf ? 'Génération...' : 'Télécharger le Rapport'}
                  </button>
              </div>
          </div>
       )}

       {selectedSlot && (
          <ConflictResolverModal
            slot={selectedSlot}
            conflict={selectedConflict || undefined}
            doctors={doctors}
            slots={schedule}
            unavailabilities={unavailabilities}
            onClose={() => { setSelectedSlot(null); setSelectedConflict(null); }}
            onResolve={handleManualAssign}
            onCloseSlot={handleCloseSlot}
          />
      )}

    </div>
  );
};

export default Activities;
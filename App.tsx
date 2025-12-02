
import React, { useState, useMemo, useEffect } from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';

// Pages
import Dashboard from './pages/Dashboard';
import Planning from './pages/Planning';
import Profile from './pages/Profile';
import Configuration from './pages/Configuration';
import Activities from './pages/Activities';
import Login from './pages/Login';
import AdminPanel from './pages/AdminPanel';

// Components & Services
import Sidebar from './components/Sidebar';
import { DEFAULT_TEMPLATE, INITIAL_ACTIVITIES } from './constants';
import { ScheduleSlot, Unavailability, Conflict, Doctor, ScheduleTemplateSlot, ActivityDefinition, RcpDefinition, AppContextType, ShiftHistory, ManualOverrides, RcpAttendance, RcpException, UserRole, RoleDefinition, GlobalBackupData } from './types';
import { detectConflicts, generateScheduleForWeek, computeHistoryFromDate } from './services/scheduleService';
import { Menu, Loader2 } from 'lucide-react';
import { doctorService } from './services/api/doctorService';
import { db, isCloudMode } from './services/api/index';

export const AppContext = React.createContext<AppContextType>({} as AppContextType);

const AppShell: React.FC = () => {
    const { user, logout, hasPermission: checkAuthPermission, isLoading: authLoading } = useAuth();
    
    // --- APP STATE ---
    const [doctors, setDoctors] = useState<Doctor[]>([]);
    const [roles, setRoles] = useState<RoleDefinition[]>([]);
    const [template, setTemplate] = useState<ScheduleTemplateSlot[]>(DEFAULT_TEMPLATE);
    const [postes, setPostes] = useState<string[]>([]);
    const [rcpTypes, setRcpTypes] = useState<RcpDefinition[]>([]);
    const [activityDefinitions, setActivityDefinitions] = useState<ActivityDefinition[]>(INITIAL_ACTIVITIES);
    const [unavailabilities, setUnavailabilities] = useState<Unavailability[]>([]);
    const [manualOverrides, setManualOverrides] = useState<ManualOverrides>({});
    const [rcpAttendance, setRcpAttendance] = useState<RcpAttendance>({});
    const [rcpExceptions, setRcpExceptions] = useState<RcpException[]>([]);
    const [activitiesStartDate, setActivitiesStartDate] = useState<string | null>(null);
    const [shiftHistory, setShiftHistory] = useState<ShiftHistory>({});
    
    const [dataLoading, setDataLoading] = useState(true);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [currentUser, setCurrentUser] = useState<Doctor | null>(null);
    const [currentReferenceDate] = useState<Date>(new Date());
    const [schedule, setSchedule] = useState<ScheduleSlot[]>([]);

    const hasPermission = (permission: string) => checkAuthPermission(permission, roles);

    useEffect(() => {
        if (!user) return; 

        let isMounted = true;
        const safetyTimeout = setTimeout(() => {
            if (isMounted && dataLoading) {
                console.warn("Data loading timed out, forcing render.");
                setDataLoading(false);
            }
        }, 10000);

        const fetchData = async () => {
            setDataLoading(true);
            try {
                const [docs, rls, tmpl, acts, rcps, unavs, history, ovrs, att, exc, psts, sDate] = await Promise.all([
                    doctorService.getAllDoctors(),
                    db.collection('ROLES').get([]),
                    db.collection('TEMPLATE').get(DEFAULT_TEMPLATE),
                    db.collection('ACTIVITIES').get(INITIAL_ACTIVITIES),
                    db.collection('RCP_TYPES').get([]),
                    db.collection('UNAVAILABILITIES').get([]),
                    db.collection('HISTORY').get({}),
                    db.collection('OVERRIDES').get({}),
                    db.collection('ATTENDANCE').get({}),
                    db.collection('EXCEPTIONS').get([]),
                    db.collection('POSTES').get(['Box 1', 'Box 2', 'Box 3']),
                    db.collection('START_DATE').get(null)
                ]);

                if (isMounted) {
                    setDoctors(docs);
                    setRoles(rls);
                    setTemplate(tmpl);
                    setActivityDefinitions(acts);
                    setRcpTypes(rcps);
                    setUnavailabilities(unavs);
                    setShiftHistory(history);
                    setManualOverrides(ovrs);
                    setRcpAttendance(att);
                    setRcpExceptions(exc);
                    setPostes(psts);
                    setActivitiesStartDate(sDate);
                    
                    if (!currentUser) {
                        setCurrentUser(docs.find(d => d.id === user.id) || null);
                    }
                }
            } catch (e) {
                console.error("Failed to load initial data", e);
            } finally {
                if (isMounted) setDataLoading(false);
                clearTimeout(safetyTimeout);
            }
        };

        fetchData();
        return () => { isMounted = false; clearTimeout(safetyTimeout); };
    }, [user]);

    // --- PERSISTENCE ---
    useEffect(() => { if(!dataLoading && user) db.collection('TEMPLATE').set(template); }, [template, dataLoading, user]);
    useEffect(() => { if(!dataLoading && user) db.collection('POSTES').set(postes); }, [postes, dataLoading, user]);
    useEffect(() => { if(!dataLoading && user) db.collection('RCP_TYPES').set(rcpTypes); }, [rcpTypes, dataLoading, user]);
    useEffect(() => { if(!dataLoading && user) db.collection('ACTIVITIES').set(activityDefinitions); }, [activityDefinitions, dataLoading, user]);
    useEffect(() => { if(!dataLoading && user) db.collection('UNAVAILABILITIES').set(unavailabilities); }, [unavailabilities, dataLoading, user]);
    useEffect(() => { if(!dataLoading && user) db.collection('OVERRIDES').set(manualOverrides); }, [manualOverrides, dataLoading, user]);
    useEffect(() => { if(!dataLoading && user) db.collection('ATTENDANCE').set(rcpAttendance); }, [rcpAttendance, dataLoading, user]);
    useEffect(() => { if(!dataLoading && user) db.collection('EXCEPTIONS').set(rcpExceptions); }, [rcpExceptions, dataLoading, user]);
    useEffect(() => { if(!dataLoading && user) db.collection('HISTORY').set(shiftHistory); }, [shiftHistory, dataLoading, user]);
    useEffect(() => { if(!dataLoading && user) db.collection('START_DATE').set(activitiesStartDate); }, [activitiesStartDate, dataLoading, user]);
    useEffect(() => { if(!dataLoading && user) db.collection('ROLES').set(roles); }, [roles, dataLoading, user]);

    // --- SCHEDULE GEN ---
    const effectiveHistory = useMemo(() => {
        if (activitiesStartDate) {
            return computeHistoryFromDate(activitiesStartDate, currentReferenceDate, template, unavailabilities, doctors, activityDefinitions, rcpTypes, manualOverrides);
        }
        return shiftHistory;
    }, [activitiesStartDate, currentReferenceDate, template, unavailabilities, doctors, activityDefinitions, rcpTypes, manualOverrides, shiftHistory]);

    useEffect(() => {
        if (dataLoading || doctors.length === 0) {
            setSchedule([]);
            return;
        }
        try {
            const generated = generateScheduleForWeek(
                currentReferenceDate, template, unavailabilities, doctors, activityDefinitions,
                rcpTypes, true, effectiveHistory, rcpAttendance, rcpExceptions
            );
            const finalSchedule = generated.map(slot => {
                const overrideValue = manualOverrides[slot.id];
                if (overrideValue) {
                    return overrideValue === '__CLOSED__' 
                        ? { ...slot, assignedDoctorId: null, isLocked: true, isClosed: true }
                        : { ...slot, assignedDoctorId: overrideValue, isLocked: true };
                }
                return slot;
            });
            setSchedule(finalSchedule);
        } catch (e) {
            console.error("Schedule generation failed", e);
            setSchedule([]);
        }
    }, [currentReferenceDate, template, unavailabilities, doctors, activityDefinitions, rcpTypes, effectiveHistory, manualOverrides, rcpAttendance, rcpExceptions, dataLoading]);


    const conflicts = useMemo(() => {
        if (!schedule || schedule.length === 0) return [];
        return detectConflicts(schedule, unavailabilities, doctors, activityDefinitions);
    }, [schedule, unavailabilities, doctors, activityDefinitions]);

    // --- ACTIONS ---
    const addDoctor = async (d: Doctor) => {
        const newDoc = await doctorService.createDoctor(d);
        setDoctors(prev => [...prev, newDoc]);
    };
    
    const updateDoctor = async (d: Doctor) => {
        const updated = await doctorService.updateDoctor(d);
        setDoctors(prev => prev.map(doc => doc.id === updated.id ? updated : doc));
    };

    const removeDoctor = async (id: string) => {
        await doctorService.deleteDoctor(id);
        setDoctors(prev => prev.filter(d => d.id !== id));
        setTemplate(prev => prev.map(t => ({
            ...t,
            defaultDoctorId: t.defaultDoctorId === id ? null : t.defaultDoctorId,
            secondaryDoctorIds: t.secondaryDoctorIds?.filter(sid => sid !== id),
            backupDoctorId: t.backupDoctorId === id ? null : t.backupDoctorId,
            doctorIds: t.doctorIds?.filter(did => did !== id)
        })));
    };

    // Role Management
    const addRole = async (name: string) => {
        const newRole: RoleDefinition = {
            id: `role_${Date.now()}`,
            name,
            isSystem: false,
            permissions: []
        };
        setRoles(prev => [...prev, newRole]);
    };

    const updateRole = (updatedRole: RoleDefinition) => {
        setRoles(prev => prev.map(r => r.id === updatedRole.id ? updatedRole : r));
    };

    const removeRole = async (id: string) => {
        setRoles(prev => prev.filter(r => r.id !== id));
    };

    // RCP Management
    const removeRcpType = (id: string) => {
        const rcpToDelete = rcpTypes.find(r => r.id === id);
        if (!rcpToDelete) return;

        setRcpTypes(prev => prev.filter(r => r.id !== id));
        setTemplate(prev => prev.filter(t => t.location !== rcpToDelete.name));
        setRcpExceptions(prev => prev.filter(e => e.rcpTemplateId !== id));
        setRcpAttendance(prev => {
            const next = { ...prev };
            Object.keys(next).forEach(key => {
                if (key.includes(id) || key.includes(rcpToDelete.name)) {
                    delete next[key];
                }
            });
            return next;
        });
    };
    
    const renameRcpType = (oldName: string, newName: string) => {
        setRcpTypes(prev => prev.map(x => x.name === oldName ? { ...x, name: newName } : x));
        setTemplate(prev => prev.map(t => {
            if (t.location === oldName) {
                return { ...t, location: newName, subType: newName };
            }
            return t;
        }));
    };

    const importConfiguration = (backup: GlobalBackupData) => {
        if (!backup || !backup.data) {
            alert("Fichier invalide");
            return;
        }
        db.importData(backup).then(() => {
            window.location.reload();
        });
    }

    if (authLoading) {
        return (
            <div className="flex h-screen items-center justify-center bg-slate-50">
                <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
            </div>
        );
    }

    if (!user) return <Navigate to="/login" />;

    if (dataLoading) {
        return (
            <div className="flex h-screen items-center justify-center bg-slate-50">
                <div className="flex flex-col items-center">
                    <Loader2 className="w-10 h-10 text-blue-600 animate-spin mb-4" />
                    <p className="text-slate-500 font-medium">Chargement des données...</p>
                </div>
            </div>
        );
    }

    return (
        <AppContext.Provider value={{
            user, isLoading: authLoading, login: async()=>{}, logout, hasPermission,
            isCloudMode: isCloudMode(),
            roles, updateRole, addRole, removeRole,
            doctors, addDoctor, updateDoctor, removeDoctor, currentUser, setCurrentUser,
            schedule, template, unavailabilities, conflicts, rcpTypes, postes,
            addPoste: (name) => setPostes(p => [...p, name]),
            removePoste: (name) => setPostes(p => p.filter(x => x !== name)),
            activityDefinitions, addActivityDefinition: (a) => setActivityDefinitions(p => [...p, a]),
            updateSchedule: setSchedule, updateTemplate: setTemplate,
            addUnavailability: (u) => setUnavailabilities(p => [...p, u]),
            removeUnavailability: (id) => setUnavailabilities(p => p.filter(u => u.id !== id)),
            addRcpType: (name) => setRcpTypes(p => [...p, { id: `rcp_${Date.now()}`, name, frequency: 'WEEKLY' }]),
            updateRcpDefinition: (def) => setRcpTypes(p => p.map(x => x.id === def.id ? def : x)),
            removeRcpType, 
            renameRcpType,
            shiftHistory, manualOverrides, setManualOverrides,
            importConfiguration,
            rcpAttendance, setRcpAttendance, rcpExceptions,
            addRcpException: (ex) => setRcpExceptions(p => [...p.filter(e => !(e.rcpTemplateId === ex.rcpTemplateId && e.originalDate === ex.originalDate)), ex]),
            removeRcpException: (tId, date) => setRcpExceptions(p => p.filter(e => !(e.rcpTemplateId === tId && e.originalDate === date))),
            activitiesStartDate, setActivitiesStartDate
        }}>
            <div className="flex h-screen overflow-hidden print:overflow-visible print:h-auto print:block">
                <div className="md:hidden fixed top-0 left-0 right-0 h-14 bg-slate-900 text-white flex items-center justify-between px-4 z-50 shadow-md">
                    <span className="font-bold tracking-wider text-blue-400">RadioPlan AI</span>
                    <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2 rounded hover:bg-slate-800">
                        <Menu className="w-6 h-6" />
                    </button>
                </div>

                <Sidebar isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)} />

                <div className="flex-1 flex flex-col overflow-hidden print:overflow-visible print:h-auto print:block pt-14 md:pt-0 transition-all duration-300">
                    <main className="flex-1 overflow-x-hidden overflow-y-auto bg-slate-50 p-4 md:p-6 print:overflow-visible print:h-auto print:bg-white print:p-0">
                        <Routes>
                            <Route path="/" element={<Dashboard />} />
                            <Route path="/planning" element={<Planning />} />
                            <Route path="/activities" element={<Activities />} />
                            <Route path="/configuration" element={hasPermission('manage_rules') ? <Configuration /> : <Navigate to="/" />} />
                            <Route path="/admin" element={hasPermission('view_admin_panel') ? <AdminPanel /> : <Navigate to="/" />} />
                            <Route path="/profile" element={<Profile />} />
                            <Route path="*" element={<Navigate to="/" replace />} />
                        </Routes>
                    </main>
                </div>
            </div>
        </AppContext.Provider>
    );
};

const App: React.FC = () => {
    return (
        <AuthProvider>
            <Router>
                <Routes>
                    <Route path="/login" element={<Login />} />
                    <Route path="/*" element={<AppShell />} />
                </Routes>
            </Router>
        </AuthProvider>
    );
};

export default App;

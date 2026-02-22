import React, { useEffect, useState, useContext } from 'react';
import { supabase } from '../../services/supabaseClient';
import { AppRole, Doctor, Specialty, DayOfWeek, SlotType, Period, Unavailability, ExcludedHalfDay } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { AppContext } from '../../App';
import { unavailabilityService } from '../../services/unavailabilityService';
import { Users, UserPlus, Edit2, Trash2, X, Save, Key, UserCheck, Mail, Shield, Eye, EyeOff, AlertTriangle, Loader2, RefreshCw, Stethoscope, Link2, Unlink, Tag, Plus, Ban, Calendar } from 'lucide-react';

interface UserData {
    id: string;
    email: string;
    role: string;
    role_id: string;
    doctor_id?: string;
    app_roles?: { name: string };
    doctors?: { id: string; name: string; color: string };
}

interface DoctorWithUser {
    id: string;
    name: string;
    color: string;
    specialty: string[];
    excludedDays: DayOfWeek[];
    excludedHalfDays?: ExcludedHalfDay[]; // NEW: Granular half-day exclusions
    excludedActivities: string[];
    excludedSlotTypes: SlotType[];
    linkedUser?: { id: string; email: string } | null;
}

// Roles that should NOT have a doctor profile
const NON_DOCTOR_ROLES = ['Secrétariat', 'Secretariat', 'Secretary'];

const TeamManagement: React.FC = () => {
    const { hasPermission } = useAuth();
    const { doctors, removeDoctor, updateDoctor, activityDefinitions, unavailabilities, addUnavailability, removeUnavailability } = useContext(AppContext);
    const [users, setUsers] = useState<UserData[]>([]);
    const [roles, setRoles] = useState<AppRole[]>([]);
    const [allDoctors, setAllDoctors] = useState<DoctorWithUser[]>([]);
    const [specialties, setSpecialties] = useState<Specialty[]>([]);
    const [loading, setLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);

    // View toggle - persisted in sessionStorage
    const [activeView, setActiveViewState] = useState<'users' | 'doctors' | 'specialties'>(() => {
        const saved = sessionStorage.getItem('teamManagement_activeView');
        return (saved === 'doctors' || saved === 'specialties') ? saved : 'users';
    });
    const setActiveView = (view: 'users' | 'doctors' | 'specialties') => {
        sessionStorage.setItem('teamManagement_activeView', view);
        setActiveViewState(view);
    };

    // Modal States
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<UserData | null>(null);

    // Doctor Edit Modal State - persist in sessionStorage to survive context re-renders
    const [isEditDoctorModalOpen, setIsEditDoctorModalOpenState] = useState(() => {
        return sessionStorage.getItem('teamMgmt_editDoctorModalOpen') === 'true';
    });
    const [editingDoctorId, setEditingDoctorIdState] = useState<string | null>(() => {
        return sessionStorage.getItem('teamMgmt_editingDoctorId') || null;
    });
    const [editingDoctor, setEditingDoctor] = useState<DoctorWithUser | null>(null);

    // Wrapper functions to persist modal state
    const setIsEditDoctorModalOpen = (isOpen: boolean) => {
        if (isOpen) {
            sessionStorage.setItem('teamMgmt_editDoctorModalOpen', 'true');
        } else {
            sessionStorage.removeItem('teamMgmt_editDoctorModalOpen');
            sessionStorage.removeItem('teamMgmt_editingDoctorId');
        }
        setIsEditDoctorModalOpenState(isOpen);
    };

    const setEditingDoctorId = (id: string | null) => {
        if (id) {
            sessionStorage.setItem('teamMgmt_editingDoctorId', id);
        } else {
            sessionStorage.removeItem('teamMgmt_editingDoctorId');
        }
        setEditingDoctorIdState(id);
    };

    const [doctorFormData, setDoctorFormData] = useState({
        name: '',
        color: '#3B82F6',
        selectedSpecialties: [] as string[],
        excludedDays: [] as DayOfWeek[],
        excludedHalfDays: [] as ExcludedHalfDay[], // NEW: Granular half-day exclusions
        excludedActivities: [] as string[],
        excludedSlotTypes: [] as SlotType[]
    });


    // Specialty Management State
    const [newSpecialtyName, setNewSpecialtyName] = useState('');
    const [newSpecialtyColor, setNewSpecialtyColor] = useState('#3b82f6');
    const [deleteSpecialtyConfirmId, setDeleteSpecialtyConfirmId] = useState<string | null>(null);

    // Unavailability Form State (in doctor edit modal)
    const [unavailStartDate, setUnavailStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [unavailEndDate, setUnavailEndDate] = useState(new Date().toISOString().split('T')[0]);
    const [unavailPeriod, setUnavailPeriod] = useState<'ALL_DAY' | Period>('ALL_DAY');
    const [unavailReason, setUnavailReason] = useState('CONGRES');
    const [unavailCustomReason, setUnavailCustomReason] = useState('');
    const [deleteUnavailConfirmId, setDeleteUnavailConfirmId] = useState<string | null>(null);

    // Local copy of unavailabilities for the currently editing doctor
    // This allows instant UI updates without triggering global recalculations
    const [localDoctorUnavails, setLocalDoctorUnavails] = useState<Unavailability[]>([]);

    // Form State
    const [formData, setFormData] = useState({
        email: '',
        password: '',
        name: '',
        roleId: '',
        color: '#3B82F6',
        existingDoctorId: '' // New: to link to existing doctor
    });
    const [linkMode, setLinkMode] = useState<'new' | 'existing'>('new');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
    const [deleteDoctorConfirmId, setDeleteDoctorConfirmId] = useState<string | null>(null);

    // Restore editing doctor from sessionStorage when allDoctors are loaded
    useEffect(() => {
        if (editingDoctorId && allDoctors.length > 0 && !editingDoctor) {
            const doctor = allDoctors.find(d => d.id === editingDoctorId);
            if (doctor) {
                setEditingDoctor(doctor);

                // AUTO-MIGRATION: Convert legacy excludedDays to excludedHalfDays
                let migratedHalfDays: ExcludedHalfDay[] = doctor.excludedHalfDays || [];
                if ((!migratedHalfDays || migratedHalfDays.length === 0) && doctor.excludedDays && doctor.excludedDays.length > 0) {
                    migratedHalfDays = doctor.excludedDays.flatMap(day => [
                        { day, period: Period.MORNING },
                        { day, period: Period.AFTERNOON }
                    ]);
                }

                setDoctorFormData({
                    name: doctor.name,
                    color: doctor.color || '#3B82F6',
                    selectedSpecialties: doctor.specialty || [],
                    excludedDays: doctor.excludedDays || [],
                    excludedHalfDays: migratedHalfDays,
                    excludedActivities: doctor.excludedActivities || [],
                    excludedSlotTypes: doctor.excludedSlotTypes || []
                });
                // Also restore local unavailabilities
                setLocalDoctorUnavails(unavailabilities.filter(u => u.doctorId === doctor.id));
            }
        }
    }, [editingDoctorId, allDoctors, editingDoctor, unavailabilities]);


    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            // Fetch users with their roles and doctors
            const { data: usersData, error: usersError } = await supabase
                .from('profiles')
                .select('*, app_roles(name), doctors(id, name, color)')
                .order('email');

            if (usersError) console.error('Error fetching users:', usersError);

            // Fetch roles
            const { data: rolesData, error: rolesError } = await supabase
                .from('app_roles')
                .select('*');

            if (rolesError) console.error('Error fetching roles:', rolesError);

            // Fetch all doctors with their linked users and exclusions
            const { data: doctorsData, error: doctorsError } = await supabase
                .from('doctors')
                .select('id, name, color, specialty, excluded_days, excluded_half_days, excluded_activities, excluded_slot_types')
                .order('name');

            if (doctorsError) console.error('Error fetching doctors:', doctorsError);

            // Fetch specialties
            const { data: specialtiesData, error: specialtiesError } = await supabase
                .from('specialties')
                .select('*')
                .order('name');

            if (specialtiesError) console.error('Error fetching specialties:', specialtiesError);

            // Map doctors with their linked users
            const doctorsWithUsers: DoctorWithUser[] = (doctorsData || []).map(doc => {
                const linkedUser = (usersData || []).find(u => u.doctor_id === doc.id);
                return {
                    id: doc.id,
                    name: doc.name,
                    color: doc.color,
                    specialty: doc.specialty || [],
                    excludedDays: doc.excluded_days || [],
                    excludedHalfDays: doc.excluded_half_days || [], // NEW: Granular half-day exclusions
                    excludedActivities: doc.excluded_activities || [],
                    excludedSlotTypes: doc.excluded_slot_types || [],
                    linkedUser: linkedUser ? { id: linkedUser.id, email: linkedUser.email } : null
                };
            });


            setUsers(usersData || []);
            setRoles(rolesData || []);
            setAllDoctors(doctorsWithUsers);
            setSpecialties(specialtiesData || []);
        } catch (err) {
            console.error('Error fetching data:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleRefresh = async () => {
        setIsRefreshing(true);
        await fetchData();
        setIsRefreshing(false);
    };

    // Get unlinked doctors (for linking to users)
    const getUnlinkedDoctors = (): DoctorWithUser[] => {
        return allDoctors.filter(d => !d.linkedUser);
    };

    const isNonDoctorRole = (roleId: string): boolean => {
        const role = roles.find(r => r.id === roleId);
        return role ? NON_DOCTOR_ROLES.some(nr => role.name.toLowerCase().includes(nr.toLowerCase())) : false;
    };

    const getSelectedRoleName = (): string => {
        const role = roles.find(r => r.id === formData.roleId);
        return role?.name || '';
    };

    const handleCreateUser = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');
        setIsSubmitting(true);

        if (!formData.email || !formData.password || !formData.roleId) {
            setError('Email, mot de passe et rôle sont obligatoires');
            setIsSubmitting(false);
            return;
        }

        const isNonDoctor = isNonDoctorRole(formData.roleId);

        if (!isNonDoctor && linkMode === 'new' && !formData.name.trim()) {
            setError('Le nom du médecin est obligatoire pour ce rôle');
            setIsSubmitting(false);
            return;
        }

        try {
            let doctorData = null;
            if (!isNonDoctor && linkMode === 'new' && formData.name.trim()) {
                const doctorName = formData.name.startsWith('Dr') || formData.name.startsWith('Pr')
                    ? formData.name
                    : `Dr ${formData.name}`;

                doctorData = {
                    name: doctorName,
                    color: formData.color
                };
            }

            const response = await supabase.functions.invoke('admin-create-user', {
                body: {
                    action: 'create',
                    email: formData.email,
                    password: formData.password,
                    roleId: formData.roleId,
                    doctorData,
                    existingDoctorId: linkMode === 'existing' ? formData.existingDoctorId : null
                }
            });

            if (response.error) {
                throw new Error(response.error.message || 'Erreur lors de la création');
            }

            if (response.data?.error) {
                throw new Error(response.data.error);
            }

            setSuccess('Compte créé avec succès !');
            resetForm();

            setTimeout(() => {
                setIsCreateModalOpen(false);
                setSuccess('');
                fetchData();
            }, 1000);

        } catch (err: any) {
            console.error('Create user error:', err);
            setError(err.message || 'Erreur lors de la création');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleEditUser = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingUser) return;

        setError('');
        setSuccess('');
        setIsSubmitting(true);

        try {
            const isNonDoctor = isNonDoctorRole(formData.roleId);

            let doctorData = null;
            if (!isNonDoctor && linkMode === 'new' && formData.name.trim()) {
                const doctorName = formData.name.startsWith('Dr') || formData.name.startsWith('Pr')
                    ? formData.name
                    : `Dr ${formData.name}`;

                doctorData = {
                    name: doctorName,
                    color: formData.color
                };
            }

            const response = await supabase.functions.invoke('admin-create-user', {
                body: {
                    action: 'update',
                    userId: editingUser.id,
                    roleId: formData.roleId,
                    doctorData,
                    existingDoctorId: linkMode === 'existing' ? formData.existingDoctorId : null,
                    newPassword: formData.password || undefined
                }
            });

            if (response.error) {
                throw new Error(response.error.message || 'Erreur lors de la mise à jour');
            }

            if (response.data?.error) {
                throw new Error(response.data.error);
            }

            if (response.data?.warning) {
                setSuccess(response.data.warning);
            } else {
                setSuccess('Profil mis à jour avec succès !');
            }

            setTimeout(() => {
                setIsEditModalOpen(false);
                setEditingUser(null);
                setSuccess('');
                fetchData();
            }, 1000);

        } catch (err: any) {
            console.error('Update user error:', err);
            setError(err.message || 'Erreur lors de la mise à jour');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteUser = async (user: UserData) => {
        if (deleteConfirmId !== user.id) {
            setDeleteConfirmId(user.id);
            setTimeout(() => setDeleteConfirmId(null), 3000);
            return;
        }

        setDeleteConfirmId(null);

        try {
            const response = await supabase.functions.invoke('admin-create-user', {
                body: {
                    action: 'delete',
                    userId: user.id,
                    doctorId: user.doctor_id
                }
            });

            if (response.error) {
                throw new Error(response.error.message || 'Erreur lors de la suppression');
            }

            if (response.data?.error) {
                throw new Error(response.data.error);
            }

            if (user.doctor_id) {
                removeDoctor(user.doctor_id);
            }

            fetchData();

        } catch (err: any) {
            console.error('Delete user error:', err);
            alert(`Erreur lors de la suppression: ${err.message}`);
        }
    };

    const handleDeleteDoctor = async (doctor: DoctorWithUser) => {
        if (deleteDoctorConfirmId !== doctor.id) {
            setDeleteDoctorConfirmId(doctor.id);
            setTimeout(() => setDeleteDoctorConfirmId(null), 3000);
            return;
        }

        setDeleteDoctorConfirmId(null);

        try {
            // If doctor is linked to a user, unlink first
            if (doctor.linkedUser) {
                const { error: unlinkError } = await supabase
                    .from('profiles')
                    .update({ doctor_id: null })
                    .eq('id', doctor.linkedUser.id);

                if (unlinkError) {
                    throw new Error('Erreur lors de la dissociation: ' + unlinkError.message);
                }
            }

            // Delete the doctor
            const { error: deleteError } = await supabase
                .from('doctors')
                .delete()
                .eq('id', doctor.id);

            if (deleteError) {
                throw new Error('Erreur lors de la suppression: ' + deleteError.message);
            }

            removeDoctor(doctor.id);
            fetchData();

        } catch (err: any) {
            console.error('Delete doctor error:', err);
            alert(`Erreur: ${err.message}`);
        }
    };

    const openEditModal = (user: UserData) => {
        setEditingUser(user);
        setFormData({
            email: user.email,
            password: '',
            name: user.doctors?.name || '',
            roleId: user.role_id || '',
            color: user.doctors?.color || '#3B82F6',
            existingDoctorId: user.doctor_id || ''
        });
        setLinkMode(user.doctor_id ? 'existing' : 'new');
        setError('');
        setSuccess('');
        setIsEditModalOpen(true);
    };

    const resetForm = () => {
        setFormData({ email: '', password: '', name: '', roleId: '', color: '#3B82F6', existingDoctorId: '' });
        setLinkMode('new');
        setError('');
        setSuccess('');
    };

    // === DOCTOR EDIT HANDLERS ===
    const openEditDoctorModal = (doctor: DoctorWithUser) => {
        setEditingDoctor(doctor);
        setEditingDoctorId(doctor.id); // Persist to sessionStorage

        // AUTO-MIGRATION: Convert legacy excludedDays to excludedHalfDays
        // If doctor has excludedDays but no excludedHalfDays, auto-convert
        let migratedHalfDays: ExcludedHalfDay[] = doctor.excludedHalfDays || [];

        if ((!migratedHalfDays || migratedHalfDays.length === 0) && doctor.excludedDays && doctor.excludedDays.length > 0) {
            // Convert each full day to 2 half-days (morning + afternoon)
            migratedHalfDays = doctor.excludedDays.flatMap(day => [
                { day, period: Period.MORNING },
                { day, period: Period.AFTERNOON }
            ]);
            console.log('🔄 Auto-migrating excludedDays to excludedHalfDays:', migratedHalfDays);
        }

        setDoctorFormData({
            name: doctor.name,
            color: doctor.color || '#3B82F6',
            selectedSpecialties: doctor.specialty || [],
            excludedDays: doctor.excludedDays || [],
            excludedHalfDays: migratedHalfDays,
            excludedActivities: doctor.excludedActivities || [],
            excludedSlotTypes: doctor.excludedSlotTypes || []
        });
        // Initialize local unavailabilities from global context
        setLocalDoctorUnavails(unavailabilities.filter(u => u.doctorId === doctor.id));
        setError('');
        setSuccess('');
        setIsEditDoctorModalOpen(true);
    };


    const handleEditDoctor = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingDoctor) return;

        setError('');
        setSuccess('');
        setIsSubmitting(true);

        try {
            const updateData = {
                name: doctorFormData.name,
                color: doctorFormData.color,
                specialty: doctorFormData.selectedSpecialties,
                excluded_days: doctorFormData.excludedDays,
                excluded_half_days: doctorFormData.excludedHalfDays,
                excluded_activities: doctorFormData.excludedActivities,
                excluded_slot_types: doctorFormData.excludedSlotTypes
            };


            const { error: updateError, data: updateResult } = await supabase
                .from('doctors')
                .update(updateData)
                .eq('id', editingDoctor.id)
                .select();

            if (updateError) throw new Error(updateError.message);


            // Update global AppContext so planning immediately reflects changes
            if (updateResult && updateResult.length > 0) {
                const savedDoc = updateResult[0];
                updateDoctor({
                    id: savedDoc.id,
                    name: savedDoc.name,
                    specialty: savedDoc.specialty || [],
                    color: savedDoc.color,
                    excludedDays: savedDoc.excluded_days || [],
                    excludedHalfDays: savedDoc.excluded_half_days || [],
                    excludedActivities: savedDoc.excluded_activities || [],
                    excludedSlotTypes: savedDoc.excluded_slot_types || []
                });
            }

            setSuccess('Profil médecin mis à jour !');

            setTimeout(() => {
                setIsEditDoctorModalOpen(false);
                setEditingDoctor(null);
                setEditingDoctorId(null);
                setSuccess('');
                fetchData();
            }, 1000);


        } catch (err: any) {
            console.error('Update doctor error:', err);
            setError(err.message || 'Erreur lors de la mise à jour');
        } finally {
            setIsSubmitting(false);
        }
    };

    // === SPECIALTY HANDLERS ===
    const handleCreateSpecialty = async () => {
        if (!newSpecialtyName.trim()) return;

        setIsSubmitting(true);
        setError('');

        try {
            const { error: insertError } = await supabase
                .from('specialties')
                .insert({
                    name: newSpecialtyName.trim(),
                    color: newSpecialtyColor
                });

            if (insertError) throw new Error(insertError.message);

            setNewSpecialtyName('');
            setNewSpecialtyColor('#3b82f6');
            setSuccess('Spécialité créée !');
            fetchData();

            setTimeout(() => setSuccess(''), 2000);

        } catch (err: any) {
            console.error('Create specialty error:', err);
            setError(err.message || 'Erreur lors de la création');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteSpecialty = async (specialty: Specialty) => {
        if (deleteSpecialtyConfirmId !== specialty.id) {
            setDeleteSpecialtyConfirmId(specialty.id);
            setTimeout(() => setDeleteSpecialtyConfirmId(null), 3000);
            return;
        }

        setDeleteSpecialtyConfirmId(null);

        try {
            const { error: deleteError } = await supabase
                .from('specialties')
                .delete()
                .eq('id', specialty.id);

            if (deleteError) throw new Error(deleteError.message);

            setSuccess('Spécialité supprimée');
            fetchData();

            setTimeout(() => setSuccess(''), 2000);

        } catch (err: any) {
            console.error('Delete specialty error:', err);
            setError(err.message || 'Erreur lors de la suppression');
        }
    };

    const toggleDoctorSpecialty = (specialtyName: string) => {
        setDoctorFormData(prev => {
            const current = prev.selectedSpecialties;
            if (current.includes(specialtyName)) {
                return { ...prev, selectedSpecialties: current.filter(s => s !== specialtyName) };
            } else {
                return { ...prev, selectedSpecialties: [...current, specialtyName] };
            }
        });
    };

    // NEW: Toggle a specific half-day exclusion (granular)
    const toggleExcludedHalfDay = (day: DayOfWeek, period: Period) => {
        setDoctorFormData(prev => {
            const current = prev.excludedHalfDays || [];
            const exists = current.some(excl => excl.day === day && excl.period === period);

            if (exists) {
                // Remove this half-day exclusion
                return {
                    ...prev,
                    excludedHalfDays: current.filter(excl => !(excl.day === day && excl.period === period))
                };
            } else {
                // Add this half-day exclusion
                return {
                    ...prev,
                    excludedHalfDays: [...current, { day, period }]
                };
            }
        });
    };

    // Helper: Check if a specific half-day is excluded
    const isHalfDayExcluded = (day: DayOfWeek, period: Period): boolean => {
        const halfDays = doctorFormData.excludedHalfDays || [];
        return halfDays.some(excl => excl.day === day && excl.period === period);
    };

    // Toggle full day (both morning and afternoon)
    const toggleFullDay = (day: DayOfWeek) => {
        const morningExcluded = isHalfDayExcluded(day, Period.MORNING);
        const afternoonExcluded = isHalfDayExcluded(day, Period.AFTERNOON);
        const fullyExcluded = morningExcluded && afternoonExcluded;

        setDoctorFormData(prev => {
            const current = prev.excludedHalfDays || [];

            if (fullyExcluded) {
                // Remove both half-days
                return {
                    ...prev,
                    excludedHalfDays: current.filter(excl => excl.day !== day)
                };
            } else {
                // Add both half-days (remove existing first to avoid duplicates)
                const filtered = current.filter(excl => excl.day !== day);
                return {
                    ...prev,
                    excludedHalfDays: [
                        ...filtered,
                        { day, period: Period.MORNING },
                        { day, period: Period.AFTERNOON }
                    ]
                };
            }
        });
    };

    // LEGACY: Keep for backward compatibility during transition
    const toggleExcludedDay = (day: DayOfWeek) => {
        // Now delegates to toggleFullDay for the new system
        toggleFullDay(day);
    };


    const toggleExcludedActivity = (activityId: string) => {
        setDoctorFormData(prev => {
            const current = prev.excludedActivities;
            if (current.includes(activityId)) {
                return { ...prev, excludedActivities: current.filter(a => a !== activityId) };
            } else {
                return { ...prev, excludedActivities: [...current, activityId] };
            }
        });
    };

    const toggleExcludedSlotType = (slotType: SlotType) => {
        setDoctorFormData(prev => {
            const current = prev.excludedSlotTypes;
            if (current.includes(slotType)) {
                return { ...prev, excludedSlotTypes: current.filter(t => t !== slotType) };
            } else {
                return { ...prev, excludedSlotTypes: [...current, slotType] };
            }
        });
    };

    // === UNAVAILABILITY HANDLERS (Admin only) ===
    // These handlers use LOCAL state for instant UI feedback
    // and sync with API in background WITHOUT updating global context
    // This prevents heavy recalculations (schedule, history, etc.)

    const handleAddUnavailabilityForDoctor = () => {
        if (!editingDoctor) return;

        const reasonText = unavailReason === 'AUTRE' ? unavailCustomReason : unavailReason;
        if (unavailReason === 'AUTRE' && !unavailCustomReason.trim()) {
            setError('Veuillez préciser le motif');
            return;
        }

        const newUnavail: Unavailability = {
            id: Date.now().toString(),
            doctorId: editingDoctor.id,
            startDate: unavailStartDate,
            endDate: unavailEndDate,
            period: unavailPeriod,
            reason: reasonText,
        };

        // INSTANT: Update local state (no global re-renders)
        setLocalDoctorUnavails(prev => [...prev, newUnavail]);

        // BACKGROUND: Save to API and update global context silently
        unavailabilityService.create(newUnavail).then(savedUnavail => {
            // Update local with server ID
            setLocalDoctorUnavails(prev =>
                prev.map(u => u.id === newUnavail.id ? savedUnavail : u)
            );
            // Also update global context (for when modal closes)
            addUnavailability(savedUnavail);
        }).catch(err => {
            console.error('Failed to save unavailability:', err);
            // Rollback local state
            setLocalDoctorUnavails(prev => prev.filter(u => u.id !== newUnavail.id));
            setError('Erreur lors de la sauvegarde');
        });

        // Reset form
        setUnavailStartDate(new Date().toISOString().split('T')[0]);
        setUnavailEndDate(new Date().toISOString().split('T')[0]);
        setUnavailPeriod('ALL_DAY');
        setUnavailReason('CONGRES');
        setUnavailCustomReason('');
        setError('');
        setSuccess('Indisponibilité ajoutée !');
        setTimeout(() => setSuccess(''), 2000);
    };

    const handleDeleteUnavailability = (unavailId: string) => {
        if (deleteUnavailConfirmId !== unavailId) {
            setDeleteUnavailConfirmId(unavailId);
            setTimeout(() => setDeleteUnavailConfirmId(null), 3000);
            return;
        }

        setDeleteUnavailConfirmId(null);

        // Store for potential rollback
        const removedItem = localDoctorUnavails.find(u => u.id === unavailId);

        // INSTANT: Update local state (no global re-renders)
        setLocalDoctorUnavails(prev => prev.filter(u => u.id !== unavailId));

        // BACKGROUND: Delete from API and update global context silently
        unavailabilityService.delete(unavailId).then(() => {
            // Also update global context (for when modal closes)
            removeUnavailability(unavailId);
        }).catch(err => {
            console.error('Failed to delete unavailability:', err);
            // Rollback local state
            if (removedItem) {
                setLocalDoctorUnavails(prev => [...prev, removedItem]);
            }
            setError('Erreur lors de la suppression');
        });

        setError('');
        setSuccess('Indisponibilité supprimée');
        setTimeout(() => setSuccess(''), 2000);
    };

    // Return LOCAL unavailabilities for instant display (no global context dependency)
    const getDoctorUnavailabilities = () => {
        return localDoctorUnavails;
    };

    if (!hasPermission('manage_users')) {
        return (
            <div className="p-6 text-center">
                <div className="text-red-500 text-lg">🔒 Accès refusé</div>
                <p className="text-slate-500 mt-2">Vous n'avez pas la permission de gérer les utilisateurs.</p>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="p-6 flex justify-center items-center min-h-[400px]">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    return (
        <div className="p-2 md:p-6 max-w-6xl mx-auto">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4 md:mb-6">
                <div>
                    <h1 className="text-lg md:text-2xl font-bold flex items-center gap-1.5 md:gap-2 text-slate-800">
                        <Users className="w-5 h-5 md:w-7 md:h-7 text-blue-600" /> Gestion d'Équipe
                    </h1>
                    <p className="text-slate-500 text-xs md:text-sm mt-0.5 md:mt-1">
                        {users.length} utilisateur{users.length > 1 ? 's' : ''} • {allDoctors.length} profil{allDoctors.length > 1 ? 's' : ''} médecin
                    </p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={handleRefresh}
                        disabled={isRefreshing}
                        className="bg-slate-100 text-slate-700 px-2 md:px-3 py-1.5 md:py-2 rounded-lg flex items-center gap-1 hover:bg-slate-200 transition-colors text-xs md:text-sm"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 md:w-4 md:h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                    </button>
                    <button
                        onClick={() => { resetForm(); setIsCreateModalOpen(true); }}
                        className="bg-blue-600 text-white px-2 md:px-4 py-1.5 md:py-2 rounded-lg flex items-center gap-1 md:gap-2 hover:bg-blue-700 shadow-md transition-colors text-xs md:text-sm"
                    >
                        <UserPlus className="w-3.5 h-3.5 md:w-4 md:h-4" />
                        <span className="hidden sm:inline">Nouvel Utilisateur</span>
                        <span className="sm:hidden">Nouveau</span>
                    </button>
                </div>
            </div>

            {/* View Toggle */}
            <div className="flex flex-wrap gap-1.5 md:gap-2 mb-4 md:mb-6">
                <button
                    onClick={() => setActiveView('users')}
                    className={`px-2 md:px-4 py-1.5 md:py-2 rounded-lg font-medium flex items-center gap-1 md:gap-2 transition-colors text-xs md:text-sm ${activeView === 'users'
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                >
                    <Users className="w-3.5 h-3.5 md:w-4 md:h-4" />
                    <span className="hidden sm:inline">Utilisateurs</span>
                    <span className="sm:hidden">Util.</span>
                </button>
                <button
                    onClick={() => setActiveView('doctors')}
                    className={`px-2 md:px-4 py-1.5 md:py-2 rounded-lg font-medium flex items-center gap-1 md:gap-2 transition-colors text-xs md:text-sm ${activeView === 'doctors'
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                >
                    <Stethoscope className="w-3.5 h-3.5 md:w-4 md:h-4" />
                    <span className="hidden sm:inline">Profils Médecins</span>
                    <span className="sm:hidden">Médecins</span>
                </button>
                <button
                    onClick={() => setActiveView('specialties')}
                    className={`px-2 md:px-4 py-1.5 md:py-2 rounded-lg font-medium flex items-center gap-1 md:gap-2 transition-colors text-xs md:text-sm ${activeView === 'specialties'
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                >
                    <Tag className="w-3.5 h-3.5 md:w-4 md:h-4" />
                    <span className="hidden sm:inline">Spécialités</span>
                    <span className="sm:hidden">Spéc.</span>
                </button>
            </div>

            {/* Users View */}
            {activeView === 'users' && (
                <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-slate-200">
                    {/* Mobile: card layout */}
                    <div className="md:hidden divide-y">
                        {users.length === 0 ? (
                            <div className="p-6 text-center text-slate-400">Aucun utilisateur trouvé.</div>
                        ) : (
                            users.map(user => (
                                <div key={user.id} className="p-3 hover:bg-slate-50">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2 min-w-0 flex-1">
                                            <Mail className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                                            <span className="font-medium text-slate-800 text-xs break-all">{user.email}</span>
                                        </div>
                                        <div className="flex gap-1 flex-shrink-0 ml-2">
                                            <button
                                                className="text-slate-400 hover:text-blue-600 p-1.5 rounded hover:bg-blue-50"
                                                onClick={() => openEditModal(user)}
                                            >
                                                <Edit2 className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                className={`p-1.5 rounded ${deleteConfirmId === user.id ? 'bg-red-600 text-white' : 'text-slate-400 hover:text-red-600 hover:bg-red-50'}`}
                                                onClick={() => handleDeleteUser(user)}
                                            >
                                                {deleteConfirmId === user.id ? <AlertTriangle className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" />}
                                            </button>
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            {user.doctors ? (
                                                <>
                                                    <div
                                                        className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[8px] font-bold shadow"
                                                        style={{ backgroundColor: user.doctors.color || '#3B82F6' }}
                                                    >
                                                        {user.doctors.name.substring(0, 2)}
                                                    </div>
                                                    <span className="text-xs text-slate-700">{user.doctors.name}</span>
                                                </>
                                            ) : (
                                                <span className="text-xs text-slate-400 italic flex items-center gap-1">
                                                    <Unlink className="w-3 h-3" /> Non lié
                                                </span>
                                            )}
                                        </div>
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${user.app_roles?.name === 'Admin'
                                            ? 'bg-purple-100 text-purple-700'
                                            : user.app_roles?.name === 'Docteur' || user.app_roles?.name === 'Médecin'
                                                ? 'bg-blue-100 text-blue-700'
                                                : 'bg-slate-100 text-slate-700'
                                            }`}>
                                            {user.app_roles?.name || 'Sans rôle'}
                                        </span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                    {/* Desktop: table layout */}
                    <div className="hidden md:block overflow-x-auto">
                        <table className="min-w-full">
                            <thead className="bg-slate-50 border-b">
                                <tr>
                                    <th className="p-4 text-left text-sm font-semibold text-slate-600">Email</th>
                                    <th className="p-4 text-left text-sm font-semibold text-slate-600">Profil Médecin</th>
                                    <th className="p-4 text-left text-sm font-semibold text-slate-600">Rôle</th>
                                    <th className="p-4 text-right text-sm font-semibold text-slate-600">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {users.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} className="p-8 text-center text-slate-400">
                                            Aucun utilisateur trouvé.
                                        </td>
                                    </tr>
                                ) : (
                                    users.map(user => (
                                        <tr key={user.id} className="hover:bg-slate-50">
                                            <td className="p-4">
                                                <div className="flex items-center gap-3">
                                                    <Mail className="w-4 h-4 text-slate-400" />
                                                    <span className="font-medium text-slate-800">{user.email}</span>
                                                </div>
                                            </td>
                                            <td className="p-4">
                                                {user.doctors ? (
                                                    <div className="flex items-center gap-2">
                                                        <div
                                                            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shadow"
                                                            style={{ backgroundColor: user.doctors.color || '#3B82F6' }}
                                                        >
                                                            {user.doctors.name.substring(0, 2)}
                                                        </div>
                                                        <span className="font-medium text-slate-700">{user.doctors.name}</span>
                                                    </div>
                                                ) : (
                                                    <span className="text-slate-400 italic flex items-center gap-1">
                                                        <Unlink className="w-3 h-3" /> Non lié
                                                    </span>
                                                )}
                                            </td>
                                            <td className="p-4">
                                                <span className={`px-3 py-1 rounded-full text-xs font-medium ${user.app_roles?.name === 'Admin'
                                                    ? 'bg-purple-100 text-purple-700 border border-purple-200'
                                                    : user.app_roles?.name === 'Docteur' || user.app_roles?.name === 'Médecin'
                                                        ? 'bg-blue-100 text-blue-700 border border-blue-200'
                                                        : 'bg-slate-100 text-slate-700 border border-slate-200'
                                                    }`}>
                                                    {user.app_roles?.name || 'Sans rôle'}
                                                </span>
                                            </td>
                                            <td className="p-4 text-right">
                                                <div className="flex justify-end gap-1">
                                                    <button
                                                        className="text-slate-400 hover:text-blue-600 p-2 rounded hover:bg-blue-50 transition-colors"
                                                        onClick={() => openEditModal(user)}
                                                        title="Modifier"
                                                    >
                                                        <Edit2 className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        className={`p-2 rounded transition-colors ${deleteConfirmId === user.id
                                                            ? 'bg-red-600 text-white'
                                                            : 'text-slate-400 hover:text-red-600 hover:bg-red-50'
                                                            }`}
                                                        onClick={() => handleDeleteUser(user)}
                                                        title={deleteConfirmId === user.id ? "Confirmer" : "Supprimer"}
                                                    >
                                                        {deleteConfirmId === user.id ? (
                                                            <AlertTriangle className="w-4 h-4" />
                                                        ) : (
                                                            <Trash2 className="w-4 h-4" />
                                                        )}
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Doctors View */}
            {activeView === 'doctors' && (
                <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-slate-200">
                    {/* Mobile: card layout */}
                    <div className="md:hidden divide-y">
                        {allDoctors.length === 0 ? (
                            <div className="p-6 text-center text-slate-400">Aucun profil médecin trouvé.</div>
                        ) : (
                            allDoctors.map(doctor => (
                                <div key={doctor.id} className="p-3 hover:bg-slate-50">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2 min-w-0 flex-1">
                                            <div
                                                className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-white text-[9px] font-bold shadow"
                                                style={{ backgroundColor: doctor.color || '#3B82F6' }}
                                            >
                                                {doctor.name.substring(0, 2)}
                                            </div>
                                            <div className="min-w-0">
                                                <div className="font-medium text-slate-800 text-xs">{doctor.name}</div>
                                                <div className="text-[10px] text-slate-400">
                                                    {doctor.specialty && doctor.specialty.length > 0
                                                        ? doctor.specialty.join(', ')
                                                        : <span className="italic">Pas de spécialité</span>
                                                    }
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex gap-1 flex-shrink-0 ml-2">
                                            <button
                                                className="text-slate-400 hover:text-blue-600 p-1.5 rounded hover:bg-blue-50"
                                                onClick={() => openEditDoctorModal(doctor)}
                                            >
                                                <Edit2 className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                className={`p-1.5 rounded ${deleteDoctorConfirmId === doctor.id ? 'bg-red-600 text-white' : 'text-slate-400 hover:text-red-600 hover:bg-red-50'}`}
                                                onClick={() => handleDeleteDoctor(doctor)}
                                            >
                                                {deleteDoctorConfirmId === doctor.id ? <AlertTriangle className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" />}
                                            </button>
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-1.5 min-w-0">
                                            {doctor.linkedUser ? (
                                                <>
                                                    <Link2 className="w-3 h-3 text-green-500 flex-shrink-0" />
                                                    <span className="text-[10px] text-slate-600 break-all">{doctor.linkedUser.email}</span>
                                                </>
                                            ) : (
                                                <span className="text-[10px] text-slate-400 italic flex items-center gap-1">
                                                    <Unlink className="w-3 h-3" /> Aucun utilisateur
                                                </span>
                                            )}
                                        </div>
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium flex-shrink-0 ${doctor.linkedUser
                                            ? 'bg-green-100 text-green-700'
                                            : 'bg-orange-100 text-orange-700'
                                            }`}>
                                            {doctor.linkedUser ? 'Lié' : 'Orphelin'}
                                        </span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                    {/* Desktop: table layout */}
                    <div className="hidden md:block overflow-x-auto">
                        <table className="min-w-full">
                            <thead className="bg-slate-50 border-b">
                                <tr>
                                    <th className="p-4 text-left text-sm font-semibold text-slate-600">Profil Médecin</th>
                                    <th className="p-4 text-left text-sm font-semibold text-slate-600">Utilisateur Lié</th>
                                    <th className="p-4 text-left text-sm font-semibold text-slate-600">Statut</th>
                                    <th className="p-4 text-right text-sm font-semibold text-slate-600">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {allDoctors.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} className="p-8 text-center text-slate-400">
                                            Aucun profil médecin trouvé.
                                        </td>
                                    </tr>
                                ) : (
                                    allDoctors.map(doctor => (
                                        <tr key={doctor.id} className="hover:bg-slate-50">
                                            <td className="p-4">
                                                <div className="flex items-center gap-3">
                                                    <div
                                                        className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shadow"
                                                        style={{ backgroundColor: doctor.color || '#3B82F6' }}
                                                    >
                                                        {doctor.name.substring(0, 2)}
                                                    </div>
                                                    <div>
                                                        <div className="font-medium text-slate-800">{doctor.name}</div>
                                                        <div className="text-xs text-slate-400">
                                                            {doctor.specialty && doctor.specialty.length > 0
                                                                ? doctor.specialty.join(', ')
                                                                : <span className="italic">Pas de spécialité</span>
                                                            }
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="p-4">
                                                {doctor.linkedUser ? (
                                                    <div className="flex items-center gap-2">
                                                        <Link2 className="w-4 h-4 text-green-500" />
                                                        <span className="text-slate-700">{doctor.linkedUser.email}</span>
                                                    </div>
                                                ) : (
                                                    <span className="text-slate-400 italic flex items-center gap-1">
                                                        <Unlink className="w-4 h-4" /> Aucun utilisateur
                                                    </span>
                                                )}
                                            </td>
                                            <td className="p-4">
                                                <span className={`px-3 py-1 rounded-full text-xs font-medium ${doctor.linkedUser
                                                    ? 'bg-green-100 text-green-700 border border-green-200'
                                                    : 'bg-orange-100 text-orange-700 border border-orange-200'
                                                    }`}>
                                                    {doctor.linkedUser ? 'Lié' : 'Orphelin'}
                                                </span>
                                            </td>
                                            <td className="p-4 text-right">
                                                <div className="flex justify-end gap-1">
                                                    <button
                                                        className="text-slate-400 hover:text-blue-600 p-2 rounded hover:bg-blue-50 transition-colors"
                                                        onClick={() => openEditDoctorModal(doctor)}
                                                        title="Modifier le profil"
                                                    >
                                                        <Edit2 className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        className={`p-2 rounded transition-colors ${deleteDoctorConfirmId === doctor.id
                                                            ? 'bg-red-600 text-white'
                                                            : 'text-slate-400 hover:text-red-600 hover:bg-red-50'
                                                            }`}
                                                        onClick={() => handleDeleteDoctor(doctor)}
                                                        title={deleteDoctorConfirmId === doctor.id ? "Confirmer la suppression" : "Supprimer le profil"}
                                                    >
                                                        {deleteDoctorConfirmId === doctor.id ? (
                                                            <AlertTriangle className="w-4 h-4" />
                                                        ) : (
                                                            <Trash2 className="w-4 h-4" />
                                                        )}
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Specialties View */}
            {activeView === 'specialties' && (
                <div className="space-y-6">
                    {/* Create new specialty */}
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                        <h3 className="font-bold text-lg text-slate-800 mb-4 flex items-center gap-2">
                            <Plus className="w-5 h-5 text-blue-600" /> Créer une Spécialité
                        </h3>
                        <div className="flex gap-4 items-end">
                            <div className="flex-1">
                                <label className="block text-sm font-medium text-slate-700 mb-1">Nom</label>
                                <input
                                    type="text"
                                    value={newSpecialtyName}
                                    onChange={(e) => setNewSpecialtyName(e.target.value)}
                                    className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                                    placeholder="Ex: Radiologie, Scanner, IRM..."
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Couleur</label>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="color"
                                        value={newSpecialtyColor}
                                        onChange={(e) => setNewSpecialtyColor(e.target.value)}
                                        className="w-10 h-10 rounded cursor-pointer border"
                                    />
                                </div>
                            </div>
                            <button
                                onClick={handleCreateSpecialty}
                                disabled={isSubmitting || !newSpecialtyName.trim()}
                                className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                            >
                                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                                Créer
                            </button>
                        </div>
                        {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
                        {success && <p className="text-green-600 text-sm mt-2">{success}</p>}
                    </div>

                    {/* List of specialties */}
                    <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-slate-200">
                        <div className="p-4 bg-slate-50 border-b">
                            <h3 className="font-bold text-slate-700">Spécialités disponibles ({specialties.length})</h3>
                        </div>
                        <div className="divide-y">
                            {specialties.length === 0 ? (
                                <div className="p-8 text-center text-slate-400">
                                    Aucune spécialité définie. Créez-en une ci-dessus.
                                </div>
                            ) : (
                                specialties.map(spec => {
                                    const doctorsWithThisSpec = allDoctors.filter(d => d.specialty.includes(spec.name));
                                    return (
                                        <div key={spec.id} className="flex items-center justify-between p-4 hover:bg-slate-50">
                                            <div className="flex items-center gap-3">
                                                <div
                                                    className="w-4 h-4 rounded-full"
                                                    style={{ backgroundColor: spec.color }}
                                                />
                                                <div>
                                                    <div className="font-medium text-slate-800">{spec.name}</div>
                                                    <div className="text-xs text-slate-400">
                                                        {doctorsWithThisSpec.length} médecin{doctorsWithThisSpec.length !== 1 ? 's' : ''}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {doctorsWithThisSpec.length > 0 && (
                                                    <div className="flex -space-x-2">
                                                        {doctorsWithThisSpec.slice(0, 3).map(doc => (
                                                            <div
                                                                key={doc.id}
                                                                className="w-7 h-7 rounded-full border-2 border-white flex items-center justify-center text-[9px] font-bold text-white"
                                                                style={{ backgroundColor: doc.color }}
                                                                title={doc.name}
                                                            >
                                                                {doc.name.substring(0, 2)}
                                                            </div>
                                                        ))}
                                                        {doctorsWithThisSpec.length > 3 && (
                                                            <div className="w-7 h-7 rounded-full border-2 border-white bg-slate-300 flex items-center justify-center text-[9px] font-bold text-slate-600">
                                                                +{doctorsWithThisSpec.length - 3}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                                <button
                                                    className={`p-2 rounded transition-colors ${deleteSpecialtyConfirmId === spec.id
                                                        ? 'bg-red-600 text-white'
                                                        : 'text-slate-400 hover:text-red-600 hover:bg-red-50'
                                                        }`}
                                                    onClick={() => handleDeleteSpecialty(spec)}
                                                    title={deleteSpecialtyConfirmId === spec.id ? "Confirmer la suppression" : "Supprimer"}
                                                >
                                                    {deleteSpecialtyConfirmId === spec.id ? (
                                                        <AlertTriangle className="w-4 h-4" />
                                                    ) : (
                                                        <Trash2 className="w-4 h-4" />
                                                    )}
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Create Modal */}
            {isCreateModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 border border-slate-200 max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                                <UserPlus className="w-5 h-5 text-blue-600" /> Nouvel Utilisateur
                            </h2>
                            <button onClick={() => setIsCreateModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleCreateUser} className="space-y-4">
                            {/* Email */}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                    <Mail className="w-4 h-4 inline mr-1" /> Email *
                                </label>
                                <input
                                    type="email"
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                    className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                                    placeholder="utilisateur@exemple.com"
                                    required
                                />
                            </div>

                            {/* Password */}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                    <Key className="w-4 h-4 inline mr-1" /> Mot de passe *
                                </label>
                                <div className="relative">
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        value={formData.password}
                                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                        className="w-full border rounded-lg px-3 py-2 pr-10 focus:ring-2 focus:ring-blue-500 outline-none"
                                        placeholder="Min. 6 caractères"
                                        required
                                        minLength={6}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                                    >
                                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>

                            {/* Role */}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                    <Shield className="w-4 h-4 inline mr-1" /> Rôle *
                                </label>
                                <select
                                    value={formData.roleId}
                                    onChange={(e) => setFormData({ ...formData, roleId: e.target.value })}
                                    className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                                    required
                                >
                                    <option value="">-- Sélectionner --</option>
                                    {roles.map(role => (
                                        <option key={role.id} value={role.id}>{role.name}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Doctor Profile Options (for non-secretary roles) */}
                            {formData.roleId && !isNonDoctorRole(formData.roleId) && (
                                <>
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setLinkMode('new')}
                                            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${linkMode === 'new'
                                                ? 'bg-blue-100 text-blue-700 border-2 border-blue-400'
                                                : 'bg-slate-100 text-slate-600 border-2 border-transparent'
                                                }`}
                                        >
                                            Créer un nouveau profil
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setLinkMode('existing')}
                                            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${linkMode === 'existing'
                                                ? 'bg-blue-100 text-blue-700 border-2 border-blue-400'
                                                : 'bg-slate-100 text-slate-600 border-2 border-transparent'
                                                }`}
                                        >
                                            Lier à un profil existant
                                        </button>
                                    </div>

                                    {linkMode === 'new' && (
                                        <>
                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                                    <UserCheck className="w-4 h-4 inline mr-1" /> Nom du Médecin *
                                                </label>
                                                <input
                                                    type="text"
                                                    value={formData.name}
                                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                                    className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                                                    placeholder="Dr Dupont"
                                                    required
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 mb-1">Couleur</label>
                                                <div className="flex items-center gap-3">
                                                    <input
                                                        type="color"
                                                        value={formData.color}
                                                        onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                                                        className="w-10 h-10 rounded cursor-pointer border"
                                                    />
                                                    <span className="text-slate-500 text-sm">{formData.color}</span>
                                                </div>
                                            </div>
                                        </>
                                    )}

                                    {linkMode === 'existing' && (
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">
                                                <Link2 className="w-4 h-4 inline mr-1" /> Profil Médecin Existant
                                            </label>
                                            <select
                                                value={formData.existingDoctorId}
                                                onChange={(e) => setFormData({ ...formData, existingDoctorId: e.target.value })}
                                                className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                                                required={linkMode === 'existing'}
                                            >
                                                <option value="">-- Sélectionner --</option>
                                                {getUnlinkedDoctors().map(doc => (
                                                    <option key={doc.id} value={doc.id}>{doc.name}</option>
                                                ))}
                                            </select>
                                            {getUnlinkedDoctors().length === 0 && (
                                                <p className="text-xs text-orange-600 mt-1">
                                                    Aucun profil médecin disponible. Tous sont déjà liés.
                                                </p>
                                            )}
                                        </div>
                                    )}
                                </>
                            )}

                            {formData.roleId && isNonDoctorRole(formData.roleId) && (
                                <div className="bg-slate-50 p-3 rounded-lg text-sm text-slate-600">
                                    ℹ️ Le rôle "{getSelectedRoleName()}" n'a pas besoin de profil médecin.
                                </div>
                            )}

                            {error && (
                                <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm flex items-center gap-2">
                                    <AlertTriangle className="w-4 h-4" /> {error}
                                </div>
                            )}
                            {success && (
                                <div className="bg-green-50 text-green-700 p-3 rounded-lg text-sm">✓ {success}</div>
                            )}

                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
                            >
                                {isSubmitting ? (
                                    <><Loader2 className="w-4 h-4 animate-spin" /> Création...</>
                                ) : (
                                    <><Save className="w-4 h-4" /> Créer le Compte</>
                                )}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* Edit Modal */}
            {isEditModalOpen && editingUser && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 border border-slate-200 max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                                <Edit2 className="w-5 h-5 text-blue-600" /> Modifier l'Utilisateur
                            </h2>
                            <button onClick={() => { setIsEditModalOpen(false); setEditingUser(null); }} className="text-slate-400 hover:text-slate-600">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleEditUser} className="space-y-4">
                            {/* Email (read-only) */}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                    <Mail className="w-4 h-4 inline mr-1" /> Email
                                </label>
                                <input
                                    type="email"
                                    value={formData.email}
                                    disabled
                                    className="w-full border rounded-lg px-3 py-2 bg-slate-50 text-slate-500"
                                />
                            </div>

                            {/* Password */}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                    <Key className="w-4 h-4 inline mr-1" /> Nouveau Mot de Passe
                                    <span className="text-slate-400 font-normal ml-1">(optionnel)</span>
                                </label>
                                <div className="relative">
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        value={formData.password}
                                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                        className="w-full border rounded-lg px-3 py-2 pr-10 focus:ring-2 focus:ring-blue-500 outline-none"
                                        placeholder="Laisser vide pour ne pas changer"
                                        minLength={6}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                                    >
                                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>

                            {/* Role */}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                    <Shield className="w-4 h-4 inline mr-1" /> Rôle *
                                </label>
                                <select
                                    value={formData.roleId}
                                    onChange={(e) => setFormData({ ...formData, roleId: e.target.value })}
                                    className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                                    required
                                >
                                    <option value="">-- Sélectionner --</option>
                                    {roles.map(role => (
                                        <option key={role.id} value={role.id}>{role.name}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Doctor Profile Options */}
                            {formData.roleId && !isNonDoctorRole(formData.roleId) && (
                                <>
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setLinkMode('existing')}
                                            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${linkMode === 'existing'
                                                ? 'bg-blue-100 text-blue-700 border-2 border-blue-400'
                                                : 'bg-slate-100 text-slate-600 border-2 border-transparent'
                                                }`}
                                        >
                                            <Link2 className="w-4 h-4 inline mr-1" /> Lier à un profil
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setLinkMode('new')}
                                            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${linkMode === 'new'
                                                ? 'bg-blue-100 text-blue-700 border-2 border-blue-400'
                                                : 'bg-slate-100 text-slate-600 border-2 border-transparent'
                                                }`}
                                        >
                                            Créer nouveau
                                        </button>
                                    </div>

                                    {linkMode === 'existing' && (
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">
                                                Profil Médecin
                                            </label>
                                            <select
                                                value={formData.existingDoctorId}
                                                onChange={(e) => setFormData({ ...formData, existingDoctorId: e.target.value })}
                                                className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                                            >
                                                <option value="">-- Aucun --</option>
                                                {/* Show current doctor + unlinked doctors */}
                                                {editingUser.doctors && (
                                                    <option value={editingUser.doctor_id}>
                                                        {editingUser.doctors.name} (actuel)
                                                    </option>
                                                )}
                                                {getUnlinkedDoctors().map(doc => (
                                                    <option key={doc.id} value={doc.id}>{doc.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                    )}

                                    {linkMode === 'new' && (
                                        <>
                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                                    <UserCheck className="w-4 h-4 inline mr-1" /> Nom du Médecin
                                                </label>
                                                <input
                                                    type="text"
                                                    value={formData.name}
                                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                                    className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                                                    placeholder="Dr Dupont"
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 mb-1">Couleur</label>
                                                <div className="flex items-center gap-3">
                                                    <input
                                                        type="color"
                                                        value={formData.color}
                                                        onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                                                        className="w-10 h-10 rounded cursor-pointer border"
                                                    />
                                                    <span className="text-slate-500 text-sm">{formData.color}</span>
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </>
                            )}

                            {formData.roleId && isNonDoctorRole(formData.roleId) && (
                                <div className="bg-slate-50 p-3 rounded-lg text-sm text-slate-600">
                                    ℹ️ Le rôle "{getSelectedRoleName()}" n'a pas besoin de profil médecin.
                                </div>
                            )}

                            {error && (
                                <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm flex items-center gap-2">
                                    <AlertTriangle className="w-4 h-4" /> {error}
                                </div>
                            )}
                            {success && (
                                <div className="bg-green-50 text-green-700 p-3 rounded-lg text-sm">✓ {success}</div>
                            )}

                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
                            >
                                {isSubmitting ? (
                                    <><Loader2 className="w-4 h-4 animate-spin" /> Mise à jour...</>
                                ) : (
                                    <><Save className="w-4 h-4" /> Enregistrer</>
                                )}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* Edit Doctor Modal */}
            {isEditDoctorModalOpen && editingDoctor && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 border border-slate-200 max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                                <Stethoscope className="w-5 h-5 text-blue-600" /> Modifier le Profil Médecin
                            </h2>
                            <button onClick={() => { setIsEditDoctorModalOpen(false); setEditingDoctor(null); setEditingDoctorId(null); }} className="text-slate-400 hover:text-slate-600">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleEditDoctor} className="space-y-4">
                            {/* Doctor Name */}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                    <UserCheck className="w-4 h-4 inline mr-1" /> Nom
                                </label>
                                <input
                                    type="text"
                                    value={doctorFormData.name}
                                    onChange={(e) => setDoctorFormData({ ...doctorFormData, name: e.target.value })}
                                    className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                                    placeholder="Dr Dupont"
                                    required
                                />
                            </div>

                            {/* Color */}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Couleur</label>
                                <div className="flex items-center gap-3">
                                    <input
                                        type="color"
                                        value={doctorFormData.color}
                                        onChange={(e) => setDoctorFormData({ ...doctorFormData, color: e.target.value })}
                                        className="w-10 h-10 rounded cursor-pointer border"
                                    />
                                    <div
                                        className="w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-bold"
                                        style={{ backgroundColor: doctorFormData.color }}
                                    >
                                        {doctorFormData.name.substring(0, 2)}
                                    </div>
                                    <span className="text-slate-500 text-sm">{doctorFormData.color}</span>
                                </div>
                            </div>

                            {/* Specialty */}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">
                                    <Tag className="w-4 h-4 inline mr-1" /> Spécialités
                                </label>
                                {specialties.length === 0 ? (
                                    <p className="text-sm text-slate-400 italic">
                                        Aucune spécialité définie. Créez-en dans l'onglet "Spécialités".
                                    </p>
                                ) : (
                                    <div className="flex flex-wrap gap-2">
                                        {specialties.map(spec => {
                                            const isSelected = doctorFormData.selectedSpecialties.includes(spec.name);
                                            return (
                                                <button
                                                    key={spec.id}
                                                    type="button"
                                                    onClick={() => toggleDoctorSpecialty(spec.name)}
                                                    className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${isSelected
                                                        ? 'text-white border-transparent shadow-sm'
                                                        : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                                                        }`}
                                                    style={isSelected ? { backgroundColor: spec.color } : {}}
                                                >
                                                    {isSelected && '✓ '}{spec.name}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                                {doctorFormData.selectedSpecialties.length > 0 && (
                                    <p className="text-xs text-slate-500 mt-2">
                                        Sélectionnées: {doctorFormData.selectedSpecialties.join(', ')}
                                    </p>
                                )}
                            </div>

                            {/* Separator */}
                            <div className="border-t border-slate-200 pt-4">
                                <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                                    <Ban className="w-4 h-4 text-red-500" /> Préférences & Exclusions
                                </h3>

                                {/* Excluded Half-Days (Recurring Weekly Absences) */}
                                <div className="mb-4">
                                    <label className="block text-sm font-medium text-slate-600 mb-2">
                                        <Calendar className="w-4 h-4 inline mr-1 text-red-500" /> Demi-journées non travaillées (récurrentes)
                                    </label>
                                    <p className="text-xs text-slate-400 mb-3">
                                        Cliquez sur une demi-journée pour l'exclure, ou cliquez sur le nom du jour pour exclure la journée entière.
                                    </p>
                                    <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                                        {/* Header row */}
                                        <div className="grid grid-cols-3 gap-1 mb-2 text-center">
                                            <div className="text-xs font-medium text-slate-400">Jour</div>
                                            <div className="text-xs font-medium text-orange-600">Matin</div>
                                            <div className="text-xs font-medium text-blue-600">Après-midi</div>
                                        </div>
                                        {/* Day rows */}
                                        {Object.values(DayOfWeek).map(day => {
                                            const morningExcluded = isHalfDayExcluded(day, Period.MORNING);
                                            const afternoonExcluded = isHalfDayExcluded(day, Period.AFTERNOON);
                                            const fullyExcluded = morningExcluded && afternoonExcluded;

                                            return (
                                                <div key={day} className="grid grid-cols-3 gap-1 mb-1.5">
                                                    {/* Day name - click to toggle full day */}
                                                    <button
                                                        type="button"
                                                        onClick={() => toggleFullDay(day)}
                                                        className={`px-2 py-1.5 text-xs rounded-lg border transition-all font-medium ${fullyExcluded
                                                            ? 'bg-red-500 text-white border-red-500'
                                                            : (morningExcluded || afternoonExcluded)
                                                                ? 'bg-red-100 text-red-700 border-red-200'
                                                                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                                                            }`}
                                                        title={fullyExcluded ? 'Cliquez pour rétablir' : 'Cliquez pour exclure la journée entière'}
                                                    >
                                                        {day.substring(0, 3)}
                                                    </button>
                                                    {/* Morning toggle */}
                                                    <button
                                                        type="button"
                                                        onClick={() => toggleExcludedHalfDay(day, Period.MORNING)}
                                                        className={`px-2 py-1.5 text-xs rounded-lg border transition-all ${morningExcluded
                                                            ? 'bg-orange-500 text-white border-orange-500 font-bold'
                                                            : 'bg-white text-orange-600 border-orange-200 hover:bg-orange-50'
                                                            }`}
                                                        title={morningExcluded ? `${day} matin : EXCLU` : `Exclure ${day} matin`}
                                                    >
                                                        {morningExcluded ? '✕ Matin' : 'Matin'}
                                                    </button>
                                                    {/* Afternoon toggle */}
                                                    <button
                                                        type="button"
                                                        onClick={() => toggleExcludedHalfDay(day, Period.AFTERNOON)}
                                                        className={`px-2 py-1.5 text-xs rounded-lg border transition-all ${afternoonExcluded
                                                            ? 'bg-blue-500 text-white border-blue-500 font-bold'
                                                            : 'bg-white text-blue-600 border-blue-200 hover:bg-blue-50'
                                                            }`}
                                                        title={afternoonExcluded ? `${day} après-midi : EXCLU` : `Exclure ${day} après-midi`}
                                                    >
                                                        {afternoonExcluded ? '✕ Ap-midi' : 'Ap-midi'}
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    {/* Summary of exclusions */}
                                    {(doctorFormData.excludedHalfDays || []).length > 0 && (
                                        <div className="mt-2 p-2 bg-red-50 rounded-lg border border-red-100">
                                            <p className="text-xs text-red-700 font-medium">
                                                Demi-journées exclues :
                                            </p>
                                            <div className="flex flex-wrap gap-1 mt-1">
                                                {(doctorFormData.excludedHalfDays || []).map((excl, idx) => (
                                                    <span key={idx} className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-red-100 text-red-800">
                                                        {excl.day.substring(0, 3)} {excl.period === Period.MORNING ? 'mat.' : 'ap-m.'}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>


                                {/* Excluded Activities */}
                                <div className="mb-4">
                                    <label className="block text-sm font-medium text-slate-600 mb-2">
                                        <Ban className="w-4 h-4 inline mr-1 text-slate-500" /> Activités Exclues
                                    </label>
                                    {activityDefinitions.length === 0 ? (
                                        <p className="text-xs text-slate-400 italic">Aucune activité définie.</p>
                                    ) : (
                                        <div className="space-y-1 max-h-32 overflow-y-auto bg-slate-50 rounded-lg p-2">
                                            {activityDefinitions.map(act => (
                                                <div
                                                    key={act.id}
                                                    className="flex items-center p-1.5 hover:bg-white rounded cursor-pointer"
                                                    onClick={() => toggleExcludedActivity(act.id)}
                                                >
                                                    <div className={`w-4 h-4 rounded border flex items-center justify-center mr-2 ${doctorFormData.excludedActivities.includes(act.id)
                                                        ? 'bg-red-500 border-red-500'
                                                        : 'border-slate-300 bg-white'
                                                        }`}>
                                                        {doctorFormData.excludedActivities.includes(act.id) && (
                                                            <Ban className="w-2.5 h-2.5 text-white" />
                                                        )}
                                                    </div>
                                                    <span className={`text-sm ${doctorFormData.excludedActivities.includes(act.id)
                                                        ? 'text-red-700 font-medium line-through'
                                                        : 'text-slate-700'
                                                        }`}>
                                                        {act.name}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Excluded Slot Types */}
                                <div>
                                    <label className="block text-sm font-medium text-slate-600 mb-2">
                                        <Ban className="w-4 h-4 inline mr-1 text-orange-500" /> Types de Créneau Exclus
                                    </label>
                                    <div className="flex flex-wrap gap-1">
                                        {Object.values(SlotType)
                                            .filter(type => type !== SlotType.MACHINE && type !== SlotType.OTHER)
                                            .map(type => (
                                                <button
                                                    key={type}
                                                    type="button"
                                                    onClick={() => toggleExcludedSlotType(type)}
                                                    className={`px-2 py-1 text-xs rounded-lg border transition-all ${doctorFormData.excludedSlotTypes.includes(type)
                                                        ? 'bg-orange-100 text-orange-800 border-orange-200 font-bold'
                                                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                                                        }`}
                                                >
                                                    {type === SlotType.CONSULTATION ? 'Consultation' :
                                                        type === SlotType.RCP ? 'RCP' :
                                                            type === SlotType.ACTIVITY ? 'Activité' : type}
                                                </button>
                                            ))}
                                    </div>
                                </div>
                            </div>

                            {/* Unavailabilities Section (Admin Only) */}
                            <div className="border-t border-slate-200 pt-4">
                                <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                                    <Calendar className="w-4 h-4 text-blue-500" /> Indisponibilités
                                </h3>

                                {/* Existing Unavailabilities List */}
                                {getDoctorUnavailabilities().length > 0 && (
                                    <div className="mb-4">
                                        <p className="text-xs text-slate-500 mb-2">Indisponibilités existantes :</p>
                                        <div className="bg-slate-50 rounded-lg p-2 max-h-32 overflow-y-auto space-y-1">
                                            {getDoctorUnavailabilities().map(unavail => (
                                                <div
                                                    key={unavail.id}
                                                    className="flex justify-between items-center bg-white p-2 rounded border border-slate-100 hover:border-slate-300"
                                                >
                                                    <div className="text-xs">
                                                        <div className="font-medium text-slate-700">{unavail.reason}</div>
                                                        <div className="text-slate-500">
                                                            {unavail.startDate} → {unavail.endDate}
                                                            {unavail.period && unavail.period !== 'ALL_DAY' && (
                                                                <span className="ml-1 text-[10px] bg-slate-100 px-1 rounded">
                                                                    {unavail.period === Period.MORNING ? 'AM' : 'PM'}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDeleteUnavailability(unavail.id)}
                                                        className={`p-1.5 rounded transition-colors ${deleteUnavailConfirmId === unavail.id
                                                            ? 'bg-red-600 text-white'
                                                            : 'text-slate-400 hover:text-red-600 hover:bg-red-50'
                                                            }`}
                                                        title={deleteUnavailConfirmId === unavail.id ? "Confirmer suppression" : "Supprimer"}
                                                    >
                                                        {deleteUnavailConfirmId === unavail.id ? (
                                                            <AlertTriangle className="w-3 h-3" />
                                                        ) : (
                                                            <Trash2 className="w-3 h-3" />
                                                        )}
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Add Unavailability Form */}
                                <div className="bg-blue-50 rounded-lg p-3 space-y-2">
                                    <p className="text-[11px] font-medium text-blue-700 flex items-center gap-1">
                                        <Plus className="w-3 h-3" /> Ajouter une indisponibilité
                                    </p>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <label className="block text-[10px] text-slate-500 mb-0.5">Du</label>
                                            <input
                                                type="date"
                                                value={unavailStartDate}
                                                onChange={(e) => setUnavailStartDate(e.target.value)}
                                                className="w-full border rounded px-2 py-1 text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] text-slate-500 mb-0.5">Au</label>
                                            <input
                                                type="date"
                                                value={unavailEndDate}
                                                min={unavailStartDate}
                                                onChange={(e) => setUnavailEndDate(e.target.value)}
                                                className="w-full border rounded px-2 py-1 text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                                            />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <label className="block text-[10px] text-slate-500 mb-0.5">Période</label>
                                            <select
                                                value={unavailPeriod}
                                                onChange={(e) => setUnavailPeriod(e.target.value as any)}
                                                className="w-full border rounded px-2 py-1 text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                                            >
                                                <option value="ALL_DAY">Journée entière</option>
                                                <option value={Period.MORNING}>Matin</option>
                                                <option value={Period.AFTERNOON}>Après-midi</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-[10px] text-slate-500 mb-0.5">Motif</label>
                                            <select
                                                value={unavailReason}
                                                onChange={(e) => setUnavailReason(e.target.value)}
                                                className="w-full border rounded px-2 py-1 text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                                            >
                                                <option value="CONGRES">Congrès</option>
                                                <option value="VACANCES">Vacances</option>
                                                <option value="MALADIE">Maladie</option>
                                                <option value="FORMATION">Formation</option>
                                                <option value="AUTRE">Autre</option>
                                            </select>
                                        </div>
                                    </div>
                                    {unavailReason === 'AUTRE' && (
                                        <input
                                            type="text"
                                            placeholder="Précisez le motif..."
                                            value={unavailCustomReason}
                                            onChange={(e) => setUnavailCustomReason(e.target.value)}
                                            className="w-full border rounded px-2 py-1 text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                                        />
                                    )}
                                    <button
                                        type="button"
                                        onClick={handleAddUnavailabilityForDoctor}
                                        className="w-full bg-blue-500 text-white py-1.5 rounded text-xs font-medium hover:bg-blue-600 flex items-center justify-center gap-1 transition-colors"
                                    >
                                        <Plus className="w-3 h-3" /> Ajouter l'absence
                                    </button>
                                </div>
                            </div>

                            {error && (
                                <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm flex items-center gap-2">
                                    <AlertTriangle className="w-4 h-4" /> {error}
                                </div>
                            )}
                            {success && (
                                <div className="bg-green-50 text-green-700 p-3 rounded-lg text-sm">✓ {success}</div>
                            )}

                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
                            >
                                {isSubmitting ? (
                                    <><Loader2 className="w-4 h-4 animate-spin" /> Mise à jour...</>
                                ) : (
                                    <><Save className="w-4 h-4" /> Enregistrer</>
                                )}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TeamManagement;

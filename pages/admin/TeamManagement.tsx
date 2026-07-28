import React, { useEffect, useState, useContext } from 'react';
import { supabase } from '../../services/supabaseClient';
import { AppRole, Doctor, Specialty, DayOfWeek, SlotType, Period, Unavailability, ExcludedHalfDay, DectSurface, DectDisplaySettings, DectStyle } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { AppContext } from '../../App';
import { activityLogService } from '../../services/activityLogService';
import { unavailabilityService } from '../../services/unavailabilityService';
import { Users, UserPlus, Edit2, Trash2, X, Save, Key, UserCheck, Mail, Shield, Eye, EyeOff, AlertTriangle, Loader2, RefreshCw, Stethoscope, Link2, Unlink, Tag, Plus, Ban, Calendar, Phone } from 'lucide-react';
import { Card, CardBody, EmptyState } from '../../src/components/ui';
import { Badge } from '../../src/components/ui/Badge';
import { DECT_SURFACES, DECT_POSITIONS, DECT_STYLES, DEFAULT_DECT_DISPLAY, formatDectName, isValidDect, sanitizeDectInput } from '../../services/dectDisplay';
import { DoctorName } from '../../components/DoctorName';

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
    dect?: string | null; // 5-digit DECT extension
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
    const { hasPermission, profile } = useAuth();
    const { doctors, removeDoctor, updateDoctor, activityDefinitions, unavailabilities, addUnavailability, syncUnavailability, removeUnavailability, dectDisplay, setDectDisplay } = useContext(AppContext);
    const [users, setUsers] = useState<UserData[]>([]);
    const [roles, setRoles] = useState<AppRole[]>([]);
    const [allDoctors, setAllDoctors] = useState<DoctorWithUser[]>([]);
    const [specialties, setSpecialties] = useState<Specialty[]>([]);
    const [loading, setLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);

    // View toggle - persisted in sessionStorage
    const [activeView, setActiveViewState] = useState<'users' | 'doctors' | 'specialties' | 'dect'>(() => {
        const saved = sessionStorage.getItem('teamManagement_activeView');
        return (saved === 'doctors' || saved === 'specialties' || saved === 'dect') ? saved : 'users';
    });
    const setActiveView = (view: 'users' | 'doctors' | 'specialties' | 'dect') => {
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
        dect: '',
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
                    dect: doctor.dect || '',
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
                .select('id, name, color, dect, specialty, excluded_days, excluded_half_days, excluded_activities, excluded_slot_types')
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
                    dect: doc.dect || null,
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
            if (doctorData) {
                await activityLogService.addLog({
                    userId: profile?.id || '',
                    userEmail: profile?.email || '',
                    userName: (profile as any).doctor_name || profile?.email || '',
                    action: 'DOCTOR_CREATE',
                    description: `Compte ${doctorData.name} créé — ${formData.email}, rôle « ${getSelectedRoleName() || '—'} »`,
                    weekKey: '',
                    category: 'CONFIG',
                    doctorName: doctorData.name,
                });
            }
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

            if (doctorData) {
                const oldRole = roles.find(r => r.id === editingUser.role_id)?.name;
                const newRole = roles.find(r => r.id === formData.roleId)?.name;
                const changes: string[] = [];
                if (oldRole !== newRole) changes.push(`rôle « ${oldRole ?? '—'} » → « ${newRole ?? '—'} »`);
                if (formData.password) changes.push('mot de passe réinitialisé');
                const detail = changes.length ? ` : ${changes.join(', ')}` : ' (aucune modification)';
                await activityLogService.addLog({
                    userId: profile?.id || '',
                    userEmail: profile?.email || '',
                    userName: (profile as any).doctor_name || profile?.email || '',
                    action: 'DOCTOR_UPDATE',
                    description: `Compte ${doctorData.name} (${editingUser.email}) mis à jour${detail}`,
                    weekKey: '',
                    category: 'CONFIG',
                    doctorName: doctorData.name,
                });
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
                await activityLogService.addLog({
                    userId: profile?.id || '',
                    userEmail: profile?.email || '',
                    userName: (profile as any).doctor_name || profile?.email || '',
                    action: 'DOCTOR_DELETE',
                    description: `Médecin ${user.doctors?.name || user.email} supprimé`,
                    weekKey: '',
                    category: 'CONFIG',
                    doctorName: user.doctors?.name || user.email,
                });
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

            await activityLogService.addLog({
                userId: profile?.id || '',
                userEmail: profile?.email || '',
                userName: (profile as any).doctor_name || profile?.email || '',
                action: 'DOCTOR_DELETE',
                description: `Médecin ${doctor.name} supprimé`,
                weekKey: '',
                category: 'CONFIG',
                doctorName: doctor.name,
            });

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
            dect: doctor.dect || '',
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

        // DECT is optional, but when filled it must be exactly 5 digits (matches the DB CHECK)
        const dectValue = doctorFormData.dect.trim();
        if (dectValue && !isValidDect(dectValue)) {
            setError('Le numéro DECT doit comporter exactement 5 chiffres (ou être laissé vide).');
            return;
        }

        setIsSubmitting(true);

        try {
            const updateData = {
                name: doctorFormData.name,
                color: doctorFormData.color,
                dect: dectValue || null,
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
                    dect: savedDoc.dect || null,
                    excludedDays: savedDoc.excluded_days || [],
                    excludedHalfDays: savedDoc.excluded_half_days || [],
                    excludedActivities: savedDoc.excluded_activities || [],
                    excludedSlotTypes: savedDoc.excluded_slot_types || []
                });
            }

            setSuccess('Profil médecin mis à jour !');

            const arrEq = (a: any[] = [], b: any[] = []) =>
                a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|');
            const actNames = (ids: string[] = []) =>
                ids.map(id => activityDefinitions.find(a => a.id === id)?.name ?? id).join(', ') || 'aucune';
            const changes: string[] = [];
            if (editingDoctor.name !== doctorFormData.name)
                changes.push(`nom « ${editingDoctor.name} » → « ${doctorFormData.name} »`);
            if ((editingDoctor.color || '') !== (doctorFormData.color || ''))
                changes.push('couleur modifiée');
            if ((editingDoctor.dect || '') !== dectValue)
                changes.push(`DECT « ${editingDoctor.dect || '—'} » → « ${dectValue || '—'} »`);
            if (!arrEq(editingDoctor.specialty, doctorFormData.selectedSpecialties))
                changes.push(`spécialités → ${doctorFormData.selectedSpecialties.join(', ') || 'aucune'}`);
            if (!arrEq(editingDoctor.excludedDays, doctorFormData.excludedDays))
                changes.push(`jours exclus → ${doctorFormData.excludedDays.join(', ') || 'aucun'}`);
            if (JSON.stringify(editingDoctor.excludedHalfDays || []) !== JSON.stringify(doctorFormData.excludedHalfDays || []))
                changes.push('demi-journées exclues modifiées');
            if (!arrEq(editingDoctor.excludedActivities, doctorFormData.excludedActivities))
                changes.push(`activités exclues → ${actNames(doctorFormData.excludedActivities)}`);
            if (!arrEq(editingDoctor.excludedSlotTypes, doctorFormData.excludedSlotTypes))
                changes.push(`types de créneaux exclus → ${doctorFormData.excludedSlotTypes.join(', ') || 'aucun'}`);
            const detail = changes.length ? ` : ${changes.join(' · ')}` : ' (aucune modification)';

            await activityLogService.addLog({
                userId: profile?.id || '',
                userEmail: profile?.email || '',
                userName: (profile as any).doctor_name || profile?.email || '',
                action: 'DOCTOR_UPDATE',
                description: `Médecin ${doctorFormData.name} mis à jour${detail}`,
                weekKey: '',
                category: 'CONFIG',
                doctorName: doctorFormData.name,
            });

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
            syncUnavailability(savedUnavail);
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

    // === DECT DISPLAY HANDLERS ===
    const doctorsWithDect = allDoctors.filter(d => isValidDect(d.dect));
    // Preview uses a real doctor when one has a number, so admins see their own data
    const previewDoctor = doctorsWithDect[0] || null;
    const previewName = previewDoctor?.name || 'Dr Dupont';
    const previewNumber = previewDoctor?.dect || '12345';

    const dectPosition = dectDisplay?.position ?? DEFAULT_DECT_DISPLAY.position;
    const dectStyle = dectDisplay?.style ?? DEFAULT_DECT_DISPLAY.style;
    const selectedDectStyle = DECT_STYLES.find(s => s.key === dectStyle);
    // Preview renders through <DoctorName> like the real surfaces do, so the phone
    // icon looks here exactly as it will in the planning. The surface is forced on.
    const previewSettings = (style: DectStyle): DectDisplaySettings => ({
        ...DEFAULT_DECT_DISPLAY, ...dectDisplay, style, position: dectPosition, planningGlobal: true,
    });

    const persistDectDisplay = async (next: DectDisplaySettings) => {
        setError('');
        const ok = await setDectDisplay(next);
        if (!ok) {
            setError('Impossible d\'enregistrer les préférences d\'affichage.');
            return;
        }
        setSuccess('Préférences d\'affichage enregistrées');
        setTimeout(() => setSuccess(''), 2000);
    };

    const handleToggleDectSurface = (key: DectSurface) =>
        persistDectDisplay({ ...DEFAULT_DECT_DISPLAY, ...dectDisplay, [key]: !dectDisplay?.[key] });

    const handleSetDectFormat = (patch: Partial<Pick<DectDisplaySettings, 'position' | 'style'>>) =>
        persistDectDisplay({ ...DEFAULT_DECT_DISPLAY, ...dectDisplay, ...patch });

    if (!hasPermission('manage_users')) {
        return (
            <div className="p-6 text-center">
                <div className="text-red-500 text-lg">Accès refusé</div>
                <p className="text-text-muted mt-2">Vous n'avez pas la permission de gérer les utilisateurs.</p>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="p-6 flex justify-center items-center min-h-[400px]">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
            </div>
        );
    }

    return (
        <div className="p-2 md:p-6 max-w-6xl mx-auto">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4 md:mb-6">
                <div>
                    <h1 className="text-2xl font-extrabold text-text-base tracking-tight flex items-center gap-1.5 md:gap-2">
                        <Users className="w-5 h-5 md:w-7 md:h-7 text-primary" /> Gestion d'Équipe
                    </h1>
                    <p className="text-text-muted text-xs md:text-sm mt-0.5 md:mt-1">
                        {users.length} utilisateur{users.length > 1 ? 's' : ''} • {allDoctors.length} profil{allDoctors.length > 1 ? 's' : ''} médecin
                    </p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={handleRefresh}
                        disabled={isRefreshing}
                        className="bg-muted text-text-base px-2 md:px-3 py-1.5 md:py-2 rounded-btn flex items-center gap-1 hover:opacity-80 transition-colors text-xs md:text-sm border border-border"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 md:w-4 md:h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                    </button>
                    <button
                        onClick={() => { resetForm(); setIsCreateModalOpen(true); }}
                        className="bg-primary text-white px-2 md:px-4 py-1.5 md:py-2 rounded-btn flex items-center gap-1 md:gap-2 hover:opacity-90 shadow-md transition-colors text-xs md:text-sm"
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
                    className={`px-2 md:px-4 py-1.5 md:py-2 rounded-btn font-medium flex items-center gap-1 md:gap-2 transition-colors text-xs md:text-sm ${activeView === 'users'
                        ? 'bg-primary text-white'
                        : 'bg-muted text-text-base hover:opacity-80 border border-border'
                        }`}
                >
                    <Users className="w-3.5 h-3.5 md:w-4 md:h-4" />
                    <span className="hidden sm:inline">Utilisateurs</span>
                    <span className="sm:hidden">Util.</span>
                </button>
                <button
                    onClick={() => setActiveView('doctors')}
                    className={`px-2 md:px-4 py-1.5 md:py-2 rounded-btn font-medium flex items-center gap-1 md:gap-2 transition-colors text-xs md:text-sm ${activeView === 'doctors'
                        ? 'bg-primary text-white'
                        : 'bg-muted text-text-base hover:opacity-80 border border-border'
                        }`}
                >
                    <Stethoscope className="w-3.5 h-3.5 md:w-4 md:h-4" />
                    <span className="hidden sm:inline">Profils Médecins</span>
                    <span className="sm:hidden">Médecins</span>
                </button>
                <button
                    onClick={() => setActiveView('specialties')}
                    className={`px-2 md:px-4 py-1.5 md:py-2 rounded-btn font-medium flex items-center gap-1 md:gap-2 transition-colors text-xs md:text-sm ${activeView === 'specialties'
                        ? 'bg-primary text-white'
                        : 'bg-muted text-text-base hover:opacity-80 border border-border'
                        }`}
                >
                    <Tag className="w-3.5 h-3.5 md:w-4 md:h-4" />
                    <span className="hidden sm:inline">Spécialités</span>
                    <span className="sm:hidden">Spéc.</span>
                </button>
                <button
                    onClick={() => setActiveView('dect')}
                    className={`px-2 md:px-4 py-1.5 md:py-2 rounded-btn font-medium flex items-center gap-1 md:gap-2 transition-colors text-xs md:text-sm ${activeView === 'dect'
                        ? 'bg-primary text-white'
                        : 'bg-muted text-text-base hover:opacity-80 border border-border'
                        }`}
                >
                    <Phone className="w-3.5 h-3.5 md:w-4 md:h-4" />
                    <span className="hidden sm:inline">Affichage DECT</span>
                    <span className="sm:hidden">DECT</span>
                </button>
            </div>

            {/* Users View */}
            {activeView === 'users' && (
                <Card>
                    <CardBody>
                    {/* Mobile: card layout */}
                    <div className="md:hidden divide-y divide-border">
                        {users.length === 0 ? (
                            <EmptyState icon={Users} title="Aucun utilisateur" description="Aucun utilisateur trouvé." />
                        ) : (
                            users.map(user => (
                                <div key={user.id} className="p-3 hover:bg-primary/5 transition-colors">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2 min-w-0 flex-1">
                                            <Mail className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
                                            <span className="text-xs font-semibold text-text-base break-all">{user.email}</span>
                                        </div>
                                        <div className="flex gap-1 flex-shrink-0 ml-2">
                                            <button
                                                className="text-text-muted hover:text-primary p-1.5 rounded hover:bg-primary/5"
                                                onClick={() => openEditModal(user)}
                                            >
                                                <Edit2 className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                className={`p-1.5 rounded ${deleteConfirmId === user.id ? 'bg-danger text-white' : 'text-text-muted hover:text-danger hover:bg-danger/10'}`}
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
                                                    <span className="text-xs text-text-base">{user.doctors.name}</span>
                                                </>
                                            ) : (
                                                <span className="text-xs text-text-muted italic flex items-center gap-1">
                                                    <Unlink className="w-3 h-3" /> Non lié
                                                </span>
                                            )}
                                        </div>
                                        <Badge variant={
                                            user.app_roles?.name === 'Admin' ? 'violet'
                                            : user.app_roles?.name === 'Docteur' || user.app_roles?.name === 'Médecin' ? 'blue'
                                            : 'gray'
                                        }>
                                            {user.app_roles?.name || 'Sans rôle'}
                                        </Badge>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                    {/* Desktop: table layout */}
                    <div className="hidden md:block overflow-x-auto rounded-card border border-border/40">
                        <table className="min-w-full border-collapse">
                            <thead>
                                <tr className="sticky top-0 z-table-header bg-[#0F172A]">
                                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-white/60 uppercase tracking-widest">Email</th>
                                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-white/60 uppercase tracking-widest">Profil Médecin</th>
                                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-white/60 uppercase tracking-widest">Rôle</th>
                                    <th className="px-4 py-3 text-right text-[11px] font-semibold text-white/60 uppercase tracking-widest">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.length === 0 ? (
                                    <tr>
                                        <td colSpan={4}>
                                            <EmptyState icon={Users} title="Aucun utilisateur" description="Aucun utilisateur trouvé." />
                                        </td>
                                    </tr>
                                ) : (
                                    users.map(user => (
                                        <tr key={user.id} className="border-b border-border/50 hover:bg-primary/5 transition-colors">
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-3">
                                                    <Mail className="w-4 h-4 text-text-muted" />
                                                    <span className="text-sm font-semibold text-text-base">{user.email}</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">
                                                {user.doctors ? (
                                                    <div className="flex items-center gap-2">
                                                        <div
                                                            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shadow"
                                                            style={{ backgroundColor: user.doctors.color || '#3B82F6' }}
                                                        >
                                                            {user.doctors.name.substring(0, 2)}
                                                        </div>
                                                        <span className="text-sm font-semibold text-text-base">{user.doctors.name}</span>
                                                    </div>
                                                ) : (
                                                    <span className="text-sm text-text-muted italic flex items-center gap-1">
                                                        <Unlink className="w-3 h-3" /> Non lié
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3">
                                                <Badge variant={
                                                    user.app_roles?.name === 'Admin' ? 'violet'
                                                    : user.app_roles?.name === 'Docteur' || user.app_roles?.name === 'Médecin' ? 'blue'
                                                    : 'gray'
                                                }>
                                                    {user.app_roles?.name || 'Sans rôle'}
                                                </Badge>
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <div className="flex justify-end gap-1">
                                                    <button
                                                        className="text-text-muted hover:text-primary p-2 rounded hover:bg-primary/5 transition-colors"
                                                        onClick={() => openEditModal(user)}
                                                        title="Modifier"
                                                    >
                                                        <Edit2 className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        className={`p-2 rounded transition-colors ${deleteConfirmId === user.id
                                                            ? 'bg-danger text-white'
                                                            : 'text-text-muted hover:text-danger hover:bg-danger/10'
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
                    </CardBody>
                </Card>
            )}

            {/* Doctors View */}
            {activeView === 'doctors' && (
                <Card>
                    <CardBody>
                    {/* Mobile: card layout */}
                    <div className="md:hidden divide-y divide-border">
                        {allDoctors.length === 0 ? (
                            <EmptyState icon={Stethoscope} title="Aucun profil médecin" description="Aucun profil médecin trouvé." />
                        ) : (
                            allDoctors.map(doctor => (
                                <div key={doctor.id} className="p-3 hover:bg-primary/5 transition-colors">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2 min-w-0 flex-1">
                                            <div
                                                className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-white text-[9px] font-bold shadow"
                                                style={{ backgroundColor: doctor.color || '#3B82F6' }}
                                            >
                                                {doctor.name.substring(0, 2)}
                                            </div>
                                            <div className="min-w-0">
                                                <div className="text-xs font-bold text-text-base">{doctor.name}</div>
                                                <div className="text-[10px] text-text-muted">
                                                    {doctor.specialty && doctor.specialty.length > 0
                                                        ? doctor.specialty.join(', ')
                                                        : <span className="italic">Pas de spécialité</span>
                                                    }
                                                </div>
                                                {doctor.dect && (
                                                    <div className="text-[10px] text-text-muted flex items-center gap-1 mt-0.5">
                                                        <Phone className="w-2.5 h-2.5" />
                                                        <span className="font-mono tracking-wider">{doctor.dect}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex gap-1 flex-shrink-0 ml-2">
                                            <button
                                                className="text-text-muted hover:text-primary p-1.5 rounded hover:bg-primary/5"
                                                onClick={() => openEditDoctorModal(doctor)}
                                            >
                                                <Edit2 className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                className={`p-1.5 rounded ${deleteDoctorConfirmId === doctor.id ? 'bg-danger text-white' : 'text-text-muted hover:text-danger hover:bg-danger/10'}`}
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
                                                    <Link2 className="w-3 h-3 text-success flex-shrink-0" />
                                                    <span className="text-[10px] text-text-base break-all">{doctor.linkedUser.email}</span>
                                                </>
                                            ) : (
                                                <span className="text-[10px] text-text-muted italic flex items-center gap-1">
                                                    <Unlink className="w-3 h-3" /> Aucun utilisateur
                                                </span>
                                            )}
                                        </div>
                                        <Badge variant={doctor.linkedUser ? 'green' : 'amber'}>
                                            {doctor.linkedUser ? 'Lié' : 'Orphelin'}
                                        </Badge>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                    {/* Desktop: table layout */}
                    <div className="hidden md:block overflow-x-auto rounded-card border border-border/40">
                        <table className="min-w-full border-collapse">
                            <thead>
                                <tr className="sticky top-0 z-table-header bg-[#0F172A]">
                                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-white/60 uppercase tracking-widest">Profil Médecin</th>
                                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-white/60 uppercase tracking-widest">Utilisateur Lié</th>
                                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-white/60 uppercase tracking-widest">Statut</th>
                                    <th className="px-4 py-3 text-right text-[11px] font-semibold text-white/60 uppercase tracking-widest">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {allDoctors.length === 0 ? (
                                    <tr>
                                        <td colSpan={4}>
                                            <EmptyState icon={Stethoscope} title="Aucun profil médecin" description="Aucun profil médecin trouvé." />
                                        </td>
                                    </tr>
                                ) : (
                                    allDoctors.map(doctor => (
                                        <tr key={doctor.id} className="border-b border-border/50 hover:bg-primary/5 transition-colors">
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-3">
                                                    <div
                                                        className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shadow"
                                                        style={{ backgroundColor: doctor.color || '#3B82F6' }}
                                                    >
                                                        {doctor.name.substring(0, 2)}
                                                    </div>
                                                    <div>
                                                        <div className="text-sm font-semibold text-text-base flex items-center gap-2">
                                                            {doctor.name}
                                                            {doctor.dect && (
                                                                <span className="text-[11px] font-mono tracking-wider text-text-muted font-normal flex items-center gap-1">
                                                                    <Phone className="w-3 h-3" />{doctor.dect}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="text-xs text-text-muted">
                                                            {doctor.specialty && doctor.specialty.length > 0
                                                                ? doctor.specialty.join(', ')
                                                                : <span className="italic">Pas de spécialité</span>
                                                            }
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">
                                                {doctor.linkedUser ? (
                                                    <div className="flex items-center gap-2">
                                                        <Link2 className="w-4 h-4 text-success" />
                                                        <span className="text-sm text-text-base">{doctor.linkedUser.email}</span>
                                                    </div>
                                                ) : (
                                                    <span className="text-sm text-text-muted italic flex items-center gap-1">
                                                        <Unlink className="w-4 h-4" /> Aucun utilisateur
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3">
                                                <Badge variant={doctor.linkedUser ? 'green' : 'amber'}>
                                                    {doctor.linkedUser ? 'Lié' : 'Orphelin'}
                                                </Badge>
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <div className="flex justify-end gap-1">
                                                    <button
                                                        className="text-text-muted hover:text-primary p-2 rounded hover:bg-primary/5 transition-colors"
                                                        onClick={() => openEditDoctorModal(doctor)}
                                                        title="Modifier le profil"
                                                    >
                                                        <Edit2 className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        className={`p-2 rounded transition-colors ${deleteDoctorConfirmId === doctor.id
                                                            ? 'bg-danger text-white'
                                                            : 'text-text-muted hover:text-danger hover:bg-danger/10'
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
                    </CardBody>
                </Card>
            )}

            {/* Specialties View */}
            {activeView === 'specialties' && (
                <div className="space-y-6">
                    {/* Create new specialty */}
                    <Card className="p-6">
                        <h3 className="font-heading font-bold text-sm text-text-base mb-4 flex items-center gap-2">
                            <Plus className="w-5 h-5 text-primary" /> Créer une Spécialité
                        </h3>
                        <div className="flex gap-4 items-end">
                            <div className="flex-1">
                                <label className="block text-sm font-medium text-text-base mb-1">Nom</label>
                                <input
                                    type="text"
                                    value={newSpecialtyName}
                                    onChange={(e) => setNewSpecialtyName(e.target.value)}
                                    className="w-full border border-border rounded-btn h-10 px-3 focus:border-primary focus:outline-none"
                                    placeholder="Ex: Radiologie, Scanner, IRM..."
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-text-base mb-1">Couleur</label>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="color"
                                        value={newSpecialtyColor}
                                        onChange={(e) => setNewSpecialtyColor(e.target.value)}
                                        className="w-10 h-10 rounded cursor-pointer border border-border"
                                    />
                                </div>
                            </div>
                            <button
                                onClick={handleCreateSpecialty}
                                disabled={isSubmitting || !newSpecialtyName.trim()}
                                className="bg-primary text-white px-4 py-2 rounded-btn font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
                            >
                                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                                Créer
                            </button>
                        </div>
                        {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
                        {success && <p className="text-green-600 text-sm mt-2">{success}</p>}
                    </Card>

                    {/* List of specialties */}
                    <Card>
                        <div className="px-4 py-3 border-b border-border">
                            <h3 className="font-heading font-semibold text-sm text-text-base">Spécialités disponibles ({specialties.length})</h3>
                        </div>
                        <div className="divide-y divide-border">
                            {specialties.length === 0 ? (
                                <EmptyState icon={Tag} title="Aucune spécialité" description="Créez-en une ci-dessus." />
                            ) : (
                                specialties.map(spec => {
                                    const doctorsWithThisSpec = allDoctors.filter(d => d.specialty.includes(spec.name));
                                    return (
                                        <div key={spec.id} className="flex items-center justify-between px-3 py-2 hover:bg-muted">
                                            <div className="flex items-center gap-3">
                                                <div
                                                    className="w-4 h-4 rounded-full"
                                                    style={{ backgroundColor: spec.color }}
                                                />
                                                <div>
                                                    <div className="font-medium text-text-base">{spec.name}</div>
                                                    <div className="text-[11px] text-text-muted">
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
                                                            <div className="w-7 h-7 rounded-full border-2 border-white bg-muted flex items-center justify-center text-[9px] font-bold text-text-muted">
                                                                +{doctorsWithThisSpec.length - 3}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                                <button
                                                    className={`p-2 rounded transition-colors ${deleteSpecialtyConfirmId === spec.id
                                                        ? 'bg-danger text-white'
                                                        : 'text-text-muted hover:text-danger hover:bg-danger/10'
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
                    </Card>
                </div>
            )}

            {/* DECT Display View */}
            {activeView === 'dect' && (
                <div className="space-y-6">
                    <Card className="p-6">
                        <h3 className="font-heading font-bold text-sm text-text-base mb-1 flex items-center gap-2">
                            <Phone className="w-5 h-5 text-primary" /> Affichage du numéro DECT
                        </h3>
                        <p className="text-xs text-text-muted mb-4">
                            Choisissez où le numéro DECT est affiché, ainsi que sa position et son style.
                            Ce réglage s'applique à toute l'équipe. Les médecins sans numéro renseigné
                            gardent leur nom seul.
                        </p>

                        {/* Live preview + format controls */}
                        <div className="bg-muted border border-border rounded-lg px-4 py-3.5 mb-5">
                            <div className="text-[11px] uppercase tracking-widest text-text-muted mb-1.5">Aperçu</div>
                            <div className="text-base font-semibold text-text-base mb-4 break-words">
                                <DoctorName
                                    doctor={{ name: previewName, dect: previewNumber }}
                                    settings={previewSettings(dectStyle)}
                                    surface="planningGlobal"
                                />
                            </div>

                            {/* Position */}
                            <div className="mb-3">
                                <div className="text-xs font-medium text-text-base mb-1.5">Position</div>
                                <div className="flex flex-wrap gap-1.5">
                                    {DECT_POSITIONS.map(pos => (
                                        <button
                                            key={pos.key}
                                            type="button"
                                            onClick={() => handleSetDectFormat({ position: pos.key })}
                                            className={`px-3 py-1.5 rounded-btn text-xs font-medium border transition-colors ${dectPosition === pos.key
                                                ? 'bg-primary text-white border-primary'
                                                : 'bg-surface text-text-muted border-border hover:border-text-muted'
                                                }`}
                                        >
                                            {pos.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Style — each button previews itself */}
                            <div>
                                <div className="text-xs font-medium text-text-base mb-1.5">Style</div>
                                <div className="flex flex-wrap gap-1.5">
                                    {DECT_STYLES.map(style => (
                                        <button
                                            key={style.key}
                                            type="button"
                                            onClick={() => handleSetDectFormat({ style: style.key })}
                                            title={style.label}
                                            className={`px-3 py-1.5 rounded-btn text-xs font-medium border transition-colors ${dectStyle === style.key
                                                ? 'bg-primary text-white border-primary'
                                                : 'bg-surface text-text-muted border-border hover:border-text-muted'
                                                }`}
                                        >
                                            <DoctorName
                                                doctor={{ name: 'Nom', dect: previewNumber }}
                                                settings={previewSettings(style.key)}
                                                surface="planningGlobal"
                                                numberClassName={dectStyle === style.key ? 'text-white/80 font-normal' : 'text-text-muted font-normal'}
                                            />
                                        </button>
                                    ))}
                                </div>
                                {selectedDectStyle?.note && (
                                    <p className="text-xs text-text-muted mt-2 flex items-start gap-1.5">
                                        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-warning" />
                                        <span>
                                            {selectedDectStyle.note}
                                            {dectDisplay?.planningGlobalPdf && (
                                                <>
                                                    {' '}Rendu PDF :{' '}
                                                    <span className="text-text-base">
                                                        {formatDectName(previewName, previewNumber, dectPosition, dectStyle)}
                                                    </span>
                                                </>
                                            )}
                                        </span>
                                    </p>
                                )}
                            </div>
                        </div>

                        <div className="space-y-2">
                            {DECT_SURFACES.map(surface => {
                                const checked = dectDisplay?.[surface.key] === true;
                                return (
                                    <label
                                        key={surface.key}
                                        className={`flex items-start gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors ${checked
                                            ? 'bg-primary/5 border-primary/30'
                                            : 'bg-surface border-border hover:bg-muted'
                                            }`}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={() => handleToggleDectSurface(surface.key)}
                                            className="mt-0.5 w-4 h-4 accent-primary cursor-pointer flex-shrink-0"
                                        />
                                        <div className="min-w-0">
                                            <div className="text-sm font-medium text-text-base">{surface.label}</div>
                                            <div className="text-xs text-text-muted">{surface.description}</div>
                                        </div>
                                    </label>
                                );
                            })}
                        </div>

                        {error && <p className="text-red-600 text-sm mt-3">{error}</p>}
                        {success && <p className="text-green-600 text-sm mt-3">{success}</p>}
                    </Card>

                    {/* Coverage: which doctors still need a number */}
                    <Card>
                        <div className="px-4 py-3 border-b border-border">
                            <h3 className="font-heading font-semibold text-sm text-text-base">
                                Numéros renseignés — {doctorsWithDect.length} médecin{doctorsWithDect.length !== 1 ? 's' : ''} sur {allDoctors.length}
                            </h3>
                        </div>
                        <div className="divide-y divide-border">
                            {allDoctors.length === 0 ? (
                                <EmptyState icon={Stethoscope} title="Aucun profil médecin" description="Aucun profil médecin trouvé." />
                            ) : (
                                allDoctors.map(doctor => (
                                    <div key={doctor.id} className="flex items-center justify-between px-3 py-2 hover:bg-muted">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div
                                                className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-white text-[9px] font-bold shadow"
                                                style={{ backgroundColor: doctor.color || '#3B82F6' }}
                                            >
                                                {doctor.name.substring(0, 2)}
                                            </div>
                                            <span className="text-sm text-text-base truncate">{doctor.name}</span>
                                        </div>
                                        <div className="flex items-center gap-2 flex-shrink-0">
                                            {doctor.dect ? (
                                                <span className="font-mono text-sm tracking-widest text-text-base">{doctor.dect}</span>
                                            ) : (
                                                <span className="text-xs text-text-muted italic">Non renseigné</span>
                                            )}
                                            <button
                                                className="text-text-muted hover:text-primary p-1.5 rounded hover:bg-primary/5 transition-colors"
                                                onClick={() => openEditDoctorModal(doctor)}
                                                title="Renseigner le numéro DECT"
                                            >
                                                <Edit2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </Card>
                </div>
            )}

            {/* Create Modal */}
            {isCreateModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-surface rounded-card shadow-2xl w-full max-w-md p-6 border border-border max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="font-heading font-bold text-xl text-text-base flex items-center gap-2">
                                <UserPlus className="w-5 h-5 text-primary" /> Nouvel Utilisateur
                            </h2>
                            <button onClick={() => setIsCreateModalOpen(false)} className="text-text-muted hover:text-text-base">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleCreateUser} className="space-y-4">
                            {/* Email */}
                            <div>
                                <label className="block text-sm font-medium text-text-base mb-1">
                                    <Mail className="w-4 h-4 inline mr-1" /> Email *
                                </label>
                                <input
                                    type="email"
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                    className="w-full border border-border rounded-btn h-10 px-3 focus:border-primary focus:outline-none"
                                    placeholder="utilisateur@exemple.com"
                                    required
                                />
                            </div>

                            {/* Password */}
                            <div>
                                <label className="block text-sm font-medium text-text-base mb-1">
                                    <Key className="w-4 h-4 inline mr-1" /> Mot de passe *
                                </label>
                                <div className="relative">
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        value={formData.password}
                                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                        className="w-full border border-border rounded-btn h-10 px-3 pr-10 focus:border-primary focus:outline-none"
                                        placeholder="Min. 6 caractères"
                                        required
                                        minLength={6}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted"
                                    >
                                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>

                            {/* Role */}
                            <div>
                                <label className="block text-sm font-medium text-text-base mb-1">
                                    <Shield className="w-4 h-4 inline mr-1" /> Rôle *
                                </label>
                                <select
                                    value={formData.roleId}
                                    onChange={(e) => setFormData({ ...formData, roleId: e.target.value })}
                                    className="w-full border border-border rounded-btn h-10 px-3 focus:border-primary focus:outline-none"
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
                                                : 'bg-muted text-text-muted border-2 border-transparent'
                                                }`}
                                        >
                                            Créer un nouveau profil
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setLinkMode('existing')}
                                            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${linkMode === 'existing'
                                                ? 'bg-blue-100 text-blue-700 border-2 border-blue-400'
                                                : 'bg-muted text-text-muted border-2 border-transparent'
                                                }`}
                                        >
                                            Lier à un profil existant
                                        </button>
                                    </div>

                                    {linkMode === 'new' && (
                                        <>
                                            <div>
                                                <label className="block text-sm font-medium text-text-base mb-1">
                                                    <UserCheck className="w-4 h-4 inline mr-1" /> Nom du Médecin *
                                                </label>
                                                <input
                                                    type="text"
                                                    value={formData.name}
                                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                                    className="w-full border border-border rounded-btn h-10 px-3 focus:border-primary focus:outline-none"
                                                    placeholder="Dr Dupont"
                                                    required
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-text-base mb-1">Couleur</label>
                                                <div className="flex items-center gap-3">
                                                    <input
                                                        type="color"
                                                        value={formData.color}
                                                        onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                                                        className="w-10 h-10 rounded cursor-pointer border"
                                                    />
                                                    <span className="text-text-muted text-sm">{formData.color}</span>
                                                </div>
                                            </div>
                                        </>
                                    )}

                                    {linkMode === 'existing' && (
                                        <div>
                                            <label className="block text-sm font-medium text-text-base mb-1">
                                                <Link2 className="w-4 h-4 inline mr-1" /> Profil Médecin Existant
                                            </label>
                                            <select
                                                value={formData.existingDoctorId}
                                                onChange={(e) => setFormData({ ...formData, existingDoctorId: e.target.value })}
                                                className="w-full border border-border rounded-btn h-10 px-3 focus:border-primary focus:outline-none"
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
                                <div className="bg-muted p-3 rounded-lg text-sm text-text-muted">
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
                                className="w-full bg-primary text-white py-2.5 rounded-btn font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
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
                    <div className="bg-surface rounded-card shadow-2xl w-full max-w-md p-6 border border-border max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="font-heading font-bold text-xl text-text-base flex items-center gap-2">
                                <Edit2 className="w-5 h-5 text-primary" /> Modifier l'Utilisateur
                            </h2>
                            <button onClick={() => { setIsEditModalOpen(false); setEditingUser(null); }} className="text-text-muted hover:text-text-base">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleEditUser} className="space-y-4">
                            {/* Email (read-only) */}
                            <div>
                                <label className="block text-sm font-medium text-text-base mb-1">
                                    <Mail className="w-4 h-4 inline mr-1" /> Email
                                </label>
                                <input
                                    type="email"
                                    value={formData.email}
                                    disabled
                                    className="w-full border border-border rounded-btn h-10 px-3 bg-muted text-text-muted"
                                />
                            </div>

                            {/* Password */}
                            <div>
                                <label className="block text-sm font-medium text-text-base mb-1">
                                    <Key className="w-4 h-4 inline mr-1" /> Nouveau Mot de Passe
                                    <span className="text-text-muted font-normal ml-1">(optionnel)</span>
                                </label>
                                <div className="relative">
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        value={formData.password}
                                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                        className="w-full border border-border rounded-btn h-10 px-3 pr-10 focus:border-primary focus:outline-none"
                                        placeholder="Laisser vide pour ne pas changer"
                                        minLength={6}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted"
                                    >
                                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>

                            {/* Role */}
                            <div>
                                <label className="block text-sm font-medium text-text-base mb-1">
                                    <Shield className="w-4 h-4 inline mr-1" /> Rôle *
                                </label>
                                <select
                                    value={formData.roleId}
                                    onChange={(e) => setFormData({ ...formData, roleId: e.target.value })}
                                    className="w-full border border-border rounded-btn h-10 px-3 focus:border-primary focus:outline-none"
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
                                                : 'bg-muted text-text-muted border-2 border-transparent'
                                                }`}
                                        >
                                            <Link2 className="w-4 h-4 inline mr-1" /> Lier à un profil
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setLinkMode('new')}
                                            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${linkMode === 'new'
                                                ? 'bg-blue-100 text-blue-700 border-2 border-blue-400'
                                                : 'bg-muted text-text-muted border-2 border-transparent'
                                                }`}
                                        >
                                            Créer nouveau
                                        </button>
                                    </div>

                                    {linkMode === 'existing' && (
                                        <div>
                                            <label className="block text-sm font-medium text-text-base mb-1">
                                                Profil Médecin
                                            </label>
                                            <select
                                                value={formData.existingDoctorId}
                                                onChange={(e) => setFormData({ ...formData, existingDoctorId: e.target.value })}
                                                className="w-full border border-border rounded-btn h-10 px-3 focus:border-primary focus:outline-none"
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
                                                <label className="block text-sm font-medium text-text-base mb-1">
                                                    <UserCheck className="w-4 h-4 inline mr-1" /> Nom du Médecin
                                                </label>
                                                <input
                                                    type="text"
                                                    value={formData.name}
                                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                                    className="w-full border border-border rounded-btn h-10 px-3 focus:border-primary focus:outline-none"
                                                    placeholder="Dr Dupont"
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-text-base mb-1">Couleur</label>
                                                <div className="flex items-center gap-3">
                                                    <input
                                                        type="color"
                                                        value={formData.color}
                                                        onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                                                        className="w-10 h-10 rounded cursor-pointer border"
                                                    />
                                                    <span className="text-text-muted text-sm">{formData.color}</span>
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </>
                            )}

                            {formData.roleId && isNonDoctorRole(formData.roleId) && (
                                <div className="bg-muted p-3 rounded-lg text-sm text-text-muted">
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
                                className="w-full bg-primary text-white py-2.5 rounded-btn font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
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
                    <div className="bg-surface rounded-card shadow-2xl w-full max-w-md p-6 border border-border max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="font-heading font-bold text-xl text-text-base flex items-center gap-2">
                                <Stethoscope className="w-5 h-5 text-primary" /> Modifier le Profil Médecin
                            </h2>
                            <button onClick={() => { setIsEditDoctorModalOpen(false); setEditingDoctor(null); setEditingDoctorId(null); }} className="text-text-muted hover:text-text-base">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleEditDoctor} className="space-y-4">
                            {/* Doctor Name */}
                            <div>
                                <label className="block text-sm font-medium text-text-base mb-1">
                                    <UserCheck className="w-4 h-4 inline mr-1" /> Nom
                                </label>
                                <input
                                    type="text"
                                    value={doctorFormData.name}
                                    onChange={(e) => setDoctorFormData({ ...doctorFormData, name: e.target.value })}
                                    className="w-full border border-border rounded-btn h-10 px-3 focus:border-primary focus:outline-none"
                                    placeholder="Dr Dupont"
                                    required
                                />
                            </div>

                            {/* Color */}
                            <div>
                                <label className="block text-sm font-medium text-text-base mb-1">Couleur</label>
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
                                    <span className="text-text-muted text-sm">{doctorFormData.color}</span>
                                </div>
                            </div>

                            {/* DECT phone */}
                            <div>
                                <label className="block text-sm font-medium text-text-base mb-1">
                                    <Phone className="w-4 h-4 inline mr-1" /> Téléphone DECT
                                    <span className="text-text-muted font-normal ml-1">(optionnel)</span>
                                </label>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    autoComplete="off"
                                    maxLength={5}
                                    value={doctorFormData.dect}
                                    onChange={(e) => setDoctorFormData({ ...doctorFormData, dect: sanitizeDectInput(e.target.value) })}
                                    className={`w-full border rounded-btn h-10 px-3 font-mono tracking-widest focus:outline-none ${doctorFormData.dect && !isValidDect(doctorFormData.dect)
                                        ? 'border-danger focus:border-danger'
                                        : 'border-border focus:border-primary'
                                        }`}
                                    placeholder="12345"
                                />
                                <p className={`text-xs mt-1 ${doctorFormData.dect && !isValidDect(doctorFormData.dect) ? 'text-danger' : 'text-text-muted'}`}>
                                    {doctorFormData.dect && !isValidDect(doctorFormData.dect)
                                        ? `${doctorFormData.dect.length}/5 chiffres — le numéro doit en comporter exactement 5.`
                                        : 'Numéro interne à 5 chiffres. Laissez vide si le médecin n\'en a pas.'}
                                </p>
                            </div>

                            {/* Specialty */}
                            <div>
                                <label className="block text-sm font-medium text-text-base mb-2">
                                    <Tag className="w-4 h-4 inline mr-1" /> Spécialités
                                </label>
                                {specialties.length === 0 ? (
                                    <p className="text-sm text-text-muted italic">
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
                                                        : 'bg-surface text-text-muted border-border hover:border-text-muted'
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
                                    <p className="text-xs text-text-muted mt-2">
                                        Sélectionnées: {doctorFormData.selectedSpecialties.join(', ')}
                                    </p>
                                )}
                            </div>

                            {/* Separator */}
                            <div className="border-t border-border pt-4">
                                <h3 className="text-sm font-bold text-text-base mb-3 flex items-center gap-2">
                                    <Ban className="w-4 h-4 text-red-500" /> Préférences & Exclusions
                                </h3>

                                {/* Excluded Half-Days (Recurring Weekly Absences) */}
                                <div className="mb-4">
                                    <label className="block text-sm font-medium text-text-muted mb-2">
                                        <Calendar className="w-4 h-4 inline mr-1 text-red-500" /> Demi-journées non travaillées (récurrentes)
                                    </label>
                                    <p className="text-xs text-text-muted mb-3">
                                        Cliquez sur une demi-journée pour l'exclure, ou cliquez sur le nom du jour pour exclure la journée entière.
                                    </p>
                                    <div className="bg-muted rounded-lg p-3 border border-border">
                                        {/* Header row */}
                                        <div className="grid grid-cols-3 gap-1 mb-2 text-center">
                                            <div className="text-xs font-medium text-text-muted">Jour</div>
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
                                                                : 'bg-surface text-text-muted border-border hover:bg-muted'
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
                                                            : 'bg-surface text-orange-600 border-orange-200 hover:bg-orange-50'
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
                                                            : 'bg-surface text-primary border-primary/20 hover:bg-primary/5'
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
                                    <label className="block text-sm font-medium text-text-muted mb-2">
                                        <Ban className="w-4 h-4 inline mr-1 text-text-muted" /> Activités Exclues
                                    </label>
                                    {activityDefinitions.length === 0 ? (
                                        <p className="text-xs text-text-muted italic">Aucune activité définie.</p>
                                    ) : (
                                        <div className="space-y-1 max-h-32 overflow-y-auto bg-muted rounded-lg p-2">
                                            {activityDefinitions.map(act => (
                                                <div
                                                    key={act.id}
                                                    className="flex items-center p-1.5 hover:bg-surface rounded cursor-pointer"
                                                    onClick={() => toggleExcludedActivity(act.id)}
                                                >
                                                    <div className={`w-4 h-4 rounded border flex items-center justify-center mr-2 ${doctorFormData.excludedActivities.includes(act.id)
                                                        ? 'bg-red-500 border-red-500'
                                                        : 'border-border bg-surface'
                                                        }`}>
                                                        {doctorFormData.excludedActivities.includes(act.id) && (
                                                            <Ban className="w-2.5 h-2.5 text-white" />
                                                        )}
                                                    </div>
                                                    <span className={`text-sm ${doctorFormData.excludedActivities.includes(act.id)
                                                        ? 'text-red-700 font-medium line-through'
                                                        : 'text-text-base'
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
                                    <label className="block text-sm font-medium text-text-muted mb-2">
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
                                                        : 'bg-muted text-text-muted border-border hover:bg-muted'
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
                            <div className="border-t border-border pt-4">
                                <h3 className="text-sm font-bold text-text-base mb-3 flex items-center gap-2">
                                    <Calendar className="w-4 h-4 text-blue-500" /> Indisponibilités
                                </h3>

                                {/* Existing Unavailabilities List */}
                                {getDoctorUnavailabilities().length > 0 && (
                                    <div className="mb-4">
                                        <p className="text-xs text-text-muted mb-2">Indisponibilités existantes :</p>
                                        <div className="bg-muted rounded-lg p-2 max-h-32 overflow-y-auto space-y-1">
                                            {getDoctorUnavailabilities().map(unavail => (
                                                <div
                                                    key={unavail.id}
                                                    className="flex justify-between items-center bg-surface p-2 rounded border border-border hover:border-text-muted"
                                                >
                                                    <div className="text-xs">
                                                        <div className="font-medium text-text-base">{unavail.reason}</div>
                                                        <div className="text-text-muted">
                                                            {unavail.startDate} → {unavail.endDate}
                                                            {unavail.period && unavail.period !== 'ALL_DAY' && (
                                                                <span className="ml-1 text-[10px] bg-muted px-1 rounded">
                                                                    {unavail.period === Period.MORNING ? 'Matin' : 'Après-midi'}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDeleteUnavailability(unavail.id)}
                                                        className={`p-1.5 rounded transition-colors ${deleteUnavailConfirmId === unavail.id
                                                            ? 'bg-red-600 text-white'
                                                            : 'text-text-muted hover:text-red-600 hover:bg-red-50'
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
                                            <label className="block text-[10px] text-text-muted mb-0.5">Du</label>
                                            <input
                                                type="date"
                                                value={unavailStartDate}
                                                onChange={(e) => setUnavailStartDate(e.target.value)}
                                                className="w-full border rounded px-2 py-1 text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] text-text-muted mb-0.5">Au</label>
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
                                            <label className="block text-[10px] text-text-muted mb-0.5">Période</label>
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
                                            <label className="block text-[10px] text-text-muted mb-0.5">Motif</label>
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
                                className="w-full bg-primary text-white py-2.5 rounded-btn font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
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

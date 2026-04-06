import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../services/supabaseClient';

type UserRole = 'admin' | 'doctor' | 'viewer';

interface UserProfile {
    id: string;
    email: string;
    role: UserRole;
    doctor_id?: string;
    role_id?: string;
    role_name?: string;
    permissions: string[];
}

interface AuthContextType {
    session: Session | null;
    user: User | null;
    profile: UserProfile | null;
    loading: boolean;
    isAdmin: boolean;
    isDoctor: boolean;
    passwordRecovery: boolean;
    clearPasswordRecovery: () => void;
    signInWithPassword: (email: string, password: string) => Promise<{ error: any }>;
    signOut: () => Promise<void>;
    hasPermission: (permission: string) => boolean;
    refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [session, setSession] = useState<Session | null>(null);
    const [user, setUser] = useState<User | null>(null);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [passwordRecovery, setPasswordRecovery] = useState(false);

    useEffect(() => {
        // Get initial session
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            setUser(session?.user ?? null);
            if (session?.user) {
                fetchProfile(session.user.id);
            } else {
                setLoading(false);
            }
        });

        // Listen for changes - but avoid unnecessary updates on TOKEN_REFRESHED
        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((event, newSession) => {
            // Detect password recovery flow → signal the router to redirect
            if (event === 'PASSWORD_RECOVERY') {
                setPasswordRecovery(true);
                setSession(newSession);
                setUser(newSession?.user ?? null);
                setLoading(false);
                return;
            }

            // Only update state if session actually changed (not just refreshed)
            if (event === 'TOKEN_REFRESHED') {
                setSession(newSession);
                setUser(newSession?.user ?? null);
                return;
            }

            setSession(newSession);
            setUser(newSession?.user ?? null);
            if (newSession?.user) {
                fetchProfile(newSession.user.id);
            } else {
                setProfile(null);
                setLoading(false);
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    const fetchProfile = async (userId: string) => {
        try {
            // Step 1: Get basic profile
            const { data: profileData, error: profileError } = await supabase
                .from('profiles')
                .select('id, email, role, doctor_id, role_id')
                .eq('id', userId)
                .single();

            if (profileError) {
                console.error('Error fetching profile:', profileError);
                setProfile(null);
                setLoading(false);
                return;
            }

            // Step 2: Get role name if role_id exists
            let roleName = '';
            let permissions: string[] = [];

            if (profileData.role_id) {
                const { data: roleData } = await supabase
                    .from('app_roles')
                    .select('name')
                    .eq('id', profileData.role_id)
                    .single();

                if (roleData) {
                    roleName = roleData.name;
                }

                // Step 3: Get permissions for this role
                const { data: permData } = await supabase
                    .from('role_permissions')
                    .select('app_permissions(code)')
                    .eq('role_id', profileData.role_id);

                if (permData) {
                    permissions = permData
                        .map((p: any) => p.app_permissions?.code)
                        .filter(Boolean);
                }
            }

            // If role is 'admin' (legacy enum), give all permissions
            if (profileData.role === 'admin' || roleName === 'Admin') {
                permissions = ['ALL']; // Special marker for admin
            }

            setProfile({
                ...profileData,
                role_name: roleName,
                permissions
            });

        } catch (err) {
            console.error('Unexpected error fetching profile:', err);
            setProfile(null);
        } finally {
            setLoading(false);
        }
    };

    const signInWithPassword = async (email: string, password: string) => {
        const { error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });
        return { error };
    };

    const signOut = async () => {
        await supabase.auth.signOut();
        setProfile(null);
    };

    const refreshProfile = async () => {
        if (user) {
            await fetchProfile(user.id);
        }
    };

    const hasPermission = (permission: string): boolean => {
        if (!profile) return false;

        // Admin has all permissions
        if (profile.role === 'admin' ||
            profile.role_name === 'Admin' ||
            profile.permissions.includes('ALL')) {
            return true;
        }

        return profile.permissions.includes(permission);
    };

    const clearPasswordRecovery = () => setPasswordRecovery(false);

    const value = {
        session,
        user,
        profile,
        loading,
        isAdmin: profile?.role === 'admin' || profile?.role_name === 'Admin',
        isDoctor: profile?.role === 'doctor' || profile?.role_name === 'Docteur',
        passwordRecovery,
        clearPasswordRecovery,
        signInWithPassword,
        signOut,
        hasPermission,
        refreshProfile
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

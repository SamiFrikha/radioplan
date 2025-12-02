
import React, { createContext, useContext, useState, useEffect } from 'react';
import { Doctor, RoleDefinition } from '../types';
import { authService } from '../services/api/authService';

interface AuthContextType {
    user: Doctor | null;
    isLoading: boolean;
    login: (email: string, password?: string) => Promise<void>;
    logout: () => void;
    hasPermission: (permission: string, loadedRoles?: RoleDefinition[]) => boolean;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<Doctor | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const initAuth = async () => {
            try {
                const currentUser = await authService.me();
                setUser(currentUser);
            } catch (e) {
                console.error("Auth init failed", e);
            } finally {
                setIsLoading(false);
            }
        };
        initAuth();
    }, []);

    const login = async (email: string, password?: string) => {
        setIsLoading(true);
        try {
            const loggedUser = await authService.login(email, password);
            setUser(loggedUser);
            localStorage.setItem('radioplan_auth_token', JSON.stringify(loggedUser));
        } finally {
            setIsLoading(false);
        }
    };

    const logout = async () => {
        await authService.logout();
        setUser(null);
    };

    // Updated to accept roles dynamically
    const hasPermission = (permission: string, loadedRoles?: RoleDefinition[]) => {
        if (!user) return false;
        
        // If roles are provided (from App context), use them to check permissions
        if (loadedRoles) {
            const roleDef = loadedRoles.find(r => r.id === user.role);
            if (roleDef) {
                // Safely access permissions, default to empty array if null/undefined in DB
                return (roleDef.permissions || []).includes(permission);
            }
        }
        
        // Fallback for bootstrap / initial load if needed (Admin always has access if role is ADMIN)
        if (user.role === 'ADMIN') return true;
        
        return false;
    };

    return (
        <AuthContext.Provider value={{ user, isLoading, login, logout, hasPermission }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);

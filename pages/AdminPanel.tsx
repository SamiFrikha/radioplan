
import React, { useContext, useState, useMemo } from 'react';
import { AppContext } from '../App';
import { useAuth } from '../context/AuthContext';
import { Shield, Users, Lock, Database, Settings, AlertOctagon, ToggleLeft, ToggleRight, PlusCircle, Trash2 } from 'lucide-react';
import DataAdministration from './DataAdministration';
import { AVAILABLE_PERMISSIONS, PERMISSION_KEYS } from '../config/permissions';
import { RoleDefinition, AppContextType } from '../types';

const AdminPanel: React.FC = () => {
    const { hasPermission: checkAccess, user } = useAuth();
    const { doctors, roles, updateRole, addRole, removeRole } = useContext(AppContext) as AppContextType;
    
    const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
    const [isCreatingRole, setIsCreatingRole] = useState(false);
    const [newRoleName, setNewRoleName] = useState("");

    // Always derive from context to ensure freshness
    const selectedRole = useMemo(() => 
        roles.find(r => r.id === selectedRoleId) || null, 
    [roles, selectedRoleId]);

    const permissionsByCategory = useMemo(() => {
        const groups: Record<string, typeof AVAILABLE_PERMISSIONS> = {};
        AVAILABLE_PERMISSIONS.forEach(p => {
            if (!groups[p.category]) groups[p.category] = [];
            groups[p.category].push(p);
        });
        return groups;
    }, []);

    if (!checkAccess(PERMISSION_KEYS.VIEW_ADMIN_PANEL)) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-slate-400">
                <Lock className="w-16 h-16 mb-4 opacity-20" />
                <h2 className="text-xl font-bold">Accès Refusé</h2>
                <p>Vous n'avez pas les droits d'administration.</p>
            </div>
        );
    }

    const togglePermission = async (role: RoleDefinition, permissionKey: string) => {
        const currentPermissions = role.permissions || [];
        const hasIt = currentPermissions.includes(permissionKey);
        
        let newPerms;
        if (hasIt) {
            newPerms = currentPermissions.filter(p => p !== permissionKey);
        } else {
            newPerms = [...currentPermissions, permissionKey];
        }

        // Create a completely new object to force React re-render
        const updatedRole = { 
            ...role, 
            permissions: newPerms 
        };
        
        updateRole(updatedRole);
    };

    const handleCreateRole = async () => {
        if (!newRoleName.trim()) return;
        await addRole(newRoleName.trim());
        setNewRoleName("");
        setIsCreatingRole(false);
    };

    const onDeleteRole = async (roleId: string, roleName: string, e?: React.MouseEvent) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }

        if (window.confirm(`Supprimer définitivement le rôle "${roleName}" ?`)) {
            if (selectedRoleId === roleId) {
                setSelectedRoleId(null);
            }
            await removeRole(roleId);
        }
    };

    return (
        <div className="h-full overflow-y-auto pb-20">
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-slate-800 flex items-center">
                    <Shield className="w-6 h-6 mr-3 text-purple-600" />
                    Panneau Administrateur
                </h1>
                <p className="text-sm text-slate-500 mt-1">
                    Connecté en tant que <strong className="text-slate-700">{user?.name}</strong>
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <div className="p-3 bg-blue-100 rounded-lg">
                            <Users className="w-6 h-6 text-blue-600" />
                        </div>
                        <span className="text-2xl font-bold text-slate-800">{doctors.length}</span>
                    </div>
                    <h3 className="font-bold text-slate-700">Utilisateurs</h3>
                </div>

                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <div className="p-3 bg-purple-100 rounded-lg">
                            <Shield className="w-6 h-6 text-purple-600" />
                        </div>
                        <span className="text-2xl font-bold text-slate-800">{roles.length}</span>
                    </div>
                    <h3 className="font-bold text-slate-700">Rôles Définis</h3>
                </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-8">
                <div className="p-4 bg-slate-50 border-b border-slate-200 font-bold text-slate-700 flex items-center">
                    <Settings className="w-4 h-4 mr-2" />
                    Gestion des Rôles et Permissions
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-4 min-h-[500px]">
                    {/* Role List */}
                    <div className="border-r border-slate-100 p-4 bg-slate-50/50 flex flex-col">
                        <h4 className="text-xs font-bold text-slate-400 uppercase mb-3">Rôles Disponibles</h4>
                        <div className="space-y-2 flex-1">
                            {roles.map(role => (
                                <div 
                                    key={role.id}
                                    className={`w-full flex items-center justify-between rounded-lg text-sm font-medium transition-colors ${
                                        selectedRoleId === role.id 
                                        ? 'bg-purple-100 text-purple-800 border border-purple-200 shadow-sm' 
                                        : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                                    }`}
                                >
                                    <button
                                        onClick={() => setSelectedRoleId(role.id)}
                                        className="flex-1 text-left px-4 py-3 flex items-center truncate"
                                    >
                                        {role.name}
                                        {role.isSystem && <Lock className="w-3 h-3 text-slate-400 ml-2" />}
                                    </button>
                                    
                                    {!role.isSystem && (
                                        <button 
                                            onClick={(e) => onDeleteRole(role.id, role.name, e)}
                                            className="p-3 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-r-lg border-l border-transparent hover:border-red-100 transition-all"
                                            title="Supprimer ce rôle"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                        <div className="mt-4 pt-4 border-t border-slate-200">
                            <button 
                                onClick={() => setIsCreatingRole(true)}
                                className="w-full py-2 bg-blue-600 text-white rounded text-xs font-bold flex items-center justify-center hover:bg-blue-700 shadow-sm"
                            >
                                <PlusCircle className="w-4 h-4 mr-2" /> Créer un rôle
                            </button>
                        </div>
                    </div>

                    {/* Permissions Matrix */}
                    <div className="md:col-span-3 p-6 bg-slate-50/30">
                        {!selectedRole ? (
                            <div className="flex flex-col items-center justify-center h-full text-slate-400">
                                <Shield className="w-12 h-12 mb-3 opacity-20" />
                                <p>Sélectionnez un rôle pour configurer ses accès.</p>
                            </div>
                        ) : (
                            <div className="animate-in fade-in slide-in-from-left-2 duration-300">
                                <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-200">
                                    <div>
                                        <h3 className="text-xl font-bold text-slate-800 flex items-center">
                                            {selectedRole.name}
                                            {selectedRole.isSystem && <span className="ml-3 text-[10px] bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full uppercase">Système</span>}
                                        </h3>
                                        <p className="text-sm text-slate-500">
                                            ID: {selectedRole.id}
                                        </p>
                                    </div>
                                    {!selectedRole.isSystem && (
                                        <button 
                                            onClick={(e) => onDeleteRole(selectedRole.id, selectedRole.name, e)}
                                            className="px-3 py-1 bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 rounded text-xs font-bold flex items-center"
                                        >
                                            <Trash2 className="w-3 h-3 mr-1" /> Supprimer
                                        </button>
                                    )}
                                </div>

                                <div className="space-y-8">
                                    {Object.entries(permissionsByCategory).map(([category, perms]) => (
                                        <div key={category}>
                                            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 pl-1">{category}</h4>
                                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                                {(perms as typeof AVAILABLE_PERMISSIONS).map(perm => {
                                                    // SAFE CHECK: Ensure permissions array exists
                                                    const isEnabled = (selectedRole.permissions || []).includes(perm.key);
                                                    const isCritical = selectedRole.id === 'ADMIN' && (
                                                        perm.key === PERMISSION_KEYS.MANAGE_ROLES || 
                                                        perm.key === PERMISSION_KEYS.VIEW_ADMIN_PANEL
                                                    ); 

                                                    return (
                                                        <div 
                                                            key={perm.key} 
                                                            onClick={() => !isCritical && togglePermission(selectedRole, perm.key)}
                                                            className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer select-none transition-all ${
                                                                isEnabled 
                                                                ? 'bg-white border-purple-400 shadow-sm ring-1 ring-purple-100' 
                                                                : 'bg-slate-50 border-slate-200 opacity-80 hover:opacity-100 hover:bg-white'
                                                            } ${isCritical ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                        >
                                                            <div>
                                                                <div className={`text-sm font-bold ${isEnabled ? 'text-slate-800' : 'text-slate-500'}`}>
                                                                    {perm.label}
                                                                </div>
                                                                <div className="text-[10px] text-slate-400 mt-0.5">
                                                                    {perm.description}
                                                                </div>
                                                            </div>
                                                            
                                                            <div className={`ml-4 transition-colors ${isEnabled ? 'text-purple-600' : 'text-slate-300'}`}>
                                                                {isEnabled ? <ToggleRight className="w-8 h-8" /> : <ToggleLeft className="w-8 h-8" />}
                                                            </div>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-4 bg-slate-50 border-b border-slate-200 font-bold text-slate-700 flex items-center">
                    <Database className="w-4 h-4 mr-2" />
                    Maintenance des Données
                </div>
                <div className="p-6">
                    <DataAdministration />
                </div>
            </div>

            {isCreatingRole && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="bg-white p-6 rounded-xl shadow-xl w-80">
                        <h3 className="font-bold text-lg mb-4 text-slate-800">Nouveau Rôle</h3>
                        <input 
                            type="text" 
                            className="w-full border rounded p-2 mb-4 focus:ring-2 focus:ring-purple-500 outline-none"
                            placeholder="Nom du rôle (ex: Physicien)"
                            value={newRoleName}
                            onChange={e => setNewRoleName(e.target.value)}
                            autoFocus
                        />
                        <div className="flex justify-end space-x-2">
                            <button onClick={() => setIsCreatingRole(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded text-sm">Annuler</button>
                            <button onClick={handleCreateRole} className="px-4 py-2 bg-purple-600 text-white rounded text-sm font-bold hover:bg-purple-700">Créer</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminPanel;

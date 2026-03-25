import React, { useEffect, useState } from 'react';
import { supabase } from '../../services/supabaseClient';
import { AppRole, AppPermission } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { Save, Shield, Check, X } from 'lucide-react';
import { Card, CardBody, EmptyState } from '../../src/components/ui';
import { Badge } from '../../src/components/ui/Badge';

const RoleManagement: React.FC = () => {
    const { hasPermission } = useAuth();
    const [roles, setRoles] = useState<AppRole[]>([]);
    const [permissions, setPermissions] = useState<AppPermission[]>([]);
    const [loading, setLoading] = useState(true);
    const [matrix, setMatrix] = useState<Record<string, string[]>>({}); // roleId -> permissionCodes[]

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        const { data: rolesData } = await supabase.from('app_roles').select('*').order('name');
        const { data: permsData } = await supabase.from('app_permissions').select('*').order('code');

        // Fetch matrix
        const { data: matrixData } = await supabase.from('role_permissions').select('role_id, app_permissions(code)');

        setRoles(rolesData || []);
        setPermissions(permsData || []);

        const newMatrix: Record<string, string[]> = {};
        matrixData?.forEach((item: any) => {
            if (!newMatrix[item.role_id]) newMatrix[item.role_id] = [];
            newMatrix[item.role_id].push(item.app_permissions.code);
        });
        setMatrix(newMatrix);
        setLoading(false);
    };

    const togglePermission = async (roleId: string, permCode: string, permId: string) => {
        const currentPerms = matrix[roleId] || [];
        const hasPerm = currentPerms.includes(permCode);

        if (hasPerm) {
            // Remove
            await supabase.from('role_permissions').delete().match({ role_id: roleId, permission_id: permId });
            setMatrix({ ...matrix, [roleId]: currentPerms.filter(p => p !== permCode) });
        } else {
            // Add
            await supabase.from('role_permissions').insert({ role_id: roleId, permission_id: permId });
            setMatrix({ ...matrix, [roleId]: [...currentPerms, permCode] });
        }
    };

    if (!hasPermission('manage_users')) return <div>Accès refusé</div>;
    if (loading) return <div>Chargement...</div>;

    return (
        <div className="p-6">
            <h1 className="text-2xl font-extrabold text-text-base tracking-tight mb-6 flex items-center gap-2">
                <Shield className="w-6 h-6 text-primary" /> Gestion des Rôles
            </h1>

            <Card>
                <CardBody className="overflow-x-auto">
                    {/* Desktop table */}
                    <div className="hidden md:block overflow-x-auto rounded-card border border-border/40">
                        {permissions.length === 0 ? (
                            <EmptyState
                                icon={Shield}
                                title="Aucune permission"
                                description="Aucune permission n'a été définie pour cette application."
                            />
                        ) : (
                            <table className="min-w-full border-collapse">
                                <thead>
                                    <tr className="sticky top-0 z-table-header bg-[#0F172A]">
                                        <th className="px-4 py-3 text-left text-[11px] font-semibold text-white/60 uppercase tracking-widest">
                                            Permission
                                        </th>
                                        {roles.map(role => (
                                            <th key={role.id} className="px-4 py-3 text-center text-[11px] font-semibold text-white/60 uppercase tracking-widest min-w-[100px]">
                                                <div className="font-bold text-white">{role.name}</div>
                                                <div className="text-[10px] text-white/40 font-normal normal-case tracking-normal">{role.description}</div>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {permissions.map(perm => (
                                        <tr key={perm.id} className="border-b border-border/50 hover:bg-primary/5 transition-colors">
                                            <td className="px-3 py-2">
                                                <div className="font-medium text-sm text-text-base">{perm.code}</div>
                                                <div className="text-[11px] text-text-muted">{perm.description}</div>
                                            </td>
                                            {roles.map(role => {
                                                const hasPerm = (matrix[role.id] || []).includes(perm.code);
                                                return (
                                                    <td key={`${role.id}-${perm.id}`} className="px-3 py-2 text-center">
                                                        <button
                                                            onClick={() => togglePermission(role.id, perm.code, perm.id)}
                                                            disabled={role.name === 'Admin'} // Admin has all by default usually
                                                            className={`p-2 rounded-full transition-colors ${hasPerm ? 'bg-success/10 text-success' : 'bg-muted text-text-muted'
                                                                }`}
                                                        >
                                                            {hasPerm ? <Check className="w-5 h-5" /> : <X className="w-5 h-5" />}
                                                        </button>
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>

                    {/* Mobile cards */}
                    <div className="md:hidden space-y-2 p-3">
                        {permissions.length === 0 ? (
                            <EmptyState
                                icon={Shield}
                                title="Aucune permission"
                                description="Aucune permission n'a été définie pour cette application."
                            />
                        ) : (
                            permissions.map(perm => (
                                <Card key={perm.id}>
                                    <div className="p-3">
                                        <p className="font-medium text-sm text-text-base">{perm.code}</p>
                                        <p className="text-[11px] text-text-muted mb-2">{perm.description}</p>
                                        <div className="flex flex-wrap gap-2">
                                            {roles.map(role => {
                                                const hasPerm = (matrix[role.id] || []).includes(perm.code);
                                                return (
                                                    <button
                                                        key={role.id}
                                                        onClick={() => togglePermission(role.id, perm.code, perm.id)}
                                                        disabled={role.name === 'Admin'}
                                                        className={`flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium transition-colors ${hasPerm ? 'bg-success/10 text-success-text' : 'bg-muted text-text-muted'}`}
                                                    >
                                                        {hasPerm ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                                                        {role.name}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </Card>
                            ))
                        )}
                    </div>
                </CardBody>
            </Card>
        </div>
    );
};

export default RoleManagement;


import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { doctorService } from '../services/api/doctorService';
import { db } from '../services/api/index';
import { Activity, ShieldCheck, User, Loader2, AlertTriangle, LogIn, Lock, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Doctor, RoleDefinition } from '../types';

const Login: React.FC = () => {
    const { login, isLoading, user } = useAuth();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    
    const [doctors, setDoctors] = useState<Doctor[]>([]);
    const [roles, setRoles] = useState<RoleDefinition[]>([]);
    const [loadingData, setLoadingData] = useState(true);
    
    const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null);

    const navigate = useNavigate();

    useEffect(() => {
        if (user) {
            navigate('/');
        }
    }, [user, navigate]);

    const loadData = async () => {
        setLoadingData(true);
        try {
            // Force fetch fresh data
            const [docs, rls] = await Promise.all([
                doctorService.getAllDoctors(),
                db.collection('ROLES').get([])
            ]);
            setDoctors(docs);
            setRoles(rls);
        } catch (e) {
            console.error("Failed to load data", e);
        } finally {
            setLoadingData(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const handleManualLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        try {
            await login(email, password);
            navigate('/');
        } catch (err: any) {
            setError(err.message || "Erreur de connexion");
        }
    };

    const handleProfileClick = (doc: Doctor) => {
        setSelectedDoctor(doc);
        setEmail(doc.email);
        setPassword("");
        setError("");
    }

    const handleProfileLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        if (!selectedDoctor) return;
        
        try {
            await login(selectedDoctor.email, password);
            navigate('/');
        } catch (err: any) {
            setError(err.message || "Mot de passe incorrect");
        }
    };

    const getRoleName = (roleId: string) => {
        if (roleId === 'ADMIN') return 'Administrateur';
        const role = roles.find(r => r.id === roleId);
        return role ? role.name : 'Utilisateur';
    };

    return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col md:flex-row min-h-[500px]">
                
                <div className="w-full md:w-5/12 bg-gradient-to-br from-blue-700 to-slate-900 p-8 text-white flex flex-col justify-between relative overflow-hidden">
                    <div className="relative z-10">
                        <div className="bg-white/20 w-12 h-12 rounded-xl flex items-center justify-center mb-6 backdrop-blur-sm shadow-inner border border-white/10">
                            <Activity className="w-6 h-6 text-white" />
                        </div>
                        <h1 className="text-3xl font-bold tracking-tight">RadioPlan AI</h1>
                        <p className="text-blue-200 mt-2 text-sm opacity-90">Orchestration intelligente des ressources en radiothérapie.</p>
                    </div>

                    <div className="relative z-10 mt-8 md:mt-0">
                        <form onSubmit={handleManualLogin} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-blue-200 uppercase tracking-wider mb-2">Connexion Manuelle</label>
                                <input 
                                    type="text" 
                                    required
                                    className="w-full px-4 py-2 bg-slate-800/50 border border-slate-600 rounded-lg text-sm text-white placeholder-slate-400 focus:ring-2 focus:ring-blue-400 outline-none transition-all mb-3"
                                    placeholder="Email ou Identifiant..."
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                />
                                <input 
                                    type="password" 
                                    required
                                    className="w-full px-4 py-2 bg-slate-800/50 border border-slate-600 rounded-lg text-sm text-white placeholder-slate-400 focus:ring-2 focus:ring-blue-400 outline-none transition-all"
                                    placeholder="Mot de passe..."
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                />
                            </div>
                            {error && !selectedDoctor && (
                                <div className="bg-red-500/20 border border-red-500/50 text-red-200 text-xs p-2 rounded flex items-center">
                                    <AlertTriangle className="w-3 h-3 mr-1" /> {error}
                                </div>
                            )}
                            <button 
                                type="submit" 
                                disabled={isLoading}
                                className="w-full bg-blue-500 hover:bg-blue-400 text-white py-2 rounded-lg text-sm font-bold transition-colors flex items-center justify-center shadow-lg"
                            >
                                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Se connecter"}
                            </button>
                        </form>
                    </div>

                    <div className="absolute top-[-50px] right-[-50px] w-40 h-40 bg-blue-500 rounded-full blur-3xl opacity-20"></div>
                    <div className="absolute bottom-[-20px] left-[-20px] w-32 h-32 bg-purple-500 rounded-full blur-3xl opacity-20"></div>
                </div>

                <div className="w-full md:w-7/12 bg-slate-50 p-8 flex flex-col relative">
                    
                    {selectedDoctor && (
                        <div className="absolute inset-0 z-20 bg-white/90 backdrop-blur-sm flex items-center justify-center p-8 animate-in fade-in duration-200">
                             <div className="w-full max-w-sm bg-white shadow-2xl rounded-2xl p-6 border border-slate-200">
                                 <div className="text-center mb-6">
                                     <div className={`w-16 h-16 rounded-full mx-auto flex items-center justify-center text-xl font-bold shadow-md mb-3 ${selectedDoctor.color}`}>
                                         {selectedDoctor.name.substring(0,2)}
                                     </div>
                                     <h3 className="text-lg font-bold text-slate-800">{selectedDoctor.name}</h3>
                                     <p className="text-sm text-purple-600 font-medium">{getRoleName(selectedDoctor.role)}</p>
                                 </div>

                                 <form onSubmit={handleProfileLogin} className="space-y-4">
                                     <div>
                                         <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Mot de passe</label>
                                         <div className="relative">
                                             <Lock className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                                             <input 
                                                type="password"
                                                autoFocus
                                                required
                                                className="w-full pl-10 pr-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 outline-none transition-all"
                                                placeholder="Entrez votre mot de passe..."
                                                value={password}
                                                onChange={e => setPassword(e.target.value)}
                                             />
                                         </div>
                                     </div>
                                     
                                     {error && (
                                        <div className="text-red-500 text-xs text-center font-medium bg-red-50 p-2 rounded">
                                            {error}
                                        </div>
                                     )}

                                     <div className="flex gap-2">
                                         <button 
                                            type="button" 
                                            onClick={() => setSelectedDoctor(null)}
                                            className="flex-1 py-2 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 text-sm font-bold"
                                         >
                                             Retour
                                         </button>
                                         <button 
                                            type="submit"
                                            disabled={isLoading}
                                            className="flex-1 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-bold flex justify-center"
                                         >
                                             {isLoading ? <Loader2 className="w-4 h-4 animate-spin"/> : 'Valider'}
                                         </button>
                                     </div>
                                 </form>
                             </div>
                        </div>
                    )}


                    <div className="flex justify-between items-center mb-6">
                        <div>
                             <h2 className="text-lg font-bold text-slate-800 mb-1">Qui êtes-vous ?</h2>
                             <p className="text-sm text-slate-500">Sélectionnez votre profil.</p>
                        </div>
                        <button 
                            onClick={loadData}
                            disabled={loadingData}
                            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors"
                            title="Rafraîchir la liste"
                        >
                            <RefreshCw className={`w-4 h-4 ${loadingData ? 'animate-spin' : ''}`} />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                        {loadingData ? (
                            <div className="flex justify-center py-10">
                                <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {doctors.map(doc => (
                                    <button 
                                        key={doc.id}
                                        onClick={() => handleProfileClick(doc)}
                                        className="flex items-center p-3 bg-white border border-slate-200 hover:border-blue-400 hover:shadow-md rounded-xl transition-all group text-left"
                                    >
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold mr-3 ${doc.color} shadow-sm group-hover:scale-105 transition-transform`}>
                                            {doc.name.substring(0,2)}
                                        </div>
                                        <div className="min-w-0">
                                            <div className="font-bold text-slate-700 text-sm truncate group-hover:text-blue-700">{doc.name}</div>
                                            <div className="text-xs text-slate-400 truncate font-medium">
                                                {getRoleName(doc.role)}
                                            </div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                        
                        {!loadingData && doctors.length === 0 && (
                            <div className="text-center py-10 text-slate-400 text-sm border-2 border-dashed border-slate-200 rounded-xl">
                                <p className="mb-2">Aucun profil configuré.</p>
                                <p className="text-xs">Connectez-vous avec le compte admin par défaut :</p>
                                <code className="block mt-2 bg-slate-100 p-2 rounded text-xs text-slate-600 font-mono">
                                    admin@system.com<br/>
                                    admin123
                                </code>
                            </div>
                        )}
                    </div>

                    <div className="mt-6 pt-4 border-t border-slate-100 text-center">
                        <p className="text-xs text-slate-400">© 2024 RadioPlan AI</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Login;

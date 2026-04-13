import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import { Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import { Button } from '../src/components/ui';

const ResetPassword: React.FC = () => {
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [ready, setReady] = useState(false);
    const navigate = useNavigate();

    // La session de recovery est établie par AuthContext (event PASSWORD_RECOVERY)
    // On vérifie qu'une session active existe, ET on s'abonne aux changements
    // d'état auth pour capturer la session si elle arrive de façon asynchrone
    // (cas où le composant monte avant que Supabase ait fini d'établir la session).
    useEffect(() => {
        // Vérification immédiate
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) setReady(true);
        });

        // Listener asynchrone : capture PASSWORD_RECOVERY ou SIGNED_IN tardifs
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if ((event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') && session) {
                setReady(true);
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (password !== confirm) {
            setError('Les mots de passe ne correspondent pas.');
            return;
        }
        if (password.length < 6) {
            setError('Le mot de passe doit contenir au moins 6 caractères.');
            return;
        }
        setLoading(true);
        setError(null);

        const { error } = await supabase.auth.updateUser({ password });
        if (error) {
            setError(error.message);
        } else {
            setSuccess(true);
            setTimeout(() => navigate('/login'), 3000);
        }
        setLoading(false);
    };

    return (
        <div
            className="min-h-dvh bg-app-bg flex items-center justify-center p-4"
            style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
            <div className="w-full max-w-[420px] bg-surface rounded-card shadow-modal border border-border/40 overflow-hidden">
                <div className="h-1.5 w-full bg-gradient-primary" aria-hidden="true" />

                <div className="px-8 pt-7 pb-8">
                    <div className="mb-8">
                        <h1 className="text-2xl font-extrabold text-gradient-primary tracking-tight">RadioPlan AI</h1>
                        <p className="text-sm text-text-muted mt-1">Nouveau mot de passe</p>
                    </div>

                    {success ? (
                        <div className="space-y-4 text-center">
                            <div className="flex justify-center">
                                <CheckCircle2 className="w-12 h-12 text-success" />
                            </div>
                            <p className="text-sm font-medium text-text-base">
                                Mot de passe mis à jour avec succès !
                            </p>
                            <p className="text-xs text-text-muted">Redirection vers la connexion…</p>
                        </div>
                    ) : !ready ? (
                        <div className="text-center space-y-3">
                            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
                            <p className="text-sm text-text-muted">Vérification du lien…</p>
                            <p className="text-xs text-text-muted/70 mt-2">
                                Si ce message persiste, le lien a peut-être expiré.
                            </p>
                            <button
                                onClick={() => navigate('/login')}
                                className="text-xs text-primary hover:underline"
                            >
                                ← Retour à la connexion
                            </button>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="float-label-wrapper">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    id="new-password"
                                    placeholder=" "
                                    className="float-label-input pr-12"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    autoComplete="new-password"
                                    required
                                />
                                <label htmlFor="new-password" className="float-label-text">Nouveau mot de passe</label>
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(v => !v)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-text-muted hover:text-text-base transition-colors"
                                    aria-label={showPassword ? 'Masquer' : 'Afficher'}
                                >
                                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>

                            <div className="float-label-wrapper">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    id="confirm-password"
                                    placeholder=" "
                                    className="float-label-input"
                                    value={confirm}
                                    onChange={e => setConfirm(e.target.value)}
                                    autoComplete="new-password"
                                    required
                                />
                                <label htmlFor="confirm-password" className="float-label-text">Confirmer le mot de passe</label>
                            </div>

                            {error && (
                                <div className="px-4 py-3 rounded-btn-sm bg-danger/5 border border-danger/20 text-sm text-danger font-medium" role="alert">
                                    {error}
                                </div>
                            )}

                            <Button variant="primary" size="lg" loading={loading} className="w-full" type="submit">
                                Enregistrer le nouveau mot de passe
                            </Button>

                            <button
                                type="button"
                                onClick={() => navigate('/login')}
                                className="w-full text-xs text-text-muted hover:text-text-base text-center transition-colors"
                            >
                                ← Retour à la connexion
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ResetPassword;

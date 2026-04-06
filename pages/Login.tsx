import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '../src/components/ui';
import { supabase } from '../services/supabaseClient';

const Login: React.FC = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showPassword, setShowPassword] = useState(false);
    const [resetMode, setResetMode] = useState(false);
    const [resetSent, setResetSent] = useState(false);
    const [resetLoading, setResetLoading] = useState(false);
    const navigate = useNavigate();
    const { signInWithPassword } = useAuth();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const { error } = await signInWithPassword(email, password);

            if (error) throw error;
            navigate('/');
        } catch (err: any) {
            setError(err.message || 'Une erreur est survenue lors de la connexion');
        } finally {
            setLoading(false);
        }
    };

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setResetLoading(true);
        setError(null);
        try {
            // Vérifier que l'email correspond à un compte existant avant d'envoyer
            const { data: profile, error: profileError } = await supabase
                .from('profiles')
                .select('id')
                .eq('email', email.toLowerCase().trim())
                .maybeSingle();

            if (profileError) throw profileError;

            if (!profile) {
                setError('Aucun compte RadioPlan n\'est associé à cette adresse e-mail.');
                return;
            }

            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: 'https://samifrikha.github.io/radioplan/#/reset-password',
            });
            if (error) throw error;
            setResetSent(true);
        } catch (err: any) {
            setError(err.message || 'Erreur lors de l\'envoi du lien de réinitialisation');
        } finally {
            setResetLoading(false);
        }
    };

    return (
        <div
            className="min-h-dvh bg-app-bg flex items-center justify-center p-4"
            style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
            <div className="w-full max-w-[420px] bg-surface rounded-card shadow-modal border border-border/40 overflow-hidden">
                {/* Brand gradient stripe */}
                <div className="h-1.5 w-full bg-gradient-primary" aria-hidden="true" />

                {/* Card content */}
                <div className="px-8 pt-7 pb-8">
                    {/* Logo / brand area */}
                    <div className="mb-8">
                        <h1 className="text-2xl font-extrabold text-gradient-primary tracking-tight">RadioPlan AI</h1>
                        <p className="text-sm text-text-muted mt-1">Planification oncologie — Connexion</p>
                    </div>

                    {/* Reset password form */}
                    {resetMode ? (
                        <div>
                            {resetSent ? (
                                <div className="space-y-4">
                                    <div className="px-4 py-3 rounded-btn-sm bg-success/10 border border-success/20 text-sm text-success font-medium text-center">
                                        ✉️ Lien de réinitialisation envoyé ! Vérifiez votre boîte mail.
                                    </div>
                                    <button
                                        onClick={() => { setResetMode(false); setResetSent(false); setError(null); }}
                                        className="w-full text-sm text-primary hover:underline text-center mt-2"
                                    >
                                        ← Retour à la connexion
                                    </button>
                                </div>
                            ) : (
                                <form onSubmit={handleResetPassword} className="space-y-4">
                                    <p className="text-sm text-text-muted">Entrez votre adresse e-mail. Vous recevrez un lien pour réinitialiser votre mot de passe.</p>
                                    <div className="float-label-wrapper">
                                        <input
                                            type="email"
                                            id="reset-email"
                                            placeholder=" "
                                            className="float-label-input"
                                            value={email}
                                            onChange={e => setEmail(e.target.value)}
                                            autoComplete="email"
                                            required
                                        />
                                        <label htmlFor="reset-email" className="float-label-text">Adresse e-mail</label>
                                    </div>
                                    {error && (
                                        <div className="px-4 py-3 rounded-btn-sm bg-danger/5 border border-danger/20 text-sm text-danger font-medium" role="alert">
                                            {error}
                                        </div>
                                    )}
                                    <Button variant="primary" size="lg" loading={resetLoading} className="w-full" type="submit">
                                        Envoyer le lien
                                    </Button>
                                    <button
                                        type="button"
                                        onClick={() => { setResetMode(false); setError(null); }}
                                        className="w-full text-sm text-text-muted hover:text-text-base text-center"
                                    >
                                        ← Retour à la connexion
                                    </button>
                                </form>
                            )}
                        </div>
                    ) : (
                    /* Login form */
                    <form onSubmit={handleLogin}>
                        <div className="space-y-4">
                            {/* Email — floating label */}
                            <div className="float-label-wrapper">
                                <input
                                    type="email"
                                    id="email"
                                    placeholder=" "
                                    className="float-label-input"
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    autoComplete="email"
                                    required
                                />
                                <label htmlFor="email" className="float-label-text">Adresse e-mail</label>
                            </div>

                            {/* Password — floating label with toggle */}
                            <div className="float-label-wrapper">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    id="password"
                                    placeholder=" "
                                    className="float-label-input pr-12"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    autoComplete="current-password"
                                    required
                                />
                                <label htmlFor="password" className="float-label-text">Mot de passe</label>
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-text-muted hover:text-text-base transition-colors"
                                    aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                                >
                                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>

                        {/* Error alert */}
                        {error && (
                            <div
                                className="mt-4 px-4 py-3 rounded-btn-sm bg-danger/5 border border-danger/20 text-sm text-danger font-medium"
                                role="alert"
                            >
                                {error}
                            </div>
                        )}

                        {/* Submit */}
                        <Button variant="primary" size="lg" loading={loading} className="w-full mt-6" type="submit">
                            Se connecter
                        </Button>

                        {/* Forgot password */}
                        <div className="text-center mt-3">
                            <button
                                type="button"
                                onClick={() => { setResetMode(true); setError(null); }}
                                className="text-xs text-text-muted hover:text-primary transition-colors"
                            >
                                Mot de passe oublié ?
                            </button>
                        </div>

                        {/* Footer note */}
                        <p className="text-center text-xs text-text-muted mt-4">
                            Accès réservé au personnel autorisé
                        </p>
                    </form>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Login;

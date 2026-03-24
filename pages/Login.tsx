import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '../src/components/ui';

const Login: React.FC = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showPassword, setShowPassword] = useState(false);
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

                    {/* Form */}
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

                        {/* Footer note */}
                        <p className="text-center text-xs text-text-muted mt-6">
                            Accès réservé au personnel autorisé
                        </p>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default Login;

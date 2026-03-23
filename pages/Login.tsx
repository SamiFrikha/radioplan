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
        <div className="min-h-dvh bg-app-bg flex items-center justify-center p-4"
             style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
            <div className="bg-surface border border-border rounded-card shadow-modal w-full max-w-[440px] p-8">
                {/* Logo */}
                <div className="text-center mb-8">
                    <h1 className="font-heading font-bold text-2xl text-primary">RadioPlan AI</h1>
                    <p className="text-sm text-text-muted mt-1">Oncologie &amp; Radiothérapie</p>
                </div>

                {/* Form — keep existing submit handler and state */}
                <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                        <label htmlFor="email" className="block text-label font-medium text-text-base mb-1.5">
                            Adresse email <span aria-hidden="true" className="text-accent-red">*</span>
                        </label>
                        <input
                            id="email"
                            type="email"
                            autoComplete="email"
                            required
                            aria-required="true"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            className="w-full h-12 md:h-10 px-3 border border-border rounded-btn text-sm bg-surface focus:border-primary focus:shadow-[0_0_0_3px_rgba(37,99,235,0.15)] focus:outline-none transition-shadow duration-150"
                            placeholder="prenom.nom@hopital.fr"
                        />
                    </div>

                    <div>
                        <label htmlFor="password" className="block text-label font-medium text-text-base mb-1.5">
                            Mot de passe <span aria-hidden="true" className="text-accent-red">*</span>
                        </label>
                        <div className="relative">
                            <input
                                id="password"
                                type={showPassword ? 'text' : 'password'}
                                autoComplete="current-password"
                                required
                                aria-required="true"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                className="w-full h-12 md:h-10 px-3 pr-10 border border-border rounded-btn text-sm bg-surface focus:border-primary focus:shadow-[0_0_0_3px_rgba(37,99,235,0.15)] focus:outline-none transition-shadow duration-150"
                            />
                            <button
                                type="button"
                                aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                                onClick={() => setShowPassword(v => !v)}
                                className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-text-muted hover:text-text-base transition-colors"
                            >
                                {showPassword ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
                            </button>
                        </div>
                    </div>

                    {error && (
                        <div role="alert" aria-live="polite" className="text-sm text-accent-red bg-[#FEF2F2] border border-[#FECACA] rounded-btn px-3 py-2">
                            {error}
                        </div>
                    )}

                    <Button type="submit" variant="primary" loading={loading} className="w-full mt-2">
                        Se connecter
                    </Button>
                </form>
            </div>
        </div>
    );
};

export default Login;

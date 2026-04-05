import React, { useState, useEffect } from 'react';
import { Smartphone, CheckCircle2, ArrowRight } from 'lucide-react';
import { triggerInstallPrompt, isInstallAvailable } from '../services/installService';

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent.toLowerCase());
const isAndroid = () => /android/i.test(navigator.userAgent.toLowerCase());
const isInStandaloneMode = () =>
  ('standalone' in window.navigator && (window.navigator as any).standalone) ||
  window.matchMedia('(display-mode: standalone)').matches;

const Install: React.FC = () => {
  const [installAvailable, setInstallAvailable] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [installing, setInstalling] = useState(false);
  const ios = isIOS();
  const android = isAndroid();

  useEffect(() => {
    if (isInStandaloneMode()) {
      setInstalled(true);
      return;
    }
    setInstallAvailable(isInstallAvailable());

    const handler = () => setInstallAvailable(isInstallAvailable());
    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', () => setInstalled(true));
    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  const handleInstall = async () => {
    setInstalling(true);
    const accepted = await triggerInstallPrompt();
    if (accepted) setInstalled(true);
    setInstalling(false);
    setInstallAvailable(isInstallAvailable());
  };

  if (installed) {
    return (
      <div className="min-h-dvh bg-[#0F172A] flex flex-col items-center justify-center p-6 text-center gap-6">
        <div className="p-5 bg-success/20 rounded-full">
          <CheckCircle2 className="w-12 h-12 text-success" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Application installée !</h1>
          <p className="text-white/60 mt-2 text-sm">RadioPlan AI est disponible sur votre écran d'accueil.</p>
        </div>
        <a
          href={`${window.location.origin}${import.meta.env.BASE_URL}`}
          className="flex items-center gap-2 bg-primary text-white px-6 py-3 rounded-xl font-bold text-sm hover:bg-primary/90 transition-colors"
        >
          Ouvrir RadioPlan AI <ArrowRight size={16} />
        </a>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[#0F172A] flex flex-col items-center justify-center p-6 gap-8 max-w-sm mx-auto">

      {/* Logo / titre */}
      <div className="text-center">
        <div className="w-20 h-20 bg-primary/20 rounded-3xl flex items-center justify-center mx-auto mb-4 border border-primary/30">
          <Smartphone className="w-10 h-10 text-primary" />
        </div>
        <h1 className="text-2xl font-bold text-white">RadioPlan AI</h1>
        <p className="text-white/60 mt-1 text-sm">Installer l'application sur votre appareil</p>
      </div>

      {/* Android — bouton install direct */}
      {(android || installAvailable) && !ios && (
        <div className="w-full flex flex-col items-center gap-3">
          <button
            onClick={handleInstall}
            disabled={!installAvailable || installing}
            className="w-full flex items-center justify-center gap-3 bg-primary text-white py-4 rounded-2xl font-bold text-lg hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-primary/30"
          >
            <Smartphone size={22} />
            {installing ? 'Installation...' : 'Installer l\'application'}
          </button>
          {!installAvailable && (
            <p className="text-white/40 text-xs text-center">
              L'application est déjà installée ou la bannière du navigateur n'est pas encore prête.
              Essayez via le menu ⋮ → "Installer l'application".
            </p>
          )}
        </div>
      )}

      {/* iOS — instructions étape par étape */}
      {ios && (
        <div className="w-full bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
          <p className="text-white font-semibold text-center text-sm">Installez avec Safari en 3 étapes :</p>
          <div className="space-y-3">
            {[
              { step: '1', icon: '🌐', text: 'Assurez-vous d\'être dans Safari (pas Chrome)' },
              { step: '2', icon: '⬆️', text: 'Appuyez sur le bouton Partager en bas de l\'écran' },
              { step: '3', icon: '📲', text: 'Choisissez "Sur l\'écran d\'accueil" puis "Ajouter"' },
            ].map(({ step, icon, text }) => (
              <div key={step} className="flex items-start gap-3">
                <span className="w-6 h-6 bg-primary rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 mt-0.5">{step}</span>
                <p className="text-white/70 text-sm leading-snug"><span className="mr-1">{icon}</span>{text}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Appareil non mobile ou non identifié — instructions génériques */}
      {!ios && !android && !installAvailable && (
        <div className="w-full bg-white/5 border border-white/10 rounded-2xl p-5 space-y-3 text-center">
          <p className="text-white/60 text-sm">
            Sur <strong className="text-white">Android</strong> : ouvrez ce lien dans Chrome, le navigateur proposera l'installation automatiquement.
          </p>
          <p className="text-white/60 text-sm">
            Sur <strong className="text-white">iPhone</strong> : ouvrez dans Safari → Partager → "Sur l'écran d'accueil".
          </p>
        </div>
      )}

      {/* URL copiable */}
      <p className="text-white/20 text-xs font-mono text-center break-all">{`${window.location.origin}${import.meta.env.BASE_URL}`}</p>
    </div>
  );
};

export default Install;

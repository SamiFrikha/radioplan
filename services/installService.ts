// installService.ts — PWA install prompt management
// Set up early in index.tsx; used by DataAdministration and any other component

let _deferredPrompt: any = null;
let _promptReady = false;

export const setupInstallListener = () => {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    _deferredPrompt = e;
    _promptReady = true;

    // Auto-trigger if URL contains ?install=true (QR code scan from admin)
    if (window.location.search.includes('install=true') || window.location.href.includes('install=true')) {
      (e as any).prompt();
    }
  });
};

export const triggerInstallPrompt = async (): Promise<boolean> => {
  if (!_deferredPrompt) return false;
  try {
    _deferredPrompt.prompt();
    const { outcome } = await _deferredPrompt.userChoice;
    _deferredPrompt = null;
    _promptReady = false;
    return outcome === 'accepted';
  } catch {
    return false;
  }
};

export const isInstallAvailable = (): boolean => _promptReady && !!_deferredPrompt;

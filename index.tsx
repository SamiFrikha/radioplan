import './src/index.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AuthProvider } from './context/AuthContext';

// Capture beforeinstallprompt early so it can be triggered later (e.g. from QR code scan with ?install=true)
let deferredInstallPrompt: any = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  // If the page was opened with ?install=true (e.g. from QR code), trigger immediately
  if (window.location.search.includes('install=true') || window.location.href.includes('install=true')) {
    (e as any).prompt();
  }
});
export const triggerInstallPrompt = () => {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    deferredInstallPrompt = null;
  }
};

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Could not find root element to mount to');
}

// Register service worker using the Vite base URL so it works on any deploy path
if ('serviceWorker' in navigator) {
  const swUrl = `${import.meta.env.BASE_URL}sw.js`;
  navigator.serviceWorker.register(swUrl)
    .then(registration => {
      // Throttle SW update checks to at most once per hour
      // Calling update() on every load wastes bandwidth on mobile
      const SW_UPDATE_KEY = 'sw_last_update_check';
      const lastCheck = parseInt(localStorage.getItem(SW_UPDATE_KEY) || '0', 10);
      if (Date.now() - lastCheck > 60 * 60 * 1000) {
        localStorage.setItem(SW_UPDATE_KEY, String(Date.now()));
        registration.update().catch(() => {/* network unavailable, skip update check */});
      }

      // Notify active SW when a new one is waiting (enables seamless updates)
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // New SW installed — activate it immediately
            newWorker.postMessage('SKIP_WAITING');
          }
        });
      });
    })
    .catch(err => console.error('[SW] Registration failed:', err));

  // Reload when an updated SW takes over — but NOT on first-ever install
  // (controllerchange also fires on first install via clients.claim(), which would
  // cause an unnecessary reload that can interfere with Chrome's PWA install check)
  const hadController = !!navigator.serviceWorker.controller;
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController && !refreshing) {
      refreshing = true;
      window.location.reload();
    }
  });
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>
);

import './src/index.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AuthProvider } from './context/AuthContext';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Could not find root element to mount to');
}

// Register service worker using the Vite base URL so it works on any deploy path
if ('serviceWorker' in navigator) {
  const swUrl = `${import.meta.env.BASE_URL}sw.js`;
  navigator.serviceWorker.register(swUrl)
    .then(registration => {
      // Check for SW updates each time the app loads
      registration.update().catch(() => {/* network unavailable, skip update check */});

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

  // Reload the page when the SW controller changes (new SW took over)
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) {
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

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Force page reload when a new service worker takes control.
// Without this, users see the old cached app even after a new deploy.
if ('serviceWorker' in navigator) {
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) { refreshing = true; window.location.reload(); }
  });
  // Check for SW updates every 10 min — 60s was freezing the tab on slow networks.
  navigator.serviceWorker.ready.then(reg => {
    setInterval(() => {
      reg.update().catch(() => { /* ignore update errors silently */ });
    }, 10 * 60_000);
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
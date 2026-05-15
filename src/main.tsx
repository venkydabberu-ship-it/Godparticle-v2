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
  // Also check for SW updates every 60 s so long-running sessions pick up new code.
  navigator.serviceWorker.ready.then(reg => {
    setInterval(() => reg.update(), 60_000);
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
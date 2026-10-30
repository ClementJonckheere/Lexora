import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import './ui/styles/global.css';
import { applyInitialTheme } from './ui/theme';
import { assetUrl, isTauri } from './core/platform/env';

applyInitialTheme();

// Version web publiée (téléphone, ordinateur) : fonctionnement hors ligne et stockage protégé du nettoyage automatique.
if (import.meta.env.PROD && !isTauri() && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.register(assetUrl('sw.js')).catch(() => undefined);
  // À la première visite, les fichiers de l'application sont chargés avant que le service worker ne prenne la main :
  // on les met en cache tout de suite pour que la version hors ligne fonctionne dès la visite suivante.
  void navigator.serviceWorker.ready
    .then(async () => {
      const prefix = new URL(assetUrl('assets/'), location.href).href;
      const loaded = performance.getEntriesByType('resource').map((e) => e.name).filter((u) => u.startsWith(prefix));
      const cache = await caches.open('lexora-v1');
      await cache.addAll([...new Set(loaded)]);
    })
    .catch(() => undefined);
  void navigator.storage?.persist?.().catch(() => undefined);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

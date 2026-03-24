'use client';

import { useEffect } from 'react';

export function PWARegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;

    const register = async () => {
      try {
        await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      } catch (e) {
        // Intentionally swallow: PWA is an enhancement and should never break the app.
        console.warn('[PWA] Service worker registration failed', e);
      }
    };

    register();
  }, []);

  return null;
}


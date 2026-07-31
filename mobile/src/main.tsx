import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { configureApiRuntime } from '@/features/shared/http/api-runtime';
import { App } from './App';
import { getSessionToken } from './auth/session-state';
import { apiOrigin } from './config';
import { configureNativeShell } from './native';
import { adoptNativeDeviceId } from './native-device-id';
import './app.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Missing #root element');
}

// The shared app assumes it is same-origin and cookie-authenticated. Point it
// at the API host and the Keychain session before any of it renders.
configureApiRuntime({ origin: apiOrigin, readSessionToken: getSessionToken });

void configureNativeShell();

// The device id has to be reconciled with the Keychain before the shared code
// reads it, so the first render waits for it either way.
void adoptNativeDeviceId().finally(() => {
  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});

'use client';

import { useSyncExternalStore } from 'react';

type TiltSupport = 'granted' | 'needs-permission' | 'denied' | 'unsupported' | 'insecure';

type TiltSnapshot = {
  tilt: number | null;
  support: TiltSupport;
};

type OrientationConstructor = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<'granted' | 'denied'>;
};

const SERVER_SNAPSHOT: TiltSnapshot = { tilt: null, support: 'unsupported' };
const CALIBRATION_SAMPLES = 5;
const MAX_TILT_DEGREES = 30;

let snapshot: TiltSnapshot = SERVER_SNAPSHOT;
let sessionPermission: 'unknown' | 'granted' | 'denied' = 'unknown';
let listening = false;
let baselineReference: number | null = null;
let baselineTotal = 0;
let baselineCount = 0;
let baseline: number | null = null;
const subscribers = new Set<() => void>();

function publish(next: TiltSnapshot): void {
  if (snapshot.support === next.support && snapshot.tilt === next.tilt) return;
  snapshot = next;
  subscribers.forEach((subscriber) => subscriber());
}

function orientationAngle(): number {
  if (typeof window === 'undefined') return 0;
  const screenAngle = window.screen.orientation?.angle;
  const legacyAngle = (window as Window & { orientation?: number }).orientation;
  const raw = typeof screenAngle === 'number' ? screenAngle : legacyAngle ?? 0;
  return ((Math.round(raw / 90) * 90) % 360 + 360) % 360;
}

function axisForScreen(
  event: Pick<DeviceOrientationEvent, 'beta' | 'gamma'>,
): number | null {
  const angle = orientationAngle();
  if (angle === 90) return event.beta;
  if (angle === 180) return event.gamma === null ? null : -event.gamma;
  if (angle === 270) return event.beta === null ? null : -event.beta;
  return event.gamma;
}

function shortestAngularDelta(value: number, origin: number): number {
  return ((value - origin + 540) % 360) - 180;
}

function resetCalibration(): void {
  baselineReference = null;
  baselineTotal = 0;
  baselineCount = 0;
  baseline = null;
  publish({ ...snapshot, tilt: null });
}

function handleOrientation(event: DeviceOrientationEvent): void {
  const rawAxis = axisForScreen(event);
  if (rawAxis === null || !Number.isFinite(rawAxis)) return;

  if (baseline === null) {
    baselineReference ??= rawAxis;
    baselineTotal += baselineReference + shortestAngularDelta(rawAxis, baselineReference);
    baselineCount += 1;
    if (baselineCount < CALIBRATION_SAMPLES) return;
    baseline = baselineTotal / baselineCount;
    publish({ support: 'granted', tilt: 0 });
    return;
  }

  const normalized = Math.max(
    -1,
    Math.min(1, shortestAngularDelta(rawAxis, baseline) / MAX_TILT_DEGREES),
  );
  const tilt = Math.abs(normalized) < 0.005 ? 0 : normalized;
  publish({ support: 'granted', tilt });
}

function detachListeners(): void {
  if (!listening || typeof window === 'undefined') return;
  window.removeEventListener('deviceorientation', handleOrientation);
  window.removeEventListener('orientationchange', resetCalibration);
  window.screen.orientation?.removeEventListener?.('change', resetCalibration);
  listening = false;
}

function attachListeners(): void {
  if (listening || typeof window === 'undefined') return;
  window.addEventListener('deviceorientation', handleOrientation, { passive: true });
  window.addEventListener('orientationchange', resetCalibration, { passive: true });
  window.screen.orientation?.addEventListener?.('change', resetCalibration);
  listening = true;
  resetCalibration();
}

function detectSupport(): void {
  if (typeof window === 'undefined') {
    publish({ tilt: null, support: 'unsupported' });
    return;
  }

  // Secure context has to be checked before the constructor: the Device
  // Orientation API is spec-gated to HTTPS, and newer WebKit does not expose
  // DeviceOrientationEvent on insecure origins at all — probing the
  // constructor first would misreport this as 'unsupported'.
  if (!window.isSecureContext) {
    publish({ tilt: null, support: 'insecure' });
    return;
  }

  if (typeof window.DeviceOrientationEvent === 'undefined') {
    publish({ tilt: null, support: 'unsupported' });
    return;
  }

  const constructor = window.DeviceOrientationEvent as OrientationConstructor;
  if (sessionPermission === 'denied') {
    publish({ tilt: null, support: 'denied' });
    return;
  }
  if (typeof constructor.requestPermission === 'function' && sessionPermission !== 'granted') {
    publish({ tilt: null, support: 'needs-permission' });
    return;
  }

  sessionPermission = 'granted';
  publish({ tilt: null, support: 'granted' });
  attachListeners();
}

function subscribe(subscriber: () => void): () => void {
  subscribers.add(subscriber);
  if (subscribers.size === 1) detectSupport();
  return () => {
    subscribers.delete(subscriber);
    if (subscribers.size === 0) detachListeners();
  };
}

function getSnapshot(): TiltSnapshot {
  return snapshot;
}

async function requestDeviceTiltPermission(): Promise<boolean> {
  if (typeof window === 'undefined') {
    publish({ tilt: null, support: 'unsupported' });
    return false;
  }

  // Insecure origins must not fall through to 'denied' — the user never
  // rejected anything — and must not touch listeners or the permission API.
  if (!window.isSecureContext) {
    publish({ tilt: null, support: 'insecure' });
    return false;
  }

  if (typeof window.DeviceOrientationEvent === 'undefined') {
    publish({ tilt: null, support: 'unsupported' });
    return false;
  }

  const constructor = window.DeviceOrientationEvent as OrientationConstructor;
  if (typeof constructor.requestPermission !== 'function') {
    sessionPermission = 'granted';
    publish({ tilt: null, support: 'granted' });
    attachListeners();
    return true;
  }

  try {
    const result = await constructor.requestPermission();
    sessionPermission = result === 'granted' ? 'granted' : 'denied';
    if (sessionPermission === 'granted') {
      publish({ tilt: null, support: 'granted' });
      attachListeners();
      return true;
    }
  } catch {
    sessionPermission = 'denied';
  }

  detachListeners();
  publish({ tilt: null, support: 'denied' });
  return false;
}

export function useDeviceTilt(): TiltSnapshot & {
  requestPermission: () => Promise<boolean>;
} {
  const current = useSyncExternalStore(subscribe, getSnapshot, () => SERVER_SNAPSHOT);
  return { ...current, requestPermission: requestDeviceTiltPermission };
}

export function resetDeviceTiltStoreForTests(): void {
  detachListeners();
  subscribers.clear();
  sessionPermission = 'unknown';
  snapshot = SERVER_SNAPSHOT;
  baselineReference = null;
  baselineTotal = 0;
  baselineCount = 0;
  baseline = null;
}

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  resetDeviceTiltStoreForTests,
  useDeviceTilt,
} from '../useDeviceTilt';

class FakeDeviceOrientationEvent extends Event {
  beta: number | null;
  gamma: number | null;

  constructor(type: string, init: { beta?: number | null; gamma?: number | null } = {}) {
    super(type);
    this.beta = init.beta ?? null;
    this.gamma = init.gamma ?? null;
  }
}

const orientation = Object.assign(new EventTarget(), { angle: 0 });

function installOrientationConstructor(
  requestPermission?: () => Promise<'granted' | 'denied'>,
) {
  const Constructor = FakeDeviceOrientationEvent as typeof FakeDeviceOrientationEvent & {
    requestPermission?: () => Promise<'granted' | 'denied'>;
  };
  if (requestPermission) Constructor.requestPermission = requestPermission;
  else delete Constructor.requestPermission;
  Object.defineProperty(window, 'DeviceOrientationEvent', {
    configurable: true,
    value: Constructor,
  });
}

function dispatchOrientation(beta: number | null, gamma: number | null) {
  window.dispatchEvent(new FakeDeviceOrientationEvent('deviceorientation', { beta, gamma }));
}

beforeEach(() => {
  resetDeviceTiltStoreForTests();
  orientation.angle = 0;
  Object.defineProperty(window.screen, 'orientation', {
    configurable: true,
    value: orientation,
  });
  installOrientationConstructor();
});

afterEach(() => {
  resetDeviceTiltStoreForTests();
  vi.restoreAllMocks();
});

describe('useDeviceTilt', () => {
  it('calibrates portrait gamma and normalizes 30 degrees to the full range', () => {
    const { result } = renderHook(() => useDeviceTilt());
    expect(result.current.support).toBe('granted');

    act(() => {
      for (let index = 0; index < 5; index += 1) dispatchOrientation(0, 10);
    });
    expect(result.current.tilt).toBe(0);

    act(() => dispatchOrientation(0, 25));
    expect(result.current.tilt).toBeCloseTo(0.5);
    act(() => dispatchOrientation(0, -30));
    expect(result.current.tilt).toBe(-1);
  });

  it.each([
    { angle: 90, baselineBeta: 80, nextBeta: 95, expected: 0.5 },
    { angle: 180, baselineGamma: 10, nextGamma: -5, expected: 0.5 },
    { angle: 270, baselineBeta: 80, nextBeta: 65, expected: 0.5 },
  ])('calibrates screen orientation $angle°', ({
    angle,
    baselineBeta = 0,
    nextBeta = 0,
    baselineGamma = 0,
    nextGamma = 0,
    expected,
  }) => {
    orientation.angle = angle;
    const { result } = renderHook(() => useDeviceTilt());
    act(() => {
      for (let index = 0; index < 5; index += 1) {
        dispatchOrientation(baselineBeta, baselineGamma);
      }
      dispatchOrientation(nextBeta, nextGamma);
    });
    expect(result.current.tilt).toBeCloseTo(expected);
  });

  it('requests iOS permission from the exposed gesture callback', async () => {
    const permission = vi.fn(async () => 'granted' as const);
    installOrientationConstructor(permission);
    const { result } = renderHook(() => useDeviceTilt());
    expect(result.current.support).toBe('needs-permission');

    await act(async () => {
      expect(await result.current.requestPermission()).toBe(true);
    });
    expect(permission).toHaveBeenCalledTimes(1);
    expect(result.current.support).toBe('granted');
  });

  it('clears the calibrated value when the screen orientation changes', () => {
    const { result } = renderHook(() => useDeviceTilt());
    act(() => {
      for (let index = 0; index < 5; index += 1) dispatchOrientation(0, 0);
      dispatchOrientation(0, 15);
    });
    expect(result.current.tilt).toBeCloseTo(0.5);

    act(() => orientation.dispatchEvent(new Event('change')));
    expect(result.current.tilt).toBeNull();
  });

  it('keeps a denial for later game mounts and catches permission errors', async () => {
    installOrientationConstructor(vi.fn(async () => { throw new Error('not allowed'); }));
    const first = renderHook(() => useDeviceTilt());
    await act(async () => {
      expect(await first.result.current.requestPermission()).toBe(false);
    });
    expect(first.result.current.support).toBe('denied');
    first.unmount();

    const second = renderHook(() => useDeviceTilt());
    expect(second.result.current.support).toBe('denied');
  });

  it('removes the shared device listener after the final subscriber unmounts', () => {
    const removeListener = vi.spyOn(window, 'removeEventListener');
    const first = renderHook(() => useDeviceTilt());
    const second = renderHook(() => useDeviceTilt());
    first.unmount();
    expect(removeListener).not.toHaveBeenCalledWith('deviceorientation', expect.any(Function));
    second.unmount();
    expect(removeListener).toHaveBeenCalledWith('deviceorientation', expect.any(Function));
  });
});

import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { StatusBar, Style } from '@capacitor/status-bar';

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

export async function configureNativeShell(): Promise<void> {
  if (!isNativeApp()) return;

  await setNativeStatusBarStyle('dark');
  await StatusBar.setOverlaysWebView({ overlay: false }).catch(() => undefined);
}

export async function setNativeStatusBarStyle(theme: 'dark' | 'light'): Promise<void> {
  if (!isNativeApp()) return;
  // Capacitor names these after the background they suit: Style.Light means
  // dark glyphs on a light background, and Style.Dark means light glyphs.
  await StatusBar.setStyle({ style: theme === 'light' ? Style.Dark : Style.Light })
    .catch(() => undefined);
}

export async function tapFeedback(): Promise<void> {
  if (!isNativeApp()) return;
  await Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined);
}

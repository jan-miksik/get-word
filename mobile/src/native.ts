import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { StatusBar, Style } from '@capacitor/status-bar';

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

export async function configureNativeShell(): Promise<void> {
  if (!isNativeApp()) return;

  await StatusBar.setStyle({ style: Style.Dark }).catch(() => undefined);
  await StatusBar.setOverlaysWebView({ overlay: false }).catch(() => undefined);
}

export async function tapFeedback(): Promise<void> {
  if (!isNativeApp()) return;
  await Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined);
}

/** Build-time flag set only by the Capacitor/Vite entry point. */
export function isNativeAppRuntime(): boolean {
  return process.env.NEXT_PUBLIC_NATIVE_APP === '1';
}

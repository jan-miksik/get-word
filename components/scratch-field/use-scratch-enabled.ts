/**
 * The full-page field runs on desktop and mobile.
 *
 * Touch devices use the passive touch listeners in `ScratchField`, so scrolling
 * remains native while a finger can still leave a scratch trail. Keeping this
 * as a hook leaves the component-level feature gate easy to restore if the
 * experiment is eventually made optional.
 */
export function useScratchFieldEnabled(): boolean {
  return true;
}

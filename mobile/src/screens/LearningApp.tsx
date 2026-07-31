import { HomeClient } from '@/app/HomeClient';
import { photoDisplayFont } from '@/features/photo-lab/font';

/**
 * The shared learning app, rendered natively. This is the same client shell the
 * web serves from `app/page.tsx` for a signed-in visitor — the native build
 * only differs in how it authenticates and how it resolves Next's client-side
 * modules (see `src/next-shims`).
 */
export function LearningApp() {
  return <HomeClient photoDisplayFontClass={photoDisplayFont.variable} />;
}

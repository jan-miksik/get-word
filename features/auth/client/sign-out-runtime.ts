/**
 * How the shell finishes a sign-out.
 *
 * On the web the app session IS the `get_word_session` cookie, so clearing it
 * and hard-navigating to `/` is the whole story.
 *
 * The native client is different: its session is a bearer token in the
 * Keychain, which no cookie clear can touch. Reloading there would boot the
 * app straight back into the stored session — it would look like sign-out did
 * nothing. It registers a handler here instead, so the shared UI keeps calling
 * one `signOut()` and the shell decides what "signed out" means for it.
 */
type SignOutHandler = () => void | Promise<void>;

let handler: SignOutHandler | null = null;

export function configureSignOutHandler(next: SignOutHandler | null): void {
  handler = next;
}

/** Returns false when no shell handler is registered (the web path). */
export async function runSignOutHandler(): Promise<boolean> {
  if (!handler) return false;
  await handler();
  return true;
}

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/components/I18nProvider';
import { DeleteAccountModal } from '../DeleteAccountModal';

const mocks = vi.hoisted(() => ({
  deviceJsonFetch: vi.fn(),
  clearLearningCache: vi.fn(async () => undefined),
  clearPendingSync: vi.fn(),
  resetSyncIdentity: vi.fn(),
  deleteDeviceId: vi.fn(),
  runSignOutHandler: vi.fn(async () => true),
}));

vi.mock('@/features/shared/http/device-json-fetch', () => ({
  deviceJsonFetch: mocks.deviceJsonFetch,
}));
vi.mock('@/lib/local-learning-cache', () => ({ clearLearningCache: mocks.clearLearningCache }));
vi.mock('@/lib/sync', () => ({
  clearPendingSync: mocks.clearPendingSync,
  resetSyncIdentity: mocks.resetSyncIdentity,
}));
vi.mock('@/lib/device-id', () => ({ deleteDeviceId: mocks.deleteDeviceId }));
vi.mock('@/features/auth/client/sign-out-runtime', () => ({
  runSignOutHandler: mocks.runSignOutHandler,
}));

function renderModal(authEmail?: string) {
  return render(
    <I18nProvider language="cs">
      <DeleteAccountModal isOpen onClose={() => {}} authEmail={authEmail} />
    </I18nProvider>
  );
}

/**
 * jsdom lays nothing out, so the field-into-view maths needs boxes to work
 * from: a field sitting below the body's visible box, as the keyboard leaves it.
 */
function stubLayout(body: HTMLElement, input: HTMLElement) {
  body.getBoundingClientRect = () =>
    ({ top: 100, height: 200, bottom: 300 }) as DOMRect;
  input.getBoundingClientRect = () =>
    ({ top: 420, height: 40, bottom: 460 }) as DOMRect;
  // jsdom clamps `scrollTop` to zero for an element it never laid out, so the
  // scroll position has to be a plain value here.
  let scrollTop = 0;
  Object.defineProperty(body, 'scrollTop', {
    configurable: true,
    get: () => scrollTop,
    set: (value: number) => {
      scrollTop = value;
    },
  });
}

describe('DeleteAccountModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.deviceJsonFetch.mockResolvedValue({ ok: false, json: async () => null });
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sizes the dialog by the visible viewport and scrolls its body', () => {
    renderModal();
    const body = document.querySelector<HTMLElement>('[data-testid="delete-account-body"]');
    const frame = document.querySelector<HTMLElement>('[data-testid="delete-account-frame"]');
    expect(frame?.style.height).toBe('var(--app-viewport-height, 100dvh)');
    expect(body?.className).toContain('overflow-y-auto');
  });

  it('pulls the confirmation field into view when it takes focus', async () => {
    renderModal();
    const body = document.querySelector<HTMLElement>('[data-testid="delete-account-body"]')!;
    const input = screen.getByPlaceholderText('DELETE');
    stubLayout(body, input);

    input.focus();

    // Field centre 440, body centre 200: the body scrolls the difference.
    await waitFor(() => expect(body.scrollTop).toBe(240));
  });

  it('keeps iOS from capitalizing an emailed confirmation phrase', () => {
    renderModal('a@b.com');
    const input = screen.getByPlaceholderText('a@b.com');
    expect(input.getAttribute('autocapitalize')).toBe('none');
  });

  it('clears the offline snapshot and sync identity after account deletion', async () => {
    mocks.deviceJsonFetch.mockImplementation(async (url: string) =>
      url.endsWith('/deletion-preview')
        ? { ok: true, json: async () => ({ keptLists: [], deletedListCount: 1 }) }
        : { ok: true, json: async () => ({ status: 'deleted' }) },
    );
    localStorage.setItem('get-word-old-account', 'old');
    sessionStorage.setItem('get_word_onboarding', 'complete');
    localStorage.setItem('unrelated', 'keep');

    renderModal();
    fireEvent.change(screen.getByPlaceholderText('DELETE'), { target: { value: 'DELETE' } });
    fireEvent.click(screen.getByRole('button', { name: 'Smazat můj účet' }));

    await waitFor(() => expect(mocks.clearLearningCache).toHaveBeenCalledOnce());
    expect(mocks.clearPendingSync).toHaveBeenCalledOnce();
    expect(mocks.resetSyncIdentity).toHaveBeenCalledOnce();
    expect(mocks.deleteDeviceId).toHaveBeenCalledOnce();
    expect(localStorage.getItem('get-word-old-account')).toBeNull();
    expect(sessionStorage.getItem('get_word_onboarding')).toBeNull();
    expect(localStorage.getItem('unrelated')).toBe('keep');
  });
});

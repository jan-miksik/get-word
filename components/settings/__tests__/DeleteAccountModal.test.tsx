import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/components/I18nProvider';
import { DeleteAccountModal } from '../DeleteAccountModal';

vi.mock('@/features/shared/http/device-json-fetch', () => ({
  deviceJsonFetch: vi.fn(async () => ({ ok: false, json: async () => null })),
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
});

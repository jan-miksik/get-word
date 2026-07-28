import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/components/I18nProvider';
import { BackLink } from '../PhotoLabPage';

function renderBackLink(search: string) {
  window.history.replaceState({}, '', `/photo-lab${search}`);
  render(
    <I18nProvider language="en">
      <BackLink />
    </I18nProvider>,
  );
  // The `from` param is read in a deferred effect to avoid a hydration mismatch.
  act(() => {
    vi.advanceTimersByTime(1);
  });
}

describe('photo lab BackLink', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('closes the in-place lab instead of navigating', () => {
    vi.useFakeTimers();
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    const onClose = vi.fn();

    render(
      <I18nProvider language="en">
        <BackLink onClose={onClose} />
      </I18nProvider>,
    );
    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(screen.queryByRole('link')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Back to studying/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(back).not.toHaveBeenCalled();
  });

  it('pops history back to the deck the learner left behind', () => {
    vi.useFakeTimers();
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    // jsdom starts with a single entry; the shortcut click is a second one.
    vi.spyOn(window.history, 'length', 'get').mockReturnValue(2);

    renderBackLink('?from=study');

    const link = screen.getByRole('link', { name: /Back to studying/i });
    expect(link).toHaveAttribute('href', '/');
    const handled = fireEvent.click(link);

    expect(back).toHaveBeenCalledTimes(1);
    // Default prevented → the href never navigates.
    expect(handled).toBe(false);
  });

  it('falls back to the plain link home when there is no history to pop', () => {
    vi.useFakeTimers();
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    vi.spyOn(window.history, 'length', 'get').mockReturnValue(1);

    renderBackLink('?from=study');

    expect(fireEvent.click(screen.getByRole('link', { name: /Back to studying/i }))).toBe(true);
    expect(back).not.toHaveBeenCalled();
  });

  it('goes home for an arrival that did not come from the study view', () => {
    vi.useFakeTimers();
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    vi.spyOn(window.history, 'length', 'get').mockReturnValue(5);

    renderBackLink('');

    const link = screen.getByRole('link', { name: /^← Back$/i });
    expect(link).toHaveAttribute('href', '/');
    expect(fireEvent.click(link)).toBe(true);
    expect(back).not.toHaveBeenCalled();
  });

  it('leaves a modifier-click alone so it can still open a new tab', () => {
    vi.useFakeTimers();
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    vi.spyOn(window.history, 'length', 'get').mockReturnValue(2);

    renderBackLink('?from=study');

    const link = screen.getByRole('link', { name: /Back to studying/i });
    expect(fireEvent.click(link, { metaKey: true })).toBe(true);
    expect(back).not.toHaveBeenCalled();
  });
});

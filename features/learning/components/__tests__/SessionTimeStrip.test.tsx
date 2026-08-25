import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/components/I18nProvider';
import type { ActivityClockState } from '@/lib/activity/runtime';
import { SessionTimeStrip } from '../SessionTimeStrip';

/** What the clock is doing, as the strip asks it every second. */
let clock: ActivityClockState = 'counting';

vi.mock('@/lib/activity/runtime', () => ({
  seedActivityDayTotal: () => undefined,
  setActivityGoalTimezone: () => undefined,
  getBestKnownDayActiveMs: () => 4 * 60_000,
  getActivityClockState: () => clock,
}));

function renderStrip(serverActiveMs: number, budgetMs = 10 * 60_000) {
  return render(
    <I18nProvider language="en">
      <SessionTimeStrip
        goal={{ dayKey: '2026-08-23', timezone: 'Europe/Prague', budgetMs, serverActiveMs }}
      />
    </I18nProvider>,
  );
}

describe('SessionTimeStrip', () => {
  beforeEach(() => {
    clock = 'counting';
  });

  it('counts down what is left of the budget, against the goal it was set to', () => {
    renderStrip(4 * 60_000);

    expect(screen.getByText('6:00')).toBeInTheDocument();
    expect(screen.getByText('10 min')).toBeInTheDocument();
  });

  it('fills its mini progress by what has been spent, and marks the stretches', () => {
    const { container } = renderStrip(4 * 60_000);
    const [fill, ...notches] = Array.from(container.querySelectorAll('span[style*="%"]')) as HTMLElement[];

    expect(fill.style.width).toBe('40%');
    expect(notches.map((notch) => notch.style.left)).toEqual(['30%', '60%']);
  });

  it('draws no session rails: the clock is the whole measure of a minutes day', () => {
    const { container } = renderStrip(4 * 60_000);

    // The rails are the only hairline columns the study area ever draws.
    expect(container.querySelector('.flex-col-reverse')).toBeNull();
    expect(container.querySelector('[class*="w-[5px]"]')).toBeNull();
  });

  it('says nothing about the clock while time is being credited', () => {
    const { container } = renderStrip(4 * 60_000);

    expect(screen.queryByText('Zzz')).toBeNull();
    expect(container.querySelector('[title]')).toBeNull();
  });

  it('says the clock is waiting once the learner has gone quiet', () => {
    clock = 'idle';
    renderStrip(4 * 60_000);

    // Still the same number — the point is that it now explains why it is not
    // moving, rather than looking like a countdown that has broken.
    expect(screen.getByText('6:00')).toBeInTheDocument();
    expect(screen.getByText('Zzz')).toBeInTheDocument();
    expect(screen.getByText('waiting for you')).toBeInTheDocument();
  });

  // The regression this whole strip exists for: every one of these used to
  // render as a countdown standing still with nothing to show for it.
  it.each([
    ['elsewhere', 'study only'],
    ['paused', 'in the background'],
    ['unmeasured', 'not measuring'],
  ] as const)('explains a stopped clock when it is %s', (state, reason) => {
    clock = state;
    const { container } = renderStrip(4 * 60_000);

    expect(screen.getByText(reason)).toBeInTheDocument();
    // A pause mark rather than Zzz: nothing the learner does starts these.
    expect(screen.queryByText('Zzz')).toBeNull();
    expect(container.querySelector('[title]')).not.toBeNull();
  });

  it('stays quiet once the day is over, whatever the clock is doing', () => {
    clock = 'unmeasured';
    renderStrip(4 * 60_000, 4 * 60_000);

    expect(screen.getByText('0:00')).toBeInTheDocument();
    expect(screen.queryByText('not measuring')).toBeNull();
  });
});

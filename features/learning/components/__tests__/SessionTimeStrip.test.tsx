import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/components/I18nProvider';
import type { ActivityClockState } from '@/lib/activity/runtime';
import { SessionTimeStrip, type SessionTimeStripVariant } from '../SessionTimeStrip';

/** What the clock is doing, as the strip asks it every second. */
let clock: ActivityClockState = 'counting';

vi.mock('@/lib/activity/runtime', () => ({
  seedActivityDayTotal: () => undefined,
  setActivityGoalTimezone: () => undefined,
  getBestKnownDayActiveMs: () => 4 * 60_000,
  getActivityClockState: () => clock,
}));

function renderStrip(
  serverActiveMs: number,
  budgetMs = 10 * 60_000,
  variant?: SessionTimeStripVariant,
  phaseShares?: readonly number[],
  phaseKinds?: readonly ('new' | 'review')[],
) {
  return render(
    <I18nProvider language="en">
      <SessionTimeStrip
        variant={variant}
        goal={{
          dayKey: '2026-08-23',
          timezone: 'Europe/Prague',
          budgetMs,
          serverActiveMs,
          phaseShares,
          phaseKinds,
        }}
      />
    </I18nProvider>,
  );
}

describe('SessionTimeStrip', () => {
  beforeEach(() => {
    clock = 'counting';
  });

  // The whole point of the quiet strip: the digit that used to change sixty
  // times a minute beside the card now changes once.
  it('counts down in whole minutes, so nothing moves in the corner of an eye', () => {
    renderStrip(4 * 60_000);

    expect(screen.getByText('6 min')).toBeInTheDocument();
    expect(screen.queryByText('6:00')).toBeNull();
  });

  it('rounds the minutes up, so the last part-minute is still on the clock', () => {
    // 4:00 spent of 9:30 leaves 5:30, which has to read as six rather than five.
    renderStrip(4 * 60_000, 9 * 60_000 + 30_000);

    expect(screen.getByText('6 min')).toBeInTheDocument();
  });

  it('switches to seconds for the run to the finish', () => {
    renderStrip(4 * 60_000, 4 * 60_000 + 30_000);

    expect(screen.getByText('0:30')).toBeInTheDocument();
  });

  it('keeps the seconds and the budget in the loud variant it is compared against', () => {
    renderStrip(4 * 60_000, 10 * 60_000, 'loud');

    expect(screen.getByText('6:00')).toBeInTheDocument();
    expect(screen.getByText('10 min')).toBeInTheDocument();
  });

  it('draws minute ticks for the current stretch and coloured stretches for the whole day', () => {
    const { container } = renderStrip(
      4 * 60_000,
      10 * 60_000,
      undefined,
      [0.5, 0.5],
      ['new', 'review'],
    );
    const current = container.querySelector<HTMLElement>('[data-time-current-rail]');
    const day = container.querySelector<HTMLElement>('[data-time-day-rail]');
    const ticks = Array.from(current?.children ?? []) as HTMLElement[];
    const segments = Array.from(day?.children ?? []) as HTMLElement[];

    expect(ticks).toHaveLength(5);
    expect(ticks.filter((tick) => tick.dataset.filled === 'true')).toHaveLength(4);
    expect(segments.map((segment) => segment.dataset.timeSegmentKind)).toEqual(['new', 'review']);
    expect((segments[0].firstElementChild as HTMLElement).style.height).toBe('80%');
    expect((segments[1].firstElementChild as HTMLElement).style.height).toBe('0%');
  });

  it('drops the duplicate horizontal progress from beside the clock', () => {
    const { container } = renderStrip(4 * 60_000);

    expect(container.querySelector('[data-time-clock] [style*="width"]')).toBeNull();
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
    expect(screen.getByText('6 min')).toBeInTheDocument();
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

  describe('getting out of the way', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    function settle() {
      act(() => {
        vi.advanceTimersByTime(5_000);
      });
    }

    it('arrives at full strength and then fades to the background', () => {
      const { container } = renderStrip(4 * 60_000);
      const strip = container.querySelector<HTMLElement>('[data-time-clock]')!;

      expect(strip.style.opacity).toBe('1');
      settle();
      expect(strip.style.opacity).toBe('0.45');
    });

    it('stays visible while the clock is stopped, because that needs answering', () => {
      clock = 'paused';
      const { container } = renderStrip(4 * 60_000);
      settle();

      expect(container.querySelector<HTMLElement>('[data-time-clock]')?.style.opacity).toBe('1');
    });

    it('stays visible through the last minute', () => {
      const { container } = renderStrip(4 * 60_000, 4 * 60_000 + 30_000);
      settle();

      expect(container.querySelector<HTMLElement>('[data-time-clock]')?.style.opacity).toBe('1');
    });

    it('does not fade the loud variant it is compared against', () => {
      const { container } = renderStrip(4 * 60_000, 10 * 60_000, 'loud');
      settle();

      expect(container.querySelector<HTMLElement>('[data-time-clock]')?.style.opacity).toBe('1');
    });
  });
});

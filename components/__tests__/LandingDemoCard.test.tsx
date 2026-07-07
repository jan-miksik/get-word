import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/components/I18nProvider';
import { LandingDemoCard } from '../LandingDemoCard';

type FakeAudioInstance = {
  src: string;
  preload: string;
  currentTime: number;
  load: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  play: ReturnType<typeof vi.fn>;
};

let audioInstances: FakeAudioInstance[] = [];
let audioMock: ReturnType<typeof vi.fn>;

function renderCard(lang = 'en') {
  return render(
    <I18nProvider language={lang}>
      <LandingDemoCard lang={lang} />
    </I18nProvider>
  );
}

/** Click through the 3-pair matching round (en → cs demo set). */
function completeMatchingRound() {
  const pairs: [string, string][] = [
    ['yes', 'ano'],
    ["I don't understand", 'nerozumím'],
    ['thank you', 'děkuji'],
  ];
  for (const [front, back] of pairs) {
    fireEvent.click(screen.getByRole('button', { name: front }));
    fireEvent.click(screen.getByRole('button', { name: back }));
  }
  // The result stays visible; a full-area continue bar advances on any tap.
  expect(screen.getByText(/All matched!/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /tap to continue/i }));
}

describe('LandingDemoCard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    audioInstances = [];
    audioMock = vi.fn(function AudioMock(this: FakeAudioInstance, src = '') {
      this.src = src;
      this.preload = '';
      this.currentTime = 0;
      this.load = vi.fn();
      this.pause = vi.fn();
      this.play = vi.fn().mockResolvedValue(undefined);
      audioInstances.push(this);
    });
    vi.stubGlobal('Audio', audioMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('covers the painted translation with the scratch canvas', () => {
    const { container } = renderCard();

    // Like the real card: the answer text is in the document, hidden under
    // an opaque canvas cover that the visitor scratches away.
    expect(screen.getByText('yes')).toBeInTheDocument();
    expect(screen.getByText('ano')).toBeInTheDocument();
    expect(container.querySelector('canvas.scratch-cover')).not.toBeNull();
    // First-time visitors also get the animated scratch gesture hint.
    expect(container.querySelector('.scratch-hint')).not.toBeNull();
  });

  it('shows the growing interval after a correct answer and advances to the next word', () => {
    const { container } = renderCard();

    fireEvent.click(screen.getByRole('button', { name: /^OK/ }));

    act(() => {
      vi.advanceTimersByTime(450);
    });

    expect(screen.getByText("I don't understand")).toBeInTheDocument();
    // The next word arrives with a fresh cover.
    expect(container.querySelector('canvas.scratch-cover')).not.toBeNull();
  });

  it('moves the mini progress with each card instead of using stage dots', () => {
    const { container } = renderCard();

    const currentDots = () => container.querySelectorAll('.lp-demo-dot.is-current');
    expect(currentDots()).toHaveLength(1);
    expect([...container.querySelectorAll('.lp-demo-dot')].indexOf(currentDots()[0])).toBe(0);

    fireEvent.click(screen.getByRole('button', { name: /^OK/ }));

    act(() => {
      vi.advanceTimersByTime(450);
    });

    expect(currentDots()).toHaveLength(1);
    expect([...container.querySelectorAll('.lp-demo-dot')].indexOf(currentDots()[0])).toBe(1);
    expect(container.querySelectorAll('.lp-demo-dot.is-on')).toHaveLength(1);
  });

  it('sends a forgotten card to the back of the stack and shows the next one', () => {
    const { container } = renderCard();

    fireEvent.click(screen.getByRole('button', { name: /Forgotten/ }));

    act(() => {
      vi.advanceTimersByTime(450);
    });

    // The forgotten card drops behind the rest of the stack; the next card
    // comes up and nothing is marked mastered.
    expect(screen.getByText("I don't understand")).toBeInTheDocument();
    expect(screen.queryByText('yes')).not.toBeInTheDocument();
    expect(container.querySelectorAll('.lp-demo-dot.is-on')).toHaveLength(0);
    expect(screen.queryByText('Done')).not.toBeInTheDocument();
  });

  it('replays the last remaining card in place when forgotten', () => {
    renderCard();

    fireEvent.click(screen.getByRole('button', { name: /^OK/ }));
    act(() => {
      vi.advanceTimersByTime(450);
    });
    fireEvent.click(screen.getByRole('button', { name: /^OK/ }));
    act(() => {
      vi.advanceTimersByTime(450);
    });
    completeMatchingRound();

    // Only the third word is left on the stack.
    expect(screen.getAllByText('thank you').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: /Forgotten/ }));
    act(() => {
      vi.advanceTimersByTime(450);
    });

    // Nothing to hide behind, so it comes straight back — not finished.
    expect(screen.getAllByText('thank you').length).toBeGreaterThan(0);
    expect(screen.queryByText('Done')).not.toBeInTheDocument();
  });

  it('uses the interface language to pick the demo pair', () => {
    renderCard('cs');

    expect(screen.getByText('ano')).toBeInTheDocument();
  });

  it('uses the selected landing language pair when provided', () => {
    render(
      <I18nProvider language="cs">
        <LandingDemoCard lang="cs" fromLang="cs" toLang="id" />
      </I18nProvider>
    );

    expect(screen.getByText('ano')).toBeInTheDocument();
    expect(screen.getByText('ya')).toBeInTheDocument();
    expect(screen.getByText(/CS → 🇮🇩 ID/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Vlastní interval' })).toBeInTheDocument();
  });

  it('preloads and plays bundled demo audio before remote fallbacks', () => {
    renderCard();

    expect(audioInstances.some((audio) => audio.src === '/audio/demo/cs/1.mp3')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Play audio' }));

    expect(audioMock.mock.calls.some(([src]) => src === '/audio/demo/cs/1.mp3')).toBe(true);
  });

  it('shows a completed state without the old explanatory timer copy', () => {
    renderCard();

    fireEvent.click(screen.getByRole('button', { name: /^OK/ }));
    act(() => {
      vi.advanceTimersByTime(450);
      vi.advanceTimersByTime(10_000);
    });

    fireEvent.click(screen.getByRole('button', { name: /^OK/ }));
    act(() => {
      vi.advanceTimersByTime(450);
    });
    completeMatchingRound();
    fireEvent.click(screen.getByRole('button', { name: /^OK/ }));
    act(() => {
      vi.advanceTimersByTime(450);
    });

    expect(screen.getByText('Done')).toBeInTheDocument();
    expect(screen.queryByText(/All demo words are scheduled/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^\d+:\d{2}$/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Continue to the app' })).toHaveAttribute(
      'href',
      '/login',
    );
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('calls the continue callback when the done CTA is used', () => {
    const onContinueToApp = vi.fn();
    render(
      <I18nProvider language="en">
        <LandingDemoCard lang="en" onContinueToApp={onContinueToApp} />
      </I18nProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: /^OK/ }));
    act(() => {
      vi.advanceTimersByTime(450);
      vi.advanceTimersByTime(10_000);
    });
    fireEvent.click(screen.getByRole('button', { name: /^OK/ }));
    act(() => {
      vi.advanceTimersByTime(450);
    });
    completeMatchingRound();
    fireEvent.click(screen.getByRole('button', { name: /^OK/ }));
    act(() => {
      vi.advanceTimersByTime(450);
    });

    fireEvent.click(screen.getByRole('link', { name: 'Continue to the app' }));

    expect(onContinueToApp).toHaveBeenCalledTimes(1);
  });

  it('falls back to a supported demo pair and hides audio for unsupported explicit targets', () => {
    render(
      <I18nProvider language="cs">
        <LandingDemoCard lang="cs" fromLang="cs" toLang="sw" />
      </I18nProvider>
    );

    expect(screen.getByText('ano')).toBeInTheDocument();
    expect(screen.getByText('ndiyo')).toBeInTheDocument();
    expect(screen.getByText(/CS → 🇹🇿 SW/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Přehrát|Play audio/i })).not.toBeInTheDocument();
  });

  it('does not fall back to speech synthesis when recording playback fails', async () => {
    const speechSynthesis = {
      cancel: vi.fn(),
      speak: vi.fn(),
    };
    vi.stubGlobal('speechSynthesis', speechSynthesis);
    audioInstances = [];
    audioMock = vi.fn(function AudioMock(this: FakeAudioInstance, src = '') {
      this.src = src;
      this.preload = '';
      this.currentTime = 0;
      this.load = vi.fn();
      this.pause = vi.fn();
      this.play = vi.fn().mockRejectedValue(new Error('playback blocked'));
      audioInstances.push(this);
    });
    vi.stubGlobal('Audio', audioMock);

    renderCard();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Play audio' }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(speechSynthesis.speak).not.toHaveBeenCalled();
  });

  it('supports the custom interval action', () => {
    renderCard();

    fireEvent.click(screen.getByRole('button', { name: 'Custom interval' }));
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('option', { name: '1 day' }));

    act(() => {
      vi.advanceTimersByTime(450);
    });

    expect(screen.getByText("I don't understand")).toBeInTheDocument();
  });

  it('can still complete with the regular OK path', () => {
    renderCard();

    for (let i = 0; i < 2; i += 1) {
      fireEvent.click(screen.getByRole('button', { name: /^OK/ }));
      act(() => {
        vi.advanceTimersByTime(450);
      });
    }
    completeMatchingRound();
    fireEvent.click(screen.getByRole('button', { name: /^OK/ }));
    act(() => {
      vi.advanceTimersByTime(450);
    });

    expect(screen.getByText('Done')).toBeInTheDocument();
    expect(screen.queryByText(/^\d+:\d{2}$/)).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.queryByText(/^\d+:\d{2}$/)).not.toBeInTheDocument();
  });

  it('injects a 3-pair matching round after the second word and lets the finished card continue from anywhere', () => {
    renderCard();

    fireEvent.click(screen.getByRole('button', { name: /^OK/ }));
    act(() => {
      vi.advanceTimersByTime(450);
    });
    fireEvent.click(screen.getByRole('button', { name: /^OK/ }));
    act(() => {
      vi.advanceTimersByTime(450);
    });

    // The matching round replaces the card: both columns are on screen and
    // there is no OK button until all pairs are matched.
    expect(screen.getByText(/Match/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^OK/ })).not.toBeInTheDocument();

    // A wrong pair flashes and unlocks again.
    fireEvent.click(screen.getByRole('button', { name: 'yes' }));
    fireEvent.click(screen.getByRole('button', { name: 'děkuji' }));
    act(() => {
      vi.advanceTimersByTime(700);
    });
    expect(screen.queryByText(/All matched!/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'yes' }));
    fireEvent.click(screen.getByRole('button', { name: 'ano' }));
    fireEvent.click(screen.getByRole('button', { name: "I don't understand" }));
    fireEvent.click(screen.getByRole('button', { name: 'nerozumím' }));
    fireEvent.click(screen.getByRole('button', { name: 'thank you' }));
    fireEvent.click(screen.getByRole('button', { name: 'děkuji' }));

    // The matched result stays on screen; continuing takes one more tap.
    expect(screen.getByText(/All matched!/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /tap to continue/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^OK/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /tap to continue/i }));

    // Matching done → the third word arrives as a normal card.
    expect(screen.getByRole('button', { name: /^OK/ })).toBeInTheDocument();
    expect(screen.getAllByText('thank you').length).toBeGreaterThan(0);
  });

  it('offers the full custom ladder including 60 days and fully-known', () => {
    renderCard();

    fireEvent.click(screen.getByRole('button', { name: 'Custom interval' }));

    expect(screen.getByRole('option', { name: '60 days' })).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: /Fully known|don.t repeat/i }),
    ).toBeInTheDocument();
  });
});

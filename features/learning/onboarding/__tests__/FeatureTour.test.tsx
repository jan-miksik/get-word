import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/components/I18nProvider';
import { FeatureTour } from '../FeatureTour';
import {
  resolveAvailableTourSteps,
  tourAnchorSelector,
} from '../featureTourSteps';

function mountAnchors(anchors: string[]) {
  const host = document.createElement('div');
  for (const anchor of anchors) {
    const element = document.createElement('button');
    element.setAttribute('data-tour', anchor);
    // jsdom reports a zero-size rect for every element, which the tour reads as
    // "not on screen". Give the anchors a measurable box.
    element.getBoundingClientRect = () =>
      ({ top: 10, left: 40, width: 48, height: 48 }) as DOMRect;
    host.appendChild(element);
  }
  document.body.appendChild(host);
  return host;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('resolveAvailableTourSteps', () => {
  it('drops steps whose control is not on screen', () => {
    mountAnchors(['study', 'chat']);
    const steps = resolveAvailableTourSteps(document);
    expect(steps.map((step) => step.anchor)).toEqual(['study', 'chat']);
  });

  it('keeps all three steps when photo lab is available', () => {
    mountAnchors(['study', 'chat', 'photo']);
    expect(resolveAvailableTourSteps(document).map((step) => step.anchor)).toEqual([
      'study',
      'chat',
      'photo',
    ]);
  });
});

describe('tourAnchorSelector', () => {
  it('targets the data attribute', () => {
    expect(tourAnchorSelector('chat')).toBe('[data-tour="chat"]');
  });
});

describe('FeatureTour', () => {
  const renderTour = (onFinish: () => void) =>
    render(
      <I18nProvider language="cs">
        <FeatureTour onFinish={onFinish} />
      </I18nProvider>
    );

  it('walks the steps and finishes on the last one', () => {
    mountAnchors(['study', 'chat', 'photo']);
    const onFinish = vi.fn();
    renderTour(onFinish);

    expect(screen.getByText('Krok 1 z 3')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Jak probíhá učení' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Dál' }));
    expect(screen.getByRole('heading', { name: 'Nevíš, co se učit?' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Dál' }));
    expect(screen.getByText('Krok 3 z 3')).toBeInTheDocument();
    expect(onFinish).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Jasně' }));
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('can be skipped from the first step', () => {
    mountAnchors(['study', 'chat', 'photo']);
    const onFinish = vi.fn();
    renderTour(onFinish);

    fireEvent.click(screen.getByRole('button', { name: 'Přeskočit' }));
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('can be escaped with the keyboard', () => {
    mountAnchors(['study', 'chat', 'photo']);
    const onFinish = vi.fn();
    renderTour(onFinish);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('renders nothing when no control is on screen', () => {
    const onFinish = vi.fn();
    const { container } = renderTour(onFinish);
    expect(container).toBeEmptyDOMElement();
  });

  it('finds anchors that commit in the same render as the tour', () => {
    // How `?previewFeatureTour` actually mounts: the tour and the surface that
    // owns the anchors appear together, so nothing is in the DOM yet while the
    // tour's own render runs.
    function Anchor() {
      const ref = (element: HTMLButtonElement | null) => {
        if (element) {
          element.getBoundingClientRect = () =>
            ({ top: 10, left: 40, width: 48, height: 48 }) as DOMRect;
        }
      };
      return <button data-tour="study" ref={ref} />;
    }

    render(
      <I18nProvider language="cs">
        <FeatureTour onFinish={vi.fn()} />
        <Anchor />
      </I18nProvider>
    );

    expect(screen.getByText('Krok 1 z 1')).toBeInTheDocument();
  });

  it('ends the tour after the last available step when photo lab is off', () => {
    mountAnchors(['study', 'chat']);
    const onFinish = vi.fn();
    renderTour(onFinish);

    expect(screen.getByText('Krok 1 z 2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Dál' }));
    fireEvent.click(screen.getByRole('button', { name: 'Jasně' }));
    expect(onFinish).toHaveBeenCalledTimes(1);
  });
});

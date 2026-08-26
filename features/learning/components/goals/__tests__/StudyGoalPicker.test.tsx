import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/components/I18nProvider';
import { normalizeFineTuneConfig } from '@/features/learning/fine-tune/config';
import {
  StudyGoalPicker,
  goalDialValueFromPoint,
  type GoalPickerValue,
} from '../StudyGoalPicker';
import type { StudyPacing } from '@/packages/domain/goals/goal';

const pacing: StudyPacing = {
  revealMode: 'press',
  minigameFrequency: 'off',
  fineTune: normalizeFineTuneConfig(undefined),
};

function renderPicker(initial?: Partial<GoalPickerValue>) {
  const onSubmit = vi.fn();
  render(
    <I18nProvider language="en">
      <StudyGoalPicker pacing={pacing} initial={initial} onSubmit={onSubmit} />
    </I18nProvider>,
  );
  const valueInput = () =>
    screen.getByRole('textbox', { name: /new words a day|minutes a day/i }) as HTMLInputElement;
  const slider = () => screen.getByRole('slider', { name: /new words a day|minutes a day/i });
  return { onSubmit, valueInput, slider };
}

describe('StudyGoalPicker circular dial', () => {
  it('starts with five words and every weekday selected', () => {
    const { valueInput } = renderPicker();

    expect(valueInput()).toHaveValue('5');
    expect(screen.getByRole('button', { name: 'Mon' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Tue' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Wed' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Thu' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Fri' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Sat' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Sun' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('maps the start and end of the pointer arc to 1 and 30', () => {
    const rect = { left: 0, top: 0, width: 200, height: 200 };
    const point = (degrees: number) => {
      const radians = degrees * Math.PI / 180;
      return [100 + Math.cos(radians) * 82, 100 + Math.sin(radians) * 82] as const;
    };
    const start = point(120);
    const end = point(60);

    expect(goalDialValueFromPoint(rect, ...start)).toBe(1);
    expect(goalDialValueFromPoint(rect, ...end)).toBe(30);
  });

  it('supports keyboard control without a scroll position', () => {
    const { slider, valueInput } = renderPicker({ newWordsPerDay: 10 });

    fireEvent.keyDown(slider(), { key: 'End' });
    expect(valueInput()).toHaveValue('30');
    fireEvent.keyDown(slider(), { key: 'ArrowLeft' });
    expect(valueInput()).toHaveValue('29');
    fireEvent.keyDown(slider(), { key: 'Home' });
    expect(valueInput()).toHaveValue('1');
  });

  it('accepts a typed custom words value through 1000 and marks it custom', () => {
    const { onSubmit, valueInput } = renderPicker();

    fireEvent.change(valueInput(), { target: { value: '1000' } });
    expect(screen.getByText('Custom value')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'words',
      newWordsPerDay: 1000,
      daysPerWeek: 7,
      weekdays: [1, 2, 3, 4, 5, 6, 7],
    }));
  });

  it('blocks a typed words value above 1000', () => {
    const { valueInput } = renderPicker();

    fireEvent.change(valueInput(), { target: { value: '1001' } });

    expect(screen.getByRole('alert')).toHaveTextContent('no higher than 1000');
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
  });

  it('keeps separate word and minute values and accepts exactly eight hours', () => {
    const { onSubmit, valueInput } = renderPicker({ newWordsPerDay: 7, minutesPerDay: 10 });

    fireEvent.click(screen.getByRole('radio', { name: /time/i }));
    fireEvent.change(valueInput(), { target: { value: '480' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(onSubmit).toHaveBeenLastCalledWith(expect.objectContaining({
      mode: 'minutes',
      minutesPerDay: 480,
    }));

    fireEvent.click(screen.getByRole('radio', { name: /words/i }));
    expect(valueInput()).toHaveValue('7');
  });

  it('blocks 481 minutes', () => {
    const { valueInput } = renderPicker({ mode: 'minutes' });

    fireEvent.change(valueInput(), { target: { value: '481' } });

    expect(screen.getByRole('alert')).toHaveTextContent('no higher than 480');
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
  });

  it('uses a multi-select weekday calendar and never allows zero days', () => {
    const { onSubmit } = renderPicker({ weekdays: [1], daysPerWeek: 1 });
    const monday = screen.getByRole('button', { name: 'Mon' });
    const friday = screen.getByRole('button', { name: 'Fri' });

    fireEvent.click(monday);
    expect(monday).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(friday);
    expect(friday).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      daysPerWeek: 2,
      weekdays: [1, 5],
    }));
  });
  it('offers every day as one press, and gives the previous days back', () => {
    const { onSubmit } = renderPicker();
    const everyDay = screen.getByRole('button', { name: /every day/i });

    fireEvent.click(everyDay);
    expect(everyDay).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Tue' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(onSubmit).toHaveBeenLastCalledWith(expect.objectContaining({
      daysPerWeek: 7,
      weekdays: [1, 2, 3, 4, 5, 6, 7],
    }));

    fireEvent.click(everyDay);
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(onSubmit).toHaveBeenLastCalledWith(expect.objectContaining({
      daysPerWeek: 7,
      weekdays: [1, 2, 3, 4, 5, 6, 7],
    }));
  });

  it('estimates words in words mode only', () => {
    renderPicker({ newWordsPerDay: 5 });

    expect(screen.getByText(/5 new \+ ~12 reviews/)).toBeInTheDocument();
    expect(screen.queryByText(/min a day/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: /time/i }));
    expect(screen.queryByText(/reviews/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/a month/i)).not.toBeInTheDocument();
  });

  it('clears the number on focus so the next keystroke replaces the goal', () => {
    const { valueInput } = renderPicker({ newWordsPerDay: 12 });

    fireEvent.focus(valueInput());
    expect(valueInput()).toHaveValue('');
    expect(valueInput()).toHaveAttribute('placeholder', '12');
    expect(screen.getByRole('button', { name: /save/i })).toBeEnabled();

    fireEvent.blur(valueInput());
    expect(valueInput()).toHaveValue('12');
  });

  it('focuses the number when the pencil is pressed', () => {
    const { valueInput } = renderPicker();

    fireEvent.click(screen.getByRole('button', { name: /edit the number/i }));
    expect(document.activeElement).toBe(valueInput());
  });
});

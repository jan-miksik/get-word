import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/components/I18nProvider';
import { SurveyPromptCard } from '../SurveyPromptCard';
import { SURVEY_DEFINITIONS } from '@/features/learning/surveys/definitions';

const recentChanges = SURVEY_DEFINITIONS.find((s) => s.id === 'recent_changes')!;
const bugCheck = SURVEY_DEFINITIONS.find((s) => s.id === 'bug_check')!;

function renderCard(props: Partial<React.ComponentProps<typeof SurveyPromptCard>> = {}) {
  const onSubmit = props.onSubmit ?? vi.fn();
  const onDismiss = props.onDismiss ?? vi.fn();
  render(
    <I18nProvider language="en">
      <SurveyPromptCard survey={recentChanges} onSubmit={onSubmit} onDismiss={onDismiss} {...props} />
    </I18nProvider>,
  );
  return { onSubmit, onDismiss };
}

describe('SurveyPromptCard', () => {
  it('renders the question and every option as a radio', () => {
    renderCard();
    expect(screen.getByText(/how do you like the recent changes/i)).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(recentChanges.options.length);
  });

  it('disables submit until an option is picked, then submits with no free text', () => {
    const { onSubmit } = renderCard();
    const submit = screen.getByRole('button', { name: /send/i });
    expect(submit).toBeDisabled();

    fireEvent.click(screen.getAllByRole('radio')[0]);
    expect(submit).not.toBeDisabled();

    fireEvent.click(submit);
    expect(onSubmit).toHaveBeenCalledWith('great', null);
  });

  it('reveals a free-text box only for an option that calls for one, and allows an empty submit', () => {
    const { onSubmit } = renderCard();
    const radios = screen.getAllByRole('radio');
    // "other" is the last option and the one that reveals free text.
    fireEvent.click(radios[radios.length - 1]);

    const textarea = screen.getByRole('textbox');
    expect(textarea).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /send/i }));
    expect(onSubmit).toHaveBeenCalledWith('other', null);
  });

  it('passes typed free text through on submit', () => {
    const { onSubmit } = renderCard();
    const radios = screen.getAllByRole('radio');
    fireEvent.click(radios[radios.length - 1]);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '  more like this  ' } });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    expect(onSubmit).toHaveBeenCalledWith('other', 'more like this');
  });

  it('shows the free-text intro line only when the survey option defines one', () => {
    render(
      <I18nProvider language="en">
        <SurveyPromptCard survey={bugCheck} onSubmit={vi.fn()} onDismiss={vi.fn()} />
      </I18nProvider>,
    );
    const radios = screen.getAllByRole('radio');
    fireEvent.click(radios[1]); // "minor_issues" — has a freeTextIntroKey
    expect(screen.getByText(/we.?d love the details/i)).toBeInTheDocument();
  });

  it('calls onDismiss from the close control without requiring an answer', () => {
    const { onDismiss } = renderCard();
    fireEvent.click(screen.getByRole('button', { name: /close survey/i }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

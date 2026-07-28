import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/components/I18nProvider';
import { SelectStep } from '../SelectStep';

const limits = {
  maxItemsPerSession: 30,
  softItemWarningThreshold: 15,
  monthlyUsed: 0,
  monthlyLimit: 60,
  monthlyResetAt: null,
};

describe('SelectStep', () => {
  it('opens a focused manual-entry surface without proposal controls', () => {
    const onAddCustom = vi.fn();
    render(
      <I18nProvider language="en">
        <SelectStep
          mode="manual"
          languageFrom="cs"
          listName="Moje slovíčka — Vietnamština"
          onListNameChange={vi.fn()}
          proposals={[]}
          isSelected={() => false}
          onToggle={vi.fn()}
          onUpdateProposal={vi.fn()}
          onSelectAll={vi.fn()}
          onClearSelection={vi.fn()}
          customItems={[]}
          onAddCustom={onAddCustom}
          onRemoveCustom={vi.fn()}
          categoryName="My words"
          onCategoryNameChange={vi.fn()}
          askVisibility={false}
          isPublic={false}
          onVisibilityChange={vi.fn()}
          limits={limits}
          selectedCount={0}
          overSoftLimit={false}
          atHardCap={false}
          monthlyRemaining={60}
          overMonthlyLimit={false}
          atSelectionLimit={false}
          busy={false}
          onBack={vi.fn()}
          onContinue={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(screen.getByRole('heading', { name: 'Add your own words' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Select all' })).not.toBeInTheDocument();

    const input = screen.getByPlaceholderText('One word or sentence per line');
    expect(input).toHaveFocus();

    fireEvent.change(input, { target: { value: 'káva\nmléko' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(onAddCustom).toHaveBeenCalledWith('káva');
    expect(onAddCustom).toHaveBeenCalledWith('mléko');
  });

  it('offers explicit bulk selection without word and sentence badges', () => {
    const onSelectAll = vi.fn();
    const onClearSelection = vi.fn();
    render(
      <I18nProvider language="en">
        <SelectStep
          languageFrom="cs"
          listName="Moje slovíčka — Vietnamština"
          onListNameChange={vi.fn()}
          proposals={[
            { kind: 'sentence', source: 'generated', text: 'Dám si kávu.', confidence: 0.9 },
            {
              kind: 'word',
              source: 'corpus',
              corpusItemId: 'corpus-1',
              verified: true,
              text: 'káva',
              confidence: 0.8,
            },
          ]}
          isSelected={() => false}
          onToggle={vi.fn()}
          onUpdateProposal={vi.fn()}
          onSelectAll={onSelectAll}
          onClearSelection={onClearSelection}
          customItems={[]}
          onAddCustom={vi.fn()}
          onRemoveCustom={vi.fn()}
          categoryName="Café"
          onCategoryNameChange={vi.fn()}
          askVisibility={false}
          isPublic={false}
          onVisibilityChange={vi.fn()}
          limits={limits}
          selectedCount={0}
          overSoftLimit={false}
          atHardCap={false}
          monthlyRemaining={60}
          overMonthlyLimit={false}
          atSelectionLimit={false}
          busy={false}
          onBack={vi.fn()}
          onContinue={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(screen.queryByText(/^word$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^sentence$/i)).not.toBeInTheDocument();
    // Provenance sits as a quiet badge at the end of the row, not under the text.
    expect(screen.getByText('reused')).toHaveClass('opacity-60');

    fireEvent.click(screen.getByRole('button', { name: 'Select all' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
    expect(onSelectAll).toHaveBeenCalledOnce();
    expect(onClearSelection).toHaveBeenCalledOnce();
  });

  it('blocks continuing when a restored selection exceeds the monthly remainder', () => {
    const onContinue = vi.fn();
    render(
      <I18nProvider language="en">
        <SelectStep
          languageFrom="cs"
          listName="Moje slovíčka — Vietnamština"
          onListNameChange={vi.fn()}
          proposals={[]}
          isSelected={() => false}
          onToggle={vi.fn()}
          onUpdateProposal={vi.fn()}
          onSelectAll={vi.fn()}
          onClearSelection={vi.fn()}
          customItems={[]}
          onAddCustom={vi.fn()}
          onRemoveCustom={vi.fn()}
          categoryName="Café"
          onCategoryNameChange={vi.fn()}
          askVisibility={false}
          isPublic={false}
          onVisibilityChange={vi.fn()}
          limits={{ ...limits, monthlyUsed: 58 }}
          selectedCount={3}
          overSoftLimit={false}
          atHardCap={false}
          monthlyRemaining={2}
          overMonthlyLimit={true}
          atSelectionLimit={true}
          busy={false}
          onBack={vi.fn()}
          onContinue={onContinue}
        />
      </I18nProvider>,
    );

    expect(screen.getByText(/You have 2 new words left this month/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Translate and continue/i })).toBeDisabled();
  });

  it('uses the row as the selection target and keeps editing behind an explicit button', () => {
    const onToggle = vi.fn();
    const onUpdateProposal = vi.fn();
    const proposal = {
      kind: 'word' as const,
      source: 'generated' as const,
      text: 'káva',
      confidence: 0.8,
    };

    render(
      <I18nProvider language="en">
        <SelectStep
          languageFrom="cs"
          listName="Moje slovíčka — Vietnamština"
          onListNameChange={vi.fn()}
          proposals={[proposal]}
          isSelected={() => true}
          onToggle={onToggle}
          onUpdateProposal={onUpdateProposal}
          onSelectAll={vi.fn()}
          onClearSelection={vi.fn()}
          customItems={[]}
          onAddCustom={vi.fn()}
          onRemoveCustom={vi.fn()}
          categoryName="Café"
          onCategoryNameChange={vi.fn()}
          askVisibility={false}
          isPublic={false}
          onVisibilityChange={vi.fn()}
          limits={limits}
          selectedCount={1}
          overSoftLimit={false}
          atHardCap={false}
          monthlyRemaining={60}
          overMonthlyLimit={false}
          atSelectionLimit={false}
          busy={false}
          onBack={vi.fn()}
          onContinue={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(screen.queryByDisplayValue('káva')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: 'káva' }));
    expect(onToggle).toHaveBeenCalledWith(proposal);
    expect(onUpdateProposal).not.toHaveBeenCalled();

    const editButton = screen.getByRole('button', { name: 'Edit: káva' });
    expect(editButton).toHaveClass('sm:opacity-0', 'sm:group-hover:opacity-70');

    fireEvent.click(editButton);
    expect(onToggle).toHaveBeenCalledOnce();

    fireEvent.change(screen.getByDisplayValue('káva'), { target: { value: 'silná káva' } });

    expect(onUpdateProposal).toHaveBeenCalledWith(proposal, 'silná káva');
  });
});

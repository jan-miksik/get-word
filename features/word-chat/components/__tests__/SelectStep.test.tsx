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
  it('opens manual entry on one word at a time, with bulk behind a toggle', () => {
    const onAddCustom = vi.fn();
    render(
      <I18nProvider language="en">
        <SelectStep
          mode="manual"
          listName="Moje slovíčka — Vietnamština"
          languageTo="vi"
          proposals={[]}
          isSelected={() => false}
          onToggle={vi.fn()}
          onUpdateProposal={vi.fn()}
          onSelectAll={vi.fn()}
          onClearSelection={vi.fn()}
          customItems={[]}
          onAddCustom={onAddCustom}
          onRemoveCustom={vi.fn()}
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

    const input = screen.getByPlaceholderText('Type a word or sentence');
    // Arriving here does not open the phone keyboard over the screen.
    expect(input).not.toHaveFocus();
    expect(
      screen.queryByPlaceholderText('One word or sentence per line'),
    ).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: 'káva' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(onAddCustom).toHaveBeenCalledExactlyOnceWith('káva');

    // A prepared batch is still one toggle away, and pastes a line at a time.
    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Add several at once' }));
    const textarea = screen.getByPlaceholderText('One word or sentence per line');
    expect(textarea).toHaveFocus();

    fireEvent.change(textarea, { target: { value: 'mléko\ncukr' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(onAddCustom).toHaveBeenCalledWith('mléko');
    expect(onAddCustom).toHaveBeenCalledWith('cukr');
  });

  it('translates a word that was typed but never added, and hands it over', () => {
    const onContinue = vi.fn();
    const onAddCustom = vi.fn();
    render(
      <I18nProvider language="en">
        <SelectStep
          mode="manual"
          listName="My words"
          languageTo="vi"
          proposals={[]}
          isSelected={() => false}
          onToggle={vi.fn()}
          onUpdateProposal={vi.fn()}
          onSelectAll={vi.fn()}
          onClearSelection={vi.fn()}
          customItems={[]}
          onAddCustom={onAddCustom}
          onRemoveCustom={vi.fn()}
          limits={limits}
          selectedCount={0}
          overSoftLimit={false}
          atHardCap={false}
          monthlyRemaining={60}
          overMonthlyLimit={false}
          atSelectionLimit={false}
          busy={false}
          onContinue={onContinue}
        />
      </I18nProvider>,
    );

    const translate = screen.getByRole('button', { name: 'Translate and continue' });
    expect(translate).toBeDisabled();

    // One character in the field is enough — pressing + first is optional.
    fireEvent.change(screen.getByPlaceholderText('Type a word or sentence'), {
      target: { value: 'káva' },
    });
    expect(translate).toBeEnabled();

    fireEvent.click(translate);
    expect(onAddCustom).not.toHaveBeenCalled();
    expect(onContinue).toHaveBeenCalledExactlyOnceWith(['káva']);
  });

  it('opens the settings from the heading menu instead of a gear of its own', () => {
    const onOpenSettings = vi.fn();
    render(
      <I18nProvider language="en">
        <SelectStep
          mode="manual"
          listName="My words"
          languageTo="vi"
          proposals={[]}
          isSelected={() => false}
          onToggle={vi.fn()}
          onUpdateProposal={vi.fn()}
          onSelectAll={vi.fn()}
          onClearSelection={vi.fn()}
          customItems={[]}
          onAddCustom={vi.fn()}
          onRemoveCustom={vi.fn()}
          limits={limits}
          selectedCount={0}
          overSoftLimit={false}
          atHardCap={false}
          monthlyRemaining={60}
          overMonthlyLimit={false}
          atSelectionLimit={false}
          busy={false}
          onOpenSettings={onOpenSettings}
          onContinue={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(
      screen.queryByRole('button', { name: 'Settings for adding words' }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Settings/ }));
    expect(onOpenSettings).toHaveBeenCalledOnce();
  });

  it('offers the chat as the other way in, and no Back when it is the first step', () => {
    const onStartChat = vi.fn();
    render(
      <I18nProvider language="en">
        <SelectStep
          mode="manual"
          listName="Moje slovíčka — Vietnamština"
          languageTo="vi"
          proposals={[]}
          isSelected={() => false}
          onToggle={vi.fn()}
          onUpdateProposal={vi.fn()}
          onSelectAll={vi.fn()}
          onClearSelection={vi.fn()}
          customItems={[]}
          onAddCustom={vi.fn()}
          onRemoveCustom={vi.fn()}
          limits={limits}
          selectedCount={0}
          overSoftLimit={false}
          atHardCap={false}
          monthlyRemaining={60}
          overMonthlyLimit={false}
          atSelectionLimit={false}
          busy={false}
          onStartChat={onStartChat}
          onContinue={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Suggest words with AI bot' }));
    expect(onStartChat).toHaveBeenCalledOnce();
  });

  it('keeps an over-limit bulk paste intact instead of silently dropping lines', () => {
    const onAddCustom = vi.fn();
    render(
      <I18nProvider language="en">
        <SelectStep
          mode="manual"
          listName="My words"
          languageTo="vi"
          proposals={[]}
          isSelected={() => false}
          onToggle={vi.fn()}
          onUpdateProposal={vi.fn()}
          onSelectAll={vi.fn()}
          onClearSelection={vi.fn()}
          customItems={[]}
          onAddCustom={onAddCustom}
          onRemoveCustom={vi.fn()}
          limits={limits}
          selectedCount={0}
          overSoftLimit={false}
          atHardCap={false}
          monthlyRemaining={60}
          overMonthlyLimit={false}
          atSelectionLimit={false}
          busy={false}
          onContinue={vi.fn()}
        />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Add several at once' }));
    const textarea = screen.getByPlaceholderText('One word or sentence per line');
    const pasted = Array.from({ length: 31 }, (_, index) => `word ${index + 1}`).join('\n');
    fireEvent.change(textarea, { target: { value: pasted } });

    expect(screen.getByText('31 / 30 items in this round')).toBeInTheDocument();
    expect(screen.getByText(/One round can contain at most 30 items/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();

    fireEvent.submit(textarea.closest('form')!);
    expect(onAddCustom).not.toHaveBeenCalled();
    expect(textarea).toHaveValue(pasted);
  });

  it('validates the 200-character limit per pasted line without changing the text', () => {
    const onAddCustom = vi.fn();
    render(
      <I18nProvider language="en">
        <SelectStep
          mode="manual"
          listName="My words"
          languageTo="vi"
          proposals={[]}
          isSelected={() => false}
          onToggle={vi.fn()}
          onUpdateProposal={vi.fn()}
          onSelectAll={vi.fn()}
          onClearSelection={vi.fn()}
          customItems={[]}
          onAddCustom={onAddCustom}
          onRemoveCustom={vi.fn()}
          limits={limits}
          selectedCount={0}
          overSoftLimit={false}
          atHardCap={false}
          monthlyRemaining={60}
          overMonthlyLimit={false}
          atSelectionLimit={false}
          busy={false}
          onContinue={vi.fn()}
        />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Add several at once' }));
    const textarea = screen.getByPlaceholderText('One word or sentence per line');
    const pasted = `short\n${'x'.repeat(201)}`;
    fireEvent.change(textarea, { target: { value: pasted } });

    expect(
      screen.getByText('Line 2 has 201 characters. The maximum is 200.'),
    ).toBeInTheDocument();
    expect(textarea).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();

    fireEvent.submit(textarea.closest('form')!);
    expect(onAddCustom).not.toHaveBeenCalled();
    expect(textarea).toHaveValue(pasted);
  });

  it('offers explicit bulk selection without word and sentence badges', () => {
    const onSelectAll = vi.fn();
    const onClearSelection = vi.fn();
    render(
      <I18nProvider language="en">
        <SelectStep
          listName="Moje slovíčka — Vietnamština"
          languageTo="vi"
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
          listName="Moje slovíčka — Vietnamština"
          languageTo="vi"
          proposals={[]}
          isSelected={() => false}
          onToggle={vi.fn()}
          onUpdateProposal={vi.fn()}
          onSelectAll={vi.fn()}
          onClearSelection={vi.fn()}
          customItems={[]}
          onAddCustom={vi.fn()}
          onRemoveCustom={vi.fn()}
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
          listName="Moje slovíčka — Vietnamština"
          languageTo="vi"
          proposals={[proposal]}
          isSelected={() => true}
          onToggle={onToggle}
          onUpdateProposal={onUpdateProposal}
          onSelectAll={vi.fn()}
          onClearSelection={vi.fn()}
          customItems={[]}
          onAddCustom={vi.fn()}
          onRemoveCustom={vi.fn()}
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

  it('shows a proposed sentence in full, and edits it in a field that wraps', () => {
    // The sentence is the thing being decided on; half of it is not enough to
    // decide with, and it is not enough to edit with either.
    const sentence =
      'Zdá se, že tato položka byla na účtu naúčtována dvakrát, můžete to prosím zkontrolovat?';
    const proposal = {
      kind: 'sentence' as const,
      source: 'generated' as const,
      text: sentence,
      confidence: 0.9,
    };

    render(
      <I18nProvider language="en">
        <SelectStep
          listName="Moje slovíčka — Vietnamština"
          languageTo="vi"
          proposals={[proposal]}
          isSelected={() => true}
          onToggle={vi.fn()}
          onUpdateProposal={vi.fn()}
          onSelectAll={vi.fn()}
          onClearSelection={vi.fn()}
          customItems={[]}
          onAddCustom={vi.fn()}
          onRemoveCustom={vi.fn()}
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

    const text = screen.getByText(sentence);
    expect(text).not.toHaveClass('truncate');
    expect(text).toHaveClass('break-words');

    fireEvent.click(screen.getByRole('button', { name: `Edit: ${sentence}` }));
    expect(screen.getByDisplayValue(sentence).tagName).toBe('TEXTAREA');
  });
  it('keeps sharing a saved list in the heading menu, not beside the field', () => {
    render(
      <I18nProvider language="en">
        <SelectStep
          mode="manual"
          listName="My words"
          languageTo="vi"
          shareList={{
            id: 'list-1',
            ownerId: null,
            name: 'My words',
            description: null,
            languageFrom: 'en',
            languageTo: 'vi',
            isPublic: false,
            isOwner: true,
          }}
          proposals={[]}
          isSelected={() => false}
          onToggle={vi.fn()}
          onUpdateProposal={vi.fn()}
          onSelectAll={vi.fn()}
          onClearSelection={vi.fn()}
          customItems={[]}
          onAddCustom={vi.fn()}
          onRemoveCustom={vi.fn()}
          limits={limits}
          selectedCount={0}
          overSoftLimit={false}
          atHardCap={false}
          monthlyRemaining={60}
          overMonthlyLimit={false}
          atSelectionLimit={false}
          busy={false}
          onContinue={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(screen.queryByText('Share & visibility')).not.toBeInTheDocument();
    expect(screen.queryByText('Add several at once')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    expect(screen.getByRole('menuitem', { name: 'Add several at once' })).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: /Share & visibility/ }),
    ).toBeInTheDocument();
  });

  it('does not offer skipping audio for manually added items', () => {
    render(
      <I18nProvider language="en">
        <SelectStep
          mode="manual"
          listName="My words"
          languageTo="vi"
          proposals={[]}
          isSelected={() => false}
          onToggle={vi.fn()}
          onUpdateProposal={vi.fn()}
          onSelectAll={vi.fn()}
          onClearSelection={vi.fn()}
          customItems={[{ kind: 'word', text: 'coffee' }]}
          onAddCustom={vi.fn()}
          onRemoveCustom={vi.fn()}
          limits={limits}
          selectedCount={1}
          overSoftLimit={false}
          atHardCap={false}
          monthlyRemaining={60}
          overMonthlyLimit={false}
          atSelectionLimit={false}
          busy={false}
          onContinue={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(screen.queryByRole('button', { name: 'Skip audio generation' })).not.toBeInTheDocument();
    expect(screen.getByText('coffee')).toBeInTheDocument();
  });

  it('shows words picked off a photo in the same basket, translation and all', () => {
    const onRemovePretranslated = vi.fn();
    render(
      <I18nProvider language="en">
        <SelectStep
          mode="manual"
          titleInHost
          listName="Moje slovíčka — Vietnamština"
          languageTo="vi"
          proposals={[]}
          isSelected={() => false}
          onToggle={vi.fn()}
          onUpdateProposal={vi.fn()}
          onSelectAll={vi.fn()}
          onClearSelection={vi.fn()}
          customItems={[{ kind: 'word', text: 'káva' }]}
          onAddCustom={vi.fn()}
          onRemoveCustom={vi.fn()}
          pretranslatedItems={[
            { kind: 'word', textKnown: 'stůl', textTarget: 'cái bàn', audioHash: 'abc' },
          ]}
          onRemovePretranslated={onRemovePretranslated}
          limits={limits}
          selectedCount={2}
          overSoftLimit={false}
          atHardCap={false}
          monthlyRemaining={60}
          overMonthlyLimit={false}
          atSelectionLimit={false}
          busy={false}
          onContinue={vi.fn()}
        />
      </I18nProvider>,
    );

    // The screen around this step names it; a second heading would repeat it.
    expect(screen.queryByRole('heading', { name: 'Add your own words' })).not.toBeInTheDocument();

    // Both sides, because both are already written — unlike the typed word,
    // which still has to go through the translator.
    expect(screen.getByText('stůl')).toBeInTheDocument();
    expect(screen.getByText('cái bàn')).toBeInTheDocument();
    expect(screen.getByText('káva')).toBeInTheDocument();

    const removals = screen.getAllByRole('button', { name: 'Remove' });
    fireEvent.click(removals[removals.length - 1]);
    expect(onRemovePretranslated).toHaveBeenCalledExactlyOnceWith('stůl\u0000cái bàn');
  });

  it('can continue with photo-only rows after the translation allowance is spent', () => {
    const onContinue = vi.fn();
    render(
      <I18nProvider language="en">
        <SelectStep
          mode="manual"
          listName="My words"
          languageTo="vi"
          proposals={[]}
          isSelected={() => false}
          onToggle={vi.fn()}
          onUpdateProposal={vi.fn()}
          onSelectAll={vi.fn()}
          onClearSelection={vi.fn()}
          customItems={[]}
          onAddCustom={vi.fn()}
          onRemoveCustom={vi.fn()}
          pretranslatedItems={[
            { kind: 'word', textKnown: 'stůl', textTarget: 'cái bàn', audioHash: 'abc' },
          ]}
          limits={{ ...limits, monthlyUsed: 60 }}
          selectedCount={1}
          translatedSelectionCount={0}
          remainingSelections={0}
          overSoftLimit={false}
          atHardCap={false}
          monthlyRemaining={0}
          overMonthlyLimit={false}
          atSelectionLimit
          busy={false}
          onContinue={onContinue}
        />
      </I18nProvider>,
    );

    const continueButton = screen.getByRole('button', { name: 'Translate and continue' });
    expect(continueButton).toBeEnabled();
    fireEvent.click(continueButton);
    expect(onContinue).toHaveBeenCalledExactlyOnceWith([]);
  });

  it('stands its typing-field entries down while another tab is the one on screen', () => {
    const headerSlot = document.createElement('div');
    document.body.append(headerSlot);

    const { rerender } = render(
      <I18nProvider language="en">
        <SelectStep
          mode="manual"
          titleInHost
          headerSlot={headerSlot}
          listName="Moje slovíčka — Vietnamština"
          languageTo="vi"
          proposals={[]}
          isSelected={() => false}
          onToggle={vi.fn()}
          onUpdateProposal={vi.fn()}
          onSelectAll={vi.fn()}
          onClearSelection={vi.fn()}
          customItems={[]}
          onAddCustom={vi.fn()}
          onRemoveCustom={vi.fn()}
          onOpenSettings={vi.fn()}
          limits={limits}
          selectedCount={0}
          overSoftLimit={false}
          atHardCap={false}
          monthlyRemaining={60}
          overMonthlyLimit={false}
          atSelectionLimit={false}
          busy={false}
          onContinue={vi.fn()}
        />
      </I18nProvider>,
    );

    // The menu lives in the screen header, which every tab shares.
    expect(headerSlot).toContainElement(screen.getByRole('button', { name: 'More options' }));
    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    expect(screen.getByRole('menuitem', { name: 'Add several at once' })).toBeInTheDocument();

    // The photo tab takes over: this step stays mounted with its draft, but its
    // entry field is not on screen, so pasting a batch into it is not on offer.
    rerender(
      <I18nProvider language="en">
        <SelectStep
          mode="manual"
          titleInHost
          headerSlot={headerSlot}
          offScreen
          listName="Moje slovíčka — Vietnamština"
          languageTo="vi"
          proposals={[]}
          isSelected={() => false}
          onToggle={vi.fn()}
          onUpdateProposal={vi.fn()}
          onSelectAll={vi.fn()}
          onClearSelection={vi.fn()}
          customItems={[]}
          onAddCustom={vi.fn()}
          onRemoveCustom={vi.fn()}
          onOpenSettings={vi.fn()}
          limits={limits}
          selectedCount={0}
          overSoftLimit={false}
          atHardCap={false}
          monthlyRemaining={60}
          overMonthlyLimit={false}
          atSelectionLimit={false}
          busy={false}
          onContinue={vi.fn()}
        />
      </I18nProvider>,
    );

    // The menu is the same one, still open — only what it offers has changed.
    expect(screen.getByRole('menuitem', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Add several at once' })).not.toBeInTheDocument();

    headerSlot.remove();
  });
});

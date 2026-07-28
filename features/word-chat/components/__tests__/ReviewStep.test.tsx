import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/components/I18nProvider';
import { ReviewStep } from '../ReviewStep';

describe('ReviewStep', () => {
  it('shows model cost, compact controls, and no manual regenerate button', () => {
    const onRemove = vi.fn();
    const onEnsureAudio = vi.fn();
    render(
      <I18nProvider language="en">
        <ReviewStep
          listName="Moje slovíčka — Vietnamština"
        categoryName="Rodina"
        items={[
            {
              kind: 'sentence',
              textKnown: 'Počkejte pět minut.',
              textTarget: 'Please wait five minutes.',
              audioAssetId: null,
            },
          ]}
          warningsByKnown={{}}
          translationDiagnostics={{
            model: 'deepseek/deepseek-v4-flash',
            inputTokens: 120,
            outputTokens: 40,
            estimatedCostUsd: 0.000018,
          }}
          isPublic={false}
          busy={false}
          onUpdate={vi.fn()}
          onRemove={onRemove}
          onEnsureAudio={onEnsureAudio}
          onBack={vi.fn()}
          onSave={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(screen.getByText(/deepseek\/deepseek-v4-flash/)).toHaveTextContent('$0.000018');
    expect(screen.queryByRole('button', { name: /Regenerate audio/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onRemove).toHaveBeenCalledWith(0);

    fireEvent.blur(screen.getByDisplayValue('Please wait five minutes.'));
    expect(onEnsureAudio).toHaveBeenCalledWith(0);
  });

  it('plays a voiced row by content hash, not by asset id', async () => {
    // `/api/audio/[hash]` resolves content hashes only — handing it the asset id
    // returns 404, which is exactly how every clip in Review went silent.
    const played: string[] = [];
    vi.stubGlobal(
      'Audio',
      class {
        set src(value: string) {
          played.push(value);
        }
        play() {
          return Promise.resolve();
        }
      },
    );

    render(
      <I18nProvider language="en">
        <ReviewStep
          listName="Moje slovíčka — Vietnamština"
        categoryName="Rodina"
        items={[
            {
              kind: 'word',
              textKnown: 'karta',
              textTarget: 'card',
              audioAssetId: 'asset-1',
              audioHash: 'hash-1',
            },
          ]}
          warningsByKnown={{}}
          translationDiagnostics={null}
          isPublic={false}
          busy={false}
          onUpdate={vi.fn()}
          onRemove={vi.fn()}
          onEnsureAudio={vi.fn()}
          onBack={vi.fn()}
          onSave={vi.fn()}
        />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    // Resolving the source consults the local clip cache first, so the src is
    // set a microtask later; jsdom has no IndexedDB, hence the proxy URL.
    await waitFor(() => expect(played).toEqual(['/api/audio/hash-1']));

    vi.unstubAllGlobals();
  });

  it('keeps a sound control in place while audio is prepared', () => {
    const props = {
      listName: 'My words',
      categoryName: 'Coffee',
      warningsByKnown: {},
      translationDiagnostics: null,
      isPublic: false,
      busy: false,
      onUpdate: vi.fn(),
      onRemove: vi.fn(),
      onEnsureAudio: vi.fn(),
      onBack: vi.fn(),
      onSave: vi.fn(),
    };
    const pendingItem = {
      kind: 'word' as const,
      textKnown: 'káva',
      textTarget: 'coffee',
      audioStatus: 'pending' as const,
      audioAssetId: null,
      audioHash: null,
    };
    const { rerender } = render(
      <I18nProvider language="en">
        <ReviewStep {...props} items={[pendingItem]} />
      </I18nProvider>,
    );

    expect(screen.getByRole('status', { name: 'Preparing audio…' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Play' })).not.toBeInTheDocument();

    rerender(
      <I18nProvider language="en">
        <ReviewStep
          {...props}
          items={[
            {
              ...pendingItem,
              audioStatus: 'ready',
              audioAssetId: 'asset-1',
              audioHash: 'hash-1',
            },
          ]}
        />
      </I18nProvider>,
    );

    expect(screen.queryByRole('status', { name: 'Preparing audio…' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
  });

  it('copies the whole set as source/translation pairs', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    render(
      <I18nProvider language="en">
        <ReviewStep
          listName="Moje slovíčka — Vietnamština"
        categoryName="Rodina"
        items={[
            { kind: 'sentence', textKnown: 'Dobrý den.', textTarget: 'Good day.' },
            { kind: 'word', textKnown: 'karta', textTarget: 'card' },
          ]}
          warningsByKnown={{}}
          translationDiagnostics={null}
          isPublic={false}
          busy={false}
          onUpdate={vi.fn()}
          onRemove={vi.fn()}
          onEnsureAudio={vi.fn()}
          onBack={vi.fn()}
          onSave={vi.fn()}
        />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Copy all' }));

    // Tab-separated so it pastes into a spreadsheet as two columns.
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith('Dobrý den.\tGood day.\nkarta\tcard'),
    );
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();

    vi.unstubAllGlobals();
  });
});

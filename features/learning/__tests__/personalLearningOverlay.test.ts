import { describe, expect, it } from 'vitest';
import { applyPersonalLearningOverlay } from '@/features/shared/sync/personal-overlay';

const lists = [
  {
    id: 'public-a',
    languageFrom: 'cs',
    languageTo: 'vi',
    isPersonal: false,
  },
  {
    id: 'public-b',
    languageFrom: 'cs',
    languageTo: 'vi',
    isPersonal: false,
  },
  {
    id: 'personal',
    languageFrom: 'cs',
    languageTo: 'vi',
    isPersonal: true,
    isOwnedPersonal: true,
  },
];

function item(
  id: string,
  listId: string,
  textKnown: string,
  textTarget: string,
  takeoverSourceItemId: string | null = null,
) {
  return {
    id,
    listId,
    textKnown,
    textTarget,
    ignoreCase: false,
    takeoverSourceItemId,
  };
}

describe('applyPersonalLearningOverlay', () => {
  it('dynamically hides every non-personal exact content-key copy', async () => {
    const visible = await applyPersonalLearningOverlay(
      [
        item('public-1', 'public-a', 'káva', 'cà phê'),
        item('public-2', 'public-b', 'káva', 'cà phê'),
        item('mine', 'personal', 'káva', 'cà phê'),
      ],
      lists,
    );

    expect(visible.map((row) => row.id)).toEqual(['mine']);
    expect(visible[0].takeoverSourceItemId).toBeNull();
  });

  it('lets the public card return after a generic personal copy is edited', async () => {
    const visible = await applyPersonalLearningOverlay(
      [
        item('public-1', 'public-a', 'káva', 'cà phê'),
        item('mine', 'personal', 'káva se smetanou', 'cà phê với kem'),
      ],
      lists,
    );

    expect(visible.map((row) => row.id)).toEqual(['public-1', 'mine']);
  });

  it('keeps an explicit takeover source hidden after personal content changes', async () => {
    const visible = await applyPersonalLearningOverlay(
      [
        item('public-1', 'public-a', 'káva', 'cà phê'),
        item(
          'mine',
          'personal',
          'káva se smetanou',
          'cà phê với kem',
          'public-1',
        ),
      ],
      lists,
    );

    expect(visible.map((row) => row.id)).toEqual(['mine']);
  });

  it('shows the source again when the personal copy is removed', async () => {
    const visible = await applyPersonalLearningOverlay(
      [item('public-1', 'public-a', 'káva', 'cà phê')],
      lists,
    );

    expect(visible.map((row) => row.id)).toEqual(['public-1']);
  });
});

'use client';

import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';

import { useI18n } from '@/components/I18nProvider';
import { noTranslateProps } from '@/lib/i18n/no-translate';
import type { NormalizedWord } from '@/lib/words';
import type { LearningRole } from '@/features/learning/state/learningRole';
import { getWordAudioSrcsBySide, getWordTextBySide, knownSideForRole, learningSideForRole } from './types';
import { CardAudioButton } from '../card-audio/CardAudioButton';
import { useCardAudio } from '../card-audio/useCardAudio';
import { SuccessMarkSlot } from './SuccessMark';
import { StageBadge } from '../StageBadge';
import { CardTopControls } from '../CardTopControls';
import { ContinueButton, studyActionClasses } from '../ContinueButton';
import type { SimilarityBand } from '@/features/learning/minigames/similarity';

export type AssemblyOutcome = 'known' | 'unknown';

type Tile = { id: string; value: string };

function seededShuffle<T>(items: T[], seed: string): T[] {
  const output = [...items];
  let state = 0;
  for (const character of seed) state = ((state << 5) - state + character.charCodeAt(0)) | 0;
  for (let index = output.length - 1; index > 0; index -= 1) {
    state = Math.imul(state ^ (state >>> 16), 0x45d9f3b) | 0;
    const swap = Math.abs(state) % (index + 1);
    [output[index], output[swap]] = [output[swap], output[index]];
  }
  return output;
}

const FLIP_DURATION_MS = 220;
const FLIP_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';
/** How far a pointer has to travel before a tap on a tile becomes a drag. */
const DRAG_THRESHOLD_PX = 5;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Slides every tile from wherever it was to wherever it now is.
 *
 * The tray and the bank are ordinary flow rows, so picking a tile, taking it
 * back or dragging it past a neighbour is a reflow the browser paints in one
 * frame. Recording each tile's box before that paint and animating the
 * difference away afterwards turns all of those jumps into movement, and none
 * of the layout has to know it is being animated.
 *
 * The tile under the finger is left alone — it is already following the
 * pointer. Its box is still recorded, which is what makes the release animate
 * from where the learner let go rather than snapping.
 */
function useTileFlip(draggingId: { current: string | null }) {
  const nodes = useRef(new Map<string, HTMLElement>());
  const boxes = useRef(new Map<string, DOMRect>());

  useLayoutEffect(() => {
    const animated = !prefersReducedMotion();
    for (const [id, node] of nodes.current) {
      if (!node.isConnected) continue;
      const next = node.getBoundingClientRect();
      const previous = boxes.current.get(id);
      boxes.current.set(id, next);
      if (!previous || !animated || id === draggingId.current) continue;
      const dx = previous.left - next.left;
      const dy = previous.top - next.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      if (typeof node.animate !== 'function') continue;
      node.animate(
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }],
        { duration: FLIP_DURATION_MS, easing: FLIP_EASING },
      );
    }
  });

  const registerTile = useCallback(
    (id: string) => (node: HTMLElement | null) => {
      // Never deleted on unmount: a tile always exists somewhere (bank or
      // tray), and every render re-registers the live node, so an entry can
      // only ever be replaced — not orphaned.
      if (node) nodes.current.set(id, node);
    },
    [],
  );

  return { registerTile, nodes };
}

const TILE_SHAPE = [
  'inline-flex h-12 select-none items-center justify-center rounded-2xl border-[1.5px]',
  'px-3 text-lg font-bold leading-none sm:text-xl',
  'transition-[background-color,border-color,color,box-shadow,transform] duration-200',
].join(' ');

/** Single letters need a floor width, or the tray turns into a ragged comb. */
const LETTER_TILE_WIDTH = 'min-w-[3rem]';
const WORD_TILE_WIDTH = 'min-w-[3.5rem]';

/**
 * Every tile in a round is exactly as wide as the widest part the round holds.
 *
 * Not a tidiness choice. With ragged widths the tray's slots shift whenever the
 * order changes, so a drag would be chasing a target moving under it — the
 * reordering has to be able to trust that slot *i* is always in the same place.
 * The width comes from an invisible stack of every part rather than from
 * measuring, so it is settled before the first paint and never reflows.
 */
function TileLabel({ value, parts }: { value: string; parts: readonly string[] }) {
  return (
    <span className="relative grid">
      <span aria-hidden="true" className="invisible grid whitespace-nowrap">
        {parts.map((part, index) => (
          <span key={`${part}-${index}`} className="[grid-area:1/1]">{part}</span>
        ))}
      </span>
      <span className="absolute inset-0 flex items-center justify-center whitespace-nowrap">
        {value}
      </span>
    </span>
  );
}

export function WordAssemblyGame({
  word,
  role,
  variant,
  answerParts,
  distractorParts,
  difficultyBand,
  stageIndex,
  onOutcome,
  onAnswered,
}: {
  word: NormalizedWord;
  role: LearningRole;
  variant: string;
  answerParts: string[];
  distractorParts: string[];
  difficultyBand?: SimilarityBand;
  stageIndex?: number;
  /** Fires on the continue tap; the SR stage moves when the card advances. */
  onOutcome: (outcome: AssemblyOutcome) => void;
  /** Fires the moment the assembly is checked, so progress counts from there. */
  onAnswered?: () => void;
}) {
  const { t } = useI18n();
  const { play } = useCardAudio();
  const [placed, setPlaced] = useState<string[]>([]);
  const [outcome, setOutcome] = useState<AssemblyOutcome | null>(null);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null);

  const isLetters = variant.startsWith('letters');
  const joiner = isLetters ? '' : ' ';
  const tiles = useMemo<Tile[]>(() => seededShuffle([
    ...answerParts.map((value, index) => ({ id: `correct-${index}`, value })),
    ...distractorParts.map((value, index) => ({ id: `extra-${index}`, value })),
  ], `${word.id}:${variant}`), [answerParts, distractorParts, variant, word.id]);

  const byId = useMemo(() => new Map(tiles.map((tile) => [tile.id, tile])), [tiles]);
  const placedTiles = placed.map((id) => byId.get(id)).filter(Boolean) as Tile[];
  const bankTiles = tiles.filter((tile) => !placed.includes(tile.id));
  const isFull = placed.length === answerParts.length;

  const draggingId = useRef<string | null>(null);
  const pointerStart = useRef({ x: 0, y: 0 });
  const pressedId = useRef<string | null>(null);
  const suppressClick = useRef(false);
  const { registerTile, nodes } = useTileFlip(draggingId);

  // The target phrase, which is what the learner was assembling — the same clip
  // the reveal and typing cards offer once their answer is out in the open.
  const answerAudioSrcs = getWordAudioSrcsBySide(word, learningSideForRole(role));

  const choose = (tile: Tile) => {
    if (outcome || placed.includes(tile.id) || isFull) return;
    setPlaced([...placed, tile.id]);
  };

  const takeBack = (id: string) => {
    if (outcome) return;
    setPlaced(placed.filter((placedId) => placedId !== id));
  };

  const check = () => {
    if (outcome || !isFull) return;
    const assembled = placedTiles.map((tile) => tile.value.toLocaleLowerCase());
    // Compared by text, not by tile identity: a repeated letter is two
    // interchangeable tiles, and putting the second one first still spells the
    // word the learner was asked for.
    const isCorrect = assembled.every(
      (value, index) => value === answerParts[index].toLocaleLowerCase(),
    );
    setOutcome(isCorrect ? 'known' : 'unknown');
    onAnswered?.();
  };

  /**
   * Everything the gesture needs, measured once when it starts.
   *
   * Reading the tiles again on every move was what made the drag unreliable:
   * mid-flight slide animations report the box a tile is *passing through*, and
   * the dragged tile's own offset was being derived from a rect its own
   * transform had produced, so the reading fed itself. The slots are a fixed
   * grid — every tile in a round is the same width — so one snapshot stays
   * true for the whole gesture, and each move is then pure arithmetic on it.
   */
  const gesture = useRef<{
    id: string;
    fromIndex: number;
    order: string[];
    centres: { x: number; y: number }[];
    origin: { x: number; y: number };
  } | null>(null);

  const beginDrag = (id: string, pointer: { x: number; y: number }): boolean => {
    const order = [...placed];
    const fromIndex = order.indexOf(id);
    if (fromIndex < 0) return false;
    const centres: { x: number; y: number }[] = [];
    for (const placedId of order) {
      const node = nodes.current.get(placedId);
      if (!node) return false;
      // A tile still sliding into place would otherwise be measured in flight.
      if (typeof node.getAnimations === 'function') {
        for (const animation of node.getAnimations()) animation.finish();
      }
      const rect = node.getBoundingClientRect();
      centres.push({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
    }
    gesture.current = { id, fromIndex, order, centres, origin: pointer };
    draggingId.current = id;
    suppressClick.current = true;
    return true;
  };

  const onTilePointerDown = (event: ReactPointerEvent<HTMLElement>, id: string) => {
    if (outcome || event.button !== 0) return;
    pointerStart.current = { x: event.clientX, y: event.clientY };
    pressedId.current = id;
    suppressClick.current = false;
    // Capture keeps the moves coming once the finger leaves the tile it
    // started on, which it does immediately. It is an optimisation, not the
    // gesture's state: a browser that refuses it still gets a working drag.
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* the pointer is already gone; the press simply becomes a tap */
    }
  };

  const onTilePointerMove = (event: ReactPointerEvent<HTMLElement>, id: string) => {
    if (outcome || pressedId.current !== id) return;
    const pointer = { x: event.clientX, y: event.clientY };
    if (draggingId.current !== id) {
      const travelled = Math.hypot(
        pointer.x - pointerStart.current.x,
        pointer.y - pointerStart.current.y,
      );
      if (travelled < DRAG_THRESHOLD_PX) return;
      // Anchored to where the press landed rather than to where the threshold
      // was crossed, so the tile travels exactly as far as the finger does.
      // It catches up those few pixels the moment the drag begins.
      if (!beginDrag(id, pointerStart.current)) return;
    }
    const snapshot = gesture.current;
    if (!snapshot) return;
    event.stopPropagation();

    const { centres, fromIndex, order, origin } = snapshot;
    // Where the tile is being held, in the coordinates the snapshot was taken in.
    const held = {
      x: centres[fromIndex].x + (pointer.x - origin.x),
      y: centres[fromIndex].y + (pointer.y - origin.y),
    };

    let toIndex = 0;
    let nearest = Infinity;
    centres.forEach((centre, index) => {
      const distance = Math.hypot(held.x - centre.x, held.y - centre.y);
      if (distance < nearest) {
        nearest = distance;
        toIndex = index;
      }
    });

    // Always derived from the snapshot's order rather than from the last render,
    // so a burst of moves inside one React batch cannot compound into a shuffle.
    const next = order.filter((placedId) => placedId !== id);
    next.splice(toIndex, 0, id);
    setPlaced(next);
    setDrag({ id, x: held.x - centres[toIndex].x, y: held.y - centres[toIndex].y });
  };

  const endDrag = (event: ReactPointerEvent<HTMLElement>, id: string) => {
    if (pressedId.current === id) pressedId.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* never captured, or already released */
    }
    if (draggingId.current !== id) return;
    // Cleared before the re-render so the flip effect adopts the tile again and
    // animates it from where it was released down into its slot.
    draggingId.current = null;
    gesture.current = null;
    setDrag(null);
  };

  /** Arrow keys move a focused tile, so reordering is not drag-only. */
  const onTileKeyDown = (event: ReactKeyboardEvent<HTMLElement>, id: string) => {
    if (outcome) return;
    const direction = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
    if (direction === 0) return;
    const index = placed.indexOf(id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= placed.length) return;
    event.preventDefault();
    const next = [...placed];
    [next[index], next[target]] = [next[target], next[index]];
    setPlaced(next);
  };

  const emptySlots = Math.max(0, answerParts.length - placed.length);
  const tileWidth = isLetters ? LETTER_TILE_WIDTH : WORD_TILE_WIDTH;
  const partValues = tiles.map((tile) => tile.value);

  return (
    <article className="study-ink-scope relative mx-auto flex h-full w-full max-w-2xl flex-col items-center justify-center gap-6 px-3 py-6 text-center">
      <CardTopControls>
        <StageBadge stageIndex={stageIndex} difficultyBand={difficultyBand} />
      </CardTopControls>
      <SuccessMarkSlot show={outcome === 'known'} label={t('game.correct')} rollKey={word.id} />
      <div className="flex flex-col items-center gap-3">
        <p className="m-0 text-xs font-bold uppercase tracking-[0.12em] text-text-soft">
          {t('game.assemble')}
        </p>
        <div {...noTranslateProps('text-4xl font-extrabold leading-none text-text sm:text-5xl')}>
          {getWordTextBySide(word, knownSideForRole(role))}
        </div>
      </div>

      {/* The tray keeps one slot per part from the first frame, so the card
          never reflows around the answer as it is built and the whole round
          stays centred on the word it is about. */}
      <div
        className={`mx-auto flex min-h-[4.5rem] max-w-full flex-wrap items-center justify-center gap-2 rounded-3xl border-2 border-dashed px-3 py-3 transition-colors duration-300 ${
          outcome === 'unknown'
            ? 'border-[#B91C1C]/50 bg-[#FCE7E5]/40 motion-safe:animate-[game-shake_350ms_ease]'
            : outcome === 'known'
              ? 'border-[#187A43]/50 bg-[#E3F3E7]/40'
              : 'border-[#BBAE98]/60 bg-[#FFF8E8]/35'
        }`}
        aria-label={t('game.assembledAnswer')}
      >
        {placedTiles.map((tile, index) => {
          const dragging = drag?.id === tile.id;
          return (
            <button
              key={tile.id}
              ref={registerTile(tile.id)}
              type="button"
              disabled={Boolean(outcome)}
              onPointerDown={(event) => onTilePointerDown(event, tile.id)}
              onPointerMove={(event) => onTilePointerMove(event, tile.id)}
              onPointerUp={(event) => endDrag(event, tile.id)}
              onPointerCancel={(event) => endDrag(event, tile.id)}
              onKeyDown={(event) => onTileKeyDown(event, tile.id)}
              onClick={() => {
                if (suppressClick.current) {
                  suppressClick.current = false;
                  return;
                }
                takeBack(tile.id);
              }}
              style={{
                transform: dragging ? `translate(${drag.x}px, ${drag.y}px) scale(1.06)` : undefined,
                // The lifted tile must not lag behind the pointer, and the
                // graded tiles colour in one after another rather than all at
                // once. Both written longhand: mixing `transition` with
                // `transitionDelay` across renders makes React complain.
                transitionProperty: dragging ? 'none' : undefined,
                transitionDelay: !dragging && outcome ? `${index * 45}ms` : undefined,
              }}
              {...noTranslateProps(
                [
                  TILE_SHAPE,
                  tileWidth,
                  'touch-none disabled:cursor-default',
                  dragging ? 'z-30 cursor-grabbing shadow-[0_10px_18px_rgba(42,34,24,0.28)]' : 'cursor-grab',
                  outcome === 'known'
                    ? 'border-[#187A43] bg-[#E3F3E7] text-[#145B33] shadow-[0_3px_0_#A9D3B6]'
                    : outcome === 'unknown'
                      ? 'border-[#B91C1C] bg-[#FCE7E5] text-[#8F1515] shadow-[0_3px_0_#E4AAA6]'
                      : dragging
                        ? 'border-[#1E6FA8] bg-[#E4EEF6] text-[#17608F]'
                        : 'border-[#1E6FA8] bg-[#E4EEF6] text-[#17608F] shadow-[0_3px_0_#B5CFE4]',
                ].join(' '),
              )}
            >
              <TileLabel value={tile.value} parts={partValues} />
            </button>
          );
        })}
        {Array.from({ length: emptySlots }, (_, index) => (
          <span
            key={`slot-${index}`}
            aria-hidden="true"
            className={`inline-flex h-12 items-center justify-center rounded-2xl border-2 border-dashed px-3 ${tileWidth} ${
              index === 0 && !outcome
                ? 'border-[#1E6FA8]/45 motion-safe:animate-[assembly-slot-wait_1.9s_ease-in-out_infinite]'
                : 'border-[#BBAE98]/55'
            }`}
          >
            {/* Sized like a tile, so the slot a tile is going to land in is
                exactly the shape of the tile that will land there. */}
            <TileLabel value="" parts={partValues} />
          </span>
        ))}
      </div>

      <div className="flex flex-wrap justify-center gap-2">
        {bankTiles.map((tile, index) => (
          <button
            key={tile.id}
            ref={registerTile(tile.id)}
            type="button"
            disabled={Boolean(outcome) || isFull}
            style={{ animationDelay: `${index * 45}ms` }}
            {...noTranslateProps(
              [
                TILE_SHAPE,
                tileWidth,
                'border-[#BBAE98] bg-[#FFF8E8] text-[#2A2218] shadow-[0_3px_0_#D8C9AF]',
                'motion-safe:animate-[deck-enter-rise_0.4s_ease-out_both]',
                'enabled:hover:-translate-y-0.5 enabled:hover:border-[#1E6FA8] enabled:hover:shadow-[0_5px_0_#C7B89E]',
                'enabled:active:translate-y-[2px] enabled:active:shadow-none',
                'disabled:cursor-default disabled:opacity-40 disabled:shadow-none',
              ].join(' '),
            )}
            onClick={() => choose(tile)}
          >
            <TileLabel value={tile.value} parts={partValues} />
          </button>
        ))}
      </div>

      {!outcome && (
        <button
          type="button"
          onClick={check}
          disabled={!isFull}
          className={`${studyActionClasses('solid')} max-w-[22rem]`}
        >
          <span>{t('game.check')}</span>
        </button>
      )}
      {outcome && (
        <div className="relative flex w-full max-w-[22rem] flex-col items-center gap-3">
          {outcome === 'unknown' && (
            <span {...noTranslateProps('text-sm font-bold text-rose-700')}>
              {`✗ ${answerParts.join(joiner)}`}
            </span>
          )}
          {/* Hearing the phrase you just built is the point of building it, so
              the answer stays playable until the card is dismissed. It floats
              above the action at the same bottom-right offset as the speaker
              on a regular card; `lg` also gives it that card's 64px target. */}
          {answerAudioSrcs.length > 0 && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14">
              <CardAudioButton
                size="lg"
                className="pointer-events-auto absolute -top-[4.5rem] right-0 z-10"
                onPlay={() => void play(answerAudioSrcs)}
              />
            </div>
          )}
          <ContinueButton
            variant="solid"
            onClick={() => onOutcome(outcome)}
          />
        </div>
      )}
    </article>
  );
}

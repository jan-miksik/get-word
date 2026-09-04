'use client';

import {
  useCallback,
  useEffect,
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
import { SoundToggle } from '../card-audio/SoundToggle';
import { useCardAudio } from '../card-audio/useCardAudio';
import { useCardSound } from '../card-audio/cardSound';
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
/** Comfortably past the tiles' own 200ms transform transition. */
const DROP_SETTLE_MS = 260;

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
 * The tray and the bank are ordinary flow rows, so picking a tile or taking it
 * back is a reflow the browser paints in one frame. Recording each tile's box
 * before that paint and animating the difference away afterwards turns those
 * jumps into movement. Pointer reordering is deliberately frozen out of this
 * hook; it owns a stable slot snapshot until release.
 */
function useTileFlip(
  freezeFlipRef: { current: boolean },
  skipNextFlipRef: { current: boolean },
) {
  const nodes = useRef(new Map<string, HTMLElement>());
  const boxes = useRef(new Map<string, DOMRect>());

  useLayoutEffect(() => {
    // A drag owns every tray transform until release. Measuring or animating
    // those transformed boxes would feed an in-flight offset back into the next
    // pointer move, which is how the neighbouring tiles used to shoot away.
    if (freezeFlipRef.current) return;

    const animated = !prefersReducedMotion();
    const skipAnimation = skipNextFlipRef.current;
    skipNextFlipRef.current = false;
    for (const [id, node] of nodes.current) {
      if (!node.isConnected) continue;
      const next = node.getBoundingClientRect();
      const previous = boxes.current.get(id);
      boxes.current.set(id, next);
      if (!previous || !animated || skipAnimation) continue;
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
  const { play, playAuto } = useCardAudio();
  const { soundEnabled, toggleSound } = useCardSound();
  const [placed, setPlaced] = useState<string[]>([]);
  const [outcome, setOutcome] = useState<AssemblyOutcome | null>(null);
  /**
   * Per-slot verdict, in tray order, recorded at the check.
   *
   * A wrong assembly used to turn the whole tray red, which says only "not
   * that" — the learner still has to diff their own word against the answer
   * below. Marking just the parts that are out of place leaves everything they
   * got right standing, so the mistake is the thing that stands out.
   */
  const [slotVerdicts, setSlotVerdicts] = useState<boolean[]>([]);
  /**
   * A drop is walked through in phases rather than in one commit, because a
   * transition may only ever be started from a style that already declares it.
   *
   * `active`   — under the pointer, transforms applied with transitions off.
   * `landing`  — the frame the new order is committed. Every transform changes
   *              to match the new flow slots, so all of them must be applied
   *              instantly; a transition here would run from the slot the tile
   *              has *already* moved into and drag it a whole slot sideways.
   * `arming`   — transitions switched back on with nothing else changing, so
   *              nothing animates but the next frame can.
   * `settling` — the offset released, gliding into the committed slot.
   */
  const [drag, setDrag] = useState<{
    id: string;
    x: number;
    y: number;
    phase: 'active' | 'landing' | 'arming' | 'settling';
    neighbourOffsets: Record<string, { x: number; y: number }>;
  } | null>(null);

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
  const freezeFlipRef = useRef(false);
  const skipNextFlipRef = useRef(false);
  const pointerStart = useRef({ x: 0, y: 0 });
  const pressedId = useRef<string | null>(null);
  const activePointer = useRef<number | null>(null);
  /**
   * A drop fires a click on whatever the pointer was released over, which is
   * rarely the tile that was dragged and never a tap the learner meant. It is
   * swallowed once, and dropped again at the next press in case it never came.
   */
  const suppressClick = useRef(false);
  const [pressed, setPressed] = useState<string | null>(null);
  const { registerTile, nodes } = useTileFlip(freezeFlipRef, skipNextFlipRef);

  // The gesture runs off window listeners, which outlive the render that armed
  // them, so what they read has to come from refs rather than from a closure.
  const placedRef = useRef(placed);
  const outcomeRef = useRef(outcome);

  // The target phrase, which is what the learner was assembling — the same clip
  // the reveal and typing cards offer once their answer is out in the open.
  const answerAudioSrcs = getWordAudioSrcsBySide(word, learningSideForRole(role));

  /** True for the one click a finished drag leaves behind. */
  const isDragFallout = () => {
    if (!suppressClick.current) return false;
    suppressClick.current = false;
    return true;
  };

  const choose = (tile: Tile) => {
    if (isDragFallout() || outcome || placed.includes(tile.id) || isFull) return;
    setPlaced([...placed, tile.id]);
  };

  const takeBack = (id: string) => {
    if (isDragFallout() || outcome) return;
    setPlaced(placed.filter((placedId) => placedId !== id));
  };

  const check = () => {
    if (outcome || !isFull) return;
    // Compared by text, not by tile identity: a repeated letter is two
    // interchangeable tiles, and putting the second one first still spells the
    // word the learner was asked for.
    const verdicts = placedTiles.map(
      (tile, index) => tile.value.toLocaleLowerCase() === answerParts[index].toLocaleLowerCase(),
    );
    const isCorrect = verdicts.every(Boolean);
    setSlotVerdicts(verdicts);
    setOutcome(isCorrect ? 'known' : 'unknown');
    // The point of the round is the phrase, so it is spoken the moment the
    // answer is out in the open — right or wrong, since a misspelt attempt is
    // exactly when hearing the real thing helps. The speaker beside Continue
    // stays for a second listen.
    if (soundEnabled) void playAuto(answerAudioSrcs);
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
    toIndex: number;
    order: string[];
    centres: { x: number; y: number }[];
    origin: { x: number; y: number };
    held: { x: number; y: number };
  } | null>(null);

  const beginDrag = (id: string, pointer: { x: number; y: number }): boolean => {
    const order = [...placedRef.current];
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
    gesture.current = {
      id,
      fromIndex,
      toIndex: fromIndex,
      order,
      centres,
      origin: pointer,
      held: centres[fromIndex],
    };
    draggingId.current = id;
    freezeFlipRef.current = true;
    return true;
  };

  const onTilePointerDown = (event: ReactPointerEvent<HTMLElement>, id: string) => {
    if (outcome || event.button !== 0) return;
    // A press whose release never arrived — the browser can drop one when the
    // tab is hidden mid-gesture — must not leave the tray unable to be touched
    // again, so a new press always takes the gesture over.
    if (draggingId.current) {
      draggingId.current = null;
      freezeFlipRef.current = false;
      gesture.current = null;
      setDrag(null);
    }
    pointerStart.current = { x: event.clientX, y: event.clientY };
    pressedId.current = id;
    activePointer.current = event.pointerId;
    suppressClick.current = false;
    // Arms the window listeners. The pointer immediately leaves the tile when
    // it crosses a neighbour (or another flex row), so the rest of the gesture
    // cannot depend on events targeted at the pressed element.
    setPressed(id);
  };

  const onDragMove = (event: PointerEvent) => {
    const id = pressedId.current;
    if (!id || outcomeRef.current || event.pointerId !== activePointer.current) return;
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

    const { centres, fromIndex, origin } = snapshot;
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

    // Keep the DOM order fixed while the pointer is down. Reordering it on every
    // move made React reflow the tray while FLIP animations were still running;
    // their transient transforms then became the next move's starting boxes and
    // the offsets compounded. The neighbours are shifted from the one immutable
    // slot snapshot instead, and the order is committed once, on release.
    snapshot.toIndex = toIndex;
    snapshot.held = held;
    const neighbourOffsets: Record<string, { x: number; y: number }> = {};
    snapshot.order.forEach((placedId, originalIndex) => {
      if (placedId === id) return;
      let targetIndex = originalIndex;
      if (
        toIndex < fromIndex &&
        originalIndex >= toIndex &&
        originalIndex < fromIndex
      ) {
        targetIndex = originalIndex + 1;
      } else if (
        toIndex > fromIndex &&
        originalIndex > fromIndex &&
        originalIndex <= toIndex
      ) {
        targetIndex = originalIndex - 1;
      }
      if (targetIndex === originalIndex) return;
      const from = centres[originalIndex];
      const to = centres[targetIndex];
      neighbourOffsets[placedId] = { x: to.x - from.x, y: to.y - from.y };
    });
    setDrag({
      id,
      x: held.x - centres[fromIndex].x,
      y: held.y - centres[fromIndex].y,
      phase: 'active',
      neighbourOffsets,
    });
  };

  const endDrag = (event: PointerEvent) => {
    if (event.pointerId !== activePointer.current) return;
    pressedId.current = null;
    activePointer.current = null;
    setPressed(null);
    if (!draggingId.current) return;
    const snapshot = gesture.current;
    if (!snapshot) return;
    const next = snapshot.order.filter((placedId) => placedId !== snapshot.id);
    next.splice(snapshot.toIndex, 0, snapshot.id);

    // Before release, neighbour transforms already put them at these final
    // slots, and the held tile's offset is measured against the slot it came
    // from. Committing the order re-bases every one of those: the neighbours
    // lose their offsets and the held tile's is re-measured against the slot
    // it landed in. That is the `landing` frame, and it has to be silent —
    // see the phase note on the state above.
    skipNextFlipRef.current = true;
    setPlaced(next);
    setDrag({
      id: snapshot.id,
      x: snapshot.held.x - snapshot.centres[snapshot.toIndex].x,
      y: snapshot.held.y - snapshot.centres[snapshot.toIndex].y,
      phase: 'landing',
      neighbourOffsets: {},
    });
    draggingId.current = null;
    gesture.current = null;
    suppressClick.current = true;
  };

  // Walks a released tile through the phases above, one frame at a time. Each
  // step only ever changes the transform or the transition, never both, so no
  // step can start an animation from a position the tile is no longer at.
  useEffect(() => {
    const phase = drag?.phase;
    if (phase === 'landing' || phase === 'arming') {
      const next = phase === 'landing' ? 'arming' : 'settling';
      const frame = window.requestAnimationFrame(() => {
        // The transforms are gone as of the settling frame, so the flip hook
        // can measure real boxes again from there on.
        if (next === 'settling') freezeFlipRef.current = false;
        setDrag((current) => (current?.phase === phase ? { ...current, phase: next } : current));
      });
      return () => window.cancelAnimationFrame(frame);
    }
    if (phase === 'settling') {
      // Held until the glide is over: dropping it early would take the tile's
      // transform transition away mid-flight. A drag started in the meantime
      // owns the state instead, so this only ever clears its own phase.
      const timer = window.setTimeout(() => {
        setDrag((current) => (current?.phase === 'settling' ? null : current));
      }, DROP_SETTLE_MS);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [drag]);

  // Kept fresh every render so the listeners below, which are attached once per
  // press, always run the current round's handlers.
  const dragHandlers = useRef({ move: onDragMove, end: endDrag });
  useEffect(() => {
    placedRef.current = placed;
    outcomeRef.current = outcome;
    dragHandlers.current = { move: onDragMove, end: endDrag };
  });

  // A press listens on the window, not on the tile, so crossing a neighbour or
  // another flex row keeps delivering the rest of the gesture.
  useEffect(() => {
    if (!pressed) return;
    const move = (event: PointerEvent) => dragHandlers.current.move(event);
    const end = (event: PointerEvent) => dragHandlers.current.end(event);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
  }, [pressed]);

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
    <article className="study-ink-scope relative mx-auto flex h-full w-full max-w-2xl flex-1 flex-col items-center justify-center gap-4 px-3 py-4 text-center sm:gap-6 sm:py-6">
      <CardTopControls>
        <StageBadge stageIndex={stageIndex} difficultyBand={difficultyBand} />
        <SoundToggle soundEnabled={soundEnabled} onToggle={toggleSound} />
      </CardTopControls>
      {/* On phones this is the flexible part of the card. The action dock below
          stays at the bottom while the prompt, tray and bank keep the remaining
          space; importantly, every audio control is outside this tile region. */}
      <div
        data-assembly-content
        className="flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-4 sm:gap-6 md:flex-none"
      >
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
            // The tiles now carry the verdict one by one, so a wrong assembly
            // no longer washes the whole tray red — a red bed under a row of
            // green tiles contradicts the very thing it is trying to say. The
            // shake stays: that is the "not quite" signal for the round.
            outcome === 'unknown'
              ? 'border-ink-faint/60 bg-paper-hi/35 motion-safe:animate-[game-shake_350ms_ease]'
              : outcome === 'known'
                ? 'border-moss/50 bg-wash-moss/40'
                : 'border-ink-faint/60 bg-paper-hi/35'
          }`}
          aria-label={t('game.assembledAnswer')}
        >
          {placedTiles.map((tile, index) => {
            const phase = drag?.id === tile.id ? drag.phase : null;
            /** Lifted look, and an offset that tracks the pointer. */
            const held = phase === 'active' || phase === 'landing' || phase === 'arming';
            // Right tiles stay right even in a wrong assembly; only the ones
            // actually out of place are called out.
            const slotWrong = outcome === 'unknown' && slotVerdicts[index] === false;
            const slotRight = outcome !== null && !slotWrong;
            let transform: string | undefined;
            if (held && drag) {
              transform = `translate(${drag.x}px, ${drag.y}px) scale(1.06)`;
            } else if (!phase) {
              const offset = drag?.neighbourOffsets[tile.id];
              if (offset) transform = `translate(${offset.x}px, ${offset.y}px)`;
            }
            // Silent on the landing frame — for the held tile and for every
            // neighbour, since all of their transforms are re-based there —
            // then armed so the release can glide.
            let transitionProperty: string | undefined;
            if (phase === 'active' || phase === 'landing' || drag?.phase === 'landing') {
              transitionProperty = 'none';
            } else if (phase === 'arming' || phase === 'settling') {
              transitionProperty = 'transform';
            }
            return (
              <button
                key={tile.id}
                ref={registerTile(tile.id)}
                type="button"
                disabled={Boolean(outcome)}
                onPointerDown={(event) => onTilePointerDown(event, tile.id)}
                onKeyDown={(event) => onTileKeyDown(event, tile.id)}
                onClick={() => takeBack(tile.id)}
                style={{
                  transform,
                  // Written longhand rather than through the `transition`
                  // shorthand: mixing it with `transitionDelay` across renders
                  // makes React complain.
                  transitionProperty,
                  transitionDelay: !phase && outcome ? `${index * 45}ms` : undefined,
                }}
                {...noTranslateProps(
                  [
                    TILE_SHAPE,
                    tileWidth,
                    'touch-none disabled:cursor-default',
                    held ? 'z-30 cursor-grabbing shadow-[0_10px_18px_rgba(42,34,24,0.28)]' : 'cursor-grab',
                    slotWrong
                      ? 'border-brick bg-wash-brick text-brick-deep shadow-[0_3px_0_#E4AAA6]'
                      : slotRight
                        ? 'border-moss bg-wash-moss text-[#145B33] shadow-[0_3px_0_#A9D3B6]'
                        : held
                          ? 'border-sea bg-wash-sea text-sea-mid'
                          : 'border-sea bg-wash-sea text-sea-mid shadow-[0_3px_0_#B5CFE4]',
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
                  ? 'border-sea/45 motion-safe:animate-[assembly-slot-wait_1.9s_ease-in-out_infinite]'
                  : 'border-ink-faint/55'
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
              // A drag that ends over anything but a button leaves no click to
              // swallow, so the suppression flag would still be armed here and
              // would eat this tap. A fresh press is never drag fallout.
              onPointerDown={() => { suppressClick.current = false; }}
              {...noTranslateProps(
                [
                  TILE_SHAPE,
                  tileWidth,
                  'border-ink-faint bg-paper-hi text-ink shadow-[0_3px_0_#D8C9AF]',
                  'motion-safe:animate-[deck-enter-rise_0.4s_ease-out_both]',
                  'enabled:hover:-translate-y-0.5 enabled:hover:border-sea enabled:hover:shadow-[0_5px_0_#C7B89E]',
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
      </div>

      {/* The mobile action dock is the final, non-growing child, so Check and
          Continue stay at the bottom of the card. Audio is in normal flow just
          above them and right-aligned, never floating over the tile bank. */}
      <div
        data-assembly-action-dock
        className="mx-auto flex w-full max-w-[22rem] shrink-0 flex-col items-center gap-3 pb-[max(env(safe-area-inset-bottom,0px),0.75rem)] md:pb-0"
      >
        {outcome === 'unknown' && (
          <span {...noTranslateProps('text-sm font-bold text-rose-700')}>
            {`✗ ${answerParts.join(joiner)}`}
          </span>
        )}
        {outcome && answerAudioSrcs.length > 0 && (
          <div data-assembly-audio-row className="flex w-full justify-end pr-1">
            <CardAudioButton
              size="lg"
              onPlay={() => void play(answerAudioSrcs)}
            />
          </div>
        )}
        {!outcome ? (
          <button
            type="button"
            onClick={check}
            disabled={!isFull}
            className={studyActionClasses('slab')}
          >
            <span>{t('game.check')}</span>
          </button>
        ) : (
          <ContinueButton variant="slab" onClick={() => onOutcome(outcome)} />
        )}
      </div>
    </article>
  );
}

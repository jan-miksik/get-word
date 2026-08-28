'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Types text out character by character, the way most AI chats do.
 *
 * The model reply arrives in one piece (the endpoint returns JSON, not a token
 * stream), so this is presentation rather than real streaming — but it is what
 * makes a two-sentence answer feel like it is being written instead of dumped.
 *
 * Only the newest message animates: replaying every earlier reply on each
 * render would be noise, and re-animating on a re-render would look like a bug.
 */
export function TypingText({
  text,
  animate,
  animationKey = text,
  charsPerTick = 2,
  tickMs = 16,
  onTick,
}: {
  text: string;
  animate: boolean;
  /** Changes when this particular string should animate again. */
  animationKey?: string;
  charsPerTick?: number;
  tickMs?: number;
  /** Called as characters appear, so a scroll container can follow along. */
  onTick?: () => void;
}) {
  if (!animate) return <>{text}</>;

  return (
    <AnimatedTypingText
      key={animationKey}
      text={text}
      charsPerTick={charsPerTick}
      tickMs={tickMs}
      onTick={onTick}
    />
  );
}

function AnimatedTypingText({
  text,
  charsPerTick,
  tickMs,
  onTick,
}: {
  text: string;
  charsPerTick: number;
  tickMs: number;
  onTick?: () => void;
}) {
  const [shown, setShown] = useState('');
  const onTickRef = useRef(onTick);

  useEffect(() => {
    onTickRef.current = onTick;
  }, [onTick]);

  useEffect(() => {
    // React Strict Mode mounts, cleans up and runs this effect again in
    // development. Both passes start a timer, so the second one still writes
    // the complete response after the first timer is cleaned up.
    let index = 0;
    const timer = setInterval(() => {
      index = Math.min(text.length, index + charsPerTick);
      setShown(text.slice(0, index));
      onTickRef.current?.();
      if (index >= text.length) clearInterval(timer);
    }, tickMs);

    return () => clearInterval(timer);
  }, [charsPerTick, text, tickMs]);

  return <>{shown}</>;
}

/**
 * How long the reveal is allowed to lag behind the text it has been handed.
 * Everything outstanding is paced to land inside this window, so a burst of a
 * hundred characters and a burst of five both take about the same time to draw.
 */
const STREAM_CATCH_UP_MS = 300;
/** Floor for the reveal rate, so the last few characters still look typed. */
const STREAM_MIN_CHARS_PER_SECOND = 55;
/**
 * Longest gap a single frame may be paced from. A backgrounded tab or a stalled
 * main thread hands the loop a gap of seconds, and charging the reveal for all
 * of it would dump the rest of the reply in one frame.
 */
const STREAM_MAX_FRAME_MS = 100;

/**
 * Renders streamed text at a steady pace instead of at the pace it arrives.
 *
 * A model reply does not reach the browser evenly: the provider emits tokens in
 * bursts, a proxy can hold a chunk back, and the turn ends by replacing the
 * message with the parsed reply in one go. Painting each arrival directly is
 * what makes the answer stutter and then jump. So arrival only moves the
 * target, and a frame loop walks the visible text toward it, draining whatever
 * is outstanding over a fixed window.
 *
 * The loop deliberately outlives the arrivals. It used to be restarted by every
 * delta, and since a restarted loop has no previous frame to measure against,
 * its first frame could only afford one character — with deltas landing every
 * 32ms that capped the whole reveal at about a character per flush, so the text
 * crawled while the reply streamed and then lurched to the end when it stopped.
 * Arrivals now only move `targetRef`; the loop keeps its own timebase and stops
 * only once it has caught up.
 */
export function StreamedText({
  text,
  animate,
  onReveal,
}: {
  text: string;
  /**
   * Read once, when this text first appears: true starts from nothing and
   * types the reply out, false paints an already-finished message at once.
   */
  animate: boolean;
  /** Called as characters appear, so a scroll container can follow along. */
  onReveal?: () => void;
}) {
  const canAnimate = animate && typeof requestAnimationFrame === 'function';
  const [shown, setShown] = useState(() => (canAnimate ? '' : text));
  const shownRef = useRef(shown);
  // Where the reveal is walking to. The loop reads this rather than a captured
  // prop, which is what lets it survive streamed deltas.
  const targetRef = useRef(text);
  // Whether this bubble types at all is decided by its first render, the same
  // way its initial state is: a reply marked complete mid-reveal must still
  // finish drawing rather than snap.
  const animateRef = useRef(canAnimate);
  const onRevealRef = useRef(onReveal);
  const loopRef = useRef<{ frame: number; lastAt: number }>({ frame: 0, lastAt: 0 });

  useEffect(() => {
    onRevealRef.current = onReveal;
  }, [onReveal]);

  useEffect(() => {
    targetRef.current = text;
  }, [text]);

  // The loop's lifetime is the component's, not any one delta's. Strict Mode
  // mounts, cleans up and mounts again in development; this cleanup is what
  // cancels the first pass's frame and lets the second start a live one.
  useEffect(() => {
    const loop = loopRef.current;
    return () => {
      if (loop.frame) cancelAnimationFrame(loop.frame);
      loop.frame = 0;
      loop.lastAt = 0;
    };
  }, []);

  useEffect(() => {
    const loop = loopRef.current;
    // The finished reply is normally the streamed text plus whatever was still
    // outstanding. When it is not — a parser fallback rewrote it — no amount of
    // revealing gets there, so show the corrected text and stop.
    if (!text.startsWith(shownRef.current)) {
      if (loop.frame) cancelAnimationFrame(loop.frame);
      loop.frame = 0;
      loop.lastAt = 0;
      shownRef.current = text;
      setShown(text);
      return;
    }
    if (!animateRef.current) {
      shownRef.current = text;
      setShown(text);
      return;
    }
    if (shownRef.current === text || loop.frame) return;

    const step = (now: number) => {
      const elapsed = loop.lastAt ? Math.min(now - loop.lastAt, STREAM_MAX_FRAME_MS) : 0;
      loop.lastAt = now;
      const target = targetRef.current;
      const remaining = target.length - shownRef.current.length;
      if (remaining <= 0 || !target.startsWith(shownRef.current)) {
        // Caught up. Idling here would burn a frame callback for as long as the
        // bubble stays in the transcript, so the loop stands down and the
        // effect above restarts it when more text arrives.
        loop.frame = 0;
        loop.lastAt = 0;
        return;
      }
      const charsPerSecond = Math.max(
        STREAM_MIN_CHARS_PER_SECOND,
        (remaining / STREAM_CATCH_UP_MS) * 1000,
      );
      const chars = Math.max(1, Math.round((charsPerSecond * elapsed) / 1000));
      const next = target.slice(0, shownRef.current.length + chars);
      shownRef.current = next;
      setShown(next);
      onRevealRef.current?.();
      loop.frame = requestAnimationFrame(step);
    };
    loop.frame = requestAnimationFrame(step);
  }, [text]);

  return <>{shown}</>;
}

/** Three-dot "working on it" indicator, used while a model call is in flight. */
export function TypingDots({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5" role="status" aria-label={label}>
      <span className="word-chat-dot" />
      <span className="word-chat-dot" />
      <span className="word-chat-dot" />
    </span>
  );
}

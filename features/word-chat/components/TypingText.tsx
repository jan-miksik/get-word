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
 * Renders streamed text at a steady pace instead of at the pace it arrives.
 *
 * A model reply does not reach the browser evenly: the provider emits tokens in
 * bursts, a proxy can hold a chunk back, and the turn ends by replacing the
 * message with the parsed reply in one go. Painting each arrival directly is
 * what makes the answer stutter and then jump. So arrival only moves the
 * target, and a frame loop walks the visible text toward it, draining whatever
 * is outstanding over a fixed window.
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
  const onRevealRef = useRef(onReveal);

  useEffect(() => {
    onRevealRef.current = onReveal;
  }, [onReveal]);

  // One effect owns the whole frame loop, so its cleanup cancels exactly what it
  // started. React Strict Mode runs this mount, clean up, mount again in
  // development; anything kept in a ref across that would leave the second pass
  // believing a cancelled loop was still running, and the text would never
  // appear at all.
  useEffect(() => {
    // The finished reply is normally the streamed text plus whatever was still
    // outstanding. When it is not — a parser fallback rewrote it — no amount of
    // revealing gets there, so show the corrected text and stop.
    if (!text.startsWith(shownRef.current)) {
      shownRef.current = text;
      setShown(text);
      return;
    }
    if (shownRef.current === text) return;

    let frame = 0;
    let lastFrameAt = 0;
    const step = (now: number) => {
      const elapsed = lastFrameAt ? now - lastFrameAt : 0;
      lastFrameAt = now;
      const remaining = text.length - shownRef.current.length;
      if (remaining <= 0) return;
      const charsPerSecond = Math.max(
        STREAM_MIN_CHARS_PER_SECOND,
        (remaining / STREAM_CATCH_UP_MS) * 1000,
      );
      const chars = Math.max(1, Math.round((charsPerSecond * elapsed) / 1000));
      const next = text.slice(0, shownRef.current.length + chars);
      shownRef.current = next;
      setShown(next);
      onRevealRef.current?.();
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);

    return () => cancelAnimationFrame(frame);
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

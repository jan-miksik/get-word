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

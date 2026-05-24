import { getSessionId } from "./session-id";
import type { ReviewEventPayload } from "./review-events";

const CHANNEL_NAME = "get-word-sync";

export type GetWordTabMessage =
  | { type: "review_event"; sessionId: string; event: ReviewEventPayload }
  | {
      type: "memory_hook_changed";
      sessionId: string;
      wordId: string;
      hook: string;
      /**
       * Wall-clock timestamp (ms) when the source tab applied this change.
       * Receivers use it as an LWW guard so an out-of-order broadcast can't
       * revert a fresher local edit (e.g. when two tabs race a save).
       */
      updatedAt: number;
    }
  | { type: "preferences_changed"; sessionId: string; patch: Record<string, unknown> }
  | { type: "category_filters_changed"; sessionId: string; scopeKey: string; categories: string[] }
  | { type: "game_score_changed"; sessionId: string; score: number };

type OutboundGetWordTabMessage = GetWordTabMessage extends infer Message
  ? Message extends { sessionId: string }
    ? Omit<Message, "sessionId">
    : never
  : never;

function openChannel(): BroadcastChannel | null {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") {
    return null;
  }
  return new BroadcastChannel(CHANNEL_NAME);
}

export function postTabMessage(message: OutboundGetWordTabMessage): void {
  const channel = openChannel();
  if (!channel) return;
  channel.postMessage({ ...message, sessionId: getSessionId() });
  channel.close();
}

export function subscribeTabMessages(
  handler: (message: GetWordTabMessage) => void
): () => void {
  const channel = openChannel();
  if (!channel) return () => {};

  const listener = (event: MessageEvent<GetWordTabMessage>) => {
    const message = event.data;
    if (!message || message.sessionId === getSessionId()) return;
    handler(message);
  };

  channel.addEventListener("message", listener);
  return () => {
    channel.removeEventListener("message", listener);
    channel.close();
  };
}

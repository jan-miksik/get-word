'use client';

import { useCallback, type Dispatch, type SetStateAction, type RefObject } from 'react';
import { sendChatMessageStream, type ChatMessageInput, type ChatMessageStreamResponse } from '../client/api';
import type { WordChatMessage } from '../types';

type Options = {
  request: Omit<ChatMessageInput, 'messages' | 'signal'>;
  abortRef: RefObject<AbortController | null>;
  assistantIdRef: RefObject<string | null>;
  setMessages: Dispatch<SetStateAction<WordChatMessage[]>>;
  setBusy: (value: 'chat' | null) => void;
  onStart: () => void;
  onResponse: (response: ChatMessageStreamResponse, conversation: WordChatMessage[], signal: AbortSignal) => Promise<void>;
  onError: (error: unknown, conversation: WordChatMessage[]) => void;
};

/** Owns one cancellable turn, including its proposal continuation. */
export function useChatTurn({ request, abortRef, assistantIdRef, setMessages, setBusy, onStart, onResponse, onError }: Options) {
  return useCallback(async (conversation: WordChatMessage[]) => {
    // React state does not update between two clicks in the same event loop.
    if (abortRef.current) return;
    const controller = new AbortController();
    abortRef.current = controller;
    const assistantId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    assistantIdRef.current = assistantId;
    const ownsTurn = () => abortRef.current === controller && !controller.signal.aborted;
    onStart();
    setBusy('chat');
    setMessages([
      ...conversation,
      { role: 'assistant', content: '', id: assistantId, incomplete: true, awaitingReveal: true },
    ]);
    let pendingDelta = '';
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    const flushDelta = () => {
      flushTimer = null;
      if (!pendingDelta || !ownsTurn()) return;
      const text = pendingDelta;
      pendingDelta = '';
      setMessages((current) => current.map((message) =>
        message.id === assistantId && message.incomplete
          ? { ...message, content: `${message.content}${text}` } : message,
      ));
    };
    try {
      const response = await sendChatMessageStream({ ...request, messages: conversation, signal: controller.signal }, {
        onDelta: (text) => {
          if (!ownsTurn()) return;
          pendingDelta += text;
          if (!flushTimer) flushTimer = setTimeout(flushDelta, 32);
        },
      });
      if (!ownsTurn()) return;
      if (flushTimer) clearTimeout(flushTimer);
      pendingDelta = '';
      const complete: WordChatMessage[] = [...conversation,
        { role: 'assistant', content: response.reply, id: assistantId, awaitingReveal: true },
      ];
      setMessages(complete);
      await onResponse(response, complete, controller.signal);
    } catch (err) {
      if (!ownsTurn()) return;
      // Never leave an empty spinner or half an answer in the transcript.
      setMessages(conversation);
      onError(err, conversation);
    } finally {
      if (flushTimer) clearTimeout(flushTimer);
      if (abortRef.current === controller) {
        abortRef.current = null;
        assistantIdRef.current = null;
        setBusy(null);
      }
    }
  }, [request, abortRef, assistantIdRef, setMessages, setBusy, onStart, onResponse, onError]);
}

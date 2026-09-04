import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockEnqueueOp = vi.fn<(input: unknown) => Promise<null>>(() => Promise.resolve(null));
const mockPostTabMessage = vi.fn<(message: unknown) => void>();
const mockSubscribeTabMessages = vi.fn<(listener: unknown) => () => void>(() => () => {});

vi.mock('@/lib/local-first/enqueue', () => ({
  enqueueOp: (input: unknown) => mockEnqueueOp(input),
}));

vi.mock('@/lib/tab-sync', () => ({
  postTabMessage: (message: unknown) => mockPostTabMessage(message),
  subscribeTabMessages: (listener: unknown) => mockSubscribeTabMessages(listener),
}));

import { useSurveyResponses } from '../surveyResponses';

describe('useSurveyResponses', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnqueueOp.mockResolvedValue(null);
    mockSubscribeTabMessages.mockReturnValue(() => {});
  });

  it('submits an answer optimistically and enqueues a set op', () => {
    const { result } = renderHook(() => useSurveyResponses());

    act(() => {
      result.current.submitSurveyResponse('bug_check', 'no_issues', null);
    });

    expect(result.current.surveyResponses.bug_check).toEqual({
      choice: 'no_issues',
      freeText: null,
      dismissed: false,
    });
    expect(mockEnqueueOp).toHaveBeenCalledWith(
      expect.objectContaining({
        entity: 'survey_response',
        opType: 'set',
        payload: { surveyId: 'bug_check', choice: 'no_issues', freeText: null, dismissed: false },
        legacyPayload: {
          survey_responses: { bug_check: { choice: 'no_issues', free_text: null, dismissed: false } },
        },
      })
    );
  });

  it('dismisses a survey as a terminal response with both fields null', () => {
    const { result } = renderHook(() => useSurveyResponses());

    act(() => {
      result.current.dismissSurvey('recent_changes');
    });

    expect(result.current.surveyResponses.recent_changes).toEqual({
      choice: null,
      freeText: null,
      dismissed: true,
    });
  });

  it('is server-authoritative: applyServerSurveyResponses fully replaces the local map', () => {
    const { result } = renderHook(() => useSurveyResponses());

    act(() => {
      result.current.submitSurveyResponse('bug_check', 'no_issues', null);
    });

    // The server's terminal value differs (this device lost a cross-device
    // write-once race) — it must win, not the locally-submitted guess.
    act(() => {
      result.current.applyServerSurveyResponses({
        bug_check: { choice: 'minor_issues', free_text: 'slow sync', dismissed: false },
      });
    });

    expect(result.current.surveyResponses.bug_check).toEqual({
      choice: 'minor_issues',
      freeText: 'slow sync',
      dismissed: false,
    });
  });

  it('applies eligibility from the server as-is', () => {
    const { result } = renderHook(() => useSurveyResponses());

    act(() => {
      result.current.applyServerSurveyEligibility({ recent_changes: true });
    });

    expect(result.current.surveyEligibility).toEqual({ recent_changes: true });
  });

  it('keeps a locally-answered survey when another tab broadcasts a different one', () => {
    let inboundListener: ((message: unknown) => void) | null = null;
    mockSubscribeTabMessages.mockImplementation((listener) => {
      inboundListener = listener as (message: unknown) => void;
      return () => {};
    });

    const { result } = renderHook(() => useSurveyResponses());

    act(() => {
      result.current.submitSurveyResponse('bug_check', 'no_issues', null);
    });

    act(() => {
      inboundListener?.({
        type: 'survey_response_changed',
        surveyId: 'bug_check',
        response: { choice: 'major_issues', freeText: null, dismissed: false },
        sessionId: 'other-tab',
      });
    });

    // Terminal per survey — this tab's own answer stands.
    expect(result.current.surveyResponses.bug_check).toEqual({
      choice: 'no_issues',
      freeText: null,
      dismissed: false,
    });
  });

  it('adopts another tab’s answer for a survey this tab has not answered yet', () => {
    let inboundListener: ((message: unknown) => void) | null = null;
    mockSubscribeTabMessages.mockImplementation((listener) => {
      inboundListener = listener as (message: unknown) => void;
      return () => {};
    });

    const { result } = renderHook(() => useSurveyResponses());

    act(() => {
      inboundListener?.({
        type: 'survey_response_changed',
        surveyId: 'bug_check',
        response: { choice: 'no_issues', freeText: null, dismissed: false },
        sessionId: 'other-tab',
      });
    });

    expect(result.current.surveyResponses.bug_check).toEqual({
      choice: 'no_issues',
      freeText: null,
      dismissed: false,
    });
  });
});

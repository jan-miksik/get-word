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

import { useSurveyProgress } from '../surveyProgress';

describe('useSurveyProgress', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnqueueOp.mockResolvedValue(null);
    mockSubscribeTabMessages.mockReturnValue(() => {});
  });

  it('increments locally and enqueues a max op', () => {
    const isUpdatingFromServerRef = { current: false };
    const { result } = renderHook(() => useSurveyProgress(true, isUpdatingFromServerRef));

    act(() => {
      result.current.incrementSurveyProgress();
    });

    expect(result.current.surveyProgressCount).toBe(1);
    expect(mockEnqueueOp).toHaveBeenCalledWith(
      expect.objectContaining({
        entity: 'survey_counter',
        opType: 'max',
        payload: { count: 1 },
        legacyPayload: { survey_progress_count: 1 },
      })
    );
  });

  it('never decreases when the server reports a lower value', () => {
    const isUpdatingFromServerRef = { current: false };
    const { result } = renderHook(() => useSurveyProgress(true, isUpdatingFromServerRef));

    act(() => {
      result.current.incrementSurveyProgress();
      result.current.incrementSurveyProgress();
      result.current.incrementSurveyProgress();
    });
    expect(result.current.surveyProgressCount).toBe(3);

    act(() => {
      result.current.applyServerSurveyCount(1);
    });
    expect(result.current.surveyProgressCount).toBe(3);

    act(() => {
      result.current.applyServerSurveyCount(10);
    });
    expect(result.current.surveyProgressCount).toBe(10);
  });

  it('merges cross-tab broadcasts as a max, never a regression', () => {
    let inboundListener: ((message: unknown) => void) | null = null;
    mockSubscribeTabMessages.mockImplementation((listener) => {
      inboundListener = listener as (message: unknown) => void;
      return () => {};
    });

    const isUpdatingFromServerRef = { current: false };
    const { result } = renderHook(() => useSurveyProgress(true, isUpdatingFromServerRef));

    act(() => {
      result.current.incrementSurveyProgress();
      result.current.incrementSurveyProgress();
    });
    expect(result.current.surveyProgressCount).toBe(2);

    act(() => {
      inboundListener?.({ type: 'survey_progress_changed', count: 1, sessionId: 'other-tab' });
    });
    expect(result.current.surveyProgressCount).toBe(2);

    act(() => {
      inboundListener?.({ type: 'survey_progress_changed', count: 5, sessionId: 'other-tab' });
    });
    expect(result.current.surveyProgressCount).toBe(5);
  });
});

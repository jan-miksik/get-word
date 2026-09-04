import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useEligibleSurvey } from '../useEligibleSurvey';

describe('useEligibleSurvey', () => {
  it('returns null below every threshold', () => {
    const { result } = renderHook(() =>
      useEligibleSurvey({ surveyProgressCount: 0, surveyResponses: {}, surveyEligibility: {} })
    );
    expect(result.current).toBeNull();
  });

  it('excludes a survey that requires prior usage until eligibility is confirmed', () => {
    const { result } = renderHook(() =>
      useEligibleSurvey({ surveyProgressCount: 100, surveyResponses: {}, surveyEligibility: {} })
    );
    // recent_changes (threshold 10, requiresPriorUsage) is excluded — only
    // bug_check (threshold 50, no gate) should be eligible.
    expect(result.current?.id).toBe('bug_check');
  });

  it('picks the lowest-threshold eligible survey first', () => {
    const { result } = renderHook(() =>
      useEligibleSurvey({
        surveyProgressCount: 100,
        surveyResponses: {},
        surveyEligibility: { recent_changes: true },
      })
    );
    expect(result.current?.id).toBe('recent_changes');
  });

  it('excludes a survey that has already been answered or dismissed', () => {
    const { result } = renderHook(() =>
      useEligibleSurvey({
        surveyProgressCount: 100,
        surveyResponses: { recent_changes: { dismissed: true } },
        surveyEligibility: { recent_changes: true },
      })
    );
    expect(result.current?.id).toBe('bug_check');
  });

  it('returns null once every eligible survey has been answered', () => {
    const { result } = renderHook(() =>
      useEligibleSurvey({
        surveyProgressCount: 100,
        surveyResponses: {
          recent_changes: { dismissed: true },
          bug_check: { dismissed: false },
        },
        surveyEligibility: { recent_changes: true },
      })
    );
    expect(result.current).toBeNull();
  });
});

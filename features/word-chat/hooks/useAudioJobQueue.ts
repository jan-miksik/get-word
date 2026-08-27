'use client';

import { useCallback, useRef } from 'react';

const AUDIO_WAIT_TIMEOUT_MS = 60_000;

/**
 * Tracks background TTS jobs so Save can wait for the rows they will update.
 * Jobs may enqueue retries, therefore `waitForAudioJobs` drains the live set
 * rather than taking one snapshot. The timeout degrades to saving voiced rows
 * instead of leaving the commit action blocked indefinitely.
 */
export function useAudioJobQueue(timeoutMs = AUDIO_WAIT_TIMEOUT_MS) {
  const jobsRef = useRef(new Set<Promise<unknown>>());

  const trackAudioJob = useCallback(<T,>(job: Promise<T>): Promise<T> => {
    const jobs = jobsRef.current;
    jobs.add(job);
    void job.catch(() => undefined).finally(() => {
      jobs.delete(job);
    });
    return job;
  }, []);

  const waitForAudioJobs = useCallback(async () => {
    const deadline = Date.now() + timeoutMs;
    while (jobsRef.current.size > 0) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) return;
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          Promise.all([...jobsRef.current].map((job) => job.catch(() => undefined))),
          new Promise<void>((resolve) => {
            timer = setTimeout(resolve, remaining);
          }),
        ]);
      } finally {
        if (timer) clearTimeout(timer);
      }
    }
  }, [timeoutMs]);

  const hasAudioJobs = useCallback(() => jobsRef.current.size > 0, []);

  return { trackAudioJob, waitForAudioJobs, hasAudioJobs };
}

/** Bound the entire response, including a body that stalls after HTTP headers. */
export async function withRequestDeadline<T>(
  parent: AbortSignal | undefined,
  timeoutMs: number,
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const cancel = () => controller.abort(parent?.reason);
  parent?.addEventListener('abort', cancel, { once: true });
  if (parent?.aborted) cancel();
  const timer = setTimeout(() => controller.abort(new DOMException('Request timed out', 'TimeoutError')), timeoutMs);
  let rejectAbort: (() => void) | undefined;
  try {
    controller.signal.throwIfAborted();
    const aborted = new Promise<never>((_resolve, reject) => {
      rejectAbort = () => reject(controller.signal.reason);
      controller.signal.addEventListener('abort', rejectAbort, { once: true });
    });
    return await Promise.race([run(controller.signal), aborted]);
  } finally {
    clearTimeout(timer);
    parent?.removeEventListener('abort', cancel);
    if (rejectAbort) controller.signal.removeEventListener('abort', rejectAbort);
  }
}

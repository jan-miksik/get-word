import { NextResponse } from 'next/server';

export interface RouteTimer {
  mark(name: string): void;
  totalMs(): number;
  applyHeaders(response: NextResponse): NextResponse;
}

export function createRouteTimer(): RouteTimer {
  const start = performance.now();
  const marks: Array<{ name: string; dur: number }> = [];
  let last = start;

  return {
    mark(name: string) {
      const now = performance.now();
      const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '_');
      marks.push({ name: safeName, dur: now - last });
      last = now;
    },
    totalMs() {
      return performance.now() - start;
    },
    applyHeaders(response: NextResponse) {
      if (marks.length > 0) {
        response.headers.set(
          'Server-Timing',
          marks.map((mark) => `${mark.name};dur=${mark.dur.toFixed(1)}`).join(', ')
        );
      }
      response.headers.set('x-get-word-total-ms', this.totalMs().toFixed(1));
      return response;
    },
  };
}

'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <div className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 p-6 text-center">
          <h2 className="text-2xl font-semibold">A critical error occurred</h2>
          <p className="text-sm text-zinc-600">{error.message || 'Unknown error'}</p>
          <button
            type="button"
            onClick={reset}
            className="rounded-md bg-black px-4 py-2 text-sm text-white"
          >
            Reload app
          </button>
        </div>
      </body>
    </html>
  );
}

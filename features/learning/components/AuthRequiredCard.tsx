'use client';

interface AuthRequiredCardProps {
  onSignIn: () => void;
}

export function AuthRequiredCard({ onSignIn }: AuthRequiredCardProps) {
  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-md rounded-2xl border border-border-subtle bg-background-elevated p-7 flex flex-col gap-4">
        <h1 className="m-0 text-2xl font-semibold text-text">Connect</h1>
        <p className="m-0 text-sm text-text-soft">
          Continue with email, Google, or Apple to access WordLink. Wallet connection is optional and available in the same modal.
        </p>
        <button
          type="button"
          onClick={onSignIn}
          className="auth-button auth-button--large"
        >
          Connect
        </button>
      </div>
    </main>
  );
}

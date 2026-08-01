import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  requestEmailSignInCode,
  signInWithEmailCode,
  signInReviewAccountWithPassword,
} = vi.hoisted(() => ({
  requestEmailSignInCode: vi.fn(),
  signInWithEmailCode: vi.fn(),
  signInReviewAccountWithPassword: vi.fn(),
}));

vi.mock('../../auth/email', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../auth/email')>();
  return {
    ...original,
    requestEmailSignInCode,
    signInWithEmailCode,
    signInReviewAccountWithPassword,
  };
});

vi.mock('../../config', () => ({
  apiOrigin: 'https://getword.app',
  hasMobileAuthConfiguration: () => true,
}));

vi.mock('../../native', () => ({ isNativeApp: () => true }));

import { SignInScreen } from '../SignInScreen';

const session = {
  success: true as const,
  userId: 'user-1',
  email: 'learner@example.com',
  authProvider: 'email',
  userRole: 'user' as const,
  sessionToken: 'get-word-token',
};

function renderScreen(onAuthenticated = vi.fn()) {
  render(
    <SignInScreen
      busy={false}
      busyLabel="Přihlašuji…"
      connection="online"
      error={null}
      onSignIn={vi.fn()}
      onAuthenticated={onAuthenticated}
    />,
  );
  return onAuthenticated;
}

describe('SignInScreen email flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requestEmailSignInCode.mockResolvedValue(undefined);
    signInWithEmailCode.mockResolvedValue(session);
    signInReviewAccountWithPassword.mockResolvedValue(session);
  });

  it('sends and verifies a one-time code for a regular email address', async () => {
    const user = userEvent.setup();
    const onAuthenticated = renderScreen();

    await user.type(screen.getByLabelText('E-mail'), 'learner@example.com');
    expect(screen.queryByLabelText('Password')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Poslat přihlašovací kód' }));

    await waitFor(() =>
      expect(requestEmailSignInCode).toHaveBeenCalledWith('learner@example.com'),
    );
    await user.type(screen.getByLabelText('Přihlašovací kód'), '12345678');
    await user.click(screen.getByRole('button', { name: 'Ověřit kód' }));

    await waitFor(() =>
      expect(signInWithEmailCode).toHaveBeenCalledWith(
        'learner@example.com',
        '12345678',
      ),
    );
    expect(onAuthenticated).toHaveBeenCalledWith('get-word-token');
  });

  it('shows a password inside the same form for the App Review account', async () => {
    const user = userEvent.setup();
    const onAuthenticated = renderScreen();

    await user.type(screen.getByLabelText('E-mail'), 'play-review@getword.app');
    await user.type(screen.getByLabelText('Password'), 'secret');
    await user.click(screen.getByRole('button', { name: 'Přihlásit se' }));

    await waitFor(() =>
      expect(signInReviewAccountWithPassword).toHaveBeenCalledWith(
        'play-review@getword.app',
        'secret',
      ),
    );
    expect(requestEmailSignInCode).not.toHaveBeenCalled();
    expect(onAuthenticated).toHaveBeenCalledWith('get-word-token');
  });
});

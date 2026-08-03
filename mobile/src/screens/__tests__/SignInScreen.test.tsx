import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/components/I18nProvider';

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

function renderScreen(onAuthenticated = vi.fn(), language = 'cs') {
  render(
    <I18nProvider language={language}>
      <SignInScreen
        busy={false}
        busyLabel="Přihlašuji…"
        error={null}
        onSignIn={vi.fn()}
        onAuthenticated={onAuthenticated}
      />
    </I18nProvider>,
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

  it('uses the Get Word branding and exposes both legal documents', () => {
    renderScreen();

    expect(screen.getByRole('img', { name: 'Get Word logo' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Vítejte' })).toBeTruthy();
    expect(
      screen.getByText('Všechny způsoby přihlášení fungují pro nové i existující účty.'),
    ).toBeTruthy();
    expect(screen.queryByText('Připojení')).toBeNull();
    expect(screen.queryByText('Server')).toBeNull();
    expect(screen.getByRole('link', { name: 'Podmínkami služby' })).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'Zásadami ochrany soukromí' }),
    ).toBeTruthy();
  });

  it('uses the selected interface language before authentication', () => {
    renderScreen(vi.fn(), 'en');

    expect(screen.getByRole('heading', { name: 'Welcome' })).toBeTruthy();
    expect(
      screen.getByText('All sign-in methods work for new and existing accounts.'),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continue with Apple' })).toBeTruthy();
  });

  it('sends and verifies a one-time code for a regular email address', async () => {
    const user = userEvent.setup();
    const onAuthenticated = renderScreen();

    await user.type(screen.getByLabelText('E-mail'), 'learner@example.com');
    expect(screen.queryByLabelText('Heslo')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Poslat mi kód e-mailem' }));

    await waitFor(() =>
      expect(requestEmailSignInCode).toHaveBeenCalledWith('learner@example.com'),
    );
    await user.type(screen.getByLabelText('Přihlašovací kód'), '12345678');
    await user.click(screen.getByRole('button', { name: 'Ověřit a pokračovat' }));

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
    await user.type(screen.getByLabelText('Heslo'), 'secret');
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

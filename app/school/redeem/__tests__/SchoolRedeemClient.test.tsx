import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enMessages } from '@/lib/i18n/locales/en';

const mockReplace = vi.fn();
const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
}));

vi.mock('@/features/shared/languages/useSettingsLanguage', () => ({
  useSettingsLanguage: () => 'en',
}));

import { SchoolRedeemClient } from '../SchoolRedeemClient';

const STORED_CODE_KEY = 'get-word-school-redeem-code';

function respondWith(status: number, body: Record<string, unknown>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  );
}

describe('SchoolRedeemClient error handling', () => {
  beforeEach(() => {
    window.sessionStorage.setItem(STORED_CODE_KEY, 'SCHOOL-CODE-123456');
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.sessionStorage.clear();
  });

  it('shows a localized message instead of the server’s operator English', async () => {
    respondWith(409, {
      error: 'This account already has an active school membership.',
      code: 'SCHOOL_MEMBERSHIP_ALREADY_EXISTS',
    });

    render(<SchoolRedeemClient />);

    await screen.findByText(enMessages['school.errorAlreadyMember']);
    expect(
      screen.queryByText('This account already has an active school membership.'),
    ).toBeNull();
  });

  it('explains a full school and keeps the code so a freed seat resolves itself', async () => {
    respondWith(409, { error: 'School is full.', code: 'SCHOOL_SEATS_FULL' });

    render(<SchoolRedeemClient />);

    await screen.findByText(enMessages['school.errorSeatsFull']);
    // The URL fragment was stripped on arrival, so the student has no other
    // copy of the code — a recoverable refusal must not throw it away.
    expect(window.sessionStorage.getItem(STORED_CODE_KEY)).toBe('SCHOOL-CODE-123456');
  });

  it('drops the code when a retry can never succeed', async () => {
    respondWith(404, { error: 'Unknown code.', code: 'INVALID_SCHOOL_CODE' });

    render(<SchoolRedeemClient />);

    await screen.findByText(enMessages['school.errorInvalidCode']);
    await waitFor(() => expect(window.sessionStorage.getItem(STORED_CODE_KEY)).toBeNull());
  });

  it('falls back to the generic message for an unrecognized code', async () => {
    respondWith(500, { error: 'Boom', code: 'SOMETHING_NEW' });

    render(<SchoolRedeemClient />);

    await screen.findByText(enMessages['school.errorBody']);
  });
});

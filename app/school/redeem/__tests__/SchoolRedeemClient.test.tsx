import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enMessages } from '@/lib/i18n/locales/en';

const mockReplace = vi.fn();
const mockPush = vi.fn();

// One object for every call, the way Next's own router behaves. Returning a
// fresh object here re-fires the redeem effect on every render, which loops
// once the code has been consumed and cleared from session storage.
const mockRouter = { replace: mockReplace, push: mockPush };

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
}));

vi.mock('@/features/shared/languages/useSettingsLanguage', () => ({
  useSettingsLanguage: () => 'en',
}));

import { SchoolRedeemClient } from '../SchoolRedeemClient';

const STORED_CODE_KEY = 'get-word-school-redeem-code';
const STORED_LIST_KEY = 'get-word-school-redeem-list';

function respondWith(status: number, body: Record<string, unknown>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  );
}

function requestBody() {
  const call = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0];
  return JSON.parse(String((call?.[1] as { body?: unknown })?.body ?? '{}'));
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

describe('SchoolRedeemClient success', () => {
  beforeEach(() => {
    window.sessionStorage.setItem(STORED_CODE_KEY, 'SCHOOL-CODE-123456');
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.sessionStorage.clear();
  });

  // Redeeming used to drop everyone into the list editor. A student has nothing
  // to edit there, so joining the school opened a data-entry screen instead of
  // the app they were sent there to use.
  it.each([['student'], ['teacher']])('sends a %s into the app, not the editor', async (role) => {
    respondWith(200, { school_name: 'Pilot School', role });

    render(<SchoolRedeemClient />);

    const button = await screen.findByRole('button', { name: enMessages['school.continue'] });
    fireEvent.click(button);

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/'));
  });
});

describe('SchoolRedeemClient link parsing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    window.history.replaceState(null, '', '/school/redeem');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.sessionStorage.clear();
  });

  // `#CODE?list=…` puts the list inside the fragment, so it is not a real query
  // string and nothing in Next will parse it for us.
  it('splits the list out of the fragment and sends both', async () => {
    respondWith(200, { school_name: 'Pilot School', role: 'student' });
    window.history.replaceState(null, '', '/school/redeem#SCHOOLCODE1234?list=list-uuid-1');

    render(<SchoolRedeemClient />);

    await screen.findByRole('button', { name: enMessages['school.continue'] });
    expect(requestBody()).toEqual({ code: 'SCHOOLCODE1234', listId: 'list-uuid-1' });
  });

  // The redeem bounces through sign-in and the fragment is stripped on arrival,
  // so session storage is the only copy that survives the round trip.
  it('keeps the list across a sign-in round trip', async () => {
    respondWith(401, { error: 'Sign in first.' });
    window.history.replaceState(null, '', '/school/redeem#SCHOOLCODE1234?list=list-uuid-1');

    render(<SchoolRedeemClient />);

    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
    expect(window.sessionStorage.getItem(STORED_CODE_KEY)).toBe('SCHOOLCODE1234');
    expect(window.sessionStorage.getItem(STORED_LIST_KEY)).toBe('list-uuid-1');
  });

  it('works exactly as before when the link names no list', async () => {
    respondWith(200, { school_name: 'Pilot School', role: 'student' });
    window.history.replaceState(null, '', '/school/redeem#SCHOOLCODE1234');

    render(<SchoolRedeemClient />);

    await screen.findByRole('button', { name: enMessages['school.continue'] });
    expect(requestBody()).toEqual({ code: 'SCHOOLCODE1234' });
  });
});

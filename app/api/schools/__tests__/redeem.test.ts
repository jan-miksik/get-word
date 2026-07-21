import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mockResolveAuthenticatedUser = vi.fn();
const mockRedeemSchoolCode = vi.fn();
const mockConsumeRateLimit = vi.fn();

vi.mock('@/lib/providers/rate-limit', () => ({
  consumeRateLimit: (...args: unknown[]) => mockConsumeRateLimit(...args),
  getClientIp: () => '203.0.113.7',
}));

vi.mock('@/lib/auth', () => ({
  resolveAuthenticatedUser: (...args: unknown[]) => mockResolveAuthenticatedUser(...args),
  unauthorizedResponse: (message?: string) =>
    new Response(JSON.stringify({ error: message ?? 'Authentication required' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    }),
}));

vi.mock('@/features/schools/server/redeem', () => {
  class SchoolRedeemError extends Error {
    constructor(
      readonly code: string,
      readonly status: number,
      message: string,
    ) {
      super(message);
    }
  }
  return {
    SchoolRedeemError,
    redeemSchoolCode: (...args: unknown[]) => mockRedeemSchoolCode(...args),
  };
});

import { POST } from '../redeem/route';
import { SchoolRedeemError } from '@/features/schools/server/redeem';

describe('POST /api/schools/redeem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConsumeRateLimit.mockResolvedValue({ allowed: true, count: 1, retryAfterSeconds: 1 });
  });

  it('throttles guessing before touching the redeem logic', async () => {
    mockResolveAuthenticatedUser.mockResolvedValue({ id: 'user-1' });
    mockConsumeRateLimit.mockResolvedValueOnce({
      allowed: false,
      count: 21,
      retryAfterSeconds: 900,
    });

    const response = await POST(new NextRequest('http://localhost/api/schools/redeem', {
      method: 'POST',
      body: JSON.stringify({ code: 'SCHOOLCODE' }),
    }));

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('900');
    expect(mockRedeemSchoolCode).not.toHaveBeenCalled();
    // The IP bucket runs before the session lookup, so an unauthenticated
    // flood is rejected without a database read for the user.
    expect(mockResolveAuthenticatedUser).not.toHaveBeenCalled();
  });

  it('throttles a single account walking the code space from many IPs', async () => {
    mockResolveAuthenticatedUser.mockResolvedValue({ id: 'user-1' });
    mockConsumeRateLimit
      .mockResolvedValueOnce({ allowed: true, count: 1, retryAfterSeconds: 1 })
      .mockResolvedValueOnce({ allowed: false, count: 11, retryAfterSeconds: 600 });

    const response = await POST(new NextRequest('http://localhost/api/schools/redeem', {
      method: 'POST',
      body: JSON.stringify({ code: 'SCHOOLCODE' }),
    }));

    expect(response.status).toBe(429);
    expect(mockRedeemSchoolCode).not.toHaveBeenCalled();
  });

  it('requires a signed-in account', async () => {
    mockResolveAuthenticatedUser.mockResolvedValue(null);

    const response = await POST(new NextRequest('http://localhost/api/schools/redeem', {
      method: 'POST',
      body: JSON.stringify({ code: 'CODE' }),
    }));

    expect(response.status).toBe(401);
    expect(mockRedeemSchoolCode).not.toHaveBeenCalled();
  });

  it('redeems a school code for the authenticated user', async () => {
    const user = { id: 'user-1' };
    mockResolveAuthenticatedUser.mockResolvedValue(user);
    mockRedeemSchoolCode.mockResolvedValue({
      school_id: 'school-1',
      school_name: 'Pilot',
      role: 'student',
      student_seat_limit: 30,
      active_student_seats: 1,
      teacher_limit: 5,
      active_teachers: 0,
    });

    const response = await POST(new NextRequest('http://localhost/api/schools/redeem', {
      method: 'POST',
      body: JSON.stringify({ code: 'SCHOOLCODE' }),
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      school_id: 'school-1',
      school_name: 'Pilot',
      role: 'student',
      student_seat_limit: 30,
      active_student_seats: 1,
      teacher_limit: 5,
      active_teachers: 0,
    });
    expect(mockRedeemSchoolCode).toHaveBeenCalledWith({
      user,
      code: 'SCHOOLCODE',
      listId: null,
    });
  });

  it('passes the link’s list through, and only when it is a string', async () => {
    mockResolveAuthenticatedUser.mockResolvedValue({ id: 'user-1' });
    mockRedeemSchoolCode.mockResolvedValue({});

    await POST(new NextRequest('http://localhost/api/schools/redeem', {
      method: 'POST',
      body: JSON.stringify({ code: 'SCHOOLCODE', listId: 'list-1' }),
    }));
    expect(mockRedeemSchoolCode).toHaveBeenCalledWith(
      expect.objectContaining({ listId: 'list-1' }),
    );

    await POST(new NextRequest('http://localhost/api/schools/redeem', {
      method: 'POST',
      body: JSON.stringify({ code: 'SCHOOLCODE', listId: { nested: 'object' } }),
    }));
    expect(mockRedeemSchoolCode).toHaveBeenLastCalledWith(
      expect.objectContaining({ listId: null }),
    );
  });

  it('returns school-specific error codes', async () => {
    mockResolveAuthenticatedUser.mockResolvedValue({ id: 'user-1' });
    mockRedeemSchoolCode.mockRejectedValue(
      new SchoolRedeemError('SCHOOL_SEATS_FULL', 409, 'This school has no student seats left.'),
    );

    const response = await POST(new NextRequest('http://localhost/api/schools/redeem', {
      method: 'POST',
      body: JSON.stringify({ code: 'SCHOOLCODE' }),
    }));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: 'This school has no student seats left.',
      code: 'SCHOOL_SEATS_FULL',
    });
  });
});

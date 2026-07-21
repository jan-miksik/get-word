import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mockResolveAuthenticatedUser = vi.fn();
const mockRedeemSchoolCode = vi.fn();

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
  beforeEach(() => vi.clearAllMocks());

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
    expect(mockRedeemSchoolCode).toHaveBeenCalledWith({ user, code: 'SCHOOLCODE' });
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

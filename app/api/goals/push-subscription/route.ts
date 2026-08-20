import { NextRequest, NextResponse } from 'next/server';

import { resolveAuthenticatedUser } from '@/lib/auth';
import {
  deleteWebPushSubscription,
  upsertWebPushSubscription,
} from '@/lib/db';
import {
  WebPushSubscriptionSchema,
  WebPushUnsubscribeSchema,
} from '@/packages/contracts/src/goals';

export async function POST(request: NextRequest) {
  const user = await resolveAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  const parsed = WebPushSubscriptionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid push subscription' }, { status: 400 });
  await upsertWebPushSubscription(user.id, {
    endpoint: parsed.data.endpoint,
    p256dh: parsed.data.keys.p256dh,
    auth: parsed.data.keys.auth,
    userAgent: request.headers.get('user-agent'),
  });
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function DELETE(request: NextRequest) {
  const user = await resolveAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  const parsed = WebPushUnsubscribeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid push subscription' }, { status: 400 });
  await deleteWebPushSubscription(user.id, parsed.data.endpoint);
  return new NextResponse(null, { status: 204 });
}

import { NextRequest, NextResponse } from 'next/server';
import { removeUserBlock } from '@/lib/db';
import { resolveUserFromRequest, unauthorizedResponse } from '@/lib/auth';

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(request: NextRequest, context: RouteContext) {
  const user = await resolveUserFromRequest(request);
  if (!user) return unauthorizedResponse();
  const { id } = await context.params;
  const removed = await removeUserBlock(user.id, id);
  if (!removed) return NextResponse.json({ error: 'Block not found' }, { status: 404 });
  return NextResponse.json({ removed: true });
}

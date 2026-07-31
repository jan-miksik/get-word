import { NextRequest, NextResponse } from 'next/server';
import { blockListOwner, getBlocksCreatedByUser } from '@/lib/db';
import { resolveUserFromRequest, unauthorizedResponse } from '@/lib/auth';
import { userHandle } from '@/features/admin/server/userHandle';

export async function GET(request: NextRequest) {
  const user = await resolveUserFromRequest(request);
  if (!user) return unauthorizedResponse();
  const blocks = await getBlocksCreatedByUser(user.id);
  return NextResponse.json({
    blocks: blocks.map((block) => ({
      id: block.id,
      handle: userHandle(block.blockedUserId),
      createdAt: block.createdAt.toISOString(),
    })),
  });
}

export async function POST(request: NextRequest) {
  const user = await resolveUserFromRequest(request);
  if (!user) return unauthorizedResponse();
  const body = await request.json().catch(() => null) as { listId?: unknown } | null;
  const listId = typeof body?.listId === 'string' ? body.listId.trim() : '';
  if (!listId) {
    return NextResponse.json({ error: 'List is required' }, { status: 400 });
  }
  const result = await blockListOwner(user.id, listId);
  if (!result) {
    return NextResponse.json({ error: 'This list author cannot be blocked' }, { status: 400 });
  }
  return NextResponse.json({ blockId: result.id, created: result.created }, { status: result.created ? 201 : 200 });
}

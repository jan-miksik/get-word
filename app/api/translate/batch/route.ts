import { NextRequest, NextResponse } from "next/server";
import { resolveUserFromRequest, unauthorizedResponse } from "@/lib/auth";
import {
  TranslateBatchError,
  translateBatch,
} from "@/features/translation/server/translate-batch";

export async function POST(request: NextRequest) {
  const user = await resolveUserFromRequest(request);
  if (!user) return unauthorizedResponse();

  const body = await request.json();
  try {
    return NextResponse.json(await translateBatch({ userId: user.id, body }));
  } catch (error) {
    if (error instanceof TranslateBatchError) {
      return NextResponse.json(error.body, { status: error.status });
    }
    throw error;
  }
}

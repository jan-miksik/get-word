import { NextRequest, NextResponse } from "next/server";
import { getUserLists, createList } from "@/lib/db";
import {
  resolveUserFromRequest,
  unauthorizedResponse,
} from "@/lib/auth";

export async function GET(request: NextRequest) {
  const user = await resolveUserFromRequest(request);
  if (!user) return unauthorizedResponse();

  const lists = await getUserLists(user.id);
  return NextResponse.json({ lists });
}

export async function POST(request: NextRequest) {
  const user = await resolveUserFromRequest(request);
  if (!user) return unauthorizedResponse();

  const body = await request.json();
  const { name, language_from, language_to, description } = body;

  if (!name || !language_from || !language_to) {
    return NextResponse.json(
      { error: "name, language_from, and language_to are required" },
      { status: 400 }
    );
  }

  const list = await createList({
    ownerId: user.id,
    name,
    description: description ?? null,
    languageFrom: language_from,
    languageTo: language_to,
    isPublic: false,
  });

  return NextResponse.json({ list }, { status: 201 });
}

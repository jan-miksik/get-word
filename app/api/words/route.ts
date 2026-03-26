import { NextRequest, NextResponse } from "next/server";
import {
  getAllWords,
  getWordById,
  createWord,
  updateWord,
  deleteWord,
  upsertWords,
  type NewWord,
} from "@/lib/db";
import {
  resolveUserFromRequest,
  isEditor,
  unauthorizedResponse,
  forbiddenResponse,
} from "@/lib/auth";

// GET: Fetch all words or a specific word by ID
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const wordId = searchParams.get("id");

    if (wordId) {
      // Fetch specific word
      const word = await getWordById(wordId);
      if (!word) {
        return NextResponse.json({ error: "Word not found" }, { status: 404 });
      }
      return NextResponse.json({ word });
    }

    // Fetch all words
    const words = await getAllWords();
    return NextResponse.json({ words });
  } catch (error) {
    console.error("Error fetching words:", error);
    return NextResponse.json(
      { error: "Failed to fetch words" },
      { status: 500 }
    );
  }
}

// POST, PUT, DELETE: Read-only during transition to list-based schema.
// Word editing now happens through /api/lists endpoints.
const readOnlyResponse = () =>
  NextResponse.json(
    { error: "Word editing via /api/words is disabled. Use list-based editing instead." },
    { status: 410 }
  );

export async function POST() {
  return readOnlyResponse();
}

export async function PUT() {
  return readOnlyResponse();
}

export async function DELETE() {
  return readOnlyResponse();
}

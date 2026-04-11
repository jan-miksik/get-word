import { NextRequest, NextResponse } from "next/server";
import {
  getAllWords,
  getWordById,
} from "@/lib/db";
import { createRouteTimer } from "@/features/shared/routes/timing";

// GET: Fetch all words or a specific word by ID
export async function GET(request: NextRequest) {
  const timer = createRouteTimer();
  try {
    const searchParams = request.nextUrl.searchParams;
    const wordId = searchParams.get("id");

    if (wordId) {
      // Fetch specific word
      const word = await getWordById(wordId);
      timer.mark("get_word_by_id");
      if (!word) {
        return timer.applyHeaders(
          NextResponse.json({ error: "Word not found" }, { status: 404 })
        );
      }
      return timer.applyHeaders(NextResponse.json({ word }));
    }

    // Fetch all words
    const words = await getAllWords();
    timer.mark("get_all_words");
    return timer.applyHeaders(NextResponse.json({ words }));
  } catch (error) {
    console.error("Error fetching words:", error);
    timer.mark("error");
    return timer.applyHeaders(NextResponse.json(
      { error: "Failed to fetch words" },
      { status: 500 }
    ));
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

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

function createServerTimer() {
  const start = performance.now();
  const marks: Array<{ name: string; dur: number }> = [];
  let last = start;
  return {
    mark(name: string) {
      const now = performance.now();
      const safeName = name.replace(/[^a-zA-Z0-9_-]/g, "_");
      marks.push({ name: safeName, dur: now - last });
      last = now;
    },
    applyHeaders(response: NextResponse) {
      if (marks.length > 0) {
        response.headers.set(
          "Server-Timing",
          marks.map((m) => `${m.name};dur=${m.dur.toFixed(1)}`).join(", ")
        );
      }
      response.headers.set(
        "x-wordlink-total-ms",
        (performance.now() - start).toFixed(1)
      );
      return response;
    },
  };
}

// GET: Fetch all words or a specific word by ID
export async function GET(request: NextRequest) {
  const timer = createServerTimer();
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

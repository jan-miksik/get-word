import { NextRequest, NextResponse } from "next/server";
import {
  getAllWords,
  getWordById,
  createWord,
  updateWord,
  deleteWord,
  type NewWord,
} from "@/lib/db";

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

// POST: Create a new word
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate required fields
    if (!body.id || !body.cz || !body.en || !body.vi) {
      return NextResponse.json(
        { error: "Missing required fields: id, cz, en, vi" },
        { status: 400 }
      );
    }

    const newWord: NewWord = {
      id: body.id,
      category: body.category || [],
      cz: body.cz,
      en: body.en,
      vi: body.vi,
      czPron: body.czPron || null,
      viPron: body.viPron || null,
      czAudio: body.czAudio || null,
      viAudio: body.viAudio || null,
      czHint: body.czHint || null,
      viHint: body.viHint || null,
    };

    const word = await createWord(newWord);
    return NextResponse.json({ word }, { status: 201 });
  } catch (error) {
    console.error("Error creating word:", error);
    return NextResponse.json(
      { error: "Failed to create word" },
      { status: 500 }
    );
  }
}

// PUT: Update an existing word
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.id) {
      return NextResponse.json(
        { error: "Word ID is required" },
        { status: 400 }
      );
    }

    const { id, ...updates } = body;
    const word = await updateWord(id, updates);

    if (!word) {
      return NextResponse.json({ error: "Word not found" }, { status: 404 });
    }

    return NextResponse.json({ word });
  } catch (error) {
    console.error("Error updating word:", error);
    return NextResponse.json(
      { error: "Failed to update word" },
      { status: 500 }
    );
  }
}

// DELETE: Delete a word
export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const wordId = searchParams.get("id");

    if (!wordId) {
      return NextResponse.json(
        { error: "Word ID is required" },
        { status: 400 }
      );
    }

    const deleted = await deleteWord(wordId);
    if (!deleted) {
      return NextResponse.json({ error: "Word not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting word:", error);
    return NextResponse.json(
      { error: "Failed to delete word" },
      { status: 500 }
    );
  }
}

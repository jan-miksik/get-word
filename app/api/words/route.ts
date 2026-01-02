import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

// GET: Fetch current words
export async function GET() {
  try {
    // Read the file directly
    const filePath = path.join(process.cwd(), 'slova.js');
    const fileContent = await fs.readFile(filePath, 'utf-8');
    
    // Extract the WORDS array from the file content
    // The file exports: export const WORDS = [...];
    // We need to extract just the array part
    const match = fileContent.match(/export const WORDS = (\[[\s\S]*\]);?\s*$/);
    if (!match) {
      throw new Error('Could not parse WORDS from slova.js');
    }
    
    // Parse the JSON array (it should be valid JSON)
    const words = JSON.parse(match[1]);
    return NextResponse.json({ words });
  } catch (error) {
    console.error('Error fetching words:', error);
    return NextResponse.json(
      { error: 'Failed to fetch words' },
      { status: 500 }
    );
  }
}

// POST: Save words back to slova.js
export async function POST(request: NextRequest) {
  try {
    const { words } = await request.json();
    
    if (!Array.isArray(words)) {
      return NextResponse.json(
        { error: 'Invalid request: words must be an array' },
        { status: 400 }
      );
    }

    // Generate the file content
    const fileContent = `export const WORDS = ${JSON.stringify(words, null, 2)};\n`;

    // Write to slova.js
    const filePath = path.join(process.cwd(), 'slova.js');
    await fs.writeFile(filePath, fileContent, 'utf-8');

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error saving words:', error);
    return NextResponse.json(
      { error: 'Failed to save words. This may not be available in production.' },
      { status: 500 }
    );
  }
}


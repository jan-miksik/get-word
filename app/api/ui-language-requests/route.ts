import { NextRequest, NextResponse } from 'next/server';
import { resolveUserFromRequest, unauthorizedResponse } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { uiLanguageRequests } from '@/lib/db/schema';
import {
  COMMON_LANGUAGES,
  GOOGLE_TRANSLATE_LANGUAGES,
  mergeLanguages,
  normalizeLanguageCode,
} from '@/lib/i18n/languages';
import { BUNDLED_UI_LANGUAGE_CODES } from '@/lib/i18n/messages';

const REQUESTABLE_LANGUAGE_CODES = new Set(
  mergeLanguages(COMMON_LANGUAGES, GOOGLE_TRANSLATE_LANGUAGES)
    .map((item) => normalizeLanguageCode(item.code)),
);
const BUNDLED_LANGUAGE_CODES = new Set(
  BUNDLED_UI_LANGUAGE_CODES.map(normalizeLanguageCode),
);

export async function POST(request: NextRequest) {
  const user = await resolveUserFromRequest(request);
  if (!user) return unauthorizedResponse();

  const body = await request.json().catch(() => null) as {
    languageCode?: unknown;
  } | null;
  const rawLanguageCode =
    typeof body?.languageCode === 'string' ? body.languageCode.trim() : '';
  const validLanguageCodeShape = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/i.test(
    rawLanguageCode,
  );
  const languageCode = validLanguageCodeShape
    ? normalizeLanguageCode(
        rawLanguageCode.replace(/^[a-z]{2,3}/i, (base) => base.toLowerCase()),
      )
    : '';

  if (!languageCode || !REQUESTABLE_LANGUAGE_CODES.has(languageCode)) {
    return NextResponse.json(
      { error: 'Unsupported language code', code: 'invalid_language' },
      { status: 400 },
    );
  }
  if (BUNDLED_LANGUAGE_CODES.has(languageCode)) {
    return NextResponse.json(
      { error: 'This interface language is already available', code: 'already_supported' },
      { status: 409 },
    );
  }

  const now = new Date();
  await db
    .insert(uiLanguageRequests)
    .values({ userId: user.id, languageCode, updatedAt: now })
    .onConflictDoUpdate({
      target: [uiLanguageRequests.userId, uiLanguageRequests.languageCode],
      set: { updatedAt: now },
    });

  return NextResponse.json({ languageCode }, { status: 201 });
}

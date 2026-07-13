import { NextRequest, NextResponse } from "next/server";
import {
  resolveUserFromRequest,
  unauthorizedResponse,
} from "@/lib/auth";
import {
  countGoogleApiTextUnits,
  getListById,
  findExistingTranslations,
  reserveGoogleApiUsage,
} from "@/lib/db";
import {
  googleTranslate,
  openRouterTranslate,
  getUserApiKey,
  type TranslationResult,
} from "@/lib/translation";
import { normalizeOpenRouterModel } from "@/lib/openrouter-models";
import { OpenRouterChatError } from "@/lib/openrouter-chat";
import { normalizeLanguageCode } from "@/lib/i18n/languages";

const MAX_ITEMS_PER_REQUEST = 500;

type TranslateItem = {
  id: string;
  text: string;
  from_lang: string;
  to_lang: string;
};

export async function POST(request: NextRequest) {
  const user = await resolveUserFromRequest(request);
  if (!user) return unauthorizedResponse();

  const body = await request.json();
  const { items, provider, list_id, input_language } = body as {
    items?: TranslateItem[];
    provider?: string;
    list_id?: string;
    input_language?: "known" | "target";
    translation_model?: string;
  };
  const translationModel = normalizeOpenRouterModel(body.translation_model);

  if (!items || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json(
      { error: "items array is required and must not be empty" },
      { status: 400 },
    );
  }

  if (items.length > MAX_ITEMS_PER_REQUEST) {
    return NextResponse.json(
      { error: `Maximum ${MAX_ITEMS_PER_REQUEST} items per request (limit: 500/user/day)` },
      { status: 400 },
    );
  }

  if (!provider || !["google", "openrouter"].includes(provider)) {
    return NextResponse.json(
      { error: "provider must be 'google' or 'openrouter'" },
      { status: 400 },
    );
  }

  // For openrouter, require BYOK key
  let openRouterKey: string | null = null;
  if (provider === "openrouter") {
    openRouterKey = await getUserApiKey(user.id, "openrouter");
    if (!openRouterKey) {
      return NextResponse.json(
        { error: "OpenRouter requires a stored API key. Add your key in settings." },
        { status: 400 },
      );
    }
  }

  // DB dedup: look for existing translations
  let dedupMap = new Map<string, string>();
  let dedupCount = 0;

  if (list_id) {
    const list = await getListById(list_id);
    if (list) {
      const field = input_language === "target" ? "textTarget" : "textKnown";
      const allTexts = items.map((i) => i.text);
      const existing = await findExistingTranslations(
        allTexts,
        field,
        list.languageFrom,
        list.languageTo,
      );
      dedupMap = new Map(existing.map((e) => [e.text, e.translatedText]));
      dedupCount = dedupMap.size;
    }
  }

  // Split items into dedup-resolved and needs-API
  const dedupResults: { id: string; text: string; translated: string }[] = [];
  const needsApi: TranslateItem[] = [];

  for (const item of items) {
    const cached = dedupMap.get(item.text);
    if (cached) {
      dedupResults.push({ id: item.id, text: item.text, translated: cached });
    } else {
      needsApi.push(item);
    }
  }

  // Call translation API for remaining items
  let apiResults: TranslationResult[] = [];

  if (needsApi.length > 0) {
    const textsToTranslate = needsApi.map((i) => i.text);
    const fromLang = normalizeLanguageCode(needsApi[0].from_lang);
    const toLang = normalizeLanguageCode(needsApi[0].to_lang);

    if (provider === "google") {
      const quota = await reserveGoogleApiUsage({
        userId: user.id,
        scope: "translate",
        units: countGoogleApiTextUnits(textsToTranslate),
        requestCount: textsToTranslate.length,
      });
      if (!quota.allowed) {
        return NextResponse.json(
          {
            error: quota.message,
            code: "GOOGLE_API_ACCOUNT_LIMIT_REACHED",
            scope: quota.scope,
            usage: {
              used_units: quota.usedUnits,
              requested_units: quota.requestedUnits,
              account_limit: quota.accountLimit,
              free_monthly_units: quota.freeMonthlyUnits,
              period_start: quota.periodStart.toISOString(),
            },
          },
          { status: 429 },
        );
      }
      apiResults = await googleTranslate(textsToTranslate, fromLang, toLang);
    } else if (provider === "openrouter" && openRouterKey) {
      try {
        apiResults = await openRouterTranslate(
          textsToTranslate,
          fromLang,
          toLang,
          openRouterKey,
          translationModel,
        );
      } catch (err) {
        if (err instanceof OpenRouterChatError && err.isOutOfCredits) {
          return NextResponse.json(
            {
              error:
                "Your OpenRouter account is out of credits. Add credits to your OpenRouter account, or switch to Google translation.",
              code: "OPENROUTER_OUT_OF_CREDITS",
            },
            { status: 402 },
          );
        }
        throw err;
      }
    }
  }

  // Build unified results array preserving original item order. Match API
  // results back through the `needsApi` index instead of source text so repeated
  // anchors such as "time" or "color" do not collapse into one translation.
  const apiResultById = new Map<string, TranslationResult>();
  needsApi.forEach((item, index) => {
    const result = apiResults[index];
    if (result) apiResultById.set(item.id, result);
  });

  const results = items.map((item) => {
    const dedup = dedupResults.find((d) => d.id === item.id);
    if (dedup) {
      return {
        id: item.id,
        translated_text: dedup.translated,
        status: "ok" as const,
        source: "dedup" as const,
      };
    }

    const apiResult = apiResultById.get(item.id);
    if (apiResult) {
      return {
        id: item.id,
        translated_text: apiResult.translated,
        status: apiResult.status,
        ...(apiResult.error ? { error: apiResult.error } : {}),
        ...(apiResult.warning ? { warning: apiResult.warning } : {}),
        ...(apiResult.validationWarnings?.length
          ? { validation_warnings: apiResult.validationWarnings }
          : {}),
        source: "api" as const,
      };
    }

    return {
      id: item.id,
      translated_text: null,
      status: "error" as const,
      error: "Translation not processed",
      source: "api" as const,
    };
  });

  return NextResponse.json({ results, dedup_count: dedupCount });
}

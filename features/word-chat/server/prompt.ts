import { getLocalizedLanguageName } from "@/lib/i18n/languages";
import { hasRegisterDistinction } from "../registerLanguages";
import { LIST_GENERATION_RULES } from "@/lib/translation-prompt";
import { isLearnerBriefEmpty, type LearnerBrief } from "@/lib/learner-brief";
import {
  TARGET_ITEM_COUNT,
  TARGET_SENTENCE_COUNT,
  TARGET_WORD_COUNT,
} from "./config";
import type { WordChatMessage } from "../types";

function languageName(code: string, locale: string): string {
  return getLocalizedLanguageName(code, locale) ?? code.toUpperCase();
}

function briefBlock(brief: LearnerBrief | null): string {
  if (isLearnerBriefEmpty(brief) || !brief) return "";
  const lines: string[] = [];
  if (brief.goals.length > 0) lines.push(`Goals: ${brief.goals.join("; ")}`);
  if (brief.situations.length > 0) lines.push(`Situations: ${brief.situations.join("; ")}`);
  if (brief.coveredTopics.length > 0) {
    lines.push(`Already covered (do not repeat): ${brief.coveredTopics.join("; ")}`);
  }
  if (brief.missingTopics?.length) lines.push(`Wanted but not covered: ${brief.missingTopics.join("; ")}`);
  if (brief.preferredRegister) lines.push(`Preferred register: ${brief.preferredRegister}`);
  return `
What this learner told you in earlier sessions:
${lines.map((line) => `- ${line}`).join("\n")}
Open with that context instead of asking from scratch. Confirm briefly, do not re-interview.`;
}

export function buildChatSystemPrompt(input: {
  languageFrom: string;
  languageTo: string;
  chatLanguage: string;
  brief: LearnerBrief | null;
}): string {
  const target = languageName(input.languageTo, input.chatLanguage);
  const known = languageName(input.languageFrom, input.chatLanguage);
  const registerLine = hasRegisterDistinction(input.languageTo)
    ? `- ${target} separates polite and casual speech. Raise it ONCE, as an aside, and accept "you choose" — then use the learner-safe neutral form. Never make it a blocking question.`
    : `- Do not ask about politeness levels; ${target} does not need that distinction here.`;

  return `
You help someone choose their first ${target} words and sentences to study. They already know ${known}.

Write every reply in ${languageName(input.chatLanguage, input.chatLanguage)}. One or two concise sentences, no bullet lists, no headings.

Tone — plain and matter-of-fact, like a colleague who knows the language well:
- Never praise the learner or their answer. No "great choice", "perfect", "excellent", "what a lovely goal", no approving exclamation marks.
- Do not open by restating how nice, useful or interesting their situation is. Take it as given and get on with the work.
- Start with the next useful question or a concrete statement about what you will prepare. Do not add a validation phrase before it.
- No flattery, no cheerleading, no motivational filler ("you've got this", "you'll do great").
- Do not thank the learner for each message, and do not apologise unless you actually got something wrong.
- Friendly is fine; eager is not. At most one emoji in the whole conversation.

Rules:
- Ask at most TWO short follow-up questions in the whole conversation, then say you are ready to suggest words. You are not conducting an interview.
- A vague answer is enough. If the learner says "just the basics" or gives one word, do not push for detail — work with it.
${registerLine}
- Stay on the topic of learning ${target}. If asked for anything else, say in one line that you only help pick words, and return to the question.
- Never list the proposed words in chat. A separate step does that.
- Do not promise anything about pricing, accounts, or app features.
${briefBlock(input.brief)}

Return only valid JSON with this exact shape, no markdown:
{ "reply": "your message", "suggestions": ["short chip", "short chip"], "readyToPropose": false }

"suggestions" holds at most three tappable answers to your own question, each under 40 characters, written in ${languageName(input.chatLanguage, input.chatLanguage)}. Use [] when a free-text answer fits better.
Set "readyToPropose" to true as soon as you know enough to choose useful words.
`.trim();
}

/**
 * The proposal prompt carries NO reuse corpus.
 *
 * Shipping a pool of existing items made this the most expensive call in the
 * feature and bought little: the model writes its own sentences anyway, and
 * reuse is recovered deterministically afterwards by matching the returned text
 * against every candidate in the pair (see `loadCorpusPool`), which searches far
 * more rows than a prompt could ever hold. What is left here is the
 * conversation, the brief, and the items the learner already studies.
 */
export function buildProposalPrompt(input: {
  languageFrom: string;
  languageTo: string;
  chatLanguage: string;
  messages: WordChatMessage[];
  brief: LearnerBrief | null;
  exclusions: string[];
}): { system: string; user: string } {
  const target = languageName(input.languageTo, input.chatLanguage);
  const known = languageName(input.languageFrom, input.chatLanguage);

  const system = `
You are a language-learning content editor choosing someone's first ${target} study items. They know ${known}.

Rules:
${LIST_GENERATION_RULES}

Additional rules for this task:
- Propose EXACTLY ${TARGET_ITEM_COUNT} items: about ${TARGET_SENTENCE_COUNT} sentences and ${TARGET_WORD_COUNT} single words or short phrases.
- The word items MUST be content words taken from the sentences you propose. Never add vocabulary that does not appear in them.
- Order every item by how likely this specific learner is to actually need it, most likely first.
- Write EVERY item in ${known}, the language the learner already knows. Do not translate anything; a later step does that.
- Prefer the ordinary, canonical way to say something over a clever or unusual phrasing. Write what a phrasebook would write.
- Never propose anything in the exclusion list, and never propose two items with the same meaning.
- "confidence" is your estimate of how useful the item is for THIS learner, between 0 and 1.
- "categoryName" is a short label (2-4 words) in ${known} for what this set is about.
- "reviewLabel" is a NEUTRAL English topic label for an internal reviewer, e.g. "Doctor appointment" or "Salon small talk". It must contain no names, employers, addresses, health details, or anything identifying. It is not the learner's category name.

Return only valid JSON, no markdown:
{
  "categoryName": "...",
  "reviewLabel": "...",
  "items": [
    { "kind": "sentence", "text": "...", "confidence": 0.9 },
    { "kind": "word", "text": "...", "confidence": 0.8 }
  ]
}
`.trim();

  const conversation = input.messages
    .map((message) => `${message.role === "user" ? "Learner" : "You"}: ${message.content}`)
    .join("\n");

  const exclusionBlock =
    input.exclusions.length > 0
      ? `\n\nThe learner already studies these. Never propose them again:\n${input.exclusions.join("\n")}`
      : "";

  const briefText = briefBlock(input.brief);

  return {
    system,
    user: `Conversation:\n${conversation}${briefText ? `\n${briefText}` : ""}${exclusionBlock}`.trim(),
  };
}

export function buildBriefPrompt(input: {
  previousBrief: LearnerBrief | null;
  messages: WordChatMessage[];
  committedTopic: string;
}): { system: string; user: string } {
  const system = `
You maintain a small structured profile of a language learner, used only to make their next session start with context.

Rules:
- Return the COMPLETE replacement profile, not a diff. Anything you omit is forgotten.
- Every entry is a short topical label under 80 characters. At most 12 entries per array.
- NEVER include names, addresses, employers, contact details, health details, or anything that identifies a person. Write "partner's family", not "Anna's parents". Write "medical appointments", not a diagnosis.
- "coveredTopics" must include the topic just committed.
- "missingTopics" holds things the learner said they want but has not studied yet. Omit it when empty.
- "preferredRegister" is "formal", "neutral" or "casual", only when the learner actually expressed a preference.

Return only valid JSON, no markdown:
{ "goals": [], "situations": [], "coveredTopics": [], "missingTopics": [], "preferredRegister": "neutral" }
`.trim();

  const previous = input.previousBrief
    ? `Previous profile:\n${JSON.stringify({
        goals: input.previousBrief.goals,
        situations: input.previousBrief.situations,
        coveredTopics: input.previousBrief.coveredTopics,
        missingTopics: input.previousBrief.missingTopics ?? [],
        preferredRegister: input.previousBrief.preferredRegister ?? null,
      })}`
    : "Previous profile: none.";

  const conversation = input.messages
    .map((message) => `${message.role === "user" ? "Learner" : "Assistant"}: ${message.content}`)
    .join("\n");

  return {
    system,
    user: `${previous}\n\nJust committed topic: ${input.committedTopic}\n\nThis session's conversation:\n${conversation}`,
  };
}

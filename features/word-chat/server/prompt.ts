import { getLocalizedLanguageName } from "@/lib/i18n/languages";
import { hasRegisterDistinction } from "../registerLanguages";
import { LIST_GENERATION_RULES } from "@/lib/translation-prompt";
import { isLearnerBriefEmpty, type LearnerBrief } from "@/lib/learner-brief";
import { TARGET_ITEM_COUNT } from "./config";
import { proposalDifficultyProfile } from "../difficulty";
import type {
  WordChatAddressRegister,
  WordChatLanguageLevel,
  WordChatMessage,
  WordChatSalutationGender,
} from "../types";

function languageName(code: string, locale: string): string {
  return getLocalizedLanguageName(code, locale) ?? code.toUpperCase();
}

function briefBlock(brief: LearnerBrief | null): string {
  if (isLearnerBriefEmpty(brief) || !brief) return "";
  const lines: string[] = [];
  if (brief.goals.length > 0) lines.push(`Goals: ${brief.goals.join("; ")}`);
  if (brief.situations.length > 0) lines.push(`Situations: ${brief.situations.join("; ")}`);
  if (brief.coveredTopics.length > 0) {
    // "Do not repeat" is about not re-proposing a covered topic unprompted. The
    // learner can still ask to go deeper into one, and that request wins.
    lines.push(
      `Already covered (do not bring these up again on your own; if the learner asks for more on one, go deeper instead of repeating it): ${brief.coveredTopics.join("; ")}`,
    );
  }
  if (brief.missingTopics?.length) lines.push(`Wanted but not covered: ${brief.missingTopics.join("; ")}`);
  if (brief.preferredRegister) lines.push(`Preferred register: ${brief.preferredRegister}`);
  return `
What this learner told you in earlier sessions:
${lines.map((line) => `- ${line}`).join("\n")}
Open with that context instead of asking from scratch. Confirm briefly, do not re-interview.`;
}

function salutationGenderLine(gender: WordChatSalutationGender | null): string {
  if (gender === "female") {
    return "- When direct address in the chat language has grammatical gender, use feminine forms for the learner.";
  }
  if (gender === "male") {
    return "- When direct address in the chat language has grammatical gender, use masculine forms for the learner.";
  }
  if (gender === "neutral") {
    return "- When direct address in the chat language has grammatical gender, avoid gendered wording for the learner where natural.";
  }
  return "";
}

function levelDescription(level: WordChatLanguageLevel): string {
  switch (level) {
    case "A0":
      return "A0: they understand almost nothing; use survival basics and very short patterns.";
    case "A1":
      return "A1: they know a few basic phrases; stay with simple, common phrases.";
    case "A2":
      return "A2: they can manage simple situations; include practical everyday sentences.";
    case "B1":
      return "B1: they already know routine survival vocabulary and can deal with most travel and everyday situations. Teach them to explain problems, give reasons, compare options, make specific requests, and handle complications with connected natural language.";
    case "B2":
      return "B2: they already communicate independently and fluently. Teach precise wording, negotiation, tact, nuance, register, and idiomatic but broadly useful expression.";
  }
}

/**
 * One unified per-level profile used by the proposal prompt.
 *
 * Every level is described along the same four axes, so the model gets a
 * symmetric picture instead of ad-hoc bullets per level:
 *   1. word-item frequency band — a CEILING for A0-A2 (nothing above it),
 *      a FLOOR for B1-B2 (nothing below it),
 *   2. communicative functions in the sense of the CEFR descriptors,
 *   3. grammar ceiling/floor for the sentences,
 *   4. what TYPE of word item is typical for the level.
 *
 * There are no official CEFR word lists for most language pairs we serve
 * (none exist for Vietnamese at all), so frequency bands are the proxy for
 * "vocabulary typical of the level"; functions and grammar come from the
 * CEFR Companion Volume descriptors, which the model knows well.
 */
function proposalDifficultyGuidance(level: WordChatLanguageLevel, target: string): string {
  switch (level) {
    case "A0":
      return `A0 profile:
  - Word-item frequency band (CEILING): the underlying ${target} expression of every word item must be among roughly the 300-500 most frequent words, or a fixed survival chunk built from them. Nothing rarer.
  - CEFR functions to teach: greeting, saying yes/no, stating an immediate need, asking for one thing, saying you do not understand.
  - Sentence grammar: fixed formulaic patterns only. No tenses beyond the default form, no subordinate clauses, no connectors.
  - Typical word items: concrete survival nouns (places, people, food, transport, numbers) and a few essential fixed chunks.`;
    case "A1":
      return `A1 profile:
  - Word-item frequency band (CEILING): the underlying ${target} expression of every word item must be among roughly the 1000 most frequent words. Nothing rarer.
  - CEFR functions to teach: introducing oneself, expressing simple needs and preferences, asking and answering simple concrete questions.
  - Sentence grammar: short, concrete, mostly present-tense sentences. No subordinate clauses; "and" is the only connector.
  - Typical word items: concrete high-frequency nouns and basic verbs; a short fixed phrase only when it is clearly more natural than a single word.`;
    case "A2":
      return `A2 profile:
  - Word-item frequency band (CEILING): the underlying ${target} expression of every word item must be among roughly the 2000 most frequent words, or a very common collocation of such words. No specialist or low-frequency vocabulary unless the learner's situation explicitly requires it.
  - CEFR functions to teach: handling routine transactions, simple descriptions of people/places/plans, simple statements about past and future.
  - Sentence grammar: past and future forms are welcome; simple connectors such as "because", "but", "when", "before". Still concrete and direct — no chained subordinate clauses.
  - Typical word items: everyday verbs, common adjectives, and simple collocations for predictable situations.`;
    case "B1":
      return `B1 profile:
  - Word-item frequency band (FLOOR): the underlying ${target} expression of every word item must sit OUTSIDE the ~2000 most frequent words (roughly the 2000-4000 band), or be a compact collocation whose meaning is not obvious from its parts. Assume the learner ALREADY KNOWS basic labels like "flight", "coffee", "please", "help" — never spend a word slot on them.
  - CEFR functions to teach: explaining a problem and its cause, requesting a specific remedy, comparing options, clarifying conditions, responding when the normal plan fails.
  - Sentence grammar: natural connected sentences using useful B1 grammar — a subordinate clause, condition, reported information, or reason/result — where the situation supports it. Sentences MAY be built largely from lower-level words; that is fine scaffolding. A sentence that merely combines beginner words with no B1 function is still beginner content.
  - Typical word items: precise verbs, problem words, useful adjectives/adverbs, compact collocations. Single words are fine when genuinely B1-useful; do not force every item into a phrase.`;
    case "B2":
      return `B2 profile:
  - Word-item frequency band (FLOOR): the underlying ${target} expression of every word item must sit outside the ~4000 most frequent words (roughly the 4000-8000 band), or be an idiomatic / register-sensitive collocation. Assume all routine A1-B1 vocabulary for the topic is known. Avoid obscure, literary, or narrowly specialist terms unless the learner asked for that domain.
  - CEFR functions to teach: hedging, tactful disagreement, negotiation, qualifying a claim, precise nuanced description, adjusting register.
  - Sentence grammar: hedging constructions, passives, nominalisation, and complex qualification are welcome where natural. Sentences may freely reuse lower-level vocabulary as scaffolding around the B2 target expression.
  - Typical word items: qualifiers, hedges, register-sensitive phrasing, precise verbs, idiomatic but broadly useful collocations. Single-word items are allowed when the word itself is the B2 learning target; otherwise prefer compact reusable chunks. Never bare topic labels.`;
  }
}

function proposalContrastCalibration(level: WordChatLanguageLevel): string {
  switch (level) {
    case "A0":
      return `A0 calibration examples on another topic; do NOT copy them:
  - ABOVE LEVEL: "Could you recommend something less spicy?" -> too much grammar and nuance.
  - ON LEVEL: "Water, please." -> survival phrase.
  - ON LEVEL: "I don't understand." -> essential fixed pattern.`;
    case "A1":
      return `A1 calibration examples on another topic; do NOT copy them:
  - ABOVE LEVEL: "I reserved a table, but I need to change the time." -> too many linked ideas.
  - ON LEVEL: "I have a reservation." -> simple everyday sentence.
  - ON LEVEL: "the bill" -> very common useful vocabulary.`;
    case "A2":
      return `A2 calibration examples on another topic; do NOT copy them:
  - BELOW LEVEL: "Coffee, please." -> A1 survival phrase, too easy.
  - ABOVE LEVEL: "The charge seems to have been added by mistake." -> B1 problem-solving.
  - ON LEVEL: "Can I pay by card?" -> practical everyday sentence.`;
    case "B1":
      return `B1 calibration examples on another topic; do NOT copy them:
  - BELOW LEVEL: "The soup is very good." -> longer beginner words are still beginner content.
  - BELOW LEVEL: "the bill" -> basic topic label the learner likely knows.
  - ON LEVEL: "Could you split this between two bills?" -> specific request with a complication.
  - ON LEVEL: "It seems this item was charged twice." -> useful problem explanation.`;
    case "B2":
      return `B2 calibration examples on another topic; do NOT copy them:
  - BELOW LEVEL: "Could you split this between two bills?" -> useful B1, but too routine for B2.
  - BELOW LEVEL: "charged twice" -> clear but not nuanced enough as a B2 word item.
  - ON LEVEL: "I may have misunderstood the pricing, but this charge seems inconsistent with the menu." -> tact, qualification, precise wording.
  - ON LEVEL: "inconsistent with" -> compact reusable B2 expression.`;
  }
}

export function buildChatSystemPrompt(input: {
  languageFrom: string;
  languageTo: string;
  chatLanguage: string;
  addressRegister: WordChatAddressRegister;
  salutationGender: WordChatSalutationGender | null;
  languageLevel: WordChatLanguageLevel;
  brief: LearnerBrief | null;
}): string {
  const target = languageName(input.languageTo, input.chatLanguage);
  const known = languageName(input.languageFrom, input.chatLanguage);
  const addressLine = hasRegisterDistinction(input.chatLanguage)
    ? input.addressRegister === "formal"
      ? `- Address the learner with polite/formal second-person forms in ${languageName(input.chatLanguage, input.chatLanguage)} (vykání or the closest local equivalent). Keep this consistent.`
      : `- Address the learner with casual/informal second-person forms in ${languageName(input.chatLanguage, input.chatLanguage)} (tykání or the closest local equivalent). Keep this consistent.`
    : "";
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
${addressLine}
${salutationGenderLine(input.salutationGender)}
Learner level in ${target}: ${levelDescription(input.languageLevel)}
${registerLine}
- Stay on the topic of learning ${target}. If asked for anything else, say in one line that you only help pick words, and return to the question.
- You can also change the study pair when the learner explicitly asks. The current pair is ${known} → ${target}. Interpret "I know/speak X" as the source language and "I want to learn/study Y" as the target language. Preserve the current side if they change only one. Use a Google Translate language code (for example cs, en, es, fr, vi, de, uk, zh-CN). Never change a language merely because it appears in a situation they want vocabulary for.
- Never list the proposed words in chat. A separate step does that.
- Do not promise anything about pricing, accounts, or app features.
${briefBlock(input.brief)}

Return only valid JSON with this exact shape and put "reply" first, no markdown:
{ "reply": "your message", "suggestions": ["short chip", "short chip"], "readyToPropose": false, "languageChange": null }

"suggestions" holds at most three tappable answers to your own question, each under 40 characters, written in ${languageName(input.chatLanguage, input.chatLanguage)}. Make them concrete continuations of the learner's latest situation and your latest question; never use generic domain chips such as travel, work, family, customers, food, or office unless the learner just mentioned that exact context. Use [] when a free-text answer fits better.
Set "readyToPropose" to true as soon as you know enough to choose useful words.
Set "languageChange" to { "from": "...", "to": "..." } only for an explicit language-setting request. In that response confirm the new pair briefly, use suggestions [], and keep readyToPropose false. Otherwise it must be null.
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
  languageLevel: WordChatLanguageLevel;
  messages: WordChatMessage[];
  brief: LearnerBrief | null;
  exclusions: string[];
}): { system: string; user: string } {
  const target = languageName(input.languageTo, input.chatLanguage);
  const known = languageName(input.languageFrom, input.chatLanguage);
  const difficulty = proposalDifficultyProfile(input.languageLevel);
  const guidance = proposalDifficultyGuidance(input.languageLevel, target);
  const calibration = proposalContrastCalibration(input.languageLevel);

  const system = `
You are a language-learning content editor choosing someone's first ${target} study items. They know ${known}.

Rules:
${LIST_GENERATION_RULES}

Precedence: the rules above are generic defaults. Wherever they conflict with the ${input.languageLevel} profile below — sentence length, grammar complexity, subordinate clauses, passives, or idiomatic expressions — the level profile wins.

Additional rules for this task:
- Propose EXACTLY ${TARGET_ITEM_COUNT} items: EXACTLY ${difficulty.sentenceCount} sentences and EXACTLY ${difficulty.supportCount} ${difficulty.supportKind}.
- Every word or short-phrase item MUST be taken from the sentences you propose. Never add vocabulary that does not appear in them.
- Order every item by how likely this specific learner is to actually need it, most likely first.
- Write EVERY item in ${known}, the language the learner already knows. Do not translate anything; a later step does that.
- Anchor before generating. Silently decide first: (a) which 2-3 communicative functions from the ${input.languageLevel} profile below this topic calls for, (b) which natural ${target} expressions inside the profile's frequency band would genuinely teach them. Only then write faithful ${known} equivalents of those exact meanings. The visible ${known} wording being common does not make a beginner ${target} expression suitable for a higher level.
- Prefer the ordinary, canonical way to express the level-appropriate meaning over clever, literary, or unusual phrasing.
- Never propose anything in the exclusion list, and never propose two items with the same meaning.
- "confidence" is your estimate of how useful the item is for THIS learner, between 0 and 1.
- "categoryName" is a short label (2-4 words) in ${known} for what this set is about.
- "reviewLabel" is a NEUTRAL English topic label for an internal reviewer, e.g. "Doctor appointment" or "Salon small talk". It must contain no names, employers, addresses, health details, or anything identifying. It is not the learner's category name.
- Learner level: ${levelDescription(input.languageLevel)}
- ${guidance}
- ${calibration}
- Final audit before answering: silently assign a CEFR level to the underlying ${target} expression of EACH word item. If any item falls outside the ${input.languageLevel} profile's frequency band — for A0-A2 above the ceiling, for B1/B2 below the floor — replace it and re-check, unless the profile itself grants an exception for it (such as A2 specialist vocabulary the learner's situation explicitly requires). Do not raise difficulty merely by making a basic sentence longer — difficulty comes from the function and the vocabulary band, not from length.

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
  chatLanguage: string;
}): { system: string; user: string } {
  const visibleLanguage = languageName(input.chatLanguage, input.chatLanguage);
  const system = `
You maintain a small structured profile of a language learner, used only to make their next session start with context.

Rules:
- Return the COMPLETE replacement profile, not a diff. Anything you omit is forgotten.
- Every entry is a short topical label under 80 characters. At most 12 entries per array.
- Write every visible topical label in ${visibleLanguage}. These labels are shown back to the learner as chips in the next session. Translate or rewrite older profile entries into ${visibleLanguage} instead of keeping English.
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

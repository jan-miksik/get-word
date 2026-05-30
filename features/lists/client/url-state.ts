export type InitialAudioFixStep = "audio-target" | "audio-known";

export type InitialListsUrlState = {
  settingsOpen: boolean;
  initialCreateLanguageFrom: string | null;
  initialCreateLanguageTo: string | null;
  shouldOpenCreate: boolean;
  existingListsHint: boolean;
  selectedListId: string | null;
  forkedListPrompt: { listId: string; sourceName: string } | null;
  initialAudioFixStep: InitialAudioFixStep | null;
  notice: string | null;
};

export function readInitialListsUrlState(urlSearch: string): InitialListsUrlState {
  const params = new URLSearchParams(urlSearch);
  const languageFrom = params.get("languageFrom") ?? params.get("targetFrom");
  const languageTo = params.get("languageTo") ?? params.get("targetTo");
  const selected = params.get("selected");
  const fixAudio = params.get("fixAudio");
  const notice = params.get("commonListNotice") ?? params.get("audioNotice");

  return {
    settingsOpen: params.has("openrouter"),
    initialCreateLanguageFrom: languageFrom,
    initialCreateLanguageTo: languageTo,
    shouldOpenCreate: params.get("create") === "1",
    existingListsHint: params.get("sourcePair") === "any",
    selectedListId: selected,
    forkedListPrompt: params.get("forked") === "1" && selected
      ? {
          listId: selected,
          sourceName: params.get("forkedFromName") || "another list",
        }
      : null,
    initialAudioFixStep: fixAudio === "known"
      ? "audio-known"
      : fixAudio === "target"
        ? "audio-target"
        : null,
    notice,
  };
}

export function consumeOneShotListsUrlParams(urlSearch: string): string {
  const params = new URLSearchParams(urlSearch);
  params.delete("fixAudio");
  params.delete("commonListNotice");
  params.delete("audioNotice");
  return `/lists?${params.toString()}`;
}

export function selectedListUrl(
  listId: string,
  forkPrompt?: { sourceName: string } | null,
): string {
  const params = new URLSearchParams(
    typeof window === "undefined" ? "" : window.location.search,
  );
  params.set("selected", listId);
  params.delete("create");
  params.delete("sourcePair");
  params.delete("targetFrom");
  params.delete("targetTo");

  if (forkPrompt) {
    params.set("forked", "1");
    params.set("forkedFromName", forkPrompt.sourceName);
  } else {
    params.delete("forked");
    params.delete("forkedFromName");
  }

  return `/lists?${params.toString()}`;
}

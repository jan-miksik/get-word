import { describe, expect, it } from 'vitest';

import { csMessages } from '@/lib/i18n/locales/cs';
import { enMessages } from '@/lib/i18n/locales/en';
import { ukMessages } from '@/lib/i18n/locales/uk';
import { viMessages } from '@/lib/i18n/locales/vi';
import {
  REMINDER_COPY,
  reminderCopyFor,
} from '@/supabase/functions/send-study-reminders/messages';

/**
 * The reminder text exists twice: in the interface dictionaries, and in the
 * Edge Function that builds the push payload. The Edge Function is deployed on
 * its own and cannot import the app, so nothing but this test stops the two
 * from drifting apart — and drift is invisible in the app, because the payload
 * is what the learner reads.
 */
const DICTIONARIES = {
  en: enMessages,
  cs: csMessages,
  uk: ukMessages,
  vi: viMessages,
} as const;

describe('study reminder push copy', () => {
  it.each(Object.keys(DICTIONARIES))('matches the %s interface dictionary', (language) => {
    const messages = DICTIONARIES[language as keyof typeof DICTIONARIES];
    expect(REMINDER_COPY[language]).toEqual({
      title: messages['goal.reminderPushTitle'],
      body: messages['goal.reminderPushBody'],
    });
  });

  it('covers every language whose dictionary ships in source control', () => {
    expect(Object.keys(REMINDER_COPY).sort()).toEqual(Object.keys(DICTIONARIES).sort());
  });

  it('reads a regional tag as its base language', () => {
    expect(reminderCopyFor('cs-CZ')).toEqual(REMINDER_COPY.cs);
    expect(reminderCopyFor('CS')).toEqual(REMINDER_COPY.cs);
  });

  it('falls back to English for an unbundled, empty, or missing preference', () => {
    expect(reminderCopyFor('de')).toEqual(REMINDER_COPY.en);
    expect(reminderCopyFor('')).toEqual(REMINDER_COPY.en);
    expect(reminderCopyFor(null)).toEqual(REMINDER_COPY.en);
    expect(reminderCopyFor(undefined)).toEqual(REMINDER_COPY.en);
  });
});

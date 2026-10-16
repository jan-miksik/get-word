import type { TesterScope } from '@/lib/stats/types';
import type { StatsUserFilter } from './stats-shared';

function parseEnvList(value: string | undefined, normalize: (item: string) => string = (item) => item): string[] {
  if (!value) return [];
  return Array.from(
    new Set(
      value
        .split(/[\s,;]+/)
        .map((item) => normalize(item.trim()))
        .filter(Boolean)
    )
  );
}

/**
 * Which accounts the admin dashboard reports on.
 *
 * Two separate populations are named out, and they behave differently:
 * - The team's own accounts, from ADMIN_STATS_EXCLUDED_USER_EMAILS/_IDS, are
 *   never part of any reading.
 * - The store-review and QA accounts, read from the `tester_accounts` table by
 *   `getTesterAccountEmails()` and passed in as `testerEmails`, are hidden by
 *   default, reported on alone under 'only', and mixed in under 'all'.
 */
export function resolveStatsUserFilter(options: {
  testerScope: TesterScope;
  testerEmails: string[];
  excludedUserIds?: string[];
  excludedUserEmails?: string[];
}): StatsUserFilter {
  const envExcludedEmails = (
    options.excludedUserEmails ?? parseEnvList(process.env.ADMIN_STATS_EXCLUDED_USER_EMAILS)
  ).map((email) => email.toLowerCase());

  const testerEmails = Array.from(
    new Set(options.testerEmails.map((email) => email.trim().toLowerCase()).filter(Boolean))
  );

  return {
    excludedUserIds: options.excludedUserIds ?? parseEnvList(process.env.ADMIN_STATS_EXCLUDED_USER_IDS),
    excludedUserEmails:
      options.testerScope === 'hide' ? [...envExcludedEmails, ...testerEmails] : envExcludedEmails,
    onlyUserEmails: options.testerScope === 'only' ? testerEmails : [],
  };
}

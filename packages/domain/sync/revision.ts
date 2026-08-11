export type SyncRevisionDomain = 'settings_language' | 'language_pair';

/**
 * Raised when a mutation was based on a server revision that is no longer
 * current. Kept in the domain layer so HTTP handling does not import a DB
 * query module just to classify an expected business outcome.
 */
export class SyncRevisionConflictError extends Error {
  constructor(readonly domain: SyncRevisionDomain) {
    super(`Stale ${domain} revision`);
    this.name = 'SyncRevisionConflictError';
  }
}

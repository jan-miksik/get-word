/**
 * Audit limits, kept in a module that touches nothing else.
 *
 * `scripts/scan-quality-pool.ts` needs the ceiling while parsing arguments,
 * before it loads any module that opens a database connection.
 */

/** Hard ceiling on pairs sent to the external model in one run. */
export const MAX_AUDIT_ITEMS = 200;

import { db } from "../client";

/**
 * Either the top-level `db` instance or a transaction handle from
 * `db.transaction(...)`. Both expose the methods (insert / select / update /
 * delete) callers use, so a query helper can opt into running inside a caller's
 * transaction without knowing which one it got. The transaction-handle type is
 * derived from drizzle's own callback signature to stay in sync with the
 * installed version.
 */
export type TxHandle = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type Executor = typeof db | TxHandle;

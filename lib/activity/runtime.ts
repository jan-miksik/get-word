'use client';

import { createBrowserId } from '@/lib/browser-id';
import { flushOutboxNow, scheduleDrain } from '@/lib/local-first/drainer';
import { appendOp } from '@/lib/local-first/outbox';
import {
  ensureLocalFirstAvailability,
  isLocalFirstAvailableSync,
} from '@/lib/local-first/availability';
import { getDeviceId } from '@/lib/device-id';
import { currentIanaTimezone, localDayKeyAt } from '@/lib/local-day';
import { getSyncOwner } from '@/lib/sync';
import {
  isGoalCreditedSurface,
  type ActivitySurface,
} from '@/packages/contracts/src/activity';
import {
  TICK_MS,
  createActivityTracker,
  type ActivityCheckpoint,
  type ActivitySegment,
  type ActivityTracker,
} from '@/packages/product/shared/activity/tracker';

/**
 * Browser/native wiring for the activity tracker. The state machine itself is
 * in `packages/product/shared/activity/tracker` and knows nothing about the
 * DOM; this file owns the lifecycle signals, persistence and delivery.
 *
 * Durability model, in the order that matters:
 *
 *   durable local checkpoint  = the guarantee
 *   pagehide urgent drain     = best-effort optimization
 *   next-startup recovery     = the fallback that makes the optimization optional
 *
 * The browser or iOS can end execution anywhere in
 * `pagehide → appendOp → drain → fetch → server`, so nothing in that chain is
 * promised. A segment that was appended but whose checkpoint outlived it is
 * simply redelivered under the same `client_segment_id`, which the server
 * deduplicates.
 */

const INSTANCE_KEY = 'get_word_activity_instance';
const CHECKPOINT_PREFIX = 'get_word_activity_segment:';
const CHANNEL_NAME = 'get-word:activity';
const SYNC_OWNER_CHANGED_EVENT = 'get-word:sync-owner-changed';

const CHECKPOINT_WRITE_MS = 10_000;
const INTERACTION_THROTTLE_MS = 1_000;
/** Orphaned checkpoints are deleted, never recovered, after this long. */
const ORPHAN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** How long to wait for another tab to claim our instance id. */
const CLAIM_REPLY_MS = 250;

type ChannelMessage =
  | { type: 'claim?'; instanceId: string }
  | { type: 'claimed'; instanceId: string };

interface RuntimeState {
  tracker: ActivityTracker;
  instanceId: string;
  channel: BroadcastChannel | null;
  documentVisible: boolean;
  windowFocused: boolean;
  nativeAppActive: boolean;
  /** True once the Capacitor shell reports app state; see effectiveActive(). */
  nativeMode: boolean;
  owner: string | null;
  pendingCheckpoint: ActivityCheckpoint | null;
  lastCheckpointWrite: number;
  lastInteractionAt: number;
  /** Suppresses the clear-on-close so a kill mid-append stays recoverable. */
  holdCheckpoint: boolean;
  /** Segments whose outbox append has not resolved yet; same suppression. */
  pendingSegmentWrites: number;
  /** Recovery and measurement stay paused until duplicate-tab claiming ends. */
  instanceClaimSettled: boolean;
  /** Recovery runs once, on the first tick where claim and owner are both known. */
  recoveryDone: boolean;
  /** Successfully appended recovery records retained only across pagehide. */
  appendedCheckpointKeys: Set<string>;
  /**
   * The IANA zone belongs to the source segment, rather than the moment an
   * asynchronous outbox write happens. A learner can cross a timezone while a
   * segment is open (or before its write is scheduled).
   */
  segmentTimezones: Map<string, string>;
  tickTimer: ReturnType<typeof setInterval> | null;
  recomputeQueued: boolean;
  teardown: Array<() => void>;
}

let state: RuntimeState | null = null;

/**
 * What a day's clock is worth to the display right now.
 *
 * The server is the durable source of truth, but it is a *lagging* one: a
 * closed segment reaches it through the outbox, which is debounced by half a
 * minute and flushed for real on shutdown. So between closing a segment and
 * the server folding it there is a window — often minutes — where the server
 * total is genuinely smaller than the time the learner has spent.
 *
 * That window is why the local part is anchored instead of discarded. This map
 * lives at module scope rather than on `RuntimeState` so it survives the
 * tracker being stopped and started; its localStorage mirror also survives a
 * reload. It remains display bookkeeping only: nothing here is reported or
 * summed by the server.
 */
interface DayLedger {
  /** Highest day total the server has confirmed. Only ever grows. */
  serverMs: number;
  /** The server total this page's own uncredited time is stacked on top of. */
  baselineMs: number;
  /** Closed segments measured here that `serverMs` does not include yet. */
  localMs: number;
  /**
   * Which segments `localMs` is made of.
   *
   * A segment whose delivery did not finish is redelivered from its recovery
   * record on the next startup, under the same id — and now that the ledger
   * itself survives that startup, adding it a second time would move the clock
   * forward by the whole undelivered stretch on every reload. Ids are dropped
   * together with `localMs` the moment the server passes it.
   */
  countedIds: string[];
}

/** Bounds the stored id list; a day cannot hold many more than this anyway. */
const MAX_COUNTED_IDS = 500;

const LEDGER_PREFIX = 'get_word_activity_day:';
/** Ledgers older than this are noise; swept once per page. */
const LEDGER_TTL_DAYS = 3;

const dayLedgers = new Map<string, DayLedger>();
let dayLedgerOwner: string | null = null;
let ledgersSwept = false;

/**
 * Which zone the display ledger buckets measured time into.
 *
 * The goal summary computes its day keys in the *account's* stored zone, and
 * the countdown asks this file for the total under one of those keys. Bucketing
 * by the browser's own zone instead answers a question nobody asked whenever
 * the two disagree: every closed segment lands under a key the display never
 * reads, and the clock stands still with nothing to show for it. Segments on
 * the wire keep their own `timezone_at_creation` — the server splits them at
 * their own local midnight — so this is display bookkeeping only.
 */
let goalDayTimezone: string | null = null;

/** Told by the countdown, which is the only thing that reads a day total. */
export function setActivityGoalTimezone(timezone: string | null): void {
  goalDayTimezone = timezone;
}

function ledgerTimezone(): string {
  return goalDayTimezone ?? currentIanaTimezone();
}

function ledgerStorageKey(dayKey: string): string {
  return `${LEDGER_PREFIX}${dayKey}`;
}

/**
 * Reloading is an interruption, not a reset.
 *
 * The uncredited part of a day lives here for as long as it takes the outbox
 * to deliver it and the server to fold it — minutes on a good connection, the
 * rest of the day offline. Keeping it in memory only meant a reload (or an
 * app the OS killed, which on a phone is most of them) handed the learner back
 * a countdown that had forgotten the last stretch they studied.
 */
function readStoredLedger(dayKey: string, owner: string | null): DayLedger | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(ledgerStorageKey(dayKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Record<keyof DayLedger, unknown>> & {
      owner?: unknown;
    };
    // Time measured under another account must never surface on this one's
    // clock. A record written before the first sync named the account has no
    // owner and is adopted; a mismatch is dropped.
    if (typeof parsed.owner === 'string' && parsed.owner !== owner) return null;
    const numeric = (value: unknown) =>
      typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
    return {
      serverMs: numeric(parsed.serverMs),
      baselineMs: numeric(parsed.baselineMs),
      localMs: numeric(parsed.localMs),
      countedIds: Array.isArray(parsed.countedIds)
        ? parsed.countedIds.filter((id): id is string => typeof id === 'string')
        : [],
    };
  } catch {
    return null;
  }
}

function persistLedger(
  dayKey: string,
  ledger: DayLedger,
  owner: string | null = state?.owner ?? getSyncOwner(),
): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(
      ledgerStorageKey(dayKey),
      JSON.stringify({ ...ledger, owner }),
    );
  } catch {
    // Quota or a hardened context. The in-memory ledger still serves this page.
  }
  if (!ledgersSwept) {
    ledgersSwept = true;
    sweepOldLedgers(dayKey);
  }
}

function sweepOldLedgers(todayKey: string): void {
  const store = storage();
  if (!store) return;
  const cutoff = new Date(`${todayKey}T00:00:00Z`);
  if (Number.isNaN(cutoff.getTime())) return;
  cutoff.setUTCDate(cutoff.getUTCDate() - LEDGER_TTL_DAYS);
  // Day keys are ISO dates, so a string compare is a date compare.
  const cutoffKey = cutoff.toISOString().slice(0, 10);
  const stale: string[] = [];
  for (let index = 0; index < store.length; index += 1) {
    const key = store.key(index);
    if (!key || !key.startsWith(LEDGER_PREFIX)) continue;
    if (key.slice(LEDGER_PREFIX.length) < cutoffKey) stale.push(key);
  }
  for (const key of stale) {
    try {
      store.removeItem(key);
    } catch {
      // Nothing to do; it is only bookkeeping.
    }
  }
}

function ledgerFor(
  dayKey: string,
  owner: string | null = state?.owner ?? getSyncOwner(),
): DayLedger {
  if (dayLedgerOwner !== owner) {
    dayLedgers.clear();
    dayLedgerOwner = owner;
    ledgersSwept = false;
  }
  let ledger = dayLedgers.get(dayKey);
  if (!ledger) {
    ledger = readStoredLedger(dayKey, owner) ?? {
      serverMs: 0,
      baselineMs: 0,
      localMs: 0,
      countedIds: [],
    };
    dayLedgers.set(dayKey, ledger);
  }
  return ledger;
}

/**
 * Records the server's total for a day.
 *
 * The local stack is dropped only once the server has demonstrably caught up
 * with it — never merely because a fresh summary arrived. Clearing it on every
 * refresh is what used to make the clock fall back to a stale total (and, when
 * nothing had been delivered yet, all the way back to zero) each time a screen
 * that owns the countdown remounted.
 *
 * The mirror-image risk — a segment the server already stored being re-added
 * locally when its recovery record outlives the delivery — is closed by
 * `countedIds`: the ledger adds each `client_segment_id` once, so redelivery
 * cannot move the clock. Whichever way the race falls, the number only ever
 * goes down.
 */
export function seedActivityDayTotal(dayKey: string, activeMs: number): void {
  const serverMs = Math.max(0, Math.round(activeMs));
  const ledger = ledgerFor(dayKey);
  // Summaries can answer out of order; an older, smaller total must not undo a
  // newer one.
  ledger.serverMs = Math.max(ledger.serverMs, serverMs);
  if (ledger.serverMs >= ledger.baselineMs + ledger.localMs) {
    ledger.baselineMs = ledger.serverMs;
    ledger.localMs = 0;
    ledger.countedIds = [];
  }
  persistLedger(dayKey, ledger);
}

/** Best-known local display value; it is not a persistence or reporting API. */
export function getBestKnownDayActiveMs(dayKey: string): number {
  const ledger = ledgerFor(dayKey);
  // Whichever knows more: the server's own total, or ours stacked on the last
  // one it confirmed.
  const credited = Math.max(ledger.serverMs, ledger.baselineMs + ledger.localMs);
  const open = state?.tracker.peek();
  // An open segment only belongs to the current local day for display. Closed
  // segments are registered in onSegment under the same zone.
  // `uncreditedMs` is the part of the open segment the next five-second tick
  // will credit; including it is what lets a displayed clock advance every
  // second instead of standing still and then jumping.
  const openLocal =
    open?.open &&
    isGoalCreditedSurface(open.surface) &&
    localDayKeyAt(Date.now(), ledgerTimezone()) === dayKey
      ? open.activeMs + open.uncreditedMs
      : 0;
  return Math.max(0, Math.round(credited + openLocal));
}

/**
 * Drops every day's display bookkeeping. Test seam only: the ledgers outlive
 * `startActivityTracking`, which is what a remount needs and what a fresh test
 * case must not inherit.
 */
export function __resetActivityDayLedgersForTests(
  options: { keepStorage?: boolean } = {},
): void {
  dayLedgers.clear();
  dayLedgerOwner = null;
  goalDayTimezone = null;
  ledgersSwept = false;
  // `keepStorage` is how a test spells "reload": the page's memory is gone and
  // the durable copy is not.
  if (options.keepStorage) return;
  const store = storage();
  if (!store) return;
  const keys: string[] = [];
  for (let index = 0; index < store.length; index += 1) {
    const key = store.key(index);
    if (key?.startsWith(LEDGER_PREFIX)) keys.push(key);
  }
  for (const key of keys) store.removeItem(key);
}

/**
 * What the clock is doing at this instant. Display only.
 *
 * "Not counting" has several causes and they are not interchangeable, so the
 * countdown gets to say which one it is rather than freezing mutely:
 *
 *  - `counting` — time is accruing towards the goal.
 *  - `idle` — measuring, on a credited surface, but the idle horizon has
 *    passed. The clock is waiting for the learner; the next tap starts it.
 *  - `elsewhere` — measuring, but on a surface the goal does not credit. The
 *    tracker is perfectly happy here, which is exactly why this has to be its
 *    own answer: `accruing` alone would claim the clock is running while the
 *    number it feeds cannot move.
 *  - `paused` — the app is backgrounded or the window is unfocused.
 *  - `unmeasured` — nothing is being measured: the tracker is not running, the
 *    duplicate-tab claim has not settled, or the account is not known yet.
 *
 * Everything except `counting` is a reason the digits are standing still, and
 * the strip shows every one of them. The previous version collapsed the last
 * three into a silent `off`, on the theory that nobody is looking at a
 * backgrounded page — which is true, and which also meant that a clock stuck
 * for any of those reasons looked identical to a broken one.
 */
export type ActivityClockState = 'counting' | 'idle' | 'elsewhere' | 'paused' | 'unmeasured';

export function getActivityClockState(): ActivityClockState {
  const current = state;
  if (!current) return 'unmeasured';
  if (!measurementReady(current)) return 'unmeasured';
  if (!inForeground(current)) return 'paused';
  const peeked = current.tracker.peek();
  if (!isGoalCreditedSurface(peeked.surface)) return 'elsewhere';
  return peeked.accruing ? 'counting' : 'idle';
}

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    // Hardened/private contexts can throw on access rather than return null.
    return null;
  }
}

function sessionStore(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function checkpointKey(instanceId: string): string {
  return `${CHECKPOINT_PREFIX}${instanceId}`;
}

/**
 * Closed segments get their own recovery records. The open-segment checkpoint
 * is allowed to advance to a successor while an earlier IndexedDB append is in
 * flight; sharing one key would otherwise overwrite the only durable copy of
 * the earlier segment.
 */
function closedCheckpointKey(instanceId: string, clientSegmentId: string): string {
  return `${checkpointKey(instanceId)}:closed:${clientSegmentId}`;
}

function isOwnCheckpointKey(key: string, instanceId: string): boolean {
  const base = checkpointKey(instanceId);
  return key === base || key.startsWith(`${base}:closed:`);
}

/**
 * Per-tab id. `sessionStorage` is the right scope: it survives a reload in this
 * tab (so a refresh recovers its own segment) but is not shared with other
 * tabs, unlike `localStorage`, where a single key would have tabs overwriting
 * each other's checkpoints.
 */
function readOrCreateInstanceId(): string {
  const store = sessionStore();
  const existing = store?.getItem(INSTANCE_KEY);
  if (existing) return existing;
  const created = createBrowserId('act-instance');
  try {
    store?.setItem(INSTANCE_KEY, created);
  } catch {
    // In-memory for this page's lifetime is enough.
  }
  return created;
}

function regenerateInstanceId(current: RuntimeState): void {
  const next = createBrowserId('act-instance');
  try {
    sessionStore()?.setItem(INSTANCE_KEY, next);
  } catch {
    // Ignore; the new id still applies for this page.
  }
  current.instanceId = next;
}

/**
 * Duplicating a tab can seed the copy's `sessionStorage` from the original, so
 * two live trackers may start out sharing an id — and therefore a checkpoint
 * key. Announce ours; if a live tracker answers, take a new one.
 */
function guardInstanceIdCollision(current: RuntimeState): void {
  const settleClaim = () => {
    if (current.instanceClaimSettled || state !== current) return;
    current.instanceClaimSettled = true;
    adoptInheritedOpenCheckpoint(current);
    // `current.owner` may already be populated from a previous sync in this
    // SPA. The tracker has its own owner field, though, and needs the value as
    // well so any checkpoint opened before the next server-sync event remains
    // recoverable under that account. Do this only after parking an inherited
    // open record: setOwner emits checkpoint(null), which clears the bare key.
    current.tracker.setOwner(current.owner);
    sweepForeignCheckpoints(current);
    maybeRecoverCheckpoints(current);
    applyActive(current);
  };

  if (typeof BroadcastChannel === 'undefined') {
    settleClaim();
    return;
  }

  let channel: BroadcastChannel;
  try {
    channel = new BroadcastChannel(CHANNEL_NAME);
  } catch {
    settleClaim();
    return;
  }
  current.channel = channel;

  channel.onmessage = (event: MessageEvent<ChannelMessage>) => {
    const message = event.data;
    if (!message || typeof message !== 'object') return;
    if (message.type === 'claim?' && message.instanceId === current.instanceId) {
      // Someone else booted with our id: tell them it is taken.
      channel.postMessage({ type: 'claimed', instanceId: current.instanceId });
      return;
    }
    if (
      !current.instanceClaimSettled &&
      message.type === 'claimed' &&
      message.instanceId === current.instanceId
    ) {
      regenerateInstanceId(current);
    }
  };

  channel.postMessage({ type: 'claim?', instanceId: current.instanceId });
  const timer = setTimeout(() => {
    // No reply means the id is ours. A reply has already regenerated it, so in
    // either case recovery now operates only on a key no live tab owns.
    settleClaim();
  }, CLAIM_REPLY_MS);
  current.teardown.push(() => {
    clearTimeout(timer);
    channel.onmessage = null;
    try {
      channel.close();
    } catch {
      // Already closed.
    }
  });
}

function parseCheckpoint(raw: string | null): ActivityCheckpoint | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ActivityCheckpoint;
    if (typeof parsed?.client_segment_id !== 'string') return null;
    if (typeof parsed?.last_accounted_wall !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Recovers this instance's own checkpoint, and garbage-collects long-dead ones.
 *
 * Another instance's checkpoint is never recovered, even when it looks stale.
 * Age does not prove death: a live tab can be backgrounded, frozen, or on a
 * sleeping laptop for many minutes. Emitting its segment would post a truncated
 * copy under the same `client_segment_id` the owner still holds, and because
 * the server takes the first write, the owner's fuller version would then be
 * silently dropped. Losing the tail of a genuinely dead tab is the better
 * failure, so orphans are deleted rather than claimed.
 */
function recoverOwnCheckpoint(current: RuntimeState): void {
  const store = storage();
  if (!store) return;

  // There can be one open checkpoint plus any number of closed segments whose
  // outbox appends did not finish. Read the key list before restoring because a
  // restore immediately requeues the segment and therefore writes its closed
  // checkpoint again under the same key.
  const ownRecords: Array<{ key: string; checkpoint: ActivityCheckpoint }> = [];
  const invalidOwnKeys: string[] = [];
  for (let index = 0; index < store.length; index += 1) {
    const key = store.key(index);
    if (!key || !isOwnCheckpointKey(key, current.instanceId)) continue;
    const checkpoint = parseCheckpoint(store.getItem(key));
    if (checkpoint) ownRecords.push({ key, checkpoint });
    else invalidOwnKeys.push(key);
  }
  ownRecords.sort(
    (left, right) => left.checkpoint.last_accounted_wall - right.checkpoint.last_accounted_wall,
  );
  for (const key of invalidOwnKeys) store.removeItem(key);
  for (const record of ownRecords) store.removeItem(record.key);
  for (const { checkpoint } of ownRecords) {
    // Never adopt activity measured under a different account.
    if (checkpoint.owner === current.owner) current.tracker.restore(checkpoint);
  }
}

/**
 * Moves a checkpoint inherited from the previous page life off the live
 * open-segment key and onto a closed-segment one.
 *
 * Recovery waits for the account, but this instance starts writing immediately:
 * the first `checkpoint(null)` — which `tracker.setOwner()` produces as soon as
 * identity arrives — removes the bare key, taking the inherited record with it
 * before anything could restore it. Closed-segment keys are only ever written
 * per segment id and never blanket-removed, so parking it there makes it immune
 * while keeping it durable if the page dies before the account resolves.
 */
function adoptInheritedOpenCheckpoint(current: RuntimeState): void {
  const store = storage();
  if (!store) return;
  const openKey = checkpointKey(current.instanceId);
  const inherited = parseCheckpoint(store.getItem(openKey));
  if (!inherited) return;
  try {
    store.setItem(
      closedCheckpointKey(current.instanceId, inherited.client_segment_id),
      JSON.stringify(inherited),
    );
    store.removeItem(openKey);
  } catch {
    // Could not park it; leave the original in place — recovery reads that key
    // too, it is merely exposed to being cleared first.
  }
}

/**
 * Recovery is deferred until the account is known.
 *
 * `getSyncOwner()` is null until the first sync response names the account, so
 * running recovery at boot would compare every stored checkpoint against null,
 * match nothing, and delete the lot — silently discarding exactly the segments
 * the durability model promises to redeliver. Waiting costs one round trip and
 * nothing else: measurement is suspended while the owner is unknown anyway.
 *
 * Own records left behind by a page life that never signed in again are aged
 * out by `sweepForeignCheckpoints` instead.
 */
function maybeRecoverCheckpoints(current: RuntimeState): void {
  if (current.recoveryDone) return;
  if (!current.instanceClaimSettled || current.owner === null) return;
  current.recoveryDone = true;
  recoverOwnCheckpoint(current);
}

/**
 * Garbage-collects checkpoints this instance will never recover: another
 * instance's records once they are older than the TTL, and our own once they
 * are that old too — at which point no sign-in is coming for them.
 *
 * Safe to run before recovery: at claim time nothing has opened a segment yet
 * (measurement needs both a settled claim and an owner), so every own record in
 * storage was written by an earlier page life.
 */
function sweepForeignCheckpoints(current: RuntimeState): void {
  const store = storage();
  if (!store) return;
  const now = Date.now();
  const stale: string[] = [];
  for (let index = 0; index < store.length; index += 1) {
    const key = store.key(index);
    if (!key || !key.startsWith(CHECKPOINT_PREFIX)) continue;
    const parsed = parseCheckpoint(store.getItem(key));
    if (isOwnCheckpointKey(key, current.instanceId)) {
      // Ours: only drop it once it is too old to be worth redelivering.
      if (parsed && now - parsed.checkpointed_at <= ORPHAN_TTL_MS) continue;
    }
    if (!parsed || now - parsed.checkpointed_at > ORPHAN_TTL_MS) stale.push(key);
  }
  for (const key of stale) store.removeItem(key);
}

/**
 * Persist the exact immutable segment before starting its asynchronous outbox
 * append. This record is separate from the live checkpoint so a successor can
 * be checkpointed without replacing it.
 */
function persistClosedSegment(
  current: RuntimeState,
  segment: ActivitySegment,
  owner: string,
): string | null {
  const store = storage();
  if (!store) return null;
  const key = closedCheckpointKey(current.instanceId, segment.client_segment_id);
  const checkpoint: ActivityCheckpoint = {
    owner,
    session_id: segment.session_id,
    client_segment_id: segment.client_segment_id,
    surface: segment.surface,
    started_at: segment.started_at,
    last_accounted_wall: segment.ended_at,
    active_ms: segment.active_ms,
    interactions: segment.interactions,
    last_interaction_wall: segment.ended_at,
    checkpointed_at: Date.now(),
  };
  try {
    store.setItem(key, JSON.stringify(checkpoint));
  } catch {
    return null;
  }

  // This exact closed record supersedes the possibly throttled open checkpoint.
  // Removing it also prevents recovery from racing a stale and a final copy of
  // the same client_segment_id into the outbox.
  try {
    store.removeItem(checkpointKey(current.instanceId));
  } catch {
    // The exact record was stored successfully, so durability is intact.
  }
  return key;
}

function removeStoredCheckpoint(key: string | null): void {
  if (!key) return;
  try {
    storage()?.removeItem(key);
  } catch {
    // A leftover record only causes an idempotent redelivery on next startup.
  }
}

function releaseAppendedCheckpoints(current: RuntimeState): void {
  for (const key of current.appendedCheckpointKeys) removeStoredCheckpoint(key);
  current.appendedCheckpointKeys.clear();
}

function writeCheckpointNow(current: RuntimeState): void {
  const store = storage();
  if (!store) return;
  const key = checkpointKey(current.instanceId);
  try {
    if (current.pendingCheckpoint) {
      store.setItem(key, JSON.stringify(current.pendingCheckpoint));
    } else if (!current.holdCheckpoint && current.pendingSegmentWrites === 0) {
      store.removeItem(key);
    }
  } catch {
    // Quota or private mode: the segment is still in memory and will be
    // delivered through the outbox on the normal path.
  }
  current.lastCheckpointWrite = Date.now();
}

function onCheckpoint(current: RuntimeState, next: ActivityCheckpoint | null): void {
  if (next && !current.segmentTimezones.has(next.client_segment_id)) {
    current.segmentTimezones.set(next.client_segment_id, currentIanaTimezone());
  }
  current.pendingCheckpoint = next;
  // Throttled: interactions can arrive many times a second and localStorage
  // writes are synchronous. Closing a segment always writes immediately.
  const due = Date.now() - current.lastCheckpointWrite >= CHECKPOINT_WRITE_MS;
  if (next === null || due) writeCheckpointNow(current);
}

/**
 * Queues a closed segment for delivery.
 *
 * The checkpoint that describes this segment must outlive the append. Closing a
 * segment emits it and then immediately reports `checkpoint(null)`, but the
 * append is asynchronous, and the very moments this fires at — the tab being
 * hidden, frozen, or backgrounded on a phone — are exactly when the OS may stop
 * running JavaScript before an IndexedDB transaction commits. Clearing the
 * recovery record first would make that gap unrecoverable, which is precisely
 * what the durability model at the top of this file promises it is not. The
 * hold is released once the write has landed; a redelivery costs nothing,
 * because the server deduplicates on `client_segment_id`.
 */
function onSegment(current: RuntimeState, segment: ActivitySegment): void {
  const owner = current.owner;
  // Nothing to attribute it to, and no endpoint that would accept it.
  if (owner === null) return;
  const timezoneAtCreation =
    current.segmentTimezones.get(segment.client_segment_id) ?? currentIanaTimezone();
  current.segmentTimezones.delete(segment.client_segment_id);
  // The ledger key follows the zone the goal day is drawn in, not the segment's
  // own; see `ledgerTimezone`. The wire payload below keeps `timezoneAtCreation`.
  const ledgerDayKey = localDayKeyAt(segment.started_at, ledgerTimezone());
  // Only what the day rollup will also credit, or the clock would run down
  // against a server total that never catches up with it.
  if (isGoalCreditedSurface(segment.surface)) {
    const ledger = ledgerFor(ledgerDayKey, owner);
    if (!ledger.countedIds.includes(segment.client_segment_id)) {
      ledger.countedIds.push(segment.client_segment_id);
      if (ledger.countedIds.length > MAX_COUNTED_IDS) {
        ledger.countedIds.splice(0, ledger.countedIds.length - MAX_COUNTED_IDS);
      }
      ledger.localMs += segment.active_ms;
      persistLedger(ledgerDayKey, ledger, owner);
    }
  }
  const recoveryKey = persistClosedSegment(current, segment, owner);
  current.pendingSegmentWrites += 1;
  void (async () => {
    let appended = false;
    try {
      const available = isLocalFirstAvailableSync()
        ? true
        : await ensureLocalFirstAvailability();
      if (!available) return;
      const queued = await appendOp({
        entity: 'activity_segment',
        opType: 'event',
        payload: {
          ...segment,
          owner,
          local_day_key: localDayKeyAt(segment.started_at, timezoneAtCreation),
          timezone_at_creation: timezoneAtCreation,
        },
        clientOpId: segment.client_segment_id,
        deviceId: safeDeviceId(),
      });
      // appendOp resolves null when opening IndexedDB or committing its
      // transaction failed. Only a non-null result means the durable outbox now
      // owns the segment and the recovery record may be removed.
      if (!queued) return;
      appended = true;
      if (recoveryKey) {
        if (current.holdCheckpoint) current.appendedCheckpointKeys.add(recoveryKey);
        else removeStoredCheckpoint(recoveryKey);
      }
      scheduleDrain();
    } catch (error) {
      console.error('[activity] failed to queue segment:', error);
    } finally {
      current.pendingSegmentWrites -= 1;
      // When the dedicated record could not be created, retain the older open
      // checkpoint after a failed append instead of clearing the only recovery
      // copy that may still exist.
      if (
        state === current &&
        current.pendingSegmentWrites === 0 &&
        (appended || recoveryKey !== null)
      ) {
        writeCheckpointNow(current);
      }
    }
  })();
}

function safeDeviceId(): string | null {
  try {
    return getDeviceId() || null;
  } catch {
    return null;
  }
}

/**
 * Web trusts focus; Capacitor does not. In WKWebView `focus`/`blur` are not
 * dependable, while `appStateChange` is authoritative — so once the native
 * shell reports app state we stop consulting focus entirely.
 *
 * An identity is also required. `/api/sync` rejects an unauthenticated POST, so
 * a signed-out visitor's segments could never be delivered — they would pile up
 * in the outbox until some later account flushed them, which is precisely the
 * cross-account attribution this feature must not create. Signed-out time on
 * the landing page is not worth measuring anyway. The cost is the second or two
 * before the first sync response names the account; the alternative is holding
 * segments that belong to nobody.
 */
/** Whether the runtime is in a position to measure anything at all. */
function measurementReady(current: RuntimeState): boolean {
  return current.instanceClaimSettled && current.owner !== null;
}

/** Whether the learner is actually in front of the app. */
function inForeground(current: RuntimeState): boolean {
  if (current.nativeMode) return current.documentVisible && current.nativeAppActive;
  return current.documentVisible && current.windowFocused;
}

function effectiveActive(current: RuntimeState): boolean {
  return measurementReady(current) && inForeground(current);
}

/**
 * Returning to the app fires `focus`, `visibilitychange` and `pageshow`
 * together. Collapse the burst into one transition, the same problem
 * `useServerSync` solves with its refetch throttle.
 */
function scheduleRecompute(current: RuntimeState): void {
  if (current.recomputeQueued) return;
  current.recomputeQueued = true;
  queueMicrotask(() => {
    current.recomputeQueued = false;
    applyActive(current);
  });
}

function applyActive(current: RuntimeState): void {
  const active = effectiveActive(current);
  current.tracker.setActive(active);

  if (active && !current.tickTimer) {
    current.tickTimer = setInterval(() => current.tracker.tick(), TICK_MS);
  } else if (!active && current.tickTimer) {
    clearInterval(current.tickTimer);
    current.tickTimer = null;
  }
}

function noteInteraction(current: RuntimeState): void {
  const now = Date.now();
  if (now - current.lastInteractionAt < INTERACTION_THROTTLE_MS) return;
  current.lastInteractionAt = now;
  // Input in our own page is proof the learner is in front of it, whatever the
  // last lifecycle event said. The web signals can be missed rather than wrong:
  // a page that loaded while the window was elsewhere, or came back from
  // bfcache, can be handed input without a `focus` event ever arriving — and a
  // `windowFocused` stuck at false is a clock that never starts, on a screen
  // the learner is demonstrably using. Recompute before the tracker is told,
  // because an inactive tracker will not open a segment for the interaction.
  if (!current.nativeMode && !effectiveActive(current)) {
    current.windowFocused = true;
    current.documentVisible = document.visibilityState === 'visible';
    applyActive(current);
  }

  // Receiving input is proof of focus, whatever `hasFocus()` claimed. Some
  // mobile browsers report focus unreliably, and without this a page that was
  // never told it gained focus would record nothing at all while the user was
  // plainly using it. A genuinely unfocused window receives no input, so this
  // cannot make an idle desktop window count.
  if (!current.windowFocused) {
    current.windowFocused = true;
    applyActive(current);
  }

  current.tracker.noteInteraction();
}

/**
 * Closes out for a page that is going away. The checkpoint is written first and
 * deliberately left in place: if execution ends mid-append, the next startup
 * redelivers the same segment id and the server deduplicates it.
 */
function handlePageHide(current: RuntimeState): void {
  current.holdCheckpoint = true;
  current.tracker.close('shutdown');
  writeCheckpointNow(current);
  void flushOutboxNow();
}

export function startActivityTracking(): () => void {
  if (typeof window === 'undefined') return () => undefined;
  if (state) return () => undefined;

  const current: RuntimeState = {
    tracker: undefined as unknown as ActivityTracker,
    instanceId: readOrCreateInstanceId(),
    channel: null,
    documentVisible: document.visibilityState === 'visible',
    windowFocused: document.hasFocus(),
    nativeAppActive: true,
    nativeMode: false,
    owner: null,
    pendingCheckpoint: null,
    lastCheckpointWrite: 0,
    lastInteractionAt: 0,
    holdCheckpoint: false,
    pendingSegmentWrites: 0,
    instanceClaimSettled: false,
    recoveryDone: false,
    appendedCheckpointKeys: new Set(),
    segmentTimezones: new Map(),
    tickTimer: null,
    recomputeQueued: false,
    teardown: [],
  };

  current.tracker = createActivityTracker({
    monotonicNow: () => performance.now(),
    wallNow: () => Date.now(),
    emit: (segment) => onSegment(current, segment),
    checkpoint: (next) => onCheckpoint(current, next),
    createId: () => createBrowserId('act'),
  });

  state = current;
  current.owner = getSyncOwner();
  guardInstanceIdCollision(current);

  const onVisibility = () => {
    current.documentVisible = document.visibilityState === 'visible';
    // Coming back proves the page was not unloaded after all — most often a
    // bfcache restore, where `pagehide` fired and execution then continued.
    // Without this the hold set there would stay on for the rest of the page's
    // life and leave a stale checkpoint behind every closed segment.
    if (current.documentVisible) {
      current.holdCheckpoint = false;
      releaseAppendedCheckpoints(current);
    }
    scheduleRecompute(current);
  };
  const onFocus = () => {
    current.windowFocused = true;
    scheduleRecompute(current);
  };
  const onBlur = () => {
    current.windowFocused = false;
    scheduleRecompute(current);
  };
  // Page Lifecycle: a frozen page's timers stop without a visibility change,
  // so this is the only signal that the gap was not activity.
  const onFreeze = () => {
    current.documentVisible = false;
    applyActive(current);
  };
  const onResume = () => {
    current.documentVisible = document.visibilityState === 'visible';
    if (current.documentVisible) {
      current.holdCheckpoint = false;
      releaseAppendedCheckpoints(current);
    }
    scheduleRecompute(current);
  };
  const onHide = () => handlePageHide(current);
  const onInteraction = () => noteInteraction(current);
  // Hydration announces identity separately because its GET snapshot is fed
  // straight into SyncEngine and never becomes a `server-sync` event. Keep the
  // broader event too: POST responses and older callers still publish it, and
  // re-reading the owner is idempotent.
  const onSyncOwnerChanged = () => setActivityOwner(getSyncOwner());

  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener(SYNC_OWNER_CHANGED_EVENT, onSyncOwnerChanged);
  window.addEventListener('get-word:server-sync', onSyncOwnerChanged);
  window.addEventListener('focus', onFocus);
  window.addEventListener('blur', onBlur);
  window.addEventListener('pagehide', onHide);
  document.addEventListener('freeze', onFreeze);
  document.addEventListener('resume', onResume);

  // Movement is intent too: returning to a study tab and moving the cursor over
  // it (or dragging a finger across it) should wake the clock before the next
  // answer is clicked. `noteInteraction` throttles this hot path, so continuous
  // pointer movement does not produce continuous persistence work.
  const interactionEvents = [
    'pointerdown',
    'pointermove',
    'keydown',
    'wheel',
    'touchstart',
    'touchmove',
  ] as const;
  for (const type of interactionEvents) {
    window.addEventListener(type, onInteraction, { passive: true, capture: true });
  }

  current.teardown.push(() => {
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener(SYNC_OWNER_CHANGED_EVENT, onSyncOwnerChanged);
    window.removeEventListener('get-word:server-sync', onSyncOwnerChanged);
    window.removeEventListener('focus', onFocus);
    window.removeEventListener('blur', onBlur);
    window.removeEventListener('pagehide', onHide);
    document.removeEventListener('freeze', onFreeze);
    document.removeEventListener('resume', onResume);
    for (const type of interactionEvents) {
      window.removeEventListener(type, onInteraction, { capture: true });
    }
  });

  applyActive(current);
  // A surface may already be known: both providers set it from an effect, and
  // a tracker restarted afterwards must not fall back to `other`.
  applySurface();

  return () => {
    if (state !== current) return;
    current.tracker.close('shutdown');
    writeCheckpointNow(current);
    if (current.tickTimer) clearInterval(current.tickTimer);
    for (const dispose of current.teardown) dispose();
    state = null;
  };
}

/**
 * Which surface the measured time belongs to.
 *
 * Two sources, because two things decide it. The route says which screen the
 * router is on, and `ActivityTrackingProvider` pushes that down. But the study
 * page also opens the word chat and the photo lab *in place*, without leaving
 * `/` — to the router nothing happened, while to the learner they left the
 * deck. Those screens set an override, and it wins for as long as it is set.
 *
 * Keeping them apart is what makes the two writers order-independent: the
 * provider's route effect and the study page's override effect both run on
 * mount, in an order React decides, and neither can erase the other's answer.
 */
let routeSurface: ActivitySurface = 'other';
let surfaceOverride: ActivitySurface | null = null;

function applySurface(): void {
  state?.tracker.setSurface(surfaceOverride ?? routeSurface);
}

export function setActivitySurface(surface: ActivitySurface): void {
  routeSurface = surface;
  applySurface();
}

/** Pass null when the in-place screen closes and the route is in charge again. */
export function setActivitySurfaceOverride(surface: ActivitySurface | null): void {
  surfaceOverride = surface;
  applySurface();
}

/**
 * Called only by the Capacitor shell. The first call also switches the runtime
 * to native semantics, where `appStateChange` replaces focus/blur.
 */
export function setNativeAppActive(active: boolean): void {
  if (!state) return;
  state.nativeMode = true;
  state.nativeAppActive = active;
  applyActive(state);
  if (!active) void flushOutboxNow();
}

/**
 * Identity changes close the open segment before the new owner takes effect, so
 * no measured time can straddle two accounts.
 */
export function setActivityOwner(owner: string | null): void {
  if (!state || state.owner === owner) return;
  // Closes the open segment while `state.owner` is still the previous account,
  // so the emitted segment is attributed to whoever measured it.
  state.tracker.setOwner(owner);
  state.owner = owner;
  // Day keys are not account identifiers. Drop the monotonic in-memory cache
  // before the next account seeds its own, potentially smaller, server total.
  dayLedgers.clear();
  dayLedgerOwner = owner;
  ledgersSwept = false;
  goalDayTimezone = null;
  // The first response to name the account is also the first moment a stored
  // checkpoint can be matched against it, so this is where recovery happens on
  // an ordinary load.
  maybeRecoverCheckpoints(state);
  // Gaining or losing an identity flips whether tracking runs at all.
  applyActive(state);
  writeCheckpointNow(state);
}

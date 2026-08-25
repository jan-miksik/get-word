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
import type { ActivitySurface } from '@/packages/contracts/src/activity';
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
  /** Closed local time since the last server total was seeded. */
  dayLocalMs: Map<string, number>;
  tickTimer: ReturnType<typeof setInterval> | null;
  recomputeQueued: boolean;
  teardown: Array<() => void>;
}

let state: RuntimeState | null = null;

// The server is the durable source of truth.  The UI deliberately replaces
// this baseline on every summary refresh instead of adding it to a running
// client total; doing the latter double-counts a segment as soon as sync lands.
const seededDayTotals = new Map<string, number>();

export function seedActivityDayTotal(dayKey: string, activeMs: number): void {
  seededDayTotals.set(dayKey, Math.max(0, Math.round(activeMs)));
  state?.dayLocalMs.delete(dayKey);
}

/** Best-known local display value; it is not a persistence or reporting API. */
export function getBestKnownDayActiveMs(dayKey: string): number {
  const seed = seededDayTotals.get(dayKey) ?? 0;
  const closedLocal = state?.dayLocalMs.get(dayKey) ?? 0;
  const open = state?.tracker.peek();
  // An open segment only belongs to the current local day for display. Closed
  // segments carry their own source timezone and are registered in onSegment.
  // `uncreditedMs` is the part of the open segment the next five-second tick
  // will credit; including it is what lets a displayed clock advance every
  // second instead of standing still and then jumping.
  const openLocal = open?.open && localDayKeyAt(Date.now(), currentIanaTimezone()) === dayKey
    ? open.activeMs + open.uncreditedMs
    : 0;
  return Math.max(0, Math.round(seed + closedLocal + openLocal));
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
  const dayKey = localDayKeyAt(segment.started_at, timezoneAtCreation);
  current.dayLocalMs.set(dayKey, (current.dayLocalMs.get(dayKey) ?? 0) + segment.active_ms);
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
function effectiveActive(current: RuntimeState): boolean {
  if (!current.instanceClaimSettled) return false;
  if (current.owner === null) return false;
  if (current.nativeMode) return current.documentVisible && current.nativeAppActive;
  return current.documentVisible && current.windowFocused;
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
    dayLocalMs: new Map(),
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

  const interactionEvents = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
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

  return () => {
    if (state !== current) return;
    current.tracker.close('shutdown');
    writeCheckpointNow(current);
    if (current.tickTimer) clearInterval(current.tickTimer);
    for (const dispose of current.teardown) dispose();
    state = null;
  };
}

export function setActivitySurface(surface: ActivitySurface): void {
  state?.tracker.setSurface(surface);
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
  // The first response to name the account is also the first moment a stored
  // checkpoint can be matched against it, so this is where recovery happens on
  // an ordinary load.
  maybeRecoverCheckpoints(state);
  // Gaining or losing an identity flips whether tracking runs at all.
  applyActive(state);
  writeCheckpointNow(state);
}

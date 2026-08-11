export type SyncEnginePhase =
  | 'booting'
  | 'ready'
  | 'pulling'
  | 'offline'
  | 'degraded';

export interface SyncEngineState {
  phase: SyncEnginePhase;
  changedAt: number;
  lastError: string | null;
}

export interface ApiTransport<TSnapshot> {
  pull(cursor?: { since: string; contentRevision?: string }): Promise<TSnapshot>;
}

export interface LocalRepository<TCached, TSnapshot> {
  load(): Promise<TCached | null>;
  readCursor(): Promise<{ since: string; contentRevision?: string } | undefined>;
  persist(snapshot: TSnapshot): Promise<boolean>;
}

export interface EngineClock {
  now(): number;
}

export interface ConnectivitySource {
  isOnline(): boolean;
  subscribe(listener: (online: boolean) => void): () => void;
}

export type SyncEngineEvent<TCached, TSnapshot> =
  | { source: 'cache'; value: TCached }
  | { source: 'server'; value: TSnapshot };

type StateListener = (state: SyncEngineState) => void;
type DataListener<TCached, TSnapshot> = (
  event: SyncEngineEvent<TCached, TSnapshot>,
) => void | Promise<void>;

/**
 * Framework-neutral coordinator for sync I/O. React and browser lifecycle
 * events live in adapters; ordering and observable state live here.
 */
export class SyncEngine<TCached, TSnapshot> {
  private state: SyncEngineState;
  private readonly stateListeners = new Set<StateListener>();
  private readonly dataListeners = new Set<DataListener<TCached, TSnapshot>>();
  private unsubscribeConnectivity: (() => void) | null = null;
  private inFlight: Promise<unknown> | null = null;

  constructor(
    private readonly ports: {
      transport: ApiTransport<TSnapshot>;
      repository: LocalRepository<TCached, TSnapshot>;
      clock: EngineClock;
      connectivity: ConnectivitySource;
    },
  ) {
    this.state = {
      phase: ports.connectivity.isOnline() ? 'booting' : 'offline',
      changedAt: ports.clock.now(),
      lastError: null,
    };
  }

  getState(): SyncEngineState {
    return this.state;
  }

  subscribe(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    listener(this.state);
    return () => this.stateListeners.delete(listener);
  }

  onData(listener: DataListener<TCached, TSnapshot>): () => void {
    this.dataListeners.add(listener);
    return () => this.dataListeners.delete(listener);
  }

  start(): void {
    if (this.unsubscribeConnectivity) return;
    this.unsubscribeConnectivity = this.ports.connectivity.subscribe((online) => {
      if (!online) this.transition('offline');
      else if (this.state.phase === 'offline') this.transition('ready');
    });
  }

  stop(): void {
    this.unsubscribeConnectivity?.();
    this.unsubscribeConnectivity = null;
  }

  async boot(options: { forceFull?: boolean } = {}): Promise<void> {
    return this.exclusive(async () => {
      this.transition('booting');
      const cached = await this.ports.repository.load().catch(() => null);
      if (cached) await this.emitData({ source: 'cache', value: cached });

      if (!this.ports.connectivity.isOnline()) {
        this.transition('offline');
        return;
      }

      this.transition('pulling');
      try {
        const cursor = options.forceFull
          ? undefined
          : await this.ports.repository.readCursor().catch(() => undefined);
        const remote = await this.ports.transport.pull(cursor);
        await this.publish(remote);
      } catch (error) {
        this.transition(this.ports.connectivity.isOnline() ? 'degraded' : 'offline', error);
        throw error;
      }
    });
  }

  async pull(options: { forceFull?: boolean } = {}): Promise<TSnapshot | null> {
    return this.exclusive(async () => {
      if (!this.ports.connectivity.isOnline()) {
        this.transition('offline');
        return null;
      }
      this.transition('pulling');
      try {
        const cursor = options.forceFull
          ? undefined
          : await this.ports.repository.readCursor().catch(() => undefined);
        const snapshot = await this.ports.transport.pull(cursor);
        await this.publish(snapshot);
        return snapshot;
      } catch (error) {
        this.transition(this.ports.connectivity.isOnline() ? 'degraded' : 'offline', error);
        throw error;
      }
    });
  }

  // No push(). Mutations leave through the outbox drainer, which needs
  // per-operation acknowledgement handling — lifecycle, conflict classification
  // and the durable checkpoint before an op is deleted — none of which this
  // generic engine models. A push() here would have been a second, quieter way
  // out that skipped the outbox entirely, so the payload would be lost on any
  // failure rather than retried.

  /** Accept a snapshot produced outside the engine (for example a low-level
   * streaming or keepalive transport) through the same publish path. */
  async ingest(snapshot: TSnapshot): Promise<void> {
    return this.exclusive(() => this.publish(snapshot));
  }

  /**
   * Cache the snapshot, then hand it to listeners either way.
   *
   * A failed cache write is not a reason to withhold fresh server state from
   * the app. The repository advances the read cursor only once the domain
   * writes have succeeded, so a failure already costs nothing more than the
   * next pull being a full snapshot instead of a delta — whereas dropping the
   * payload leaves the learner looking at stale data on a device whose storage
   * is merely full or evicted, with only a console error to show for it. The
   * durability that does matter belongs to the outbox, which owns unsent
   * mutations and is untouched by this path.
   *
   * The phase still tells the truth: `degraded` means the app is live but not
   * warm-bootable, which is exactly the state a failed cache write leaves.
   */
  private async publish(snapshot: TSnapshot): Promise<void> {
    const persisted = await this.ports.repository.persist(snapshot).catch(() => false);
    await this.emitData({ source: 'server', value: snapshot });
    if (!persisted) {
      this.transition('degraded', new Error('Sync snapshot could not be cached locally'));
      return;
    }
    this.transition(this.ports.connectivity.isOnline() ? 'ready' : 'offline');
  }

  private async exclusive<T>(operation: () => Promise<T>): Promise<T> {
    while (this.inFlight) await this.inFlight.catch(() => undefined);
    const running = operation();
    this.inFlight = running;
    try {
      return await running;
    } finally {
      if (this.inFlight === running) this.inFlight = null;
    }
  }

  private transition(phase: SyncEnginePhase, error?: unknown): void {
    this.state = {
      phase,
      changedAt: this.ports.clock.now(),
      lastError: error instanceof Error ? error.message : error ? String(error) : null,
    };
    for (const listener of this.stateListeners) listener(this.state);
  }

  private async emitData(event: SyncEngineEvent<TCached, TSnapshot>): Promise<void> {
    for (const listener of this.dataListeners) await listener(event);
  }
}

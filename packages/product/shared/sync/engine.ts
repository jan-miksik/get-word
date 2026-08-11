export type SyncEnginePhase =
  | 'booting'
  | 'ready'
  | 'pulling'
  | 'pushing'
  | 'offline'
  | 'degraded';

export interface SyncEngineState {
  phase: SyncEnginePhase;
  changedAt: number;
  lastError: string | null;
}

export interface ApiTransport<TSnapshot, TMutation> {
  pull(cursor?: { since: string; contentRevision?: string }): Promise<TSnapshot>;
  push(mutation: TMutation): Promise<TSnapshot>;
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
export class SyncEngine<TCached, TSnapshot, TMutation> {
  private state: SyncEngineState;
  private readonly stateListeners = new Set<StateListener>();
  private readonly dataListeners = new Set<DataListener<TCached, TSnapshot>>();
  private unsubscribeConnectivity: (() => void) | null = null;
  private inFlight: Promise<unknown> | null = null;

  constructor(
    private readonly ports: {
      transport: ApiTransport<TSnapshot, TMutation>;
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
        const persisted = await this.ports.repository.persist(remote);
        if (!persisted) throw new Error('Sync snapshot could not be persisted');
        await this.emitData({ source: 'server', value: remote });
        this.transition('ready');
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
        const persisted = await this.ports.repository.persist(snapshot);
        if (!persisted) throw new Error('Sync snapshot could not be persisted');
        await this.emitData({ source: 'server', value: snapshot });
        this.transition('ready');
        return snapshot;
      } catch (error) {
        this.transition(this.ports.connectivity.isOnline() ? 'degraded' : 'offline', error);
        throw error;
      }
    });
  }

  async push(mutation: TMutation): Promise<TSnapshot | null> {
    return this.exclusive(async () => {
      if (!this.ports.connectivity.isOnline()) {
        this.transition('offline');
        return null;
      }
      this.transition('pushing');
      try {
        const snapshot = await this.ports.transport.push(mutation);
        const persisted = await this.ports.repository.persist(snapshot);
        if (!persisted) throw new Error('Sync acknowledgement could not be persisted');
        await this.emitData({ source: 'server', value: snapshot });
        this.transition('ready');
        return snapshot;
      } catch (error) {
        this.transition(this.ports.connectivity.isOnline() ? 'degraded' : 'offline', error);
        throw error;
      }
    });
  }

  /** Accept a snapshot produced outside the engine (for example a low-level
   * streaming or keepalive transport) while preserving persist-before-publish. */
  async ingest(snapshot: TSnapshot): Promise<void> {
    return this.exclusive(async () => {
      const persisted = await this.ports.repository.persist(snapshot);
      if (!persisted) {
        const error = new Error('Sync snapshot could not be persisted');
        this.transition('degraded', error);
        throw error;
      }
      await this.emitData({ source: 'server', value: snapshot });
      this.transition(this.ports.connectivity.isOnline() ? 'ready' : 'offline');
    });
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

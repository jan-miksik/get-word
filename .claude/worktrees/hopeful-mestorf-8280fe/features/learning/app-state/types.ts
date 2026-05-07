'use client';

export interface LinkPayload {
  email?: string | null;
  authProvider?: string | null;
}

export type ViewMode = 'card' | 'stream';

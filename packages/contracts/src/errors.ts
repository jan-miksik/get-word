export interface ApiErrorEnvelope {
  error: string;
  code: string;
  requestId?: string;
  details?: unknown;
}

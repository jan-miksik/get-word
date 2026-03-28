type AuditLevel = "info" | "warn" | "error";

type AuditPayload = {
  provider?: string;
  step: string;
  requestId?: string;
  userId?: string;
  errorCode?: string;
  statusCode?: number;
  details?: string;
};

function emit(level: AuditLevel, payload: AuditPayload): void {
  const line = {
    at: new Date().toISOString(),
    domain: "provider_auth",
    ...payload,
  };

  if (level === "error") {
    console.error("[provider-auth]", JSON.stringify(line));
    return;
  }
  if (level === "warn") {
    console.warn("[provider-auth]", JSON.stringify(line));
    return;
  }
  console.log("[provider-auth]", JSON.stringify(line));
}

export function auditInfo(payload: AuditPayload): void {
  emit("info", payload);
}

export function auditWarn(payload: AuditPayload): void {
  emit("warn", payload);
}

export function auditError(payload: AuditPayload): void {
  emit("error", payload);
}

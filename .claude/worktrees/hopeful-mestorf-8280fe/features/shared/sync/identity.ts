const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export function rekeyByItemId<V>(
  data: Record<string, V>,
  mapping: Map<string, string>
): Record<string, V> {
  const result: Record<string, V> = {};
  for (const [key, value] of Object.entries(data)) {
    result[mapping.get(key) ?? key] = value;
  }
  return result;
}

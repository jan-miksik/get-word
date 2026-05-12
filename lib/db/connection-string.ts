const MALFORMED_PERCENT_ESCAPE = /%(?![0-9A-Fa-f]{2})/g;

function encodeMalformedPercentEscapes(value: string): string {
  return value.replace(MALFORMED_PERCENT_ESCAPE, "%25");
}

export function normalizeDatabaseUrl(connectionString: string): string {
  const url = new URL(connectionString);

  const normalizedUsername = encodeMalformedPercentEscapes(url.username);
  const normalizedPassword = encodeMalformedPercentEscapes(url.password);

  if (normalizedUsername !== url.username) {
    url.username = normalizedUsername;
  }
  if (normalizedPassword !== url.password) {
    url.password = normalizedPassword;
  }

  return url.toString();
}

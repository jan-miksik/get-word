const SUPPORT_TEXT = 'Contact our tech support';
const SUPPORT_LINK_TEXT = 'Kontaktujte technickou podporu';
const SUPPORT_URL = 'https://t.me/janmiksik';

export function ErrorMessage({ message }: { message: string }) {
  const parts = message.split(SUPPORT_TEXT);

  if (parts.length === 1) return <>{message}</>;

  return (
    <>
      {parts.map((part, index) => (
        <span key={`${part}-${index}`}>
          {part}
          {index < parts.length - 1 ? (
            <a
              href={SUPPORT_URL}
              target="_blank"
              rel="noreferrer"
              className="font-medium underline"
            >
              {SUPPORT_LINK_TEXT}
            </a>
          ) : null}
        </span>
      ))}
    </>
  );
}

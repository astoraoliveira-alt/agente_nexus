export function normalizeMessagingText(text?: string | null): string {
  if (!text) return '';

  return String(text)
    .replace(/\r\n/g, '\n')
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t');
}


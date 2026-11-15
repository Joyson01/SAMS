/** Convert API validation and network failures into readable UI feedback. */
export function formatApiErrorMessage(
  error: unknown,
  defaultFallback = 'An unexpected error occurred. Please try again.'
): string {
  const record = (value: unknown): Record<string, unknown> =>
    value !== null && typeof value === 'object' ? value as Record<string, unknown> : {};
  const message = (value: unknown): string => {
    if (typeof value === 'string') return value.trim();
    const item = record(value);
    const text = [item.msg, item.message, item.error].find(candidate => typeof candidate === 'string');
    if (typeof text !== 'string') return '';
    const location = Array.isArray(item.loc)
      ? item.loc.filter(part => typeof part === 'string' && !['body', 'query', 'path'].includes(part)).join(' → ')
      : typeof item.field === 'string' ? item.field : '';
    return location ? `${location}: ${text}` : text;
  };
  if (typeof error === 'string') return error.trim() || defaultFallback;
  const source = record(error);
  const data = record(record(source.response).data);
  const details = record(data.error).details;
  if (Array.isArray(details)) {
    const messages = details.map(message).filter(Boolean);
    if (messages.length) return messages.join('; ');
  }
  const detail = data.detail ?? data.message ?? data.error ?? source.detail;
  const messages = (Array.isArray(detail) ? detail : [detail]).map(message).filter(Boolean);
  return messages.join('; ') || message(error) || defaultFallback;
}

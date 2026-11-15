/**
 * Utility for normalizing any backend or network error (FastAPI 422 validation objects/arrays,
 * Axios error responses, standard Error objects, string messages) into a 100% safe, human-readable string.
 *
 * This guarantees that raw error objects like `{ type, loc, msg, input }` are NEVER directly passed
 * to React JSX children, preventing React invariant crashes ("Objects are not valid as a React child").
 */

export function formatApiErrorMessage(
  error: unknown,
  defaultFallback: string = 'An unexpected error occurred. Please try again.'
): string {
  if (!error) return defaultFallback;

  // 1. Primitive string
  if (typeof error === 'string') {
    return error.trim() || defaultFallback;
  }

  const errObj = error as any;

  // 2. Axios Error structure
  const responseData = errObj?.response?.data;
  const detail = responseData?.detail ?? responseData?.message ?? responseData?.error ?? errObj?.detail;

  if (detail !== undefined && detail !== null) {
    // 2a. Simple string detail
    if (typeof detail === 'string') {
      return detail;
    }

    // 2b. FastAPI 422 validation error array: [{ loc: ['body', 'file'], msg: 'Field required', type: 'missing' }, ...]
    if (Array.isArray(detail)) {
      const messages = detail
        .map((item: any) => {
          if (!item) return '';
          if (typeof item === 'string') return item;
          if (typeof item === 'object') {
            const locArray = Array.isArray(item.loc)
              ? item.loc.filter((l: any) => l !== 'body' && l !== 'query' && l !== 'path')
              : [];
            const locName = locArray.length > 0 ? locArray.join(' -> ') : '';
            const msg = item.msg || item.message || JSON.stringify(item);
            return locName ? `${locName}: ${msg}` : msg;
          }
          return String(item);
        })
        .filter(Boolean);

      if (messages.length > 0) {
        return messages.join('; ');
      }
    }

    // 2c. Single validation error object: { type, loc, msg, input }
    if (typeof detail === 'object' && detail !== null) {
      if (typeof detail.msg === 'string') {
        const locArray = Array.isArray(detail.loc)
          ? detail.loc.filter((l: any) => l !== 'body' && l !== 'query' && l !== 'path')
          : [];
        const locName = locArray.length > 0 ? locArray.join(' -> ') : '';
        return locName ? `${locName}: ${detail.msg}` : detail.msg;
      }
      if (typeof detail.message === 'string') {
        return detail.message;
      }
      if (typeof detail.error === 'string') {
        return detail.error;
      }
      try {
        return JSON.stringify(detail);
      } catch (_) {
        return defaultFallback;
      }
    }
  }

  // 3. Standard JS Error
  if (errObj?.message && typeof errObj.message === 'string') {
    return errObj.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  // 4. Object fallback
  try {
    if (typeof error === 'object') {
      return JSON.stringify(error);
    }
  } catch (_) {}

  return String(error);
}

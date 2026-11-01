import { setTimeout as sleep } from 'node:timers/promises';

const transient = new Set([429, 502, 503, 504]);
function integer(name, value, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max)
    throw new RangeError(`${name} must be an integer in [${min}, ${max}]`);
}

// null means absent or malformed. Never truncate a server's requested delay.
export function retryAfter(value, now = Date.now()) {
  if (value === null) return null;
  if (/^\d+$/.test(value)) return Number(value) * 1000;
  // Accept IMF-fixdate; deliberately decline obsolete or ambiguous date formats.
  if (!/^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(value)) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - now) : null;
}

async function readBounded(response, maxBytes) {
  if (!response.body) return '';
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.byteLength;
    if (size > maxBytes) throw new RangeError('Response exceeds maxBytes');
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** GET only. A timeout is an error; exhausted HTTP retries return the final response. */
export async function read(url, {
  attempts = 3, timeoutMs = 5000, baseDelayMs = 100,
  maxDelayMs = 2000, maxBytes = 65536, signal,
} = {}) {
  integer('attempts', attempts, 1, 5);
  integer('timeoutMs', timeoutMs, 1, 30000);
  integer('baseDelayMs', baseDelayMs, 0, 5000);
  integer('maxDelayMs', maxDelayMs, 0, 10000);
  integer('maxBytes', maxBytes, 1, 1048576);
  const target = new URL(url);
  if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password)
    throw new TypeError('Expected HTTP(S) URL without credentials');
  const deadline = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([signal, deadline]) : deadline;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    combined.throwIfAborted();
    let response;
    try {
      // Manual redirects prevent hidden requests, origin changes and retry multiplication.
      response = await fetch(target, { method: 'GET', redirect: 'manual', signal: combined });
    } catch (error) {
      combined.throwIfAborted();
      if (attempt === attempts) throw error;
      await sleep(Math.random() * Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1)),
        undefined, { signal: combined });
      continue;
    }
    const serverDelay = retryAfter(response.headers.get('retry-after'));
    const retry = transient.has(response.status) && attempt < attempts
      && (serverDelay === null || serverDelay <= maxDelayMs);
    if (!retry) {
      const body = await readBounded(response, maxBytes);
      return { status: response.status, body, attempts: attempt };
    }
    // Release discarded bodies before waiting, including streaming error responses.
    await response.body?.cancel();
    const delay = serverDelay ?? Math.random() * Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
    await sleep(delay, undefined, { signal: combined });
  }
}

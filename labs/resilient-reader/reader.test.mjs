import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { read, retryAfter } from './reader.mjs';

async function fixture(t, handler) {
  let calls = 0;
  const server = createServer((req, res) => handler(req, res, ++calls));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  });
  return { url: `http://127.0.0.1:${server.address().port}`, calls: () => calls };
}

test('Retry-After seconds, dates, past dates and malformed inputs', () => {
  const now = Date.UTC(2026, 10, 1);
  assert.equal(retryAfter('2', now), 2000);
  assert.equal(retryAfter('Sun, 01 Nov 2026 00:00:03 GMT', now), 3000);
  assert.equal(retryAfter('Sat, 31 Oct 2026 00:00:00 GMT', now), 0);
  for (const value of [null, '-1', '1.5', 'tomorrow', '123abc']) assert.equal(retryAfter(value, now), null);
  assert.equal(retryAfter('9'.repeat(400)), Infinity);
});

for (const status of [429, 502, 503, 504]) {
  test(`${status} then success uses exactly two GET requests`, async t => {
    const f = await fixture(t, (req, res, n) => {
      assert.equal(req.method, 'GET');
      res.writeHead(n === 1 ? status : 200, { 'Retry-After': '0' });
      res.end(n === 1 ? 'busy' : 'ok');
    });
    assert.deepEqual(await read(f.url), { status: 200, body: 'ok', attempts: 2 });
    assert.equal(f.calls(), 2);
  });
}

test('attempt cap returns final HTTP error with body', async t => {
  const f = await fixture(t, (_, res) => { res.writeHead(503); res.end('busy'); });
  assert.deepEqual(await read(f.url, { baseDelayMs: 0 }), { status: 503, body: 'busy', attempts: 3 });
  assert.equal(f.calls(), 3);
});

test('long Retry-After returns immediately instead of retrying early', async t => {
  const f = await fixture(t, (_, res) => { res.writeHead(429, { 'Retry-After': '60' }); res.end('later'); });
  assert.equal((await read(f.url)).attempts, 1);
  assert.equal(f.calls(), 1);
});

test('Retry-After minimum is honored over real HTTP', async t => {
  const f = await fixture(t, (_, res, n) => {
    res.writeHead(n === 1 ? 503 : 200, { 'Retry-After': '1' }); res.end('ok');
  });
  const start = performance.now();
  assert.equal((await read(f.url)).attempts, 2);
  assert.ok(performance.now() - start >= 990);
});

for (const status of [200, 400, 401, 404, 409, 500, 302]) {
  test(`${status} is terminal; redirects are not followed`, async t => {
    const f = await fixture(t, (_, res) => { res.writeHead(status, { Location: '/again' }); res.end('result'); });
    assert.equal((await read(f.url)).status, status);
    assert.equal(f.calls(), 1);
  });
}

test('socket failure retries a read', async t => {
  const f = await fixture(t, (req, res, n) => n === 1 ? req.socket.destroy() : res.end('recovered'));
  assert.equal((await read(f.url, { baseDelayMs: 0 })).body, 'recovered');
  assert.equal(f.calls(), 2);
});

test('response byte limit rejects without retry', async t => {
  const f = await fixture(t, (_, res) => res.end('é'.repeat(10)));
  await assert.rejects(read(f.url, { maxBytes: 10 }), /maxBytes/);
  assert.equal(f.calls(), 1);
});

test('global deadline covers stalled response body', async t => {
  const f = await fixture(t, (_, res) => { res.writeHead(200); res.write('partial'); });
  await assert.rejects(read(f.url, { timeoutMs: 100 }), error => ['TimeoutError', 'AbortError'].includes(error.name));
  assert.equal(f.calls(), 1);
});

test('global deadline also covers retry waiting', async t => {
  const f = await fixture(t, (_, res) => { res.writeHead(503, { 'Retry-After': '1' }); res.end(); });
  await assert.rejects(read(f.url, { timeoutMs: 100 }), { name: 'AbortError' });
  assert.equal(f.calls(), 1);
});

test('pre-aborted caller sends no requests', async t => {
  const f = await fixture(t, (_, res) => res.end());
  await assert.rejects(read(f.url, { signal: AbortSignal.abort() }), { name: 'AbortError' });
  assert.equal(f.calls(), 0);
});

test('invalid configuration fails before network access', async () => {
  for (const options of [{ attempts: 0 }, { attempts: 6 }, { timeoutMs: NaN }, { maxBytes: 0 }, { baseDelayMs: -1 }, { maxDelayMs: Infinity }])
    await assert.rejects(read('http://127.0.0.1:1', options), RangeError);
  await assert.rejects(read('file:///tmp/test'), TypeError);
  await assert.rejects(read('http://user:password@localhost'), TypeError);
});

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { EventEmitter } from 'node:events';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { networkInterfaces, tmpdir } from 'node:os';
import path from 'node:path';
import { TelegramClient } from '../src/client';
import { type ProxyHandle, type ProxyOptions, startProxy } from '../src/proxy';
import {
  authorizationHeaders,
  getDaemonToken,
  PROTOCOL_HEADER,
  PROTOCOL_VERSION,
  requireSecureDaemon,
  serveLocal,
} from '../src/security';

const token = 'a'.repeat(64);
const headers = authorizationHeaders(token);
let directory: string;
let proxy: ProxyHandle | undefined;
let calls: Record<string, unknown>[];
let client: EventEmitter & {
  invoke: (params: Record<string, unknown>) => Promise<unknown>;
  close: () => Promise<void>;
};

beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), 'tg-security-'));
  mkdirSync(path.join(directory, 'media_cache'));
  mkdirSync(path.join(directory, 'tdlib_db'));
  writeFileSync(path.join(directory, 'media_cache', 'photo.jpg'), 'fake-photo');
  writeFileSync(path.join(directory, 'tdlib_db', 'td.binlog'), 'fake-session');
  writeFileSync(path.join(directory, 'tdlib_db', 'db.sqlite'), 'fake-database');
  calls = [];
  client = Object.assign(new EventEmitter(), {
    async invoke(params: Record<string, unknown>) {
      calls.push(params);
      return { _: 'user', id: 123 };
    },
    async close() {},
  });
});

afterEach(async () => {
  await proxy?.stop();
  proxy = undefined;
  rmSync(directory, { recursive: true, force: true });
});

async function start(options: Partial<ProxyOptions> = {}) {
  proxy = await startProxy({
    authToken: token,
    port: 0,
    databaseDirectory: path.join(directory, 'tdlib_db'),
    filesDirectory: path.join(directory, 'media_cache'),
    client: client as unknown as ProxyOptions['client'],
    ...options,
  });
  return proxy;
}

function request(server: ProxyHandle, route: string, init: RequestInit = {}) {
  return fetch(`${server.url}${route}`, { headers, ...init });
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('local HTTP boundary', () => {
  test('binds only to IPv4 loopback, and requires authentication on every route', async () => {
    const server = await start();
    expect(server.url).toBe(`http://127.0.0.1:${server.port}`);
    for (const route of [
      '/health',
      '/api/tg/auth/state',
      '/api/tg/updates',
      '/api/media/photo.jpg',
    ]) {
      const response = await request(server, route, { headers: {} });
      expect(response.status).toBe(401);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    }
    for (const route of [
      '/api/tg/invoke',
      '/api/open',
      '/api/tg/auth/phone',
      '/api/tg/auth/code',
      '/api/tg/auth/password',
      '/api/tg/auth/resend',
      '/api/tg/auth/logout',
      '/shutdown',
    ]) {
      expect(
        (await request(server, route, { method: 'POST', headers: {}, body: '{}' })).status,
      ).toBe(401);
    }
    expect(calls).toEqual([]);
    const response = await request(server, '/health');
    expect(response.status).toBe(200);
    expect(() => requireSecureDaemon(response)).not.toThrow();
  });

  test('does not accept connections through this machine’s non-loopback IPv4 address', async () => {
    const address = Object.values(networkInterfaces())
      .flat()
      .find((entry) => entry?.family === 'IPv4' && !entry.internal)?.address;
    if (!address) return;
    const server = await start();
    await expect(
      fetch(`http://${address}:${server.port}/health`, {
        headers,
        signal: AbortSignal.timeout(500),
      }),
    ).rejects.toThrow();
  });

  test('rejects incorrect tokens, browser origins, preflights and rebinding Host values', async () => {
    const server = await start();
    expect(
      (await request(server, '/health', { headers: authorizationHeaders('b'.repeat(64)) })).status,
    ).toBe(401);
    for (const extra of [
      { Origin: 'https://example.com' },
      { Origin: 'null' },
      { 'Sec-Fetch-Site': 'same-origin' },
      { Host: `example.com:${server.port}` },
    ]) {
      expect((await request(server, '/health', { headers: { ...headers, ...extra } })).status).toBe(
        403,
      );
    }
    expect(
      (
        await request(server, '/api/tg/invoke', {
          method: 'OPTIONS',
          headers: { Origin: 'https://example.com', 'Access-Control-Request-Method': 'POST' },
        })
      ).status,
    ).toBe(403);
  });

  test('authorized RPC and SSE still work through TelegramClient', async () => {
    const server = await start();
    const api = new TelegramClient({ baseUrl: server.url, authToken: token });
    try {
      expect(await api.invoke({ _: 'getMe' })).toEqual({ _: 'user', id: 123 });
      expect(calls).toEqual([{ _: 'getMe' }]);
      expect((await api.getAuthState()).state).toBe('unknown');
      let resolveUpdate: (value: unknown) => void = () => {};
      const update = new Promise((resolve) => {
        resolveUpdate = resolve;
      });
      api.on('update', resolveUpdate);
      for (let i = 0; i < 100; i++) {
        const health = (await (await request(server, '/health')).json()) as { connections: number };
        if (health.connections > 0) break;
        await delay(5);
      }
      client.emit('update', { _: 'updateConnectionState', state: { _: 'connectionStateReady' } });
      expect(await Promise.race([update, delay(1000).then(() => 'timeout')])).toEqual({
        _: 'updateConnectionState',
        state: { _: 'connectionStateReady' },
      });
    } finally {
      api.close();
    }
  });
});

describe('media isolation', () => {
  test('serves media but never falls back to session files, even with the correct token', async () => {
    const server = await start();
    const photo = await request(server, '/api/media/photo.jpg');
    expect(photo.status).toBe(200);
    expect(await photo.text()).toBe('fake-photo');
    expect(photo.headers.get('cache-control')).toBe('no-store');
    for (const name of ['td.binlog', 'db.sqlite']) {
      expect((await request(server, `/api/media/${name}`)).status).toBe(404);
      const open = await request(server, '/api/open', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ mediaUrl: `/api/media/${name}` }),
      });
      expect(open.status).toBe(404);
    }
  });

  test('rejects symlink escapes, sibling-prefix paths and directories for serving and opening', async () => {
    const server = await start();
    const media = path.join(directory, 'media_cache');
    symlinkSync(path.join(directory, 'tdlib_db', 'td.binlog'), path.join(media, 'escape.jpg'));
    mkdirSync(path.join(directory, 'media_cache_other'));
    writeFileSync(path.join(directory, 'media_cache_other', 'secret'), 'private');
    for (const name of [
      'escape.jpg',
      '../media_cache_other/secret',
      '../tdlib_db/td.binlog',
      '.',
      '%2e%2e%2ftdlib_db%2ftd.binlog',
    ]) {
      const response = await request(server, `/api/media/${name}`);
      expect(response.status).toBe(404);
      expect(await response.text()).not.toContain('fake-session');
      expect(
        (
          await request(server, '/api/open', {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ mediaUrl: name }),
          })
        ).status,
      ).toBe(404);
    }
  });
});

describe('idle shutdown', () => {
  test('health polling cannot keep an idle daemon alive', async () => {
    let expired = false;
    const server = await start({
      idleTimeoutMs: 80,
      onIdle: () => {
        expired = true;
      },
    });
    for (let i = 0; i < 10 && !expired; i++) {
      await request(server, '/health');
      await delay(25);
    }
    expect(expired).toBe(true);
  });

  test('keeps an SSE subscriber alive and expires after disconnect', async () => {
    let expired = false;
    const server = await start({
      idleTimeoutMs: 80,
      onIdle: () => {
        expired = true;
      },
    });
    const abort = new AbortController();
    const stream = request(server, '/api/tg/updates', { signal: abort.signal }).catch(
      () => undefined,
    );
    await delay(200);
    expect(expired).toBe(false);
    abort.abort();
    await stream;
    await delay(200);
    expect(expired).toBe(true);
  });

  test('does not shut down during an outstanding RPC', async () => {
    let expired = false;
    client.invoke = async () => {
      await delay(200);
      return { _: 'ok' };
    };
    const server = await start({
      idleTimeoutMs: 80,
      onIdle: () => {
        expired = true;
      },
    });
    await request(server, '/api/tg/invoke', {
      method: 'POST',
      body: JSON.stringify({ _: 'getMe' }),
    });
    expect(expired).toBe(false);
    await delay(200);
    expect(expired).toBe(true);
  });
});

describe('token storage and upgrade', () => {
  test('uses a stable private token, repairs permissions and rejects malformed state', () => {
    const secret = getDaemonToken(directory);
    expect(secret).toMatch(/^[a-f0-9]{64}$/);
    expect(getDaemonToken(directory)).toBe(secret);
    if (process.platform !== 'win32') {
      chmodSync(directory, 0o755);
      chmodSync(path.join(directory, 'daemon.token'), 0o644);
      expect(getDaemonToken(directory)).toBe(secret);
      expect(statSync(directory).mode & 0o777).toBe(0o700);
      expect(statSync(path.join(directory, 'daemon.token')).mode & 0o777).toBe(0o600);
    }
    writeFileSync(path.join(directory, 'daemon.token'), 'invalid');
    expect(() => getDaemonToken(directory)).toThrow('Invalid daemon token');
  });

  test('refuses token symlinks without changing their target', () => {
    const outside = path.join(directory, 'other');
    writeFileSync(outside, token);
    symlinkSync(outside, path.join(directory, 'daemon.token'));
    expect(() => getDaemonToken(directory)).toThrow();
    expect(readFileSync(outside, 'utf8')).toBe(token);
  });

  test('concurrent creators all see the same complete token', async () => {
    const module = path.resolve(import.meta.dir, '../src/security.ts');
    const code = `import { getDaemonToken } from ${JSON.stringify(module)}; console.log(getDaemonToken(process.argv[1]));`;
    const results = await Promise.all(
      Array.from({ length: 6 }, async () => {
        const child = Bun.spawn([process.execPath, '-e', code, directory], {
          stdout: 'pipe',
          stderr: 'pipe',
        });
        const stdout = await new Response(child.stdout).text();
        const stderr = await new Response(child.stderr).text();
        expect(await child.exited).toBe(0);
        expect(stderr).toBe('');
        return stdout.trim();
      }),
    );
    expect(new Set(results).size).toBe(1);
    expect(results[0]).toMatch(/^[a-f0-9]{64}$/);
  });

  test('rejects legacy health responses instead of falling back to unauthenticated access', () => {
    expect(() => requireSecureDaemon(Response.json({ ok: true }))).toThrow('older daemon');
    expect(() => requireSecureDaemon(new Response(null, { status: 401 }))).toThrow();
    expect(() =>
      requireSecureDaemon(new Response(null, { headers: { [PROTOCOL_HEADER]: PROTOCOL_VERSION } })),
    ).not.toThrow();
  });

  test('does not send the local token to a remote URL', () => {
    for (const baseUrl of [
      'https://example.com',
      'http://example.com',
      'http://localhost@evil.example',
      'http://127.0.0.1/other',
    ]) {
      expect(() => new TelegramClient({ baseUrl, authToken: token })).toThrow();
    }
  });
});

describe('authenticated client requests', () => {
  test('adds authorization to every login helper', async () => {
    const routes: string[] = [];
    const server = serveLocal({
      port: 0,
      authToken: token,
      fetch(req) {
        routes.push(new URL(req.url).pathname);
        return Response.json({ ok: true, data: { state: 'ready', ready: true } });
      },
    });
    const api = new TelegramClient({
      baseUrl: `http://127.0.0.1:${server.port}`,
      authToken: token,
    });
    try {
      await api.getAuthState();
      await api.submitPhone('+10000000000');
      await api.submitCode('00000');
      await api.resendCode();
      await api.submitPassword('test-only');
      expect(routes).toEqual([
        '/api/tg/auth/state',
        '/api/tg/auth/phone',
        '/api/tg/auth/code',
        '/api/tg/auth/resend',
        '/api/tg/auth/password',
      ]);
    } finally {
      api.close();
      server.stop(true);
    }
  });

  test('never follows a daemon redirect with credentials', async () => {
    let forwarded = false;
    const target = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      fetch() {
        forwarded = true;
        return Response.json({ ok: true, data: {} });
      },
    });
    const server = serveLocal({
      port: 0,
      authToken: token,
      fetch() {
        return Response.redirect(`http://127.0.0.1:${target.port}/`, 307);
      },
    });
    const api = new TelegramClient({
      baseUrl: `http://127.0.0.1:${server.port}`,
      authToken: token,
    });
    try {
      await expect(api.invoke({ _: 'getMe' })).rejects.toThrow();
      expect(forwarded).toBe(false);
    } finally {
      api.close();
      server.stop(true);
      target.stop(true);
    }
  });
});

test('graceful shutdown requires an authenticated non-browser POST', async () => {
  let shutdowns = 0;
  const server = await start({
    onShutdown: () => {
      shutdowns++;
    },
  });
  expect((await request(server, '/shutdown', { method: 'POST', headers: {} })).status).toBe(401);
  expect(
    (
      await request(server, '/shutdown', {
        method: 'POST',
        headers: { ...headers, Origin: 'https://example.com' },
      })
    ).status,
  ).toBe(403);
  expect((await request(server, '/shutdown')).status).toBe(404);
  await delay(30);
  expect(shutdowns).toBe(0);
  expect((await request(server, '/shutdown', { method: 'POST' })).status).toBe(200);
  await delay(30);
  expect(shutdowns).toBe(1);
});

import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  getDaemonToken,
  PROTOCOL_HEADER,
  PROTOCOL_VERSION,
  serveLocal,
} from '@tg/protocol/security';

const CLI = path.resolve(import.meta.dir, '../../src/index.ts');
let directory: string;
let server: ReturnType<typeof Bun.serve> | undefined;

beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), 'tg-cli-security-'));
});
afterEach(() => {
  server?.stop(true);
  server = undefined;
  rmSync(directory, { recursive: true, force: true });
});

async function run(args: string[]) {
  const child = Bun.spawn([process.execPath, ...args], {
    env: { ...process.env, TG_APP_DIR: directory },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const timeout = setTimeout(() => child.kill(), 5000);
  try {
    const [stdout, stderr, status] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    return { stdout, stderr, status };
  } finally {
    clearTimeout(timeout);
  }
}

function state(prefix: string) {
  writeFileSync(path.join(directory, `${prefix}.pid`), String(process.pid));
  writeFileSync(path.join(directory, `${prefix}.port`), String(server?.port));
}

test('CLI discovers the private token and uses authenticated health and RPC requests', async () => {
  const routes: string[] = [];
  server = serveLocal({
    port: 0,
    authToken: getDaemonToken(directory),
    fetch(req) {
      const route = new URL(req.url).pathname;
      routes.push(route);
      if (route === '/health')
        return Response.json({ ok: true }, { headers: { [PROTOCOL_HEADER]: PROTOCOL_VERSION } });
      return Response.json({
        ok: true,
        data: { _: 'user', id: 123, first_name: 'Fixture', type: { _: 'userTypeRegular' } },
      });
    },
  });
  state('tg_daemon');
  const result = await run(['run', CLI, 'me']);
  expect(result).toMatchObject({ status: 0 });
  expect(JSON.parse(result.stdout).ok).toBe(true);
  expect(routes).toEqual(['/health', '/api/tg/invoke']);
});

test('CLI refuses a legacy daemon before issuing Telegram RPCs', async () => {
  const routes: string[] = [];
  server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch(req) {
      routes.push(new URL(req.url).pathname);
      return Response.json({ ok: true });
    },
  });
  state('tg_daemon');
  const result = await run(['run', CLI, 'me']);
  expect(result.status).toBe(1);
  expect(result.stdout).toContain('older daemon');
  expect(routes).toEqual(['/health']);
});

test('caption client uses authenticated health and caption requests', async () => {
  const routes: string[] = [];
  server = serveLocal({
    port: 0,
    authToken: getDaemonToken(directory),
    async fetch(req) {
      const route = new URL(req.url).pathname;
      routes.push(route);
      if (route === '/health')
        return Response.json({ ok: true }, { headers: { [PROTOCOL_HEADER]: PROTOCOL_VERSION } });
      const body = (await req.json()) as { files: string[] };
      return Response.json({ file: body.files[0], text: 'Fixture caption' });
    },
  });
  state('caption');
  const module = path.resolve(import.meta.dir, '../../src/caption.ts');
  const result = await run([
    '-e',
    `import { captionFiles } from ${JSON.stringify(module)}; console.log(JSON.stringify(await captionFiles(['fixture.jpg'])));`,
  ]);
  expect(result).toMatchObject({ status: 0 });
  expect(JSON.parse(result.stdout).text).toBe('Fixture caption');
  expect(routes).toEqual(['/health', '/caption']);
});

import { afterEach, beforeEach, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { acquireAccountLocks } from '@tg/protocol/account-lock';
import {
  addAccount,
  getAccountDir,
  readAccountMetadata,
  readActiveAccount,
  useAccount,
} from '@tg/protocol/accounts';
import { authorizationHeaders, getDaemonToken } from '@tg/protocol/security';

const CLI = path.resolve(import.meta.dir, '../../src/index.ts');
const FIXTURE = path.resolve(import.meta.dir, '../fixtures/account-daemon.ts');
let root: string;
const children: ReturnType<typeof Bun.spawn>[] = [];
beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'tg-cli-accounts-'));
});
afterEach(async () => {
  for (const child of children.splice(0)) {
    child.kill();
    await child.exited;
  }
  rmSync(root, { recursive: true, force: true });
});
async function run(args: string[], account = '') {
  const child = Bun.spawn([process.execPath, CLI, ...args], {
    env: { ...process.env, TG_APP_DIR: root, TG_ACCOUNT: account || undefined },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const timer = setTimeout(() => child.kill(), 8000);
  try {
    const [stdout, stderr, status] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    const last = stdout.trim().split('\n').at(-1) ?? '';
    return { stdout, stderr, status, json: last.startsWith('{') ? JSON.parse(last) : undefined };
  } finally {
    clearTimeout(timer);
  }
}
async function daemon(account: string, service = 'tg_daemon', stopMarker?: string) {
  const child = Bun.spawn([process.execPath, FIXTURE], {
    env: {
      ...process.env,
      TG_APP_DIR: root,
      TG_ACCOUNT: account,
      FIXTURE_SERVICE: service,
      FIXTURE_STOP_MARKER: stopMarker,
      FIXTURE_LOGOUT_RECORD: path.join(root, 'logout-record'),
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  children.push(child);
  const reader = child.stdout.getReader();
  const result = await reader.read();
  reader.releaseLock();
  const port = Number(new TextDecoder().decode(result.value).trim());
  expect(port).toBeGreaterThan(0);
  return { child, port };
}

test('selection precedence is flag > environment > saved default > legacy default', async () => {
  expect((await run(['accounts', 'current'])).json.data.selected).toBe('default');
  addAccount('work', root);
  addAccount('personal', root);
  useAccount('work', root);
  expect((await run(['accounts', 'current'])).json.data.selected).toBe('work');
  expect((await run(['accounts', 'current'], 'personal')).json.data.selected).toBe('personal');
  for (const args of [
    ['--account', 'default', 'accounts', 'current'],
    ['accounts', 'current', '--account=default'],
  ]) {
    expect((await run(args, 'personal')).json.data.selected).toBe('default');
  }
  expect(readActiveAccount(root)).toBe('work');
  const unknown = await run(['--account', 'missing', 'me']);
  expect(unknown.status).toBe(1);
  expect(unknown.json.error).toContain('does not exist');
  expect(existsSync(getAccountDir('missing', root))).toBe(false);
});

test('offline profile lifecycle requires confirmation and preserves the original session', async () => {
  mkdirSync(path.join(root, 'tdlib_db'));
  writeFileSync(path.join(root, 'tdlib_db', 'session'), 'legacy');
  expect((await run(['accounts', 'add', 'work', '--no-login'])).status).toBe(0);
  expect((await run(['accounts', 'use', 'work'])).status).toBe(0);
  expect((await run(['accounts', 'rename', 'work', 'office'])).status).toBe(0);
  expect(readActiveAccount(root)).toBe('office');
  expect((await run(['accounts', 'remove', 'office'])).json.code).toBe('PERMISSION');
  expect((await run(['accounts', 'remove', 'office', '--confirm'])).status).toBe(0);
  expect(readActiveAccount(root)).toBe('default');
  expect(readFileSync(path.join(root, 'tdlib_db', 'session'), 'utf8')).toBe('legacy');
});

test('concurrent accounts have separate ports, tokens, identities and authenticated status', async () => {
  addAccount('work', root);
  addAccount('personal', root);
  const work = await daemon('work');
  const personal = await daemon('personal');
  expect(work.port).not.toBe(personal.port);
  const workToken = getDaemonToken(getAccountDir('work', root));
  const personalToken = getDaemonToken(getAccountDir('personal', root));
  expect(workToken).not.toBe(personalToken);
  const wrongToken = await fetch(`http://127.0.0.1:${personal.port}/health`, {
    headers: authorizationHeaders(workToken),
  });
  expect(wrongToken.status).toBe(401);
  useAccount('work', root);
  const first = await run(['me']);
  expect(first.json.account).toBe('work');
  expect(first.json.data.id).toBe(101);
  useAccount('personal', root);
  expect((await run(['me'])).json.data.id).toBe(202);
  expect((await run(['me', '--account', 'work'])).json.data.id).toBe(101);
  const status = await run(['accounts', 'status', 'work']);
  expect(status.json.data.authorization.ready).toBe(true);
  expect((await run(['accounts', 'login', 'work'])).status).toBe(0);
  expect(readAccountMetadata('work', root).identity?.id).toBe(101);
});

test('rename stops only that account daemon and caption service', async () => {
  addAccount('work', root);
  addAccount('personal', root);
  const work = await daemon('work');
  const caption = await daemon('work', 'caption');
  const personal = await daemon('personal');
  const renamed = await run(['accounts', 'rename', 'work', 'office']);
  expect(renamed.status).toBe(0);
  expect(await work.child.exited).toBe(0);
  expect(await caption.child.exited).toBe(0);
  expect(personal.child.exitCode).toBe(null);
  expect((await run(['--account', 'personal', 'me'])).json.data.id).toBe(202);
  expect(existsSync(getAccountDir('office', root))).toBe(true);
});

test('remove with logout revokes only the requested account before deleting local files', async () => {
  addAccount('work', root);
  addAccount('personal', root);
  const work = await daemon('work');
  const personal = await daemon('personal');
  const removed = await run(['accounts', 'remove', 'work', '--confirm', '--logout']);
  expect(removed.status).toBe(0);
  expect(JSON.parse(removed.stdout).data.removed).toBe('work');
  expect(removed.json.data.loggedOut).toBe(true);
  expect(readFileSync(path.join(root, 'logout-record'), 'utf8')).toBe('work');
  expect(await work.child.exited).toBe(0);
  expect(personal.child.exitCode).toBe(null);
  expect(existsSync(getAccountDir('work', root))).toBe(false);
  expect(existsSync(path.join(getAccountDir('personal', root), 'calls.jsonl'))).toBe(false);
});

test('session export and import operate only on the selected profile', async () => {
  addAccount('work', root);
  addAccount('personal', root);
  for (const name of ['default', 'work']) {
    const db = path.join(getAccountDir(name, root), 'tdlib_db');
    mkdirSync(db);
    writeFileSync(path.join(db, 'session'), name);
  }
  const exported = await run(['--account', 'work', 'session', 'export']);
  const imported = await run([
    '--account',
    'personal',
    'session',
    'import',
    '--string',
    exported.json.data.blob,
  ]);
  expect(imported.status).toBe(0);
  expect(
    readFileSync(path.join(getAccountDir('personal', root), 'tdlib_db', 'session'), 'utf8'),
  ).toBe('work');
  expect(readFileSync(path.join(root, 'tdlib_db', 'session'), 'utf8')).toBe('default');
});

test.each([
  false,
  true,
])('a running listener keeps its account after the saved default changes (pretty=%s)', async (pretty) => {
  addAccount('work', root);
  addAccount('personal', root);
  await daemon('work');
  await daemon('personal');
  useAccount('work', root);
  const child = Bun.spawn(
    [
      process.execPath,
      CLI,
      'listen',
      '--chat',
      '123',
      '--event',
      'user_status',
      ...(pretty ? ['--pretty'] : []),
    ],
    {
      env: { ...process.env, TG_APP_DIR: root, TG_ACCOUNT: undefined },
      stdout: 'pipe',
      stderr: 'pipe',
    },
  );
  children.push(child);
  const reader = child.stdout.getReader();
  const timer = setTimeout(() => child.kill(), 5000);
  try {
    const first = await reader.read();
    expect(new TextDecoder().decode(first.value)).toContain(
      pretty ? 'Account: work' : '"account":"work"',
    );
    useAccount('personal', root);
    const second = await reader.read();
    expect(new TextDecoder().decode(second.value)).toContain(
      pretty ? 'Account: work' : '"account":"work"',
    );
  } finally {
    reader.releaseLock();
    clearTimeout(timer);
  }
});

test('media URLs resolve inside the selected account cache only', async () => {
  addAccount('work', root);
  addAccount('personal', root);
  for (const name of ['work', 'personal']) {
    const media = path.join(getAccountDir(name, root), 'media_cache');
    mkdirSync(media);
    writeFileSync(path.join(media, 'photo.jpg'), name);
  }
  const work = await daemon('work');
  const personal = await daemon('personal');
  for (const [name, port] of [
    ['work', work.port],
    ['personal', personal.port],
  ] as const) {
    const response = await fetch(`http://127.0.0.1:${port}/api/media/photo.jpg`, {
      headers: authorizationHeaders(getDaemonToken(getAccountDir(name, root))),
    });
    expect(await response.text()).toBe(name);
  }
});

test('removal refuses a mismatched PID without deleting files or signalling that process', async () => {
  const directory = addAccount('work', root);
  const work = await daemon('work');
  writeFileSync(path.join(directory, 'tg_daemon.pid'), String(process.pid));
  const result = await run(['accounts', 'remove', 'work', '--confirm']);
  expect(result.status).toBe(1);
  expect(result.json.error).toContain('unverified process');
  expect(existsSync(directory)).toBe(true);
  expect(work.child.exitCode).toBe(null);
});

test('literal flag-shaped arguments cannot switch the account', async () => {
  addAccount('work', root);
  useAccount('work', root);
  const result = await run(['eval', '--', '--account=default']);
  expect(result.status).toBe(1);
  expect(result.json.account).toBe('work');
  expect(result.json.code).toBe('PERMISSION');
});

test('profile credentials override shared credentials and never fall back to another profile', async () => {
  const directory = addAccount('work', root);
  const personal = addAccount('personal', root);
  writeFileSync(path.join(root, 'credentials'), 'TG_API_ID=10\nTG_API_HASH=shared-test\n');
  writeFileSync(path.join(directory, 'credentials'), 'TG_API_ID=20\nTG_API_HASH=work-test\n');
  writeFileSync(path.join(personal, 'credentials'), 'TG_API_ID=30\nTG_API_HASH=personal-test\n');
  const module = path.resolve(import.meta.dir, '../../src/daemon.ts');
  async function credentials() {
    const child = Bun.spawn(
      [
        process.execPath,
        '-e',
        `import { loadCredentials } from ${JSON.stringify(module)}; console.log(JSON.stringify(loadCredentials()));`,
      ],
      {
        env: {
          ...process.env,
          TG_APP_DIR: root,
          TG_ACCOUNT: 'work',
          TG_API_ID: undefined,
          TG_API_HASH: undefined,
          VITE_TG_API_ID: undefined,
          VITE_TG_API_HASH: undefined,
        },
        stdout: 'pipe',
        stderr: 'pipe',
      },
    );
    const output = await new Response(child.stdout).text();
    expect(await child.exited).toBe(0);
    return JSON.parse(output);
  }
  expect((await credentials()).apiId).toBe(20);
  rmSync(path.join(directory, 'credentials'));
  expect((await credentials()).apiId).toBe(10);
});

test('locked profiles refuse real daemon startup and state mutations without touching sessions', async () => {
  const directory = addAccount('work', root);
  mkdirSync(path.join(directory, 'tdlib_db'));
  writeFileSync(path.join(directory, 'tdlib_db/session'), 'keep');
  const release = acquireAccountLocks(['work'], root);
  try {
    for (const args of [
      ['--account', 'work', '--daemon'],
      ['--account', 'work', '--caption-daemon'],
      ['accounts', 'remove', 'work', '--confirm'],
      ['accounts', 'rename', 'work', 'office'],
      ['--account', 'work', 'session', 'export'],
      ['--account', 'work', 'session', 'import', '--force', '--string', 'eA=='],
    ]) {
      const result = await run(args);
      expect(result.status).toBe(1);
      expect(result.json.error).toContain('is busy');
    }
    // The standalone daemon must neither start nor clean up another process's PID on lock contention.
    writeFileSync(path.join(directory, 'tg_daemon.pid'), String(process.pid));
    const standalone = Bun.spawn(
      [process.execPath, path.resolve(import.meta.dir, '../../../daemon/src/index.ts')],
      {
        env: { ...process.env, TG_APP_DIR: root, TG_ACCOUNT: 'work' },
        stdout: 'pipe',
        stderr: 'pipe',
      },
    );
    expect(await standalone.exited).toBe(1);
    expect(await new Response(standalone.stderr).text()).toContain('is busy');
    expect(readFileSync(path.join(directory, 'tg_daemon.pid'), 'utf8')).toBe(String(process.pid));
    rmSync(path.join(directory, 'tg_daemon.pid'));
    expect(readFileSync(path.join(directory, 'tdlib_db/session'), 'utf8')).toBe('keep');
    expect(existsSync(path.join(directory, 'tg_daemon.pid'))).toBe(false);
    expect(existsSync(path.join(directory, 'caption.pid'))).toBe(false);
  } finally {
    release();
  }
});

test('removal keeps startup excluded while waiting for the second service to stop', async () => {
  const directory = addAccount('work', root);
  await daemon('work');
  const marker = path.join(root, 'caption-stopping');
  await daemon('work', 'caption', marker);
  const removal = run(['accounts', 'remove', 'work', '--confirm']);
  const deadline = Date.now() + 4000;
  while (!existsSync(marker) && Date.now() < deadline) await Bun.sleep(10);
  expect(existsSync(marker)).toBe(true);
  const restart = await run(['--account', 'work', '--daemon']);
  expect(restart.status).toBe(1);
  expect(restart.json.error).toContain('is busy');
  expect((await removal).status).toBe(0);
  expect(existsSync(directory)).toBe(false);
  expect(existsSync(path.join(root, '.account-locks/work'))).toBe(false);
});

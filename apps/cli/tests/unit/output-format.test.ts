import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const CLI = path.resolve(import.meta.dir, '../../src/index.ts');
let root: string;
beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'tg-output-'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

async function run(args: string[]) {
  const child = Bun.spawn([process.execPath, CLI, ...args], {
    env: { ...process.env, TG_APP_DIR: root, TG_ACCOUNT: 'default' },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr, status] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { stdout, stderr, status };
}

test('pipes preserve the compact JSON envelope and selected account', async () => {
  const result = await run(['accounts', 'current']);
  expect(result.status).toBe(0);
  expect(result.stdout.trim().split('\n')).toHaveLength(1);
  expect(JSON.parse(result.stdout)).toMatchObject({
    ok: true,
    account: 'default',
    data: { selected: 'default' },
  });
});

test('pretty and JSON overrides work before and after subcommands', async () => {
  for (const args of [
    ['--pretty', 'daemon', 'status'],
    ['daemon', 'status', '--pretty'],
  ]) {
    const result = await run(args);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Running: No');
    expect(result.stdout).toContain('Account: default');
    expect(result.stdout).not.toContain('"ok"');
  }
  for (const args of [
    ['--json', 'daemon', 'status'],
    ['daemon', 'status', '--json'],
  ]) {
    expect(JSON.parse((await run(args)).stdout).data).toEqual({ running: false });
  }
});

test('bootstrap account errors, argument errors and command failures use the requested format', async () => {
  for (const args of [
    ['--pretty', '--account', '../bad', 'me'],
    ['--pretty', 'accounts', 'use'],
    ['--pretty', 'session', 'export'],
    ['--pretty', '--account'],
  ]) {
    const result = await run(args);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('Error ·');
    expect(result.stdout).not.toContain('"ok"');
  }
});

test('conflicting formats fail before a command can create a profile', async () => {
  const result = await run(['accounts', 'add', 'work', '--no-login', '--json', '--pretty']);
  expect(result.status).toBe(1);
  expect(JSON.parse(result.stdout)).toMatchObject({ ok: false, code: 'INVALID_ARGS' });
  expect(JSON.parse((await run(['accounts', 'list'])).stdout).data.accounts).toHaveLength(1);
});

test('format-like literal arguments do not select an output mode', async () => {
  const result = await run(['eval', '--', '--pretty']);
  expect(result.status).toBe(1);
  expect(JSON.parse(result.stdout).code).toBe('PERMISSION');
});

test('daemon logs keep plain output by default and support explicit global JSON', async () => {
  writeFileSync(path.join(root, 'tg_daemon.log'), 'one\ntwo\n');
  expect((await run(['daemon', 'log'])).stdout).toBe('one\ntwo\n');
  for (const args of [
    ['daemon', 'log', '--json'],
    ['--json', 'daemon', 'log'],
  ]) {
    expect(JSON.parse((await run(args)).stdout).data.lines).toEqual(['one', 'two']);
  }
  expect((await run(['daemon', 'log', '--pretty'])).stdout).toContain('Lines:');
});

test('doctor honors JSON without mixing human-readable output into the result', async () => {
  const result = await run(['doctor', '--json']);
  const data = JSON.parse(result.stdout);
  expect(data.account).toBe('default');
  expect(data.data.checks).toBeArray();
  expect(result.status).toBe(data.ok ? 0 : 1);
});

test('session export remains parseable with a complete base64 blob in a pipe', async () => {
  mkdirSync(path.join(root, 'tdlib_db'));
  writeFileSync(path.join(root, 'tdlib_db', 'td.binlog'), 'test-only session');
  const result = await run(['session', 'export']);
  expect(result.status).toBe(0);
  expect(Buffer.from(JSON.parse(result.stdout).data.blob, 'base64').length).toBeGreaterThan(0);
});

test('stream writer preserves one JSON object per line and allows explicit pretty output', async () => {
  const module = path.resolve(import.meta.dir, '../../src/output-format.ts');
  for (const pretty of [false, true]) {
    const child = Bun.spawn(
      [
        process.execPath,
        '-e',
        `import { configureOutput, writeEvent } from ${JSON.stringify(module)}; configureOutput({pretty:${pretty}}); writeEvent({type:'new_message',account:'work',text:'hello\\nworld'}); writeEvent({type:'delete_messages',account:'work',ids:[1,2]});`,
      ],
      { stdout: 'pipe', stderr: 'pipe' },
    );
    const stdout = await new Response(child.stdout).text();
    expect(await child.exited).toBe(0);
    if (pretty) {
      expect(stdout).toContain('New message');
      expect(stdout).toContain('Delete messages');
    } else {
      const events = stdout
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
      expect(events).toHaveLength(2);
      expect(events[0].text).toBe('hello\nworld');
      expect(events[1].ids).toEqual([1, 2]);
    }
  }
});

test('terminal detection selects readable output and explicit JSON overrides it', async () => {
  const module = path.resolve(import.meta.dir, '../../src/output-format.ts');
  for (const json of [false, true]) {
    const child = Bun.spawn(
      [
        process.execPath,
        '-e',
        `import { configureOutput, writeResult } from ${JSON.stringify(module)}; Object.defineProperty(process.stdout,'isTTY',{value:true}); configureOutput({json:${json}}); writeResult({ok:true,account:'work',data:{running:false}});`,
      ],
      { stdout: 'pipe', stderr: 'pipe' },
    );
    const stdout = await new Response(child.stdout).text();
    expect(await child.exited).toBe(0);
    if (json) expect(JSON.parse(stdout).data.running).toBe(false);
    else expect(stdout).toContain('Running: No');
  }
});

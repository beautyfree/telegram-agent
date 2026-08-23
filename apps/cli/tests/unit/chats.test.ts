import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const CLI_ENTRY = path.resolve(import.meta.dir, '../../src/index.ts');

function run(...args: string[]) {
  return spawnSync('bun', ['run', CLI_ENTRY, ...args], {
    encoding: 'utf-8',
    timeout: 10_000,
  });
}

describe('chats add-bot confirmation gate', () => {
  test('refuses to change channel membership without --confirm before connecting', () => {
    const result = run('chats', 'add-bot', '-100123', '@example_bot');

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('"code":"PERMISSION"');
    expect(result.stdout).toContain('--confirm');
  });

  test('documents the narrow administrator action', () => {
    const result = run('chats', 'add-bot', '--help');

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('broadcast channel');
    expect(result.stdout).toContain('--confirm');
  });
});

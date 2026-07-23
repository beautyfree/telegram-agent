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

describe('eval confirmation gate', () => {
  test('refuses arbitrary JavaScript without --confirm before connecting', () => {
    const result = run('eval', '1 + 1');

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('"code":"PERMISSION"');
    expect(result.stdout).toContain('--confirm');
  });

  test('advertises the confirmation flag in help', () => {
    const result = run('eval', '--help');

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('--confirm');
  });
});

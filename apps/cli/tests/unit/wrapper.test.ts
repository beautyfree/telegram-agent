import { afterAll, describe, expect, test } from 'bun:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// The npm package is CommonJS, unlike this monorepo's type: module root.
const temp = mkdtempSync(path.join(tmpdir(), 'telegram-wrapper-test-'));
const wrapper = path.join(temp, 'wrapper.cjs');
copyFileSync(path.resolve(import.meta.dir, '../../bin/telegram-agent.js'), wrapper);
afterAll(() => rmSync(temp, { recursive: true, force: true }));
// The published wrapper runs in Node, even when the test runner is Bun.
const node = execFileSync('node', ['-p', 'process.execPath'], { encoding: 'utf8' }).trim();

function runChild(code: string) {
  return spawnSync(node, [wrapper, '-e', code], {
    env: { ...process.env, TG_BIN_PATH: node },
    encoding: 'utf8',
    timeout: 10000,
  });
}

describe('npm wrapper', () => {
  test('preserves successful output', () => {
    const result = runChild('console.log("child output")');
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('child output');
  });

  test('preserves nonzero exit codes', () => {
    expect(runChild('process.exit(23)').status).toBe(23);
  });

  test.skipIf(process.platform === 'win32')('reports signal termination as failure', () => {
    const result = runChild('process.kill(process.pid, "SIGKILL")');
    expect(result.status).toBe(137);
    expect(result.stderr).toContain('SIGKILL');
  });
});

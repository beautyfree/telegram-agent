import { expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { acquireAccountLocks } from '../src/account-lock';

test('profile locks serialize across processes, isolate names and release partial acquisitions', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'tg-lock-'));
  const release = acquireAccountLocks(['work'], root);
  try {
    expect(readFileSync(path.join(root, '.account-locks/work/owner.pid'), 'utf8').trim()).toBe(
      String(process.pid),
    );
    const child = Bun.spawn(
      [
        process.execPath,
        '-e',
        `import { acquireAccountLocks } from ${JSON.stringify(path.resolve(import.meta.dir, '../src/account-lock.ts'))}; acquireAccountLocks(['work'], ${JSON.stringify(root)});`,
      ],
      { stdout: 'pipe', stderr: 'pipe' },
    );
    expect(await child.exited).not.toBe(0);
    expect(await new Response(child.stderr).text()).toContain('is busy');
    expect(() => acquireAccountLocks(['other', 'work'], root)).toThrow('is busy');
    expect(existsSync(path.join(root, '.account-locks/other'))).toBe(false);
    const other = acquireAccountLocks(['personal'], root);
    other();
    release();
    const next = acquireAccountLocks(['work'], root);
    next();
  } finally {
    release();
    rmSync(root, { recursive: true, force: true });
  }
});

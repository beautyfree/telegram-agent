import { afterEach, beforeEach, expect, test } from 'bun:test';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  addAccount,
  getAccountDir,
  listAccounts,
  readAccountMetadata,
  readActiveAccount,
  removeAccount,
  renameAccount,
  requireAccount,
  saveIdentity,
  useAccount,
  validateAccountName,
} from '../src/accounts';

let root: string;
beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'tg-accounts-'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

test('legacy session stays in place as default with no migration', () => {
  mkdirSync(path.join(root, 'tdlib_db'));
  writeFileSync(path.join(root, 'tdlib_db', 'session'), 'legacy');
  expect(getAccountDir('default', root)).toBe(root);
  expect(readActiveAccount(root)).toBe('default');
  expect(listAccounts(root)).toEqual(['default']);
  expect(readAccountMetadata('default', root)).toEqual({});
  addAccount('work', root);
  expect(readFileSync(path.join(root, 'tdlib_db', 'session'), 'utf8')).toBe('legacy');
});

test('profiles and metadata are private and names cannot escape the accounts directory', () => {
  const work = addAccount('work', root);
  if (process.platform !== 'win32') {
    expect(statSync(work).mode & 0o777).toBe(0o700);
    expect(statSync(path.join(work, 'account.json')).mode & 0o777).toBe(0o600);
  }
  for (const name of ['../other', '/tmp', 'Work', '', '.', 'a/b', 'a\\b', 'con', 'x'.repeat(33)]) {
    expect(() => validateAccountName(name)).toThrow();
  }
  expect(() => addAccount('work', root)).toThrow('already exists');
  expect(() => addAccount('default', root)).toThrow();
  expect(() => requireAccount('missing', root)).toThrow();
});

test('switch, rename and remove preserve other profiles and reset the saved default', () => {
  addAccount('work', root);
  const personal = addAccount('personal', root);
  writeFileSync(path.join(personal, 'sentinel'), 'keep');
  saveIdentity({ id: 42, firstName: 'Test' }, 'work', root);
  useAccount('work', root);
  renameAccount('work', 'office', root);
  expect(readActiveAccount(root)).toBe('office');
  expect(readAccountMetadata('office', root).identity?.id).toBe(42);
  expect(listAccounts(root)).toEqual(['default', 'office', 'personal']);
  expect(() => renameAccount('office', 'personal', root)).toThrow();
  expect(() => removeAccount('default', root)).toThrow();
  expect(() => renameAccount('default', 'legacy', root)).toThrow();
  removeAccount('office', root);
  expect(readActiveAccount(root)).toBe('default');
  expect(existsSync(getAccountDir('office', root))).toBe(false);
  expect(readFileSync(path.join(personal, 'sentinel'), 'utf8')).toBe('keep');
});

test('symlinked profile directories and parent directories are refused', () => {
  const real = addAccount('real', root);
  symlinkSync(real, path.join(root, 'accounts', 'alias'));
  expect(() => requireAccount('alias', root)).toThrow();
  expect(listAccounts(root)).toEqual(['default', 'real']);
  const otherRoot = path.join(root, 'other');
  mkdirSync(otherRoot);
  symlinkSync(path.join(root, 'accounts'), path.join(otherRoot, 'accounts'));
  expect(() => addAccount('new', otherRoot)).toThrow();
  expect(() => requireAccount('real', otherRoot)).toThrow();
});

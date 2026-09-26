import { afterEach, beforeEach, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Header } from 'tar';
import { importSessionArchive } from '../../src/session-archive';

let root: string;
beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'tg-archive-'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});
function archive(
  entries: {
    path: string;
    text?: string;
    type?: 'File' | 'Directory' | 'SymbolicLink' | 'Link';
    linkpath?: string;
  }[],
) {
  const parts: Buffer[] = [];
  for (const entry of entries) {
    const body = Buffer.from(entry.text ?? '');
    const header = new Header({
      path: entry.path,
      type: entry.type ?? 'File',
      linkpath: entry.linkpath,
      size: body.length,
      mode: 0o600,
    });
    const block = Buffer.alloc(512);
    header.encode(block);
    parts.push(block, body, Buffer.alloc((512 - (body.length % 512)) % 512));
  }
  return Buffer.concat([...parts, Buffer.alloc(1024)]);
}

test('legacy macOS AppleDouble sidecar is ignored while the database is restored', () => {
  importSessionArchive(
    archive([
      { path: '._tdlib_db', text: 'apple metadata' },
      { path: 'tdlib_db/session', text: 'fixture' },
    ]),
    root,
  );
  expect(readFileSync(path.join(root, 'tdlib_db/session'), 'utf8')).toBe('fixture');
  expect(existsSync(path.join(root, '._tdlib_db'))).toBe(false);
});

test('traversal, other accounts, absolute paths and links are rejected before replacing existing data', () => {
  mkdirSync(path.join(root, 'tdlib_db'));
  writeFileSync(path.join(root, 'tdlib_db/session'), 'existing');
  const unsafe = [
    { path: '../outside', text: 'bad' },
    { path: 'accounts/personal/tdlib_db/session', text: 'bad' },
    { path: '/tmp/outside', text: 'bad' },
    { path: 'tdlib_db/../../outside', text: 'bad' },
    { path: 'tdlib_db/alias', type: 'SymbolicLink' as const, linkpath: '../../accounts/personal' },
    { path: 'tdlib_db/alias', type: 'Link' as const, linkpath: '/tmp/outside' },
    { path: '._tdlib_db', type: 'SymbolicLink' as const, linkpath: '../outside' },
  ];
  for (const entry of unsafe) {
    expect(() =>
      importSessionArchive(
        archive([{ path: 'tdlib_db/session', text: 'replacement' }, entry]),
        root,
      ),
    ).toThrow();
    expect(readFileSync(path.join(root, 'tdlib_db/session'), 'utf8')).toBe('existing');
  }
});

test('malformed, empty and oversized archives cannot destroy an existing session', () => {
  mkdirSync(path.join(root, 'tdlib_db'));
  writeFileSync(path.join(root, 'tdlib_db/session'), 'existing');
  expect(() => importSessionArchive(Buffer.from('not a tar'), root)).toThrow();
  expect(() => importSessionArchive(archive([]), root)).toThrow();
  const block = Buffer.alloc(512);
  new Header({ path: 'tdlib_db/huge', type: 'File', size: 3 * 1024 ** 3 }).encode(block);
  expect(() => importSessionArchive(Buffer.concat([block, Buffer.alloc(1024)]), root)).toThrow();
  expect(readFileSync(path.join(root, 'tdlib_db/session'), 'utf8')).toBe('existing');
});

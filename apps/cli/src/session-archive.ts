import { existsSync, lstatSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ensurePrivateDirectory } from '@tg/protocol/security';
import { extract, list } from 'tar';

/** Validate before extracting, then replace only the selected account's database. */
export function importSessionArchive(bytes: Buffer, accountDirectory: string): void {
  ensurePrivateDirectory(accountDirectory);
  const staging = mkdtempSync(path.join(accountDirectory, '.session-import-'));
  const archive = path.join(staging, 'session.tgz');
  const database = path.join(accountDirectory, 'tdlib_db');
  const backup = path.join(staging, 'previous');
  try {
    writeFileSync(archive, bytes, { mode: 0o600 });
    let totalBytes = 0;
    let entries = 0;
    list({
      file: archive,
      sync: true,
      strict: true,
      onReadEntry(entry) {
        totalBytes += entry.size;
        entries++;
        if (totalBytes > 2 * 1024 ** 3 || entries > 100_000)
          throw new Error('Session archive exceeds the 2 GiB / 100,000-entry limit');
        const name = entry.path.replace(/^\.\//, '').replace(/\/$/, '');
        // Older macOS exports contain a harmless root AppleDouble sidecar.
        if (name === '._tdlib_db' && ['File', 'OldFile'].includes(entry.type)) return;
        const parts = name.split('/');
        if (
          parts[0] !== 'tdlib_db' ||
          parts.some((part) => part === '..' || part === '.' || part === '') ||
          /[\\:\0]/.test(name) ||
          !['Directory', 'File', 'OldFile'].includes(entry.type)
        ) {
          throw new Error(
            'Session archives may contain only regular files/directories under tdlib_db (no links or external paths)',
          );
        }
      },
    });
    if (!entries) throw new Error('Session archive is empty');
    extract({
      file: archive,
      cwd: staging,
      sync: true,
      strict: true,
      preserveOwner: false,
      filter: (name) => name.replace(/^\.\//, '') !== '._tdlib_db',
      noChmod: true,
    });
    const imported = path.join(staging, 'tdlib_db');
    if (!existsSync(imported) || !lstatSync(imported).isDirectory())
      throw new Error('Session archive has no tdlib_db directory');
    if (existsSync(database)) renameSync(database, backup);
    try {
      renameSync(imported, database);
    } catch (error) {
      if (existsSync(backup)) renameSync(backup, database);
      throw error;
    }
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

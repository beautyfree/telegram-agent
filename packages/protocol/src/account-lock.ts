import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { getRootDir, validateAccountName } from './accounts';
import { ensurePrivateDirectory } from './storage';

/** Serialize startup and state transitions, outside directories that can be moved/deleted.
 * Fail closed after an unclean exit: never steal a possibly live operation's lock.
 */
export function acquireAccountLocks(names: string[], root = getRootDir()): () => void {
  const parent = path.join(root, '.account-locks');
  ensurePrivateDirectory(root);
  ensurePrivateDirectory(parent);
  const held: string[] = [];
  const release = () => {
    process.off('exit', release);
    for (const directory of held.splice(0).reverse()) rmSync(directory, { recursive: true });
  };
  try {
    for (const name of [...new Set(names.map(validateAccountName))].sort()) {
      const directory = path.join(parent, name);
      try {
        mkdirSync(directory, { mode: 0o700 });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        throw new Error(
          `Account "${name}" is busy (lock: ${directory}). Retry after its current operation. ` +
            'After a crash, inspect owner.pid and verify that no operation is running before removing this lock directory.',
        );
      }
      held.push(directory);
      writeFileSync(path.join(directory, 'owner.pid'), `${process.pid}\n`, {
        mode: 0o600,
        flag: 'wx',
      });
    }
    process.once('exit', release);
    return release;
  } catch (error) {
    release();
    throw error;
  }
}

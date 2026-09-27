import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
} from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { ensurePrivateDirectory, writePrivateFile } from './storage';

export const DEFAULT_ACCOUNT = 'default';

export interface AccountIdentity {
  id: number;
  firstName?: string;
  username?: string;
}
export interface AccountMetadata {
  createdAt?: string;
  identity?: AccountIdentity;
}

export function getRootDir(): string {
  return path.resolve(process.env.TG_APP_DIR || path.join(homedir(), '.telegram-agent'));
}

export function validateAccountName(name: string): string {
  if (!/^[a-z][a-z0-9_-]{0,31}$/.test(name) || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/.test(name)) {
    throw new Error(
      'Account names must be 1–32 lowercase letters, digits, underscores or hyphens, starting with a letter; reserved system names are not allowed',
    );
  }
  return name;
}

export function getAccountDir(name: string, root = getRootDir()): string {
  validateAccountName(name);
  return name === DEFAULT_ACCOUNT ? root : path.join(root, 'accounts', name);
}

export function readActiveAccount(root = getRootDir()): string {
  try {
    return validateAccountName(readFileSync(path.join(root, 'active-account'), 'utf8').trim());
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return DEFAULT_ACCOUNT;
    throw error;
  }
}

export function selectedAccount(): string {
  return validateAccountName(process.env.TG_ACCOUNT ?? readActiveAccount());
}

export function requireAccount(name: string, root = getRootDir()): string {
  const directory = getAccountDir(name, root);
  if (name === DEFAULT_ACCOUNT) return directory;
  for (const candidate of [path.join(root, 'accounts'), directory]) {
    if (
      !existsSync(candidate) ||
      !lstatSync(candidate).isDirectory() ||
      lstatSync(candidate).isSymbolicLink()
    ) {
      throw new Error(
        `Account "${name}" does not exist or is not a regular directory. Run: telegram-agent accounts add ${name}`,
      );
    }
  }
  if (!existsSync(path.join(directory, 'account.json'))) {
    throw new Error(
      `Account "${name}" is not registered. Run: telegram-agent accounts add ${name}`,
    );
  }
  return directory;
}

export function readAccountMetadata(name: string, root = getRootDir()): AccountMetadata {
  const file = path.join(requireAccount(name, root), 'account.json');
  try {
    if (!lstatSync(file).isFile() || lstatSync(file).isSymbolicLink())
      throw new Error('Metadata must be a regular file');
    const value = JSON.parse(readFileSync(file, 'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error('Invalid account metadata');
    const metadata: AccountMetadata = {};
    if (typeof value.createdAt === 'string') metadata.createdAt = value.createdAt;
    if (value.identity) {
      if (!Number.isSafeInteger(value.identity.id) || value.identity.id <= 0)
        throw new Error('Invalid account identity');
      metadata.identity = { id: value.identity.id };
      if (typeof value.identity.firstName === 'string')
        metadata.identity.firstName = value.identity.firstName;
      if (typeof value.identity.username === 'string')
        metadata.identity.username = value.identity.username;
    }
    return metadata;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT' && name === DEFAULT_ACCOUNT) return {};
    throw new Error(`Cannot read metadata for account "${name}": ${(error as Error).message}`);
  }
}

export function saveIdentity(
  identity?: AccountIdentity,
  name = selectedAccount(),
  root = getRootDir(),
): void {
  const directory = requireAccount(name, root);
  const metadata = readAccountMetadata(name, root);
  metadata.identity = identity;
  writePrivateFile(path.join(directory, 'account.json'), `${JSON.stringify(metadata)}\n`);
}

export function addAccount(name: string, root = getRootDir()): string {
  const directory = getAccountDir(name, root);
  if (name === DEFAULT_ACCOUNT) throw new Error('The default account already exists');
  ensurePrivateDirectory(root);
  ensurePrivateDirectory(path.join(root, 'accounts'));
  try {
    mkdirSync(directory, { mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST')
      throw new Error(`Account "${name}" already exists`);
    throw error;
  }
  writePrivateFile(
    path.join(directory, 'account.json'),
    `${JSON.stringify({ createdAt: new Date().toISOString() })}\n`,
  );
  return directory;
}

export function listAccounts(root = getRootDir()): string[] {
  const names = [DEFAULT_ACCOUNT];
  const parent = path.join(root, 'accounts');
  if (!existsSync(parent)) return names;
  if (lstatSync(parent).isSymbolicLink())
    throw new Error('Accounts directory must not be a symlink');
  for (const entry of readdirSync(parent, { withFileTypes: true })) {
    if (entry.isDirectory() && existsSync(path.join(parent, entry.name, 'account.json'))) {
      validateAccountName(entry.name);
      names.push(entry.name);
    }
  }
  return names.sort((a, b) =>
    a === DEFAULT_ACCOUNT ? -1 : b === DEFAULT_ACCOUNT ? 1 : a.localeCompare(b),
  );
}

export function useAccount(name: string, root = getRootDir()): void {
  requireAccount(name, root);
  writePrivateFile(path.join(root, 'active-account'), `${name}\n`);
}

/** The caller must stop this account's services before moving its state. */
export function renameAccount(name: string, newName: string, root = getRootDir()): void {
  const from = requireAccount(name, root);
  const to = getAccountDir(newName, root);
  if (name === DEFAULT_ACCOUNT || newName === DEFAULT_ACCOUNT)
    throw new Error('The default account cannot be renamed or replaced');
  if (existsSync(to)) throw new Error(`Account "${newName}" already exists`);
  renameSync(from, to);
  if (readActiveAccount(root) === name) useAccount(newName, root);
}

/** Removes local state only; this does not revoke authorization on Telegram's servers. */
export function removeAccount(name: string, root = getRootDir()): void {
  const directory = requireAccount(name, root);
  if (name === DEFAULT_ACCOUNT)
    throw new Error(
      'The default account cannot be removed; use --account default logout to revoke its session',
    );
  rmSync(directory, { recursive: true });
  if (readActiveAccount(root) === name) useAccount(DEFAULT_ACCOUNT, root);
}

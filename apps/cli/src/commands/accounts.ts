import { existsSync } from 'node:fs';
import { TelegramClient } from '@tg/protocol';
import { acquireAccountLocks } from '@tg/protocol/account-lock';
import {
  addAccount,
  getAccountDir,
  listAccounts,
  readActiveAccount,
  removeAccount,
  renameAccount,
  requireAccount,
  saveIdentity,
  selectedAccount,
  useAccount,
  validateAccountName,
} from '@tg/protocol/accounts';
import { daemonUrl, getDaemonToken } from '@tg/protocol/security';
import type { Command } from 'commander';
import {
  accountAuthState,
  describeAccount,
  runAccountCommand,
  serviceState,
  stopAccountServices,
} from '../account-runtime';
import { fail, success, warn } from '../output';

export function register(parent: Command): void {
  const accounts = parent.command('accounts').description('Manage multiple Telegram accounts');
  accounts
    .command('list')
    .description('List local accounts and service status without connecting')
    .action(() => {
      success({
        active: readActiveAccount(),
        selected: selectedAccount(),
        accounts: listAccounts().map(describeAccount),
      });
    });
  accounts
    .command('current')
    .description('Show the selected account and saved default')
    .action(() => {
      success({
        active: readActiveAccount(),
        selected: selectedAccount(),
        ...describeAccount(selectedAccount()),
      });
    });
  accounts
    .command('add')
    .argument('<name>', 'Unique account name')
    .option('--no-login', 'Create a profile without interactive login')
    .description('Add an account and log in; does not change the saved default')
    .action(async (name: string, opts: { login: boolean }) => {
      const release = acquireAccountLocks([name]);
      try {
        addAccount(name);
      } finally {
        release();
      }
      if (opts.login) await runAccountCommand(name, ['login']);
      success({ added: name, active: readActiveAccount(), ...describeAccount(name) });
    });
  accounts
    .command('login')
    .argument('[name]', 'Account to log in to (defaults to selected)')
    .description('Log in or reconnect an existing account')
    .action(async (name?: string) => {
      const selected = name ?? selectedAccount();
      requireAccount(selected);
      await runAccountCommand(selected, ['login']);
    });
  accounts
    .command('use')
    .argument('<name>')
    .description('Choose the default account for future commands')
    .action((name: string) => {
      const release = acquireAccountLocks([name]);
      try {
        useAccount(name);
      } finally {
        release();
      }
      success({ active: name });
    });
  accounts
    .command('status')
    .argument('[name]')
    .description('Show account details and authorization state without starting it')
    .action(async (name?: string) => {
      const selected = name ?? selectedAccount();
      success({ ...describeAccount(selected), authorization: await accountAuthState(selected) });
    });
  accounts
    .command('rename')
    .argument('<name>')
    .argument('<new-name>')
    .description('Rename an account after stopping its services')
    .action(async (name: string, newName: string) => {
      const release = acquireAccountLocks([name, newName]);
      try {
        requireAccount(name);
        validateAccountName(newName);
        if (name === 'default' || newName === 'default')
          fail('The default account cannot be renamed or replaced', 'INVALID_ARGS');
        if (existsSync(getAccountDir(newName)))
          fail(`Account "${newName}" already exists`, 'INVALID_ARGS');
        await stopAccountServices(name);
        renameAccount(name, newName);
        success({ renamed: name, ...describeAccount(newName), active: readActiveAccount() });
      } finally {
        release();
      }
    });
  accounts
    .command('remove')
    .argument('<name>')
    .option('--confirm', 'Confirm deletion of local account files')
    .option('--logout', 'Revoke this account session on Telegram before removing local files')
    .description('Remove a named account and its local session/media (requires --confirm)')
    .action(async (name: string, opts: { confirm?: boolean; logout?: boolean }) => {
      if (!opts.confirm)
        fail(
          'Removing an account deletes its local session and media. Re-run with --confirm.',
          'PERMISSION',
        );
      requireAccount(name);
      if (name === 'default')
        fail(
          'The default account cannot be removed; use --account default logout instead',
          'INVALID_ARGS',
        );
      // Startup takes the same lock. Start first, then hold the lock through revocation and deletion.
      if (opts.logout) await runAccountCommand(name, ['daemon', 'start'], true);
      const release = acquireAccountLocks([name]);
      try {
        const directory = requireAccount(name);
        if (opts.logout) {
          const state = serviceState(directory, 'tg_daemon');
          if (!state.running || !state.port)
            throw new Error('Account daemon stopped before logout; profile retained');
          const client = new TelegramClient({
            baseUrl: daemonUrl(state.port),
            authToken: getDaemonToken(directory),
          });
          client.signal = AbortSignal.timeout(10_000);
          try {
            await client.invoke({ _: 'logOut' });
            saveIdentity(undefined, name);
          } finally {
            client.close();
          }
        }
        await stopAccountServices(name);
        removeAccount(name);
        if (!opts.logout)
          warn(
            'Local files removed. This does not revoke the session on Telegram; use Telegram Devices to revoke it if needed.',
          );
        success({ removed: name, active: readActiveAccount(), loggedOut: Boolean(opts.logout) });
      } finally {
        release();
      }
    });
}

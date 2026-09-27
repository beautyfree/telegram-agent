import { acquireAccountLocks } from '@tg/protocol/account-lock';
import { saveIdentity, selectedAccount } from '@tg/protocol/accounts';
import type { Command } from 'commander';
import { stopAccountServices } from '../account-runtime';
import { strip, success } from '../output';
import { pending } from '../pending';

export function register(parent: Command): void {
  parent
    .command('logout')
    .description('Log out of Telegram')
    .action(() => {
      pending.action = async (client) => {
        const release = acquireAccountLocks([selectedAccount()]);
        try {
          const res = await client.invoke({ _: 'logOut' });
          saveIdentity(undefined);
          await stopAccountServices(undefined, ['tg_daemon']);
          success(strip(res));
        } finally {
          release();
        }
      };
    });
}

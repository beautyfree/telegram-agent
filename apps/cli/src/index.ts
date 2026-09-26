// Resolve the account before importing modules that capture filesystem paths.
import { selectedAccount, validateAccountName } from '@tg/protocol/accounts';
import { Command } from 'commander';
import { normalizeNegativePeerSeparatorArgv } from './argv';

try {
  // Match Commander's global option parsing, including --account after a subcommand
  // and the literal-argument boundary (--). Never inspect message text as code.
  const selector = new Command()
    .option('--account <name>')
    .option('--timeout <seconds>')
    .exitOverride()
    .configureOutput({ writeErr: () => {} });
  selector.parseOptions(normalizeNegativePeerSeparatorArgv(process.argv.slice(2)));
  process.env.TG_ACCOUNT = validateAccountName(selector.opts().account ?? selectedAccount());
  await import('./cli');
} catch (error) {
  process.stdout.write(
    `${JSON.stringify({ ok: false, error: (error as Error).message, code: 'INVALID_ARGS' })}\n`,
  );
  process.exitCode = 1;
}

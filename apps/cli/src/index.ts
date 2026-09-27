// Resolve the account before importing modules that capture filesystem paths.
import { selectedAccount, validateAccountName } from '@tg/protocol/accounts';
import { Command } from 'commander';
import { normalizeNegativePeerSeparatorArgv } from './argv';
import { configureOutput, writeResult } from './output-format';

// Match Commander's global option parsing, including --account after a subcommand
// and the literal-argument boundary (--). Never inspect message text as code.
const selector = new Command()
  .option('--account <name>')
  .option('--timeout <seconds>')
  .option('--json')
  .option('--pretty')
  .exitOverride()
  .configureOutput({ writeErr: () => {} });
try {
  selector.parseOptions(normalizeNegativePeerSeparatorArgv(process.argv.slice(2)));
  configureOutput(selector.opts());
  process.env.TG_ACCOUNT = validateAccountName(selector.opts().account ?? selectedAccount());
  await import('./cli');
} catch (error) {
  try {
    configureOutput(selector.opts());
  } catch {
    /* The original parsing error is reported below. */
  }
  writeResult({ ok: false, error: (error as Error).message, code: 'INVALID_ARGS' });
  process.exitCode = 1;
}

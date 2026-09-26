import { existsSync, readFileSync } from 'node:fs';
import type { Command } from 'commander';
import { stopAccountServices } from '../account-runtime';
import { ensureDaemon, getDaemonPid, LOG_FILE } from '../daemon';
import { fail, success } from '../output';

export function register(parent: Command): void {
  const daemon = parent.command('daemon').description('Daemon lifecycle management');

  daemon
    .command('start')
    .description('Start the background daemon')
    .action(async () => {
      const existingPid = getDaemonPid();
      if (existingPid) {
        const { port } = await ensureDaemon();
        success({ already_running: true, pid: existingPid, port });
      } else {
        const { url } = await ensureDaemon();
        const pid = getDaemonPid();
        if (url && pid) {
          success({ started: true, pid });
        } else {
          fail('Failed to start daemon', 'UNKNOWN');
        }
      }
      process.exit(0);
    });

  daemon
    .command('stop')
    .description('Stop the selected account background daemon')
    .action(async () => {
      const pid = getDaemonPid();
      await stopAccountServices(undefined, ['tg_daemon']);
      success(pid ? { stopped: true, pid } : { stopped: false, already_stopped: true });
    });

  daemon
    .command('status')
    .description('Check if daemon is running')
    .action(() => {
      const pid = getDaemonPid();
      if (pid) {
        success({ running: true, pid });
      } else {
        success({ running: false });
      }
      process.exit(0);
    });

  daemon
    .command('log')
    .description('Show last 20 lines of daemon log')
    .option('--json', 'Output as JSON')
    .action((opts: { json?: boolean }) => {
      if (existsSync(LOG_FILE)) {
        const log = readFileSync(LOG_FILE, 'utf-8');
        const lines = log.trim().split('\n');
        if (opts.json) {
          success({ lines: lines.slice(-20) });
        } else {
          process.stdout.write(`${lines.slice(-20).join('\n')}\n`);
        }
      } else {
        fail('No daemon log file', 'NOT_FOUND');
      }
      process.exit(0);
    });
}

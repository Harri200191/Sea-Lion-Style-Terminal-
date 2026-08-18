import * as vscode from 'vscode';
import type { SeaLionConfig, UnknownExitBehavior } from './configuration';
import type { Logger } from './log';

/** What a finished terminal command should sound like. */
export type TerminalOutcome = 'success' | 'failure' | 'ignore';

/**
 * Maps a shell exit code to an outcome.
 *
 * `undefined` is a genuinely ambiguous case in the VS Code API: it means the
 * shell reported no code, which happens on Ctrl+C, on pressing Enter at an
 * empty prompt, and when a sub-shell confuses the integration script. Barking
 * at an empty Enter would be maddening, so the default is to stay quiet and
 * let the user opt in.
 */
export function outcomeForExitCode(
  exitCode: number | undefined,
  unknownBehavior: UnknownExitBehavior
): TerminalOutcome {
  if (typeof exitCode !== 'number' || !Number.isFinite(exitCode)) {
    return unknownBehavior;
  }
  return exitCode === 0 ? 'success' : 'failure';
}

/** True when the running VS Code build exposes the shell integration events. */
export function hasShellIntegrationApi(
  namespace: typeof vscode.window = vscode.window
): boolean {
  return typeof namespace.onDidEndTerminalShellExecution === 'function';
}

/**
 * Listens for finished terminal commands and asks for a success or failure
 * sound. Exit codes come from shell integration -- terminal text is never
 * scanned for words like "error".
 */
export class TerminalListener implements vscode.Disposable {
  private readonly subscriptions: vscode.Disposable[] = [];

  constructor(
    private readonly getConfig: () => SeaLionConfig,
    private readonly play: (outcome: 'success' | 'failure') => void,
    private readonly logger: Logger
  ) {
    if (!hasShellIntegrationApi()) {
      this.logger.warn(
        'Terminal shell integration API is unavailable in this VS Code build; ' +
          'terminal sounds are disabled. VS Code 1.93 or newer is required.'
      );
      return;
    }

    this.subscriptions.push(
      vscode.window.onDidEndTerminalShellExecution((event) => this.handleEnd(event))
    );
  }

  private handleEnd(event: vscode.TerminalShellExecutionEndEvent): void {
    try {
      const config = this.getConfig();
      if (!config.enabled || !config.terminal.enabled) {
        return;
      }

      const { exitCode } = event;
      const outcome = outcomeForExitCode(exitCode, config.terminal.unknownExitCode);

      if (outcome === 'ignore') {
        this.logger.info('Terminal command finished without an exit code; ignoring.');
        return;
      }

      const reported = typeof exitCode === 'number' ? exitCode : 'unknown';
      if (outcome === 'success') {
        this.logger.info(`Terminal command completed with exit code ${reported}`);
        this.logger.info('Playing success sound');
      } else {
        this.logger.info(`Terminal command failed with exit code ${reported}`);
        this.logger.info('Playing failure sound');
      }
      this.play(outcome);
    } catch (error) {
      // A sound must never break the terminal.
      this.logger.error('Failed to handle a terminal execution event.', error);
    }
  }

  dispose(): void {
    for (const subscription of this.subscriptions) {
      subscription.dispose();
    }
    this.subscriptions.length = 0;
  }
}

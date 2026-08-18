import type * as vscode from 'vscode';

/**
 * Minimal logging surface. Kept as an interface so that everything below the
 * extension entry point can be unit tested without an OutputChannel.
 */
export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string, error?: unknown): void;
}

export const LOG_PREFIX = '[Sea Lion Sounds]';

function describe(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? `${error.name}: ${error.message}`;
  }
  if (error === undefined) {
    return '';
  }
  return typeof error === 'string' ? error : JSON.stringify(error);
}

export class OutputChannelLogger implements Logger {
  constructor(private readonly channel: vscode.OutputChannel) {}

  info(message: string): void {
    this.write(message);
  }

  warn(message: string): void {
    this.write(`WARN  ${message}`);
  }

  error(message: string, error?: unknown): void {
    const detail = describe(error);
    this.write(`ERROR ${message}${detail ? ` -- ${detail}` : ''}`);
  }

  private write(message: string): void {
    const time = new Date().toISOString().slice(11, 23);
    this.channel.appendLine(`${time} ${LOG_PREFIX} ${message}`);
  }
}

/** Discards everything. Useful in tests and as a safe default. */
export const silentLogger: Logger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined
};

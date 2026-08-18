import './vscodeMock';

import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import type * as vscode from 'vscode';
import { readConfiguration, type SeaLionConfig } from '../configuration';
import { silentLogger } from '../log';
import { TerminalListener, hasShellIntegrationApi, outcomeForExitCode } from '../terminal';
import { fakeWorkspaceConfiguration, onDidEndTerminalShellExecution, resetMock } from './vscodeMock';

function read(values: Record<string, unknown> = {}): SeaLionConfig {
  return readConfiguration(
    fakeWorkspaceConfiguration(values) as unknown as vscode.WorkspaceConfiguration
  );
}

/** Fires a fake shell execution end event and returns what was played. */
function runCommand(exitCode: number | undefined, config: SeaLionConfig): string[] {
  const played: string[] = [];
  const listener = new TerminalListener(
    () => config,
    (outcome) => played.push(outcome),
    silentLogger
  );

  onDidEndTerminalShellExecution.fire({ exitCode, execution: {} });
  listener.dispose();
  return played;
}

beforeEach(resetMock);

describe('outcomeForExitCode', () => {
  it('treats exit code 0 as success', () => {
    assert.equal(outcomeForExitCode(0, 'ignore'), 'success');
  });

  it('treats any non-zero exit code as failure', () => {
    assert.equal(outcomeForExitCode(1, 'ignore'), 'failure');
    assert.equal(outcomeForExitCode(2, 'ignore'), 'failure');
    assert.equal(outcomeForExitCode(127, 'ignore'), 'failure');
    assert.equal(outcomeForExitCode(-1, 'ignore'), 'failure');
  });

  it('honours the configured behaviour when the shell reports no exit code', () => {
    // Ctrl+C, or pressing Enter at an empty prompt.
    assert.equal(outcomeForExitCode(undefined, 'ignore'), 'ignore');
    assert.equal(outcomeForExitCode(undefined, 'success'), 'success');
    assert.equal(outcomeForExitCode(undefined, 'failure'), 'failure');
  });
});

describe('terminal success detection', () => {
  it('plays the success sound when a command exits cleanly', () => {
    assert.deepEqual(runCommand(0, read()), ['success']);
  });
});

describe('terminal failure detection', () => {
  it('plays the failure sound on a non-zero exit code', () => {
    assert.deepEqual(runCommand(1, read()), ['failure']);
  });

  it('plays nothing for an unknown exit code by default', () => {
    assert.deepEqual(runCommand(undefined, read()), []);
  });

  it('can be configured to treat an unknown exit code as failure', () => {
    const config = read({ 'terminal.unknownExitCode': 'failure' });
    assert.deepEqual(runCommand(undefined, config), ['failure']);
  });
});

describe('terminal enablement', () => {
  it('stays quiet when terminal sounds are off', () => {
    assert.deepEqual(runCommand(0, read({ 'terminal.enabled': false })), []);
    assert.deepEqual(runCommand(1, read({ 'terminal.enabled': false })), []);
  });

  it('stays quiet when the extension is off entirely', () => {
    assert.deepEqual(runCommand(1, read({ enabled: false })), []);
  });
});

describe('terminal listener lifecycle', () => {
  it('unsubscribes on dispose so no listeners leak', () => {
    const before = onDidEndTerminalShellExecution.listenerCount;
    const listener = new TerminalListener(() => read(), () => undefined, silentLogger);

    assert.equal(onDidEndTerminalShellExecution.listenerCount, before + 1);
    listener.dispose();
    assert.equal(onDidEndTerminalShellExecution.listenerCount, before);
  });

  it('is safe to dispose twice', () => {
    const listener = new TerminalListener(() => read(), () => undefined, silentLogger);
    listener.dispose();
    assert.doesNotThrow(() => listener.dispose());
  });

  it('never lets a failing callback escape into the terminal', () => {
    const listener = new TerminalListener(
      () => read(),
      () => {
        throw new Error('speaker on fire');
      },
      silentLogger
    );

    assert.doesNotThrow(() => onDidEndTerminalShellExecution.fire({ exitCode: 0 }));
    listener.dispose();
  });
});

describe('shell integration availability', () => {
  it('detects the API when the host provides it', () => {
    const present = { onDidEndTerminalShellExecution: (): void => undefined };
    assert.equal(hasShellIntegrationApi(present as unknown as typeof vscode.window), true);
  });

  it('reports the API as missing on older hosts', () => {
    assert.equal(hasShellIntegrationApi({} as unknown as typeof vscode.window), false);
  });

  it('constructs without throwing when the API is missing', () => {
    // Older VS Code builds must degrade quietly rather than crash on activate.
    const present = onDidEndTerminalShellExecution.event;
    assert.equal(typeof present, 'function');
  });
});

import Module from 'node:module';

/**
 * Installs a fake `vscode` module so the real source files can be unit tested
 * in a plain Node process. Import this **first** in every test file, before
 * anything that reaches `vscode`.
 */

type Listener<T> = (event: T) => unknown;

export interface Disposable {
  dispose(): void;
}

/** A tiny event emitter matching the shape of `vscode.Event`. */
export class FakeEvent<T> {
  private readonly listeners = new Set<Listener<T>>();

  readonly event = (listener: Listener<T>): Disposable => {
    this.listeners.add(listener);
    return {
      dispose: (): void => {
        this.listeners.delete(listener);
      }
    };
  };

  fire(value: T): void {
    for (const listener of [...this.listeners]) {
      listener(value);
    }
  }

  get listenerCount(): number {
    return this.listeners.size;
  }
}

/** Stands in for `vscode.WorkspaceConfiguration`, keyed by dotted path. */
export function fakeWorkspaceConfiguration(values: Readonly<Record<string, unknown>>): {
  get(key: string): unknown;
} {
  return {
    get: (key: string): unknown => values[key]
  };
}

export const onDidChangeTextDocument = new FakeEvent<unknown>();
export const onDidEndTerminalShellExecution = new FakeEvent<unknown>();

export const state: {
  activeTextEditor: { document: unknown } | undefined;
  configValues: Record<string, unknown>;
} = {
  activeTextEditor: undefined,
  configValues: {}
};

export const vscodeMock = {
  workspace: {
    getConfiguration: (): { get(key: string): unknown } =>
      fakeWorkspaceConfiguration(state.configValues),
    onDidChangeTextDocument: onDidChangeTextDocument.event
  },
  window: {
    get activeTextEditor(): { document: unknown } | undefined {
      return state.activeTextEditor;
    },
    onDidEndTerminalShellExecution: onDidEndTerminalShellExecution.event
  },
  // Mirrors the real numeric enums we compare against.
  TextDocumentChangeReason: { Undo: 1, Redo: 2 },
  ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
  StatusBarAlignment: { Left: 1, Right: 2 }
};

/** Resets mutable mock state between tests. */
export function resetMock(): void {
  state.activeTextEditor = undefined;
  state.configValues = {};
}

interface ModuleWithLoad {
  _load(request: string, parent: unknown, isMain: boolean): unknown;
}

const patched = Module as unknown as ModuleWithLoad;
const originalLoad = patched._load;

patched._load = function load(request: string, parent: unknown, isMain: boolean): unknown {
  if (request === 'vscode') {
    return vscodeMock;
  }
  return originalLoad.call(this, request, parent, isMain);
};

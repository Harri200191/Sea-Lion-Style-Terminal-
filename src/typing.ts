import * as vscode from 'vscode';
import type { SeaLionConfig } from './configuration';

/**
 * Leading-edge throttle. Uses no timers, so there is nothing to leak and a
 * pause in typing always lets the next keystroke through immediately.
 */
export class Throttle {
  private lastFiredAt = Number.NEGATIVE_INFINITY;

  constructor(private readonly now: () => number = Date.now) {}

  /** Returns true (and consumes the slot) if `cooldownMs` has elapsed. */
  tryAcquire(cooldownMs: number): boolean {
    const timestamp = this.now();
    if (timestamp - this.lastFiredAt < cooldownMs) {
      return false;
    }
    this.lastFiredAt = timestamp;
    return true;
  }

  reset(): void {
    this.lastFiredAt = Number.NEGATIVE_INFINITY;
  }
}

/** The parts of a document change that decide whether it counts as "typing". */
export interface TypingChangeSummary {
  readonly changedCharacters: number;
  readonly isUndoRedo: boolean;
  /** False for background edits: other files, output channels, SCM buffers. */
  readonly isActiveDocument: boolean;
}

/**
 * Pure predicate, so the interesting rules are testable without an editor.
 *
 * Rejects undo/redo, edits to documents the user is not looking at (which is
 * how formatters, refactors and other extensions are filtered out), and any
 * change large enough to be a paste rather than a keystroke.
 */
export function shouldPlayTypingSound(
  summary: TypingChangeSummary,
  maxChangedCharacters: number
): boolean {
  if (summary.isUndoRedo || !summary.isActiveDocument) {
    return false;
  }
  if (summary.changedCharacters <= 0) {
    return false;
  }
  return summary.changedCharacters <= maxChangedCharacters;
}

/** Counts inserted plus removed characters across every edit in one event. */
export function countChangedCharacters(
  changes: readonly vscode.TextDocumentContentChangeEvent[]
): number {
  let total = 0;
  for (const change of changes) {
    total += change.text.length + change.rangeLength;
  }
  return total;
}

export function summarize(
  event: vscode.TextDocumentChangeEvent,
  activeDocument: vscode.TextDocument | undefined
): TypingChangeSummary {
  return {
    changedCharacters: countChangedCharacters(event.contentChanges),
    isUndoRedo:
      event.reason === vscode.TextDocumentChangeReason.Undo ||
      event.reason === vscode.TextDocumentChangeReason.Redo,
    isActiveDocument: activeDocument === event.document
  };
}

/** Bridges editor change events to a play callback. */
export class TypingListener implements vscode.Disposable {
  private readonly throttle = new Throttle();
  private readonly subscription: vscode.Disposable;

  constructor(
    private readonly getConfig: () => SeaLionConfig,
    private readonly play: () => void
  ) {
    this.subscription = vscode.workspace.onDidChangeTextDocument((event) =>
      this.handleChange(event)
    );
  }

  private handleChange(event: vscode.TextDocumentChangeEvent): void {
    const config = this.getConfig();
    if (!config.enabled || !config.typing.enabled || event.contentChanges.length === 0) {
      return;
    }

    const summary = summarize(event, vscode.window.activeTextEditor?.document);
    if (!shouldPlayTypingSound(summary, config.typing.maxChangedCharacters)) {
      return;
    }
    if (!this.throttle.tryAcquire(config.typing.cooldownMs)) {
      return;
    }
    this.play();
  }

  dispose(): void {
    this.subscription.dispose();
  }
}

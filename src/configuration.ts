import * as vscode from 'vscode';
import type { SoundKind } from './sounds';

export const CONFIG_SECTION = 'seaLionSounds';

export type UnknownExitBehavior = 'ignore' | 'success' | 'failure';

export interface TypingConfig {
  readonly enabled: boolean;
  readonly volume: number;
  readonly cooldownMs: number;
  readonly sound: string;
  readonly maxChangedCharacters: number;
}

export interface TerminalConfig {
  readonly enabled: boolean;
  readonly volume: number;
  readonly successSound: string;
  readonly failureSound: string;
  readonly unknownExitCode: UnknownExitBehavior;
}

export interface SeaLionConfig {
  readonly enabled: boolean;
  readonly masterVolume: number;
  readonly typing: TypingConfig;
  readonly terminal: TerminalConfig;
  readonly statusBarEnabled: boolean;
}

/** Clamps to a range, falling back to `fallback` for junk hand-edited settings. */
export function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, value));
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function unknownExit(value: unknown): UnknownExitBehavior {
  return value === 'success' || value === 'failure' ? value : 'ignore';
}

/** Reads the whole configuration tree into one immutable snapshot. */
export function readConfiguration(
  section: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration(CONFIG_SECTION)
): SeaLionConfig {
  const get = (key: string): unknown => section.get(key);

  return {
    enabled: bool(get('enabled'), true),
    masterVolume: clampNumber(get('masterVolume'), 0.5, 0, 1),
    typing: {
      enabled: bool(get('typing.enabled'), true),
      volume: clampNumber(get('typing.volume'), 0.35, 0, 1),
      cooldownMs: clampNumber(get('typing.cooldownMs'), 60, 0, 5000),
      sound: str(get('typing.sound')),
      maxChangedCharacters: clampNumber(get('typing.maxChangedCharacters'), 12, 1, 1000)
    },
    terminal: {
      enabled: bool(get('terminal.enabled'), true),
      volume: clampNumber(get('terminal.volume'), 0.8, 0, 1),
      successSound: str(get('terminal.successSound')),
      failureSound: str(get('terminal.failureSound')),
      unknownExitCode: unknownExit(get('terminal.unknownExitCode'))
    },
    statusBarEnabled: bool(get('statusBar.enabled'), true)
  };
}

/**
 * Effective volume for a sound: the per-category volume scaled by the master
 * volume. Purely arithmetic -- enablement is a separate question, see
 * {@link shouldPlay}.
 */
export function volumeFor(config: SeaLionConfig, kind: SoundKind): number {
  const categoryVolume = kind === 'typing' ? config.typing.volume : config.terminal.volume;
  return clampNumber(config.masterVolume * categoryVolume, 0, 0, 1);
}

/** Whether this kind of sound is currently switched on. */
export function shouldPlay(config: SeaLionConfig, kind: SoundKind): boolean {
  if (!config.enabled) {
    return false;
  }
  return kind === 'typing' ? config.typing.enabled : config.terminal.enabled;
}

/** The user-configured override path for a kind, or `''` to use the bundled sound. */
export function customPathFor(config: SeaLionConfig, kind: SoundKind): string {
  switch (kind) {
    case 'typing':
      return config.typing.sound;
    case 'success':
      return config.terminal.successSound;
    case 'failure':
      return config.terminal.failureSound;
  }
}

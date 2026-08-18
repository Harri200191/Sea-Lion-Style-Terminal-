import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Logger } from './log';

export type SoundKind = 'typing' | 'success' | 'failure';

export const SOUND_KINDS: readonly SoundKind[] = ['typing', 'success', 'failure'];

/**
 * Playable extensions, in the order the bundled defaults are probed. An `.mp3`
 * dropped into `media/` therefore wins over the shipped `.wav`, which is how a
 * user swaps the defaults without touching settings.
 */
export const SUPPORTED_EXTENSIONS: readonly string[] = ['.mp3', '.wav'];

export function isSupportedAudioFile(filePath: string): boolean {
  return SUPPORTED_EXTENSIONS.includes(path.extname(filePath).toLowerCase());
}

/** Expands a leading `~` so users can write `~/sounds/bark.mp3` in settings. */
export function expandHome(filePath: string, home: string = os.homedir()): string {
  if (filePath === '~') {
    return home;
  }
  if (filePath.startsWith('~/') || filePath.startsWith('~\\')) {
    return path.join(home, filePath.slice(2));
  }
  return filePath;
}

export interface SoundResolverOptions {
  /** Absolute path of the extension's bundled `media` directory. */
  mediaDir: string;
  logger: Logger;
  /** Surfaces a one-time, user-visible warning. Called at most once per path. */
  notify?: (message: string) => void;
  /** Injectable for tests. */
  exists?: (filePath: string) => boolean;
}

/**
 * Turns a sound kind plus an optional user override into an absolute file path.
 *
 * Results are cached so that typing does not stat the filesystem on every
 * keystroke; `invalidate()` is called whenever configuration changes.
 */
export class SoundResolver {
  private readonly cache = new Map<string, string | undefined>();
  private readonly warned = new Set<string>();
  private readonly exists: (filePath: string) => boolean;

  constructor(private readonly options: SoundResolverOptions) {
    this.exists = options.exists ?? defaultExists;
  }

  /** Returns an absolute, existing, playable file path, or `undefined`. */
  resolve(kind: SoundKind, customPath: string): string | undefined {
    const key = `${kind}::${customPath}`;
    if (this.cache.has(key)) {
      return this.cache.get(key);
    }
    const resolved = this.compute(kind, customPath);
    this.cache.set(key, resolved);
    return resolved;
  }

  /** Drops cached lookups. Call when settings change or files may have moved. */
  invalidate(): void {
    this.cache.clear();
  }

  private compute(kind: SoundKind, customPath: string): string | undefined {
    const custom = customPath.trim();
    if (custom.length > 0) {
      const candidate = this.validateCustom(custom, kind);
      if (candidate) {
        return candidate;
      }
    }
    return this.bundled(kind);
  }

  private validateCustom(custom: string, kind: SoundKind): string | undefined {
    const expanded = expandHome(custom);

    if (!path.isAbsolute(expanded)) {
      this.warnOnce(custom, `Custom ${kind} sound must be an absolute path: "${custom}".`);
      return undefined;
    }
    if (!isSupportedAudioFile(expanded)) {
      this.warnOnce(
        custom,
        `Custom ${kind} sound must be an ${SUPPORTED_EXTENSIONS.join(' or ')} file: "${custom}".`
      );
      return undefined;
    }
    if (!this.exists(expanded)) {
      this.warnOnce(custom, `Custom ${kind} sound was not found on disk: "${expanded}".`);
      return undefined;
    }
    return expanded;
  }

  private bundled(kind: SoundKind): string | undefined {
    for (const extension of SUPPORTED_EXTENSIONS) {
      const candidate = path.join(this.options.mediaDir, `${kind}${extension}`);
      if (this.exists(candidate)) {
        return candidate;
      }
    }
    this.warnOnce(
      `bundled::${kind}`,
      `No bundled ${kind} sound found in "${this.options.mediaDir}". ` +
        `Add ${kind}${SUPPORTED_EXTENSIONS.join(' or ')} there, or set a custom path in settings.`
    );
    return undefined;
  }

  private warnOnce(key: string, message: string): void {
    this.options.logger.warn(message);
    if (this.warned.has(key)) {
      return;
    }
    this.warned.add(key);
    this.options.notify?.(message);
  }
}

function defaultExists(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

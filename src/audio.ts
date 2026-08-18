import { spawn, type ChildProcess } from 'node:child_process';
import type { Logger } from './log';

/**
 * A thing that can make noise. Implementations must never throw and never
 * block; failures are reported through the logger they were given.
 */
export interface AudioBackend {
  readonly name: string;
  /** Fire and forget. `volume` is already clamped to 0..1. */
  play(file: string, volume: number): void;
  dispose(): void;
}

/** PowerShell prelude: P/Invoke mciSendString and only report real failures. */
const BOOTSTRAP = [
  "$ErrorActionPreference='Continue'",
  'Add-Type -MemberDefinition \'[DllImport("winmm.dll", CharSet=CharSet.Auto)] public static extern int mciSendString(string c, System.Text.StringBuilder r, int l, System.IntPtr h);\' -Name Mci -Namespace SeaLion',
  'function M($c){ try { $b = New-Object System.Text.StringBuilder 256; ' +
    '$rc = [SeaLion.Mci]::mciSendString($c, $b, 256, [System.IntPtr]::Zero); ' +
    "if ($rc -ne 0) { Write-Output ('mci error ' + $rc + ' for: ' + $c) } } catch { Write-Output $_.Exception.Message } }"
].join('; ');

function escapeForPowerShell(file: string): string {
  // Inside a single-quoted PowerShell string a quote is escaped by doubling it.
  return file.replace(/'/g, "''");
}

/**
 * Windows backend built on MCI (winmm.dll) driven through a single, long-lived
 * PowerShell process.
 *
 * Spawning a player per sound is not viable here: PowerShell takes hundreds of
 * milliseconds to start, so a typing sound every 80 ms would pile up processes
 * faster than they exit. Instead one process is started once, each distinct
 * file is opened once (that is the preload), and replaying afterwards costs a
 * single short line on stdin.
 */
export class WindowsMciBackend implements AudioBackend {
  readonly name = 'mci';

  private process: ChildProcess | undefined;
  private readonly aliases = new Map<string, string>();
  private nextAliasId = 0;
  private restarts = 0;
  private disposed = false;

  private static readonly MAX_OPEN_FILES = 8;
  private static readonly MAX_RESTARTS = 3;

  constructor(private readonly logger: Logger) {}

  play(file: string, volume: number): void {
    const worker = this.ensureProcess();
    if (!worker?.stdin?.writable) {
      return;
    }

    const alias = this.aliasFor(file, worker);
    // MCI volume is 0..1000. `play <alias> from 0` restarts a sound that is
    // already playing, which is exactly the behaviour we want for fast typing.
    const level = Math.round(volume * 1000);
    this.send(worker, `M('setaudio ${alias} volume to ${level}'); M('play ${alias} from 0')`);
  }

  private aliasFor(file: string, worker: ChildProcess): string {
    const existing = this.aliases.get(file);
    if (existing) {
      return existing;
    }

    // Bound how many MCI devices stay open; evict the oldest entry.
    if (this.aliases.size >= WindowsMciBackend.MAX_OPEN_FILES) {
      const oldest = this.aliases.keys().next();
      if (!oldest.done) {
        const staleAlias = this.aliases.get(oldest.value);
        this.aliases.delete(oldest.value);
        this.send(worker, `M('close ${staleAlias}')`);
      }
    }

    const alias = `sl${this.nextAliasId++}`;
    this.aliases.set(file, alias);
    // `type mpegvideo` routes both WAV and MP3 through the media device, which
    // -- unlike the default waveaudio device -- supports volume control.
    this.send(worker, `M('open "${escapeForPowerShell(file)}" type mpegvideo alias ${alias}')`);
    return alias;
  }

  private ensureProcess(): ChildProcess | undefined {
    if (this.disposed) {
      return undefined;
    }
    if (this.process && !this.process.killed && this.process.exitCode === null) {
      return this.process;
    }
    if (this.restarts > WindowsMciBackend.MAX_RESTARTS) {
      return undefined;
    }

    try {
      const worker = spawn(
        'powershell.exe',
        ['-NoProfile', '-NoLogo', '-NonInteractive', '-Command', '-'],
        { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }
      );

      worker.on('error', (error) => {
        this.logger.error('Audio worker failed to start.', error);
        this.forget();
      });
      worker.on('exit', (code) => {
        if (!this.disposed) {
          this.logger.warn(`Audio worker exited with code ${code}; it will restart on demand.`);
        }
        this.forget();
      });
      // MCI reports failures as text on stdout; surface them but never throw.
      worker.stdout?.on('data', (chunk: Buffer) => this.reportWorkerOutput(chunk));
      worker.stderr?.on('data', (chunk: Buffer) => this.reportWorkerOutput(chunk));
      // Do not hold VS Code open because of a sound player.
      worker.unref();

      this.process = worker;
      this.aliases.clear();
      this.restarts++;
      this.send(worker, BOOTSTRAP);
      this.logger.info(`Audio backend ready (${this.name}).`);
      return worker;
    } catch (error) {
      this.logger.error('Could not start the audio worker.', error);
      this.forget();
      return undefined;
    }
  }

  private reportWorkerOutput(chunk: Buffer): void {
    const text = chunk.toString().trim();
    if (text.length > 0) {
      this.logger.error(`Audio worker: ${text}`);
    }
  }

  private send(worker: ChildProcess, command: string): void {
    try {
      worker.stdin?.write(`${command}\n`);
    } catch (error) {
      this.logger.error('Could not send a command to the audio worker.', error);
      this.forget();
    }
  }

  private forget(): void {
    this.process = undefined;
    this.aliases.clear();
  }

  dispose(): void {
    this.disposed = true;
    const worker = this.process;
    this.forget();
    if (!worker) {
      return;
    }
    try {
      worker.stdin?.write("M('close all')\n");
      worker.stdin?.end();
    } catch {
      // The process is already gone; nothing to clean up.
    }
    worker.kill();
  }
}

interface PlayerCandidate {
  readonly command: string;
  /** Builds argv for a file at a 0..1 volume. */
  readonly args: (file: string, volume: number) => string[];
  /** Extensions this player can decode; omitted means "anything". */
  readonly extensions?: readonly string[];
}

const MACOS_PLAYERS: readonly PlayerCandidate[] = [
  // afplay ships with macOS and handles both formats natively.
  { command: 'afplay', args: (file, volume) => ['-v', volume.toFixed(3), file] }
];

const LINUX_PLAYERS: readonly PlayerCandidate[] = [
  {
    command: 'ffplay',
    args: (file, volume) => [
      '-nodisp',
      '-autoexit',
      '-loglevel',
      'quiet',
      '-volume',
      String(Math.round(volume * 100)),
      file
    ]
  },
  {
    command: 'mpv',
    args: (file, volume) => [
      '--no-video',
      '--really-quiet',
      `--volume=${Math.round(volume * 100)}`,
      file
    ]
  },
  {
    command: 'mpg123',
    args: (file, volume) => ['-q', '-f', String(Math.round(volume * 32768)), file],
    extensions: ['.mp3']
  },
  {
    command: 'paplay',
    args: (file, volume) => [`--volume=${Math.round(volume * 65536)}`, file],
    extensions: ['.wav']
  },
  // Last resort: no volume control, WAV only.
  { command: 'aplay', args: (file) => ['-q', file], extensions: ['.wav'] }
];

/**
 * macOS and Linux backend. These players start in a few milliseconds, so one
 * short-lived process per sound is fine -- but the count is still capped so a
 * stuck player can never accumulate.
 */
export class SpawnBackend implements AudioBackend {
  private active = 0;
  private disposed = false;
  private readonly children = new Set<ChildProcess>();
  private readonly unavailable = new Set<string>();
  private loggedMissingPlayer = false;

  private static readonly MAX_CONCURRENT = 6;

  constructor(
    readonly name: string,
    private readonly candidates: readonly PlayerCandidate[],
    private readonly logger: Logger
  ) {}

  play(file: string, volume: number): void {
    if (this.disposed || this.active >= SpawnBackend.MAX_CONCURRENT) {
      return;
    }
    const candidate = this.pick(file);
    if (!candidate) {
      if (!this.loggedMissingPlayer) {
        this.loggedMissingPlayer = true;
        this.logger.error(
          `No usable audio player found for "${file}". Tried: ` +
            this.candidates.map((c) => c.command).join(', ') +
            '.'
        );
      }
      return;
    }
    this.launch(candidate, file, volume);
  }

  private pick(file: string): PlayerCandidate | undefined {
    const extension = extensionOf(file);
    return this.candidates.find(
      (candidate) =>
        !this.unavailable.has(candidate.command) &&
        (!candidate.extensions || candidate.extensions.includes(extension))
    );
  }

  private launch(candidate: PlayerCandidate, file: string, volume: number): void {
    try {
      const child = spawn(candidate.command, candidate.args(file, volume), {
        stdio: 'ignore',
        detached: false
      });
      this.active++;
      this.children.add(child);

      const done = (): void => {
        if (this.children.delete(child)) {
          this.active--;
        }
      };

      child.on('error', (error: NodeJS.ErrnoException) => {
        done();
        if (error.code === 'ENOENT') {
          // Player is not installed; skip it from now on and try the next one.
          this.unavailable.add(candidate.command);
          this.logger.info(`${candidate.command} is not installed; trying the next player.`);
          this.play(file, volume);
          return;
        }
        this.logger.error(`${candidate.command} failed to play "${file}".`, error);
      });
      child.on('exit', done);
    } catch (error) {
      this.logger.error(`Could not start ${candidate.command}.`, error);
      this.unavailable.add(candidate.command);
    }
  }

  dispose(): void {
    this.disposed = true;
    for (const child of this.children) {
      try {
        child.kill();
      } catch {
        // Already exited.
      }
    }
    this.children.clear();
    this.active = 0;
  }
}

function extensionOf(file: string): string {
  const dot = file.lastIndexOf('.');
  return dot === -1 ? '' : file.slice(dot).toLowerCase();
}

export function createBackend(
  logger: Logger,
  platform: NodeJS.Platform = process.platform
): AudioBackend {
  switch (platform) {
    case 'win32':
      return new WindowsMciBackend(logger);
    case 'darwin':
      return new SpawnBackend('afplay', MACOS_PLAYERS, logger);
    default:
      return new SpawnBackend('spawn', LINUX_PLAYERS, logger);
  }
}

/**
 * Public entry point for playing sounds. Swallows every failure so that a bad
 * sound file can never take down the extension host.
 */
export class AudioPlayer {
  private backend: AudioBackend | undefined;
  private disposed = false;

  constructor(
    private readonly logger: Logger,
    private readonly backendFactory: () => AudioBackend = () => createBackend(logger)
  ) {}

  /** Never throws. A missing file or dead player is logged and ignored. */
  play(file: string | undefined, volume: number): void {
    if (this.disposed || !file || volume <= 0) {
      return;
    }
    try {
      this.backend ??= this.backendFactory();
      this.backend.play(file, Math.min(1, Math.max(0, volume)));
    } catch (error) {
      this.logger.error(`Could not play "${file}".`, error);
    }
  }

  dispose(): void {
    this.disposed = true;
    try {
      this.backend?.dispose();
    } catch (error) {
      this.logger.error('Failed to shut down the audio backend cleanly.', error);
    }
    this.backend = undefined;
  }
}

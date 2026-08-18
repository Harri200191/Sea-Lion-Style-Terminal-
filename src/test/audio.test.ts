import './vscodeMock';

import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';
import { AudioPlayer, SpawnBackend, WindowsMciBackend, createBackend, type AudioBackend } from '../audio';
import { silentLogger, type Logger } from '../log';
import { SoundResolver } from '../sounds';

/** Records what it was asked to play instead of making noise. */
class MockBackend implements AudioBackend {
  readonly name = 'mock';
  readonly calls: Array<{ file: string; volume: number }> = [];
  readonly preloaded: string[] = [];
  disposed = false;

  play(file: string, volume: number): void {
    this.calls.push({ file, volume });
  }

  preload(file: string): void {
    this.preloaded.push(file);
  }

  dispose(): void {
    this.disposed = true;
  }
}

function collectingLogger(): { logger: Logger; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  return {
    errors,
    warnings,
    logger: {
      info: () => undefined,
      warn: (message) => warnings.push(message),
      error: (message) => errors.push(message)
    }
  };
}

describe('AudioPlayer', () => {
  it('passes the file and volume through to the backend', () => {
    const backend = new MockBackend();
    const player = new AudioPlayer(silentLogger, () => backend);

    player.play('/sounds/bark.wav', 0.4);

    assert.deepEqual(backend.calls, [{ file: '/sounds/bark.wav', volume: 0.4 }]);
  });

  it('creates the backend lazily, so nothing spawns until a sound is played', () => {
    let created = 0;
    const player = new AudioPlayer(silentLogger, () => {
      created++;
      return new MockBackend();
    });

    assert.equal(created, 0);
    player.play('/sounds/bark.wav', 0.5);
    assert.equal(created, 1);
    player.play('/sounds/bark.wav', 0.5);
    assert.equal(created, 1, 'the backend is reused');
  });

  it('plays nothing when there is no file to play', () => {
    const backend = new MockBackend();
    const player = new AudioPlayer(silentLogger, () => backend);

    player.play(undefined, 0.5);

    assert.equal(backend.calls.length, 0);
  });

  it('plays nothing at zero volume', () => {
    const backend = new MockBackend();
    const player = new AudioPlayer(silentLogger, () => backend);

    player.play('/sounds/bark.wav', 0);

    assert.equal(backend.calls.length, 0);
  });

  it('clamps the volume into 0..1', () => {
    const backend = new MockBackend();
    const player = new AudioPlayer(silentLogger, () => backend);

    player.play('/sounds/bark.wav', 12);

    assert.equal(backend.calls[0].volume, 1);
  });

  it('logs and swallows a backend failure instead of throwing', () => {
    const { logger, errors } = collectingLogger();
    const player = new AudioPlayer(logger, () => ({
      name: 'broken',
      play: () => {
        throw new Error('no sound card');
      },
      preload: () => undefined,
      dispose: () => undefined
    }));

    assert.doesNotThrow(() => player.play('/sounds/bark.wav', 0.5));
    assert.equal(errors.length, 1);
    assert.match(errors[0], /Could not play/);
  });

  it('disposes the backend and stays quiet afterwards', () => {
    const backend = new MockBackend();
    const player = new AudioPlayer(silentLogger, () => backend);

    player.play('/sounds/bark.wav', 0.5);
    player.dispose();
    player.play('/sounds/bark.wav', 0.5);

    assert.equal(backend.disposed, true);
    assert.equal(backend.calls.length, 1, 'no playback after dispose');
  });

  it('survives a backend that throws on dispose', () => {
    const { logger, errors } = collectingLogger();
    const player = new AudioPlayer(logger, () => ({
      name: 'broken',
      play: () => undefined,
      preload: () => undefined,
      dispose: () => {
        throw new Error('stuck');
      }
    }));

    player.play('/sounds/bark.wav', 0.5);
    assert.doesNotThrow(() => player.dispose());
    assert.equal(errors.length, 1);
  });
});

describe('preloading', () => {
  it('warms up every sound it is given', () => {
    const backend = new MockBackend();
    const player = new AudioPlayer(silentLogger, () => backend);

    player.preload(['/sounds/a.wav', '/sounds/b.wav']);

    assert.deepEqual(backend.preloaded, ['/sounds/a.wav', '/sounds/b.wav']);
  });

  it('skips sounds that could not be resolved', () => {
    const backend = new MockBackend();
    const player = new AudioPlayer(silentLogger, () => backend);

    player.preload([undefined, '/sounds/a.wav', undefined]);

    assert.deepEqual(backend.preloaded, ['/sounds/a.wav']);
  });

  it('does nothing after dispose', () => {
    const backend = new MockBackend();
    const player = new AudioPlayer(silentLogger, () => backend);

    player.dispose();
    player.preload(['/sounds/a.wav']);

    assert.equal(backend.preloaded.length, 0);
  });

  it('swallows a backend that throws while preloading', () => {
    const { logger, errors } = collectingLogger();
    const player = new AudioPlayer(logger, () => ({
      name: 'broken',
      play: () => undefined,
      preload: () => {
        throw new Error('cannot open');
      },
      dispose: () => undefined
    }));

    assert.doesNotThrow(() => player.preload(['/sounds/a.wav']));
    assert.equal(errors.length, 1);
  });
});

describe('backend selection', () => {
  it('uses the persistent MCI worker on Windows', () => {
    const backend = createBackend(silentLogger, 'win32');
    assert.ok(backend instanceof WindowsMciBackend);
    backend.dispose();
  });

  it('uses afplay on macOS', () => {
    const backend = createBackend(silentLogger, 'darwin');
    assert.ok(backend instanceof SpawnBackend);
    assert.equal(backend.name, 'afplay');
    backend.dispose();
  });

  it('falls back to a player chain on Linux and friends', () => {
    for (const platform of ['linux', 'freebsd'] as const) {
      const backend = createBackend(silentLogger, platform);
      assert.ok(backend instanceof SpawnBackend);
      backend.dispose();
    }
  });
});

describe('missing audio file handling', () => {
  const mediaDir = path.join('/ext', 'media');

  function resolverWith(present: readonly string[]) {
    const { logger, warnings } = collectingLogger();
    const notified: string[] = [];
    const resolver = new SoundResolver({
      mediaDir,
      logger,
      notify: (message) => notified.push(message),
      exists: (candidate) => present.includes(candidate)
    });
    return { resolver, warnings, notified };
  }

  it('returns undefined when the bundled sound is missing, without throwing', () => {
    const { resolver, notified } = resolverWith([]);

    assert.equal(resolver.resolve('typing', ''), undefined);
    assert.equal(notified.length, 1);
    assert.match(notified[0], /No bundled typing sound/);
  });

  it('warns the user only once per missing file', () => {
    const { resolver, notified } = resolverWith([]);

    resolver.resolve('typing', '');
    resolver.invalidate();
    resolver.resolve('typing', '');
    resolver.invalidate();
    resolver.resolve('typing', '');

    assert.equal(notified.length, 1, 'one popup, not three');
  });

  it('a missing sound is simply not played', () => {
    const backend = new MockBackend();
    const player = new AudioPlayer(silentLogger, () => backend);
    const { resolver } = resolverWith([]);

    player.play(resolver.resolve('success', ''), 0.5);

    assert.equal(backend.calls.length, 0);
  });

  it('prefers a bundled .mp3 over the shipped .wav', () => {
    const { resolver } = resolverWith([
      path.join(mediaDir, 'typing.mp3'),
      path.join(mediaDir, 'typing.wav')
    ]);

    assert.equal(resolver.resolve('typing', ''), path.join(mediaDir, 'typing.mp3'));
  });

  it('falls back to the bundled sound when a custom path does not exist', () => {
    const bundled = path.join(mediaDir, 'failure.wav');
    const { resolver, notified } = resolverWith([bundled]);

    const resolved = resolver.resolve('failure', path.resolve('/nope/missing.mp3'));

    assert.equal(resolved, bundled);
    assert.match(notified[0], /was not found on disk/);
  });

  it('rejects a relative custom path', () => {
    const bundled = path.join(mediaDir, 'typing.wav');
    const { resolver, notified } = resolverWith([bundled]);

    assert.equal(resolver.resolve('typing', 'sounds/bark.wav'), bundled);
    assert.match(notified[0], /must be an absolute path/);
  });

  it('rejects an unsupported file type', () => {
    const bundled = path.join(mediaDir, 'typing.wav');
    const custom = path.resolve('/sounds/bark.ogg');
    const { resolver, notified } = resolverWith([bundled, custom]);

    assert.equal(resolver.resolve('typing', custom), bundled);
    assert.match(notified[0], /\.mp3 or \.wav/);
  });

  it('accepts a valid custom path', () => {
    const custom = path.resolve('/sounds/bark.mp3');
    const { resolver, notified } = resolverWith([custom]);

    assert.equal(resolver.resolve('typing', custom), custom);
    assert.equal(notified.length, 0);
  });

  it('caches lookups so typing does not stat on every keystroke', () => {
    let statCalls = 0;
    const resolver = new SoundResolver({
      mediaDir,
      logger: silentLogger,
      exists: () => {
        statCalls++;
        return true;
      }
    });

    for (let i = 0; i < 100; i++) {
      resolver.resolve('typing', '');
    }
    assert.equal(statCalls, 1);

    resolver.invalidate();
    resolver.resolve('typing', '');
    assert.equal(statCalls, 2, 'invalidate forces one fresh check');
  });
});

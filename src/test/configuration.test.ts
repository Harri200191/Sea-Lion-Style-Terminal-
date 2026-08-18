import './vscodeMock';

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type * as vscode from 'vscode';
import {
  clampNumber,
  customPathFor,
  readConfiguration,
  shouldPlay,
  volumeFor,
  type SeaLionConfig
} from '../configuration';
import { fakeWorkspaceConfiguration } from './vscodeMock';

function read(values: Record<string, unknown> = {}): SeaLionConfig {
  return readConfiguration(
    fakeWorkspaceConfiguration(values) as unknown as vscode.WorkspaceConfiguration
  );
}

describe('configuration loading', () => {
  it('falls back to the documented defaults when nothing is set', () => {
    const config = read();

    assert.equal(config.enabled, true);
    assert.equal(config.masterVolume, 0.5);
    assert.equal(config.typing.enabled, true);
    assert.equal(config.typing.volume, 0.35);
    assert.equal(config.typing.cooldownMs, 80);
    assert.equal(config.typing.maxChangedCharacters, 12);
    assert.equal(config.terminal.enabled, true);
    assert.equal(config.terminal.volume, 0.8);
    assert.equal(config.terminal.unknownExitCode, 'ignore');
    assert.equal(config.statusBarEnabled, true);
  });

  it('reads user values from the dotted setting keys', () => {
    const config = read({
      enabled: false,
      masterVolume: 0.25,
      'typing.cooldownMs': 250,
      'typing.sound': '/tmp/bark.mp3',
      'terminal.failureSound': '/tmp/sad.wav',
      'terminal.unknownExitCode': 'failure'
    });

    assert.equal(config.enabled, false);
    assert.equal(config.masterVolume, 0.25);
    assert.equal(config.typing.cooldownMs, 250);
    assert.equal(config.typing.sound, '/tmp/bark.mp3');
    assert.equal(config.terminal.failureSound, '/tmp/sad.wav');
    assert.equal(config.terminal.unknownExitCode, 'failure');
  });

  it('survives hand-edited nonsense in settings.json', () => {
    const config = read({
      enabled: 'yes please',
      masterVolume: 'loud',
      'typing.volume': 42,
      'typing.cooldownMs': -1000,
      'typing.sound': 17,
      'terminal.unknownExitCode': 'explode'
    });

    assert.equal(config.enabled, true, 'non-boolean falls back to the default');
    assert.equal(config.masterVolume, 0.5, 'non-number falls back to the default');
    assert.equal(config.typing.volume, 1, 'out-of-range values are clamped');
    assert.equal(config.typing.cooldownMs, 0, 'negative cooldown is clamped to zero');
    assert.equal(config.typing.sound, '', 'non-string path becomes empty');
    assert.equal(config.terminal.unknownExitCode, 'ignore', 'unknown enum falls back');
  });
});

describe('clampNumber', () => {
  it('clamps to the range and rejects non-finite input', () => {
    assert.equal(clampNumber(0.5, 0, 0, 1), 0.5);
    assert.equal(clampNumber(-3, 0.5, 0, 1), 0);
    assert.equal(clampNumber(9, 0.5, 0, 1), 1);
    assert.equal(clampNumber(Number.NaN, 0.5, 0, 1), 0.5);
    assert.equal(clampNumber(Number.POSITIVE_INFINITY, 0.5, 0, 1), 0.5);
    assert.equal(clampNumber(undefined, 0.5, 0, 1), 0.5);
  });
});

describe('volume calculations', () => {
  it('multiplies the category volume by the master volume', () => {
    const config = read({ masterVolume: 0.5, 'typing.volume': 0.35, 'terminal.volume': 0.8 });

    assert.equal(volumeFor(config, 'typing'), 0.175);
    assert.equal(volumeFor(config, 'success'), 0.4);
    assert.equal(volumeFor(config, 'failure'), 0.4);
  });

  it('is silent when either volume is zero', () => {
    assert.equal(volumeFor(read({ masterVolume: 0 }), 'typing'), 0);
    assert.equal(volumeFor(read({ 'typing.volume': 0 }), 'typing'), 0);
  });

  it('never exceeds 1', () => {
    const config = read({ masterVolume: 1, 'terminal.volume': 1 });
    assert.equal(volumeFor(config, 'success'), 1);
  });
});

describe('enabled and disabled state', () => {
  it('the master switch silences every kind', () => {
    const config = read({ enabled: false });

    assert.equal(shouldPlay(config, 'typing'), false);
    assert.equal(shouldPlay(config, 'success'), false);
    assert.equal(shouldPlay(config, 'failure'), false);
  });

  it('category switches are independent', () => {
    const noTyping = read({ 'typing.enabled': false });
    assert.equal(shouldPlay(noTyping, 'typing'), false);
    assert.equal(shouldPlay(noTyping, 'success'), true);

    const noTerminal = read({ 'terminal.enabled': false });
    assert.equal(shouldPlay(noTerminal, 'typing'), true);
    assert.equal(shouldPlay(noTerminal, 'failure'), false);
  });
});

describe('customPathFor', () => {
  it('maps each kind to its own setting', () => {
    const config = read({
      'typing.sound': '/a/typing.wav',
      'terminal.successSound': '/a/yay.mp3',
      'terminal.failureSound': '/a/boo.mp3'
    });

    assert.equal(customPathFor(config, 'typing'), '/a/typing.wav');
    assert.equal(customPathFor(config, 'success'), '/a/yay.mp3');
    assert.equal(customPathFor(config, 'failure'), '/a/boo.mp3');
  });

  it('returns an empty string when the user has set nothing', () => {
    assert.equal(customPathFor(read(), 'typing'), '');
  });
});

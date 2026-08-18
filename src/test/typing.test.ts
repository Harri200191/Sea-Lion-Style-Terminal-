import './vscodeMock';

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type * as vscode from 'vscode';
import { Throttle, countChangedCharacters, shouldPlayTypingSound } from '../typing';

/** A clock we can wind forward by hand, so tests never sleep. */
function fakeClock(): { now: () => number; advance: (ms: number) => void } {
  let current = 1_000;
  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms;
    }
  };
}

describe('typing cooldown', () => {
  it('lets the first keystroke through immediately', () => {
    const clock = fakeClock();
    const throttle = new Throttle(clock.now);

    assert.equal(throttle.tryAcquire(80), true);
  });

  it('drops keystrokes that arrive inside the cooldown window', () => {
    const clock = fakeClock();
    const throttle = new Throttle(clock.now);

    assert.equal(throttle.tryAcquire(80), true);
    clock.advance(20);
    assert.equal(throttle.tryAcquire(80), false);
    clock.advance(20);
    assert.equal(throttle.tryAcquire(80), false);
  });

  it('allows the next sound once the cooldown has elapsed', () => {
    const clock = fakeClock();
    const throttle = new Throttle(clock.now);

    assert.equal(throttle.tryAcquire(80), true);
    clock.advance(80);
    assert.equal(throttle.tryAcquire(80), true);
  });

  it('caps a fast typist at roughly one sound per cooldown', () => {
    const clock = fakeClock();
    const throttle = new Throttle(clock.now);
    let played = 0;

    // 200 keystrokes at 10 ms apart = two seconds of very fast typing.
    for (let i = 0; i < 200; i++) {
      if (throttle.tryAcquire(80)) {
        played++;
      }
      clock.advance(10);
    }

    assert.equal(played, 25, '2000 ms / 80 ms cooldown');
  });

  it('never throttles when the cooldown is zero', () => {
    const clock = fakeClock();
    const throttle = new Throttle(clock.now);

    for (let i = 0; i < 5; i++) {
      assert.equal(throttle.tryAcquire(0), true);
    }
  });

  it('forgets its history after a reset', () => {
    const clock = fakeClock();
    const throttle = new Throttle(clock.now);

    assert.equal(throttle.tryAcquire(500), true);
    assert.equal(throttle.tryAcquire(500), false);
    throttle.reset();
    assert.equal(throttle.tryAcquire(500), true);
  });
});

describe('shouldPlayTypingSound', () => {
  const typed = { changedCharacters: 1, isUndoRedo: false, isActiveDocument: true };

  it('plays for a single typed character', () => {
    assert.equal(shouldPlayTypingSound(typed, 12), true);
  });

  it('ignores undo and redo', () => {
    assert.equal(shouldPlayTypingSound({ ...typed, isUndoRedo: true }, 12), false);
  });

  it('ignores edits to documents the user is not looking at', () => {
    // This is how formatters, refactors and other extensions are filtered out.
    assert.equal(shouldPlayTypingSound({ ...typed, isActiveDocument: false }, 12), false);
  });

  it('ignores a large paste', () => {
    assert.equal(shouldPlayTypingSound({ ...typed, changedCharacters: 4000 }, 12), false);
  });

  it('plays right up to the size limit but not past it', () => {
    assert.equal(shouldPlayTypingSound({ ...typed, changedCharacters: 12 }, 12), true);
    assert.equal(shouldPlayTypingSound({ ...typed, changedCharacters: 13 }, 12), false);
  });

  it('ignores changes that touch no characters', () => {
    assert.equal(shouldPlayTypingSound({ ...typed, changedCharacters: 0 }, 12), false);
  });
});

describe('countChangedCharacters', () => {
  const change = (text: string, rangeLength = 0): vscode.TextDocumentContentChangeEvent =>
    ({ text, rangeLength }) as vscode.TextDocumentContentChangeEvent;

  it('counts inserted text', () => {
    assert.equal(countChangedCharacters([change('a')]), 1);
  });

  it('counts deletions, which insert nothing', () => {
    assert.equal(countChangedCharacters([change('', 1)]), 1);
  });

  it('sums every edit in a multi-cursor change', () => {
    assert.equal(countChangedCharacters([change('a'), change('b'), change('c')]), 3);
  });

  it('counts a replacement as both the removal and the insertion', () => {
    assert.equal(countChangedCharacters([change('hello', 3)]), 8);
  });
});

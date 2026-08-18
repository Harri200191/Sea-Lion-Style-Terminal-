/**
 * Regenerates `contributes.keybindings` in package.json.
 *
 * VS Code has no API for terminal keystrokes -- `TerminalShellExecution.read()`
 * only exposes a command's output after it is submitted, and
 * `onDidWriteTerminalData` is still proposed API and cannot be published. The
 * only way to react to a key pressed in the terminal is to bind that key,
 * play the sound, and re-send the character ourselves.
 *
 * That constrains which keys we can safely bind: we must be able to reproduce
 * the character exactly. Letters, digits and space are reproducible; punctuation
 * is not (it moves between keyboard layouts), so it is deliberately left alone
 * and simply makes no sound.
 *
 * Every binding is gated on the `seaLionSounds.terminalTyping` context key, so
 * when the feature is off VS Code does not route terminal keys through the
 * extension host at all.
 *
 * Run with: npm run keybindings
 */
const fs = require('fs');
const path = require('path');

const WHEN = 'terminalFocus && !terminalFindVisible && seaLionSounds.terminalTyping';

const letters = 'abcdefghijklmnopqrstuvwxyz'.split('');
const digits = '0123456789'.split('');

/** One binding: play a bark, then deliver the character to the shell. */
function binding(key, text) {
  return {
    key,
    when: WHEN,
    command: 'runCommands',
    args: {
      commands: [
        'seaLionSounds.terminalKeystroke',
        { command: 'workbench.action.terminal.sendSequence', args: { text } }
      ]
    }
  };
}

const keybindings = [
  ...letters.map((c) => binding(c, c)),
  ...letters.map((c) => binding(`shift+${c}`, c.toUpperCase())),
  ...digits.map((d) => binding(d, d)),
  binding('space', ' ')
];

const pkgPath = path.join(__dirname, '..', 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
pkg.contributes.keybindings = keybindings;
fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

console.log(`wrote ${keybindings.length} keybindings to package.json`);

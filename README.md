# Sea Lion Sounds 🦭

Make VS Code sound like a sea lion colony.

A short bark while you type. A cheerful double-bark when a terminal command succeeds. A grumpy descending growl when one fails. That is the whole idea, and it is implemented carefully enough that you can leave it switched on all day.

## Features

- 🦭 **Sea lion typing sounds** — a small bark as you type, throttled so fast typing does not turn into a stampede.
- ✅ **Sea lion success sounds** — plays when an integrated terminal command exits with code `0`.
- ❌ **Sea lion failure sounds** — plays when a command exits non-zero. Driven by the real exit code from VS Code's shell integration, never by scanning terminal text for the word "error".
- 🎵 **Custom MP3/WAV support** — swap in any sound you like, per category.
- 🔊 **Configurable volume** — a master volume plus independent per-category volumes.
- 🖥️ **Cross-platform** — Windows, macOS and Linux.
- 🦭 **A sea lion pet** — lives in the panel, galumphs around on its own, falls asleep when clicked, and can be dragged anywhere.
- 🪶 **Lightweight** — zero runtime dependencies, no filesystem polling, and no process-per-keystroke.

## Installation

1. Install **Sea Lion Sounds** from the VS Code Marketplace.
2. Open VS Code.
3. Start typing.
4. Run a terminal command.
5. Enjoy sea lions.

The status bar shows `🦭 Sea Lions: ON`. Click it to toggle the colony on and off.

## The pet

Open the **Sea Lion** tab in the bottom panel, next to Terminal and Problems, or run `Sea Lion Sounds: Show the Sea Lion Pet`.

- It **galumphs** to random spots on its own, turning to face where it is going.
- **Click it** and it curls up and falls asleep, with little `z`s drifting off. Click again to wake it — waking earns a bark.
- **Drag it** anywhere in the panel. It stays where you drop it, then carries on wandering.
- It remembers where it was and whether it was asleep, and stays inside the panel when you resize.

A note on why it lives there: VS Code extensions cannot draw over the editor or the desktop, so a pet has to live inside a webview. The panel gives it a wide strip to roam while staying visible next to your terminal. Drag the panel taller if you want it to have more room.

## Requirements

Terminal sounds need [shell integration](https://code.visualstudio.com/docs/terminal/shell-integration), which VS Code enables automatically for bash, zsh, fish, PowerShell and Git Bash. If your terminal has no shell integration the extension logs a note and stays quiet rather than guessing — typing sounds are unaffected.

Requires VS Code 1.93 or newer, which is where the terminal shell execution API became stable.

### Linux audio players

macOS uses the built-in `afplay` and Windows uses the built-in MCI system, so neither needs anything installed. Linux needs one of these on your `PATH`, tried in order:

| Player | Formats | Volume control |
| --- | --- | --- |
| `ffplay` (from FFmpeg) | MP3, WAV | Yes |
| `mpv` | MP3, WAV | Yes |
| `mpg123` | MP3 | Yes |
| `paplay` (PulseAudio) | WAV | Yes |
| `aplay` (ALSA) | WAV | No |

`ffplay` is the recommended one: `sudo apt install ffmpeg`.

## Commands

Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and type "Sea Lion":

| Command | What it does |
| --- | --- |
| `Sea Lion Sounds: Enable` | Turns all sounds on. |
| `Sea Lion Sounds: Disable` | Turns all sounds off. |
| `Sea Lion Sounds: Toggle` | Flips the master switch. Same as clicking the status bar. |
| `Sea Lion Sounds: Test Typing Sound` | Plays the typing sound immediately. |
| `Sea Lion Sounds: Test Success Sound` | Plays the success sound immediately. |
| `Sea Lion Sounds: Test Failure Sound` | Plays the failure sound immediately. |
| `Sea Lion Sounds: Open Settings` | Jumps to the extension's settings. |
| `Sea Lion Sounds: Show Output Log` | Opens the **Sea Lion Sounds** output channel. |
| `Sea Lion Sounds: Show the Sea Lion Pet` | Reveals the pet in the bottom panel. |

The three test commands play even when the corresponding sound is switched off, so you can audition a file before enabling it.

## Configuration

All volumes are `0`–`1`. Effective loudness is always `masterVolume × categoryVolume`, so setting `masterVolume` to `0` silences everything.

| Setting | Type | Default | Description |
| --- | --- | --- | --- |
| `seaLionSounds.enabled` | boolean | `true` | Enable Sea Lion Sounds. When off, no sounds are played at all. |
| `seaLionSounds.masterVolume` | number | `0.5` | Master volume for all Sea Lion Sounds. Multiplied into every individual volume. |
| `seaLionSounds.typing.enabled` | boolean | `true` | Play a sound while typing in the editor. |
| `seaLionSounds.typing.volume` | number | `0.35` | Volume of the typing sound. |
| `seaLionSounds.typing.cooldownMs` | number | `40` | Minimum delay between typing sounds in milliseconds. Lower it further for an even busier colony. |
| `seaLionSounds.typing.sound` | string | `""` | Absolute path to a custom typing sound. Empty uses the bundled sound. |
| `seaLionSounds.typing.maxChangedCharacters` | number | `12` | Skip the typing sound when one change touches more characters than this. Stops pastes and formatters from barking. |
| `seaLionSounds.typing.inTerminal` | boolean | `false` | Also bark while typing in the integrated terminal. See the caveats below. |
| `seaLionSounds.terminal.enabled` | boolean | `true` | Play sounds when integrated terminal commands finish. |
| `seaLionSounds.terminal.volume` | number | `0.8` | Volume of the success and failure sounds. |
| `seaLionSounds.terminal.successSound` | string | `""` | Absolute path to a custom success sound. Empty uses the bundled sound. |
| `seaLionSounds.terminal.failureSound` | string | `""` | Absolute path to a custom failure sound. Empty uses the bundled sound. |
| `seaLionSounds.terminal.unknownExitCode` | enum | `"ignore"` | What to play when the shell reports no exit code — `ignore`, `success` or `failure`. |
| `seaLionSounds.statusBar.enabled` | boolean | `true` | Show the Sea Lion Sounds toggle in the status bar. |

### About `terminal.unknownExitCode`

VS Code reports `undefined` instead of an exit code when you press `Ctrl+C`, press Enter at an empty prompt, or when a sub-shell confuses the shell integration script. Barking every time you tap Enter gets old fast, so the default is `ignore`. Set it to `failure` if you want cancelled commands to sound sad.

### Typing sounds in the terminal

Off by default, and worth reading before you switch it on:

```jsonc
{ "seaLionSounds.typing.inTerminal": true }
```

VS Code exposes **no API for terminal keystrokes**. `TerminalShellExecution.read()` only gives you a command's output after it has been submitted, and `onDidWriteTerminalData` is still proposed API, which cannot be published to the Marketplace. So the only way to do this is to bind the keys ourselves while the terminal is focused, play the bark, and re-send the character.

That means real limitations:

- **Letters, digits and space only.** Punctuation moves around between keyboard layouts, so re-sending it reliably is not possible. Those keys stay silent and are never intercepted.
- **Caps Lock sends the wrong case.** Keybindings match the key, not the character it produces.
- **Every affected keypress makes a round trip through the extension host.** On a busy window the terminal can feel slightly less responsive.

When the setting is off, the keybindings are disabled by a context key, so VS Code does not route terminal keys through the extension at all — there is zero cost to leaving it off.

If the terminal ever feels laggy, turn it off. Editor typing sounds are unaffected either way.

### Using your own sounds

```jsonc
{
  "seaLionSounds.typing.sound": "/Users/you/sounds/pup-chirp.wav",
  "seaLionSounds.terminal.successSound": "/Users/you/sounds/happy-bark.mp3",
  "seaLionSounds.terminal.failureSound": "/Users/you/sounds/grumpy-bark.mp3"
}
```

Paths must be **absolute** (a leading `~` is expanded) and must end in `.mp3` or `.wav`. If a path is wrong the extension logs the reason, warns you once, and falls back to the bundled sound — it never goes silent without telling you.

You can also just replace the bundled files. Drop `typing.mp3`, `success.mp3` or `failure.mp3` into the extension's `media/` folder and they take priority over the shipped `.wav` files.

## How it works

Three small pieces:

- **Typing** listens to `workspace.onDidChangeTextDocument`, not raw keyboard events. It skips undo/redo, skips edits to any document that is not the one you are looking at (which is how formatters, refactors and other extensions are filtered out), skips changes bigger than `maxChangedCharacters`, and then applies a leading-edge throttle. No timers are involved, so a pause always lets the next keystroke through immediately.
- **Terminal** listens to `window.onDidEndTerminalShellExecution` and reads the real `exitCode`. Optional terminal *typing* sounds work differently, through keybindings, because no keystroke API exists — see above.
- **Audio** keeps exactly one player alive. On Windows that is a single long-lived PowerShell process driving MCI (`winmm.dll`); each sound is opened as a small pool of four devices and playing costs one short line on stdin. The pool matters: MCI silently ignores a `play` on a device that is still playing, so retriggering an 82 ms typing sound every 40 ms needs a spare device rather than a rewind. All three sounds are opened at activation, so the first bark is as fast as the rest. On macOS and Linux, short-lived players are spawned per sound with a hard concurrency cap.

Everything is logged to the **Sea Lion Sounds** output channel — backend startup, terminal exit codes, bad paths, playback errors. Keystrokes are deliberately not logged.

## Development

```bash
npm install         # install dev dependencies
npm run compile     # type-check and bundle to dist/extension.js
npm run watch       # rebuild on change
npm run lint        # eslint
npm test            # unit tests (no sound is produced)
npm run package     # build sea-lion-sounds-x.y.z.vsix
```

Press `F5` in VS Code to launch the Extension Development Host with the extension loaded.

Regenerating the bundled assets:

```bash
npm run sounds       # re-synthesise media/*.wav
npm run icon         # re-render images/icon.png
npm run keybindings  # regenerate the terminal keybindings in package.json
npm run trim-sounds  # shorten media/*.wav to sensible lengths
```

`npm run sounds` refuses to overwrite real recordings; pass `--force` if you really mean it.

`npm run trim-sounds` shortens all three to keystroke- and notification-sized clips (typing 130 ms, success 1200 ms, failure 1300 ms), fading the tail so a cut through continuous barking does not sound chopped. Trim one at a custom length with `node scripts/trim-sound.js success 500`. The untouched originals are kept as `media/<name>.original.wav`, and every run re-trims from those, so repeated runs never compound — restore by copying one back.

### Installing the VSIX locally

```bash
code --install-extension sea-lion-sounds-0.1.0.vsix
```

Then reload VS Code. To remove it again:

```bash
code --uninstall-extension harisrehman.sea-lion-sounds
```

### Publishing to the Marketplace

1. Create a publisher at <https://marketplace.visualstudio.com/manage>.
2. Create an Azure DevOps Personal Access Token with **Marketplace → Manage** scope.
3. Then:

```bash
npx vsce login harisrehman     # paste the PAT once
npm run package                # verify the .vsix first
npx vsce publish               # or: npx vsce publish minor
```

## Audio licensing and attribution

The bundled sounds in `media/` are **synthesised from scratch** by `scripts/generate-sounds.js` using a source/filter model — a jittered pulse train pushed through three resonators, plus a shaped noise burst. No recording is sampled, downloaded, or derived from third-party material, so they carry the same MIT licence as the rest of this repository and are safe to redistribute.

They are honest placeholders: recognisably barky, but not a real sea lion. If you want the genuine article, replace them with recordings you have the right to redistribute. Good sources for permissively licensed audio:

- [Freesound](https://freesound.org) — filter by **Creative Commons 0** to avoid attribution obligations.
- [BBC Sound Effects](https://sound-effects.bbcrewind.co.uk) — free for personal, educational and research use; check the terms before shipping commercially.
- [Wikimedia Commons](https://commons.wikimedia.org) — licences vary per file, so check each one.

If you swap in a CC-BY file, add the attribution to this section — that is a licence condition, not a nicety.

## License

MIT. See [LICENSE](LICENSE).

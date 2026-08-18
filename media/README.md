# Bundled sounds

This folder holds the three default sounds. The extension looks for each name
as `.mp3` first, then `.wav`:

| File | When it plays |
| --- | --- |
| `typing.mp3` or `typing.wav` | While you type in the editor |
| `success.mp3` or `success.wav` | A terminal command exits with code `0` |
| `failure.mp3` or `failure.wav` | A terminal command exits non-zero |

## What is shipped today

The `.wav` files here are **synthesised from scratch** by
`scripts/generate-sounds.js` — a jittered pulse train pushed through three
resonators, plus a shaped noise burst for rasp. Nothing is sampled from a
recording, so they are MIT licensed along with the rest of the repository and
are safe to redistribute inside a Marketplace extension.

Regenerate them at any time:

```bash
npm run sounds
```

They are deliberate placeholders: recognisably barky, but no one would mistake
them for an actual sea lion.

## Replacing them with real recordings

Drop an `.mp3` (or `.wav`) with the matching name into this folder. An `.mp3`
takes priority over the shipped `.wav`, so you do not need to delete anything
or change any settings:

```
media/typing.mp3     <- your file wins over typing.wav
media/success.mp3
media/failure.mp3
```

Then run `npm run package` to build a VSIX containing them.

To use sounds from somewhere else on disk without touching this folder, point
the settings at absolute paths instead:

```jsonc
{
  "seaLionSounds.typing.sound": "/Users/you/sounds/pup-chirp.wav",
  "seaLionSounds.terminal.successSound": "/Users/you/sounds/happy-bark.mp3",
  "seaLionSounds.terminal.failureSound": "/Users/you/sounds/grumpy-bark.mp3"
}
```

## Licensing

Only add audio you have the right to redistribute. If you ship this extension
publicly, every bundled file must permit redistribution — Creative Commons 0
is the least troublesome, and CC-BY requires you to add attribution to the
README.

Do not drop in audio ripped from YouTube or a stock library you have not
licensed. See the "Audio licensing and attribution" section of the main
[README](../README.md) for suggested sources.

## Trimming

Recordings are usually far too long for this. `npm run trim-sounds` cuts each
one down (typing 130 ms, success 1200 ms, failure 1300 ms), drops any dead air at
the head, and fades the tail. Originals are preserved as `<name>.original.wav`
and every run re-trims from those, so nothing degrades and you can always
restore by copying one back.

```bash
npm run trim-sounds                      # all three, default lengths
node scripts/trim-sound.js success 500   # one, custom length
```

## Practical tips

- Keep `typing` **very short** — 60–120 ms. It can fire several times a second.
- Keep it **quiet** relative to the terminal sounds; the default typing volume
  is `0.35` against `0.8` for the terminal, for exactly this reason.
- Success and failure should be obviously different from each other. Rising and
  bright versus falling and low works well without needing to look at the screen.
- Trim leading silence, or the sound will feel laggy.

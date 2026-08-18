/**
 * Trims media/typing.wav down to a keystroke-sized bark.
 *
 * A typing sound is retriggered many times a second, so it has to be short.
 * Anything much over ~150 ms either overlaps itself into mush or gets cut off
 * before you hear the interesting part. This finds the loudest onset in the
 * recording, keeps a short window around it, and fades the tail so it does not
 * click.
 *
 * The original is backed up next to it as typing.original.wav the first time
 * this runs, so nothing is lost.
 *
 * Usage:
 *   node scripts/trim-typing.js [milliseconds]     (default 130)
 */
const fs = require('fs');
const path = require('path');

const TARGET_MS = Number(process.argv[2]) || 130;
const mediaDir = path.join(__dirname, '..', 'media');
const target = path.join(mediaDir, 'typing.wav');
const backup = path.join(mediaDir, 'typing.original.wav');

/** Minimal RIFF/WAVE reader for 16-bit PCM. */
function readWav(buffer) {
  if (buffer.subarray(0, 4).toString() !== 'RIFF') {
    throw new Error('not a RIFF file');
  }
  let offset = 12;
  let format;
  let data;
  while (offset + 8 <= buffer.length) {
    const id = buffer.subarray(offset, offset + 4).toString();
    const size = buffer.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === 'fmt ') {
      format = {
        channels: buffer.readUInt16LE(body + 2),
        sampleRate: buffer.readUInt32LE(body + 4),
        bitsPerSample: buffer.readUInt16LE(body + 14)
      };
    } else if (id === 'data') {
      data = buffer.subarray(body, body + size);
      break;
    }
    offset = body + size + (size % 2);
  }
  if (!format || !data) {
    throw new Error('missing fmt or data chunk');
  }
  if (format.bitsPerSample !== 16) {
    throw new Error(`only 16-bit PCM is supported, found ${format.bitsPerSample}-bit`);
  }
  return { format, data };
}

function writeWav(filePath, format, frames) {
  const header = Buffer.alloc(44);
  const byteRate = format.sampleRate * format.channels * 2;
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + frames.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(format.channels, 22);
  header.writeUInt32LE(format.sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(format.channels * 2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(frames.length, 40);
  fs.writeFileSync(filePath, Buffer.concat([header, frames]));
}

if (!fs.existsSync(target)) {
  console.error(`No ${target} to trim.`);
  process.exit(1);
}

// Preserve the original exactly once, so re-running never trims a trim.
if (!fs.existsSync(backup)) {
  fs.copyFileSync(target, backup);
  console.log(`backed up original -> media/${path.basename(backup)}`);
}

const { format, data } = readWav(fs.readFileSync(backup));
const { channels, sampleRate } = format;
const frameCount = Math.floor(data.length / (channels * 2));

const sampleAt = (frame, channel) => data.readInt16LE((frame * channels + channel) * 2) / 32768;

// Peak amplitude across channels, per frame.
const amplitude = new Float64Array(frameCount);
let peak = 0;
for (let frame = 0; frame < frameCount; frame++) {
  let loudest = 0;
  for (let channel = 0; channel < channels; channel++) {
    loudest = Math.max(loudest, Math.abs(sampleAt(frame, channel)));
  }
  amplitude[frame] = loudest;
  peak = Math.max(peak, loudest);
}

// The onset is the first frame that crosses a fraction of the overall peak.
const threshold = peak * 0.12;
let onset = 0;
while (onset < frameCount && amplitude[onset] < threshold) {
  onset++;
}
if (onset >= frameCount) {
  onset = 0;
}

const preRoll = Math.floor(sampleRate * 0.004);
const start = Math.max(0, onset - preRoll);
const length = Math.min(Math.floor((sampleRate * TARGET_MS) / 1000), frameCount - start);

const fadeIn = Math.floor(sampleRate * 0.003);
const fadeOut = Math.floor(sampleRate * 0.025);
const gain = peak > 0 ? 0.92 / peak : 1;

const out = Buffer.alloc(length * channels * 2);
for (let frame = 0; frame < length; frame++) {
  let envelope = 1;
  if (frame < fadeIn) {
    envelope *= frame / fadeIn;
  }
  const fromEnd = length - frame;
  if (fromEnd < fadeOut) {
    envelope *= fromEnd / fadeOut;
  }
  for (let channel = 0; channel < channels; channel++) {
    const value = sampleAt(start + frame, channel) * gain * envelope;
    const clamped = Math.max(-1, Math.min(1, value));
    out.writeInt16LE(Math.round(clamped * 32767), (frame * channels + channel) * 2);
  }
}

writeWav(target, format, out);

const originalMs = Math.round((frameCount / sampleRate) * 1000);
const trimmedMs = Math.round((length / sampleRate) * 1000);
console.log(`onset found at ${Math.round((onset / sampleRate) * 1000)} ms`);
console.log(`media/typing.wav  ${originalMs} ms -> ${trimmedMs} ms  (${out.length + 44} bytes)`);
console.log('restore anytime:  copy media/typing.original.wav over media/typing.wav');

/**
 * Trims a bundled sound down to a sensible length.
 *
 * Typing sounds are retriggered many times a second and have to be very short.
 * Terminal sounds can breathe a bit more, but a two second bark still outlives
 * its welcome on every successful command.
 *
 * The tool finds the loudest onset, keeps a window from just before it, and
 * fades the tail. The fade is proportional to the clip: a short bark that ends
 * in silence needs only a few milliseconds, while a hard cut through continuous
 * barking needs a long one or it sounds chopped off.
 *
 * The original is backed up as <name>.original.wav the first time each sound is
 * trimmed, and every later run re-trims from that backup, so repeated runs never
 * compound and nothing is lost.
 *
 * Usage:
 *   node scripts/trim-sound.js typing 130
 *   node scripts/trim-sound.js success 1200
 *   node scripts/trim-sound.js failure 1300
 */
const fs = require('fs');
const path = require('path');

const DEFAULT_MS = { typing: 130, success: 1200, failure: 1300 };

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
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + frames.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(format.channels, 22);
  header.writeUInt32LE(format.sampleRate, 24);
  header.writeUInt32LE(format.sampleRate * format.channels * 2, 28);
  header.writeUInt16LE(format.channels * 2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(frames.length, 40);
  fs.writeFileSync(filePath, Buffer.concat([header, frames]));
}

function trim(name, targetMs) {
  const mediaDir = path.join(__dirname, '..', 'media');
  const target = path.join(mediaDir, `${name}.wav`);
  const backup = path.join(mediaDir, `${name}.original.wav`);

  if (!fs.existsSync(target) && !fs.existsSync(backup)) {
    console.log(`skipped ${name}: no media/${name}.wav`);
    return;
  }
  // Always work from the pristine original so re-running cannot compound.
  if (!fs.existsSync(backup)) {
    fs.copyFileSync(target, backup);
    console.log(`backed up  media/${name}.wav -> media/${name}.original.wav`);
  }

  const { format, data } = readWav(fs.readFileSync(backup));
  const { channels, sampleRate } = format;
  const frameCount = Math.floor(data.length / (channels * 2));
  const sampleAt = (frame, channel) => data.readInt16LE((frame * channels + channel) * 2) / 32768;

  let peak = 0;
  const amplitude = new Float64Array(frameCount);
  for (let frame = 0; frame < frameCount; frame++) {
    let loudest = 0;
    for (let channel = 0; channel < channels; channel++) {
      loudest = Math.max(loudest, Math.abs(sampleAt(frame, channel)));
    }
    amplitude[frame] = loudest;
    peak = Math.max(peak, loudest);
  }

  // Skip any dead air at the head, which otherwise reads as latency.
  const threshold = peak * 0.12;
  let onset = 0;
  while (onset < frameCount && amplitude[onset] < threshold) {
    onset++;
  }
  if (onset >= frameCount) {
    onset = 0;
  }

  const start = Math.max(0, onset - Math.floor(sampleRate * 0.004));
  const length = Math.min(Math.floor((sampleRate * targetMs) / 1000), frameCount - start);

  const fadeIn = Math.floor(sampleRate * 0.003);
  // Long clips get a long fade: cutting through continuous barking with a short
  // fade sounds like the file was chopped.
  const fadeOutMs = Math.min(150, Math.max(25, targetMs * 0.15));
  const fadeOut = Math.min(Math.floor((sampleRate * fadeOutMs) / 1000), Math.floor(length / 2));
  const gain = peak > 0 ? 0.92 / peak : 1;

  const out = Buffer.alloc(length * channels * 2);
  for (let frame = 0; frame < length; frame++) {
    let envelope = 1;
    if (frame < fadeIn) {
      envelope *= frame / fadeIn;
    }
    const fromEnd = length - frame;
    if (fromEnd < fadeOut) {
      // Equal-power-ish curve; a linear ramp on a loud tail still sounds abrupt.
      envelope *= Math.sin((fromEnd / fadeOut) * (Math.PI / 2));
    }
    for (let channel = 0; channel < channels; channel++) {
      const value = sampleAt(start + frame, channel) * gain * envelope;
      out.writeInt16LE(Math.round(Math.max(-1, Math.min(1, value)) * 32767), (frame * channels + channel) * 2);
    }
  }

  writeWav(target, format, out);

  const before = Math.round((frameCount / sampleRate) * 1000);
  const after = Math.round((length / sampleRate) * 1000);
  const onsetMs = Math.round((onset / sampleRate) * 1000);
  console.log(
    `media/${name}.wav`.padEnd(20) +
      `${String(before).padStart(5)}ms -> ${String(after).padStart(4)}ms` +
      `  (onset ${onsetMs}ms, fade-out ${Math.round(fadeOutMs)}ms)`
  );
}

const [requested, ms] = process.argv.slice(2);
const names = requested ? [requested] : Object.keys(DEFAULT_MS);

for (const name of names) {
  const targetMs = Number(ms) || DEFAULT_MS[name];
  if (!targetMs) {
    console.error(`No default length for "${name}"; pass one explicitly.`);
    process.exit(1);
  }
  trim(name, targetMs);
}
console.log('restore any of them by copying media/<name>.original.wav back over media/<name>.wav');

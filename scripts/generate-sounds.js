/**
 * Generates the bundled placeholder sea lion sounds as 16-bit PCM WAV files.
 *
 * These are synthesised from scratch with a Klatt-style source/filter model:
 * a jittered pulse train (the "voice") is pushed through three resonators that
 * stand in for the vocal tract, then mixed with a shaped noise burst for rasp.
 * Nothing is sampled from a recording, so the output is ours to redistribute.
 *
 * Run with: npm run sounds
 */
const fs = require('fs');
const path = require('path');

const SAMPLE_RATE = 44100;

/** A two-pole resonator, the classic Klatt formant building block. */
function makeResonator(freq, bandwidth) {
  const r = Math.exp((-Math.PI * bandwidth) / SAMPLE_RATE);
  const b = 2 * r * Math.cos((2 * Math.PI * freq) / SAMPLE_RATE);
  const c = -r * r;
  const a = 1 - b - c;
  let y1 = 0;
  let y2 = 0;
  return (x) => {
    const y = a * x + b * y1 + c * y2;
    y2 = y1;
    y1 = y;
    return y;
  };
}

/** Linear interpolation across a list of [position 0..1, value] breakpoints. */
function envelope(points, t) {
  for (let i = 0; i < points.length - 1; i++) {
    const [p0, v0] = points[i];
    const [p1, v1] = points[i + 1];
    if (t >= p0 && t <= p1) {
      const span = p1 - p0;
      return span === 0 ? v1 : v0 + ((v1 - v0) * (t - p0)) / span;
    }
  }
  return points[points.length - 1][1];
}

/**
 * Renders one bark into `out` starting at `startSec`.
 *
 * @param {Float64Array} out          destination buffer
 * @param {object} spec
 * @param {number} spec.start         start time in seconds
 * @param {number} spec.duration      bark length in seconds
 * @param {Array}  spec.pitch         f0 breakpoints, [position 0..1, hz]
 * @param {Array}  spec.amp           amplitude breakpoints, [position 0..1, gain]
 * @param {number[]} spec.formants    three formant centre frequencies in Hz
 * @param {number} spec.noise         amount of breathy rasp, 0..1
 * @param {number} spec.gain          overall level
 */
function renderBark(out, spec) {
  const { start, duration, pitch, amp, formants, noise, gain } = spec;
  const startSample = Math.floor(start * SAMPLE_RATE);
  const total = Math.floor(duration * SAMPLE_RATE);

  const r1 = makeResonator(formants[0], 110);
  const r2 = makeResonator(formants[1], 170);
  const r3 = makeResonator(formants[2], 300);
  const noiseRes = makeResonator(1800, 900);

  // Phase accumulator for the glottal pulse train.
  let phase = 0;
  // A one-pole lowpass smooths the raw impulses into a rounder glottal pulse.
  let pulseLp = 0;

  for (let i = 0; i < total; i++) {
    const t = i / total;
    const f0 = envelope(pitch, t);

    // Pulse train with a little jitter so it sounds animal rather than synthetic.
    phase += f0 / SAMPLE_RATE;
    let excitation = 0;
    if (phase >= 1) {
      phase -= 1;
      excitation = 1 + (Math.random() - 0.5) * 0.25;
    }
    pulseLp += (excitation - pulseLp) * 0.65;
    const voiced = pulseLp * 2.2;

    // Rasp: noise, strongest at the attack, band-limited so it stays growly.
    const noiseBurst = noiseRes((Math.random() * 2 - 1) * envelope([[0, 1], [0.12, 0.55], [1, 0.15]], t));

    const source = voiced + noiseBurst * noise;
    const shaped = r1(source) * 1.0 + r2(source) * 0.55 + r3(source) * 0.22;

    const a = envelope(amp, t) * gain;
    const idx = startSample + i;
    if (idx < out.length) {
      out[idx] += shaped * a;
    }
  }
}

/** Normalises to `peak`, applies a short fade-out, and writes a mono 16-bit WAV. */
function writeWav(filePath, samples, peak = 0.85) {
  let max = 0;
  for (const s of samples) {
    max = Math.max(max, Math.abs(s));
  }
  const scale = max > 0 ? peak / max : 0;

  // Fade the last 5 ms so the file never ends on a click.
  const fade = Math.min(Math.floor(SAMPLE_RATE * 0.005), samples.length);

  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    let v = samples[i] * scale;
    const fromEnd = samples.length - i;
    if (fromEnd < fade) {
      v *= fromEnd / fade;
    }
    const clamped = Math.max(-1, Math.min(1, v));
    data.writeInt16LE(Math.round(clamped * 32767), i * 2);
  }

  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // PCM chunk size
  header.writeUInt16LE(1, 20); // format = PCM
  header.writeUInt16LE(1, 22); // channels = mono
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * 2, 28); // byte rate
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);

  fs.writeFileSync(filePath, Buffer.concat([header, data]));
  return 44 + data.length;
}

function buffer(seconds) {
  return new Float64Array(Math.ceil(seconds * SAMPLE_RATE));
}

/** A short, high, quiet pup chirp. Deliberately tiny so it can repeat fast. */
function typingSound() {
  const out = buffer(0.082);
  renderBark(out, {
    start: 0,
    duration: 0.075,
    pitch: [[0, 430], [0.25, 470], [1, 330]],
    amp: [[0, 0], [0.04, 1], [0.35, 0.5], [1, 0]],
    formants: [700, 1500, 2900],
    noise: 0.18,
    gain: 1
  });
  return out;
}

/** Two rising barks: the "ork ork!" of a pleased sea lion. */
function successSound() {
  const out = buffer(0.62);
  renderBark(out, {
    start: 0,
    duration: 0.17,
    pitch: [[0, 250], [0.3, 300], [1, 280]],
    amp: [[0, 0], [0.03, 1], [0.4, 0.6], [1, 0]],
    formants: [620, 1300, 2700],
    noise: 0.2,
    gain: 1
  });
  renderBark(out, {
    start: 0.21,
    duration: 0.26,
    pitch: [[0, 300], [0.35, 390], [1, 350]],
    amp: [[0, 0], [0.03, 1], [0.45, 0.65], [1, 0]],
    formants: [700, 1450, 2900],
    noise: 0.16,
    gain: 1.05
  });
  return out;
}

/** One long descending growl-bark: the disappointed colony elder. */
function failureSound() {
  const out = buffer(0.6);
  renderBark(out, {
    start: 0,
    duration: 0.44,
    pitch: [[0, 310], [0.15, 260], [0.6, 175], [1, 130]],
    amp: [[0, 0], [0.025, 1], [0.5, 0.7], [0.8, 0.4], [1, 0]],
    formants: [480, 1050, 2300],
    noise: 0.42,
    gain: 1
  });
  // A low grumble tail underneath the bark.
  renderBark(out, {
    start: 0.3,
    duration: 0.28,
    pitch: [[0, 150], [1, 105]],
    amp: [[0, 0], [0.15, 0.5], [1, 0]],
    formants: [380, 900, 2000],
    noise: 0.5,
    gain: 0.55
  });
  return out;
}

const mediaDir = path.join(__dirname, '..', 'media');
fs.mkdirSync(mediaDir, { recursive: true });

const jobs = [
  ['typing.wav', typingSound(), 0.6],
  ['success.wav', successSound(), 0.9],
  ['failure.wav', failureSound(), 0.9]
];

for (const [name, samples, peak] of jobs) {
  const target = path.join(mediaDir, name);
  const bytes = writeWav(target, samples, peak);
  const ms = Math.round((samples.length / SAMPLE_RATE) * 1000);
  console.log(`wrote media/${name.padEnd(12)} ${String(ms).padStart(4)} ms  ${bytes} bytes`);
}

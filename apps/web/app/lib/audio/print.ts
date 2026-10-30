// A sound's "print": a small spectrogram for the audio lab, so sounds can be compared by eye as well as by ear.

/** In-place radix-2 FFT; `re` and `im` have the same power-of-two length. */
function fft(re: Float64Array, im: Float64Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j]!, re[i]!];
      [im[i], im[j]] = [im[j]!, im[i]!];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const step = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const c = Math.cos(step * k);
        const s = Math.sin(step * k);
        const a = i + k;
        const b = a + len / 2;
        const vr = re[b]! * c - im[b]! * s;
        const vi = re[b]! * s + im[b]! * c;
        re[b] = re[a]! - vr;
        im[b] = im[a]! - vi;
        re[a] = re[a]! + vr;
        im[a] = im[a]! + vi;
      }
    }
  }
}

export interface SoundPrint {
  /** `columns` time slices, each `rows` log-spaced bands from 60 Hz to 12 kHz, low first; 0..1, 1 is the loudest. */
  cells: Float32Array[];
  rows: number;
}

/** Turns mono samples into a spectrogram with log-spaced frequency bands and a 60 dB range. */
export function soundPrint(samples: Float32Array, sampleRate: number, columns = 64, rows = 40): SoundPrint {
  const size = 1024;
  const hop = Math.max(1, Math.floor((samples.length - size) / columns));
  const lo = Math.log(60);
  const hi = Math.log(12000);
  const cells: Float32Array[] = [];
  let peak = 0;
  for (let c = 0; c < columns; c++) {
    const re = new Float64Array(size);
    const im = new Float64Array(size);
    for (let i = 0; i < size; i++) re[i] = (samples[c * hop + i] ?? 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size));
    fft(re, im);
    const column = new Float32Array(rows);
    for (let k = 1; k < size / 2; k++) {
      const row = Math.floor(((Math.log((k * sampleRate) / size) - lo) / (hi - lo)) * rows);
      if (row < 0 || row >= rows) continue;
      column[row] = Math.max(column[row]!, Math.hypot(re[k]!, im[k]!));
    }
    for (const v of column) peak = Math.max(peak, v);
    cells.push(column);
  }
  for (const column of cells) {
    for (let r = 0; r < rows; r++) column[r] = peak ? Math.max(0, 1 + Math.log10(column[r]! / peak + 1e-9) / 3) : 0;
  }
  return { cells, rows };
}

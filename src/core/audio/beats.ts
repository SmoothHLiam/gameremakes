/**
 * Tempo + beat-phase detection for imported songs: an onset-strength envelope
 * (rectified energy flux in two bands), autocorrelated over 70–190 BPM, then
 * the beat phase that best lines up with onsets.
 */
export interface BeatInfo {
  bpm: number;
  /** Song time (s) of the first beat. */
  offset: number;
  confidence: number;
}

const FRAME_RATE = 200;

function onsetEnvelope(L: Float32Array, R: Float32Array | null, sampleRate: number): Float32Array {
  const hop = Math.max(1, Math.round(sampleRate / FRAME_RATE));
  const frames = Math.floor(L.length / hop);
  const env = new Float32Array(frames);
  // one-pole lowpass splits low (kick) and high (snare/hats) energy
  const a = Math.exp((-2 * Math.PI * 180) / sampleRate);
  let lp = 0;
  let prevLo = 0;
  let prevHi = 0;
  for (let f = 0; f < frames; f++) {
    let lo = 0;
    let hi = 0;
    for (let i = f * hop; i < (f + 1) * hop; i++) {
      const x = R ? (L[i]! + R[i]!) * 0.5 : L[i]!;
      lp = a * lp + (1 - a) * x;
      const h = x - lp;
      lo += lp * lp;
      hi += h * h;
    }
    lo = Math.log1p(lo * 1000);
    hi = Math.log1p(hi * 1000);
    env[f] = Math.max(0, lo - prevLo) * 1.5 + Math.max(0, hi - prevHi);
    prevLo = lo;
    prevHi = hi;
  }
  // remove the local mean so sustained loudness doesn't dominate
  const out = new Float32Array(frames);
  const w = 20;
  let acc = 0;
  for (let f = 0; f < frames; f++) {
    acc += env[f]!;
    if (f >= w) acc -= env[f - w]!;
    out[f] = Math.max(0, env[f]! - acc / Math.min(f + 1, w));
  }
  // Smooth the spikes over a few frames: otherwise integer lags alias against
  // fractional beat periods and the half-tempo lag wins.
  const K = [0.15, 0.5, 1, 0.5, 0.15];
  const sm = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let v = 0;
    for (let k = 0; k < K.length; k++) v += (out[f + k - 2] ?? 0) * K[k]!;
    sm[f] = v;
  }
  return sm;
}

export function detectBeats(L: Float32Array, R: Float32Array | null, sampleRate: number, maxSeconds = 90): BeatInfo {
  const n = Math.min(L.length, Math.floor(maxSeconds * sampleRate));
  const env = onsetEnvelope(L.subarray(0, n), R ? R.subarray(0, n) : null, sampleRate);
  const minLag = Math.floor((60 / 190) * FRAME_RATE);
  const maxLag = Math.ceil((60 / 70) * FRAME_RATE);
  let best = 0;
  let bestLag = minLag;
  let total = 0;
  const scores: number[] = [];
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0;
    for (let i = lag; i < env.length; i++) s += env[i]! * env[i - lag]!;
    // gentle preference for typical dance tempos (120–150 BPM)
    const bpm = (60 * FRAME_RATE) / lag;
    const w = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 135) / 0.6, 2));
    s *= 0.6 + 0.4 * w;
    scores.push(s);
    total += s;
    if (s > best) {
      best = s;
      bestLag = lag;
    }
  }
  // parabolic refinement around the peak
  const k = bestLag - minLag;
  let lag = bestLag;
  if (k > 0 && k < scores.length - 1) {
    const y0 = scores[k - 1]!;
    const y1 = scores[k]!;
    const y2 = scores[k + 1]!;
    const d = y0 - 2 * y1 + y2;
    if (d < 0) lag += (0.5 * (y0 - y2)) / d;
  }
  const coarse = (60 * FRAME_RATE) / lag;
  // Joint fine search over tempo (±1.5%) and phase with a comb over the whole track.
  const at = (t: number) => {
    const i = Math.floor(t);
    const f = t - i;
    return (env[i] ?? 0) * (1 - f) + (env[i + 1] ?? 0) * f;
  };
  let bpm = coarse;
  let bestPhase = 0;
  let bestComb = -1;
  for (let cand = coarse * 0.985; cand <= coarse * 1.015; cand += 0.02) {
    const period = (60 / cand) * FRAME_RATE;
    for (let p = 0; p < period; p += 0.5) {
      let sum = 0;
      for (let t = p; t < env.length - 1; t += period) sum += at(t);
      if (sum > bestComb) {
        bestComb = sum;
        bpm = cand;
        bestPhase = p;
      }
    }
  }
  // snap near-integer tempos (most songs are made on integer BPM) and re-fit the phase
  if (Math.abs(bpm - Math.round(bpm)) < 0.15) {
    bpm = Math.round(bpm);
    const period = (60 / bpm) * FRAME_RATE;
    bestComb = -1;
    for (let p = 0; p < period; p += 0.25) {
      let sum = 0;
      for (let t = p; t < env.length - 1; t += period) sum += at(t);
      if (sum > bestComb) {
        bestComb = sum;
        bestPhase = p;
      }
    }
  }
  return { bpm, offset: bestPhase / FRAME_RATE, confidence: total > 0 ? best / (total / scores.length) : 0 };
}

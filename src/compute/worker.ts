/// <reference lib="webworker" />
// ---------------------------------------------------------------------------
// Buddhabrot sampling worker.
//
// Runs an endless progressive Monte-Carlo loop:
//   1. Pick a random c in the configured sampling rectangle.
//   2. Iterate z -> z^2 + c, recording the orbit, until escape or cap.
//   3. For each colour channel whose iteration budget covers the escape time,
//      splat every orbit point into a shared 3D density grid after applying
//      the active 4D rotation + orthographic projection.
//
// Accumulation is done with Atomics.add into a SharedArrayBuffer so that an
// arbitrary number of workers cooperate on a single volume with no merging.
// ---------------------------------------------------------------------------

interface SamplingMsg {
  cMinRe: number; cMaxRe: number; cMinIm: number; cMaxIm: number;
  z0Re: number; z0Im: number;
  bailout: number; minIter: number;
  capR: number; capG: number; capB: number;
  skipInterior: boolean; mirror: boolean;
}

let RES = 0;
let N = 0;
let volR: Uint32Array | null = null;
let volG: Uint32Array | null = null;
let volB: Uint32Array | null = null;
let ctrl: Int32Array | null = null;

let cfg: SamplingMsg | null = null;
let rot = new Float64Array(16);
let span = 2.3, cx = 0, cy = 0, cz = 0;
let running = false;
let token = 0;

// Reusable orbit buffer (filled to the largest channel cap).
let orbit = new Float64Array(8192 * 2);

// Per-worker PRNG (mulberry32).
let rngState = 1;
function rng(): number {
  rngState |= 0;
  rngState = (rngState + 0x6d2b79f5) | 0;
  let t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

self.onmessage = (e: MessageEvent) => {
  const m = e.data;
  switch (m.type) {
    case 'init': {
      RES = m.res;
      N = RES * RES * RES;
      volR = new Uint32Array(m.volume, 0, N);
      volG = new Uint32Array(m.volume, N * 4, N);
      volB = new Uint32Array(m.volume, N * 8, N);
      ctrl = new Int32Array(m.ctrl);
      break;
    }
    case 'config': {
      cfg = m.cfg as SamplingMsg;
      rot = Float64Array.from(m.rot as number[]);
      span = m.geom.span; cx = m.geom.centerX; cy = m.geom.centerY; cz = m.geom.centerZ;
      rngState = (m.seed | 0) || 1;
      const cap = Math.max(cfg.capR, cfg.capG, cfg.capB);
      if (orbit.length < cap * 2) orbit = new Float64Array(cap * 2);
      token++;
      break;
    }
    case 'start':
      if (!running) { running = true; token++; loop(token); }
      break;
    case 'stop':
      running = false;
      break;
  }
};

const CHUNK = 1000;

function loop(myToken: number) {
  if (!running || myToken !== token || !cfg) return;
  runChunk(cfg);
  // Yield to the event loop so config/stop messages are processed and the
  // worker stays cooperative.
  setTimeout(() => loop(myToken), 0);
}

function runChunk(c: SamplingMsg) {
  const vR = volR!, vG = volG!, vB = volB!, ct = ctrl!;
  const bail = c.bailout;
  const maxCap = Math.max(c.capR, c.capG, c.capB);
  const minIter = c.minIter;
  const reSpan = c.cMaxRe - c.cMinRe;
  const imSpan = c.cMaxIm - c.cMinIm;
  const scale = (RES * 0.5) / span;
  const off = RES * 0.5;

  // First three rows of the rotation matrix.
  const r00 = rot[0], r01 = rot[1], r02 = rot[2], r03 = rot[3];
  const r10 = rot[4], r11 = rot[5], r12 = rot[6], r13 = rot[7];
  const r20 = rot[8], r21 = rot[9], r22 = rot[10], r23 = rot[11];

  let attempts = 0, hits = 0;

  for (let s = 0; s < CHUNK; s++) {
    attempts++;
    const cr = c.cMinRe + rng() * reSpan;
    const ci = c.cMinIm + rng() * imSpan;

    if (c.skipInterior) {
      const xq = cr - 0.25;
      const q = xq * xq + ci * ci;
      if (q * (q + xq) < 0.25 * ci * ci) continue;          // main cardioid
      const xb = cr + 1;
      if (xb * xb + ci * ci < 0.0625) continue;             // period-2 bulb
    }

    // Iterate and record the orbit.
    let zr = c.z0Re, zi = c.z0Im;
    let k = 0;
    let escaped = false;
    for (; k < maxCap; k++) {
      const zr2 = zr * zr, zi2 = zi * zi;
      if (zr2 + zi2 > bail) { escaped = true; break; }
      orbit[k * 2] = zr;
      orbit[k * 2 + 1] = zi;
      const nzi = 2 * zr * zi + ci;
      zr = zr2 - zi2 + cr;
      zi = nzi;
    }
    if (!escaped || k < minIter) continue;
    hits++;

    // Precompute the c-dependent part of the projection (and its conjugate).
    const baseX = r00 * cr + r01 * ci - cx;
    const baseY = r10 * cr + r11 * ci - cy;
    const baseZ = r20 * cr + r21 * ci - cz;
    const baseXm = r00 * cr - r01 * ci - cx;
    const baseYm = r10 * cr - r11 * ci - cy;
    const baseZm = r20 * cr - r21 * ci - cz;

    // Which channels does this orbit feed? (Nebulabrot layering.)
    const inR = k <= c.capR;
    const inG = k <= c.capG;
    const inB = k <= c.capB;

    for (let p = 0; p < k; p++) {
      const pr = orbit[p * 2];
      const pi = orbit[p * 2 + 1];

      const x = baseX + r02 * pr + r03 * pi;
      const y = baseY + r12 * pr + r13 * pi;
      const z = baseZ + r22 * pr + r23 * pi;
      const ix = (x * scale + off) | 0;
      const iy = (y * scale + off) | 0;
      const iz = (z * scale + off) | 0;
      if (ix >= 0 && ix < RES && iy >= 0 && iy < RES && iz >= 0 && iz < RES) {
        const idx = ix + iy * RES + iz * RES * RES;
        if (inR) Atomics.add(vR, idx, 1);
        if (inG) Atomics.add(vG, idx, 1);
        if (inB) Atomics.add(vB, idx, 1);
      }

      if (c.mirror) {
        const xm = baseXm + r02 * pr - r03 * pi;
        const ym = baseYm + r12 * pr - r13 * pi;
        const zm = baseZm + r22 * pr - r23 * pi;
        const jx = (xm * scale + off) | 0;
        const jy = (ym * scale + off) | 0;
        const jz = (zm * scale + off) | 0;
        if (jx >= 0 && jx < RES && jy >= 0 && jy < RES && jz >= 0 && jz < RES) {
          const idx = jx + jy * RES + jz * RES * RES;
          if (inR) Atomics.add(vR, idx, 1);
          if (inG) Atomics.add(vG, idx, 1);
          if (inB) Atomics.add(vB, idx, 1);
        }
      }
    }
  }

  Atomics.add(ct, 0, attempts);
  Atomics.add(ct, 1, hits);
}

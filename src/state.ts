// ---------------------------------------------------------------------------
// Central configuration for the 3D/4D Buddhabrot Explorer.
//
// The configuration is split into logical groups. Two classes of change exist:
//   * "compute"  -> invalidates the accumulated density volume (restart sampling)
//   * "render"   -> only affects the volumetric shading (cheap, instant)
// The UI layer tags each control accordingly so we never recompute needlessly.
// ---------------------------------------------------------------------------

export type ToneMap = 'none' | 'reinhard' | 'aces' | 'filmic';

export interface SamplingConfig {
  /** c-plane sampling rectangle. */
  cMinRe: number;
  cMaxRe: number;
  cMinIm: number;
  cMaxIm: number;
  /** Generalized Buddhabrot orbit seed z0. */
  z0Re: number;
  z0Im: number;
  /** Escape radius (|z| threshold). */
  bailout: number;
  /** Orbits escaping before this many iterations are discarded. */
  minIter: number;
  /** Per-channel iteration caps (Nebulabrot R/G/B). */
  capR: number;
  capG: number;
  capB: number;
  /** Skip points provably inside the main cardioid / period-2 bulb. */
  skipInterior: boolean;
  /** Also accumulate the real-axis mirror of each orbit (2x throughput). */
  mirror: boolean;
}

export interface GeometryConfig {
  /** Six 4D rotation-plane angles (radians). Axes: 0=Re(c) 1=Im(c) 2=Re(z) 3=Im(z). */
  a01: number; // Re(c)-Im(c)
  a02: number; // Re(c)-Re(z)
  a03: number; // Re(c)-Im(z)
  a12: number; // Im(c)-Re(z)
  a13: number; // Im(c)-Im(z)
  a23: number; // Re(z)-Im(z)
  /** Half-extent of the cubic volume in projected space. */
  span: number;
  /** Projected-space recentering offset. */
  centerX: number;
  centerY: number;
  centerZ: number;
  /** Continuous animation of a rotation plane. */
  animate: boolean;
  animPlane: 'a01' | 'a02' | 'a03' | 'a12' | 'a13' | 'a23';
  animSpeed: number;
}

export interface VolumeConfig {
  resolution: number;
}

export interface RenderConfig {
  rayMarchSteps: number;
  exposure: number;
  expR: number;
  expG: number;
  expB: number;
  gamma: number;
  logDensity: boolean;
  logScale: number;
  density: number;
  absorb: number;
  toneMap: ToneMap;
  saturation: number;
  background: string;
  showBox: boolean;
  jitter: number;
}

export interface CameraConfig {
  autoRotate: boolean;
  autoRotateSpeed: number;
  fov: number;
}

export interface PerfConfig {
  workerCount: number;
  uploadInterval: number;
}

export interface Config {
  sampling: SamplingConfig;
  geometry: GeometryConfig;
  volume: VolumeConfig;
  render: RenderConfig;
  camera: CameraConfig;
  perf: PerfConfig;
}

const hwThreads = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 8;

export function defaultConfig(): Config {
  return {
    sampling: {
      cMinRe: -2.2,
      cMaxRe: 0.9,
      cMinIm: -1.4,
      cMaxIm: 1.4,
      z0Re: 0,
      z0Im: 0,
      bailout: 4,
      minIter: 16,
      capR: 2400,
      capG: 360,
      capB: 64,
      skipInterior: true,
      mirror: true,
    },
    geometry: {
      a01: 0,
      a02: 0.35,
      a03: 0,
      a12: 0,
      a13: 0.55,
      a23: 0,
      span: 2.3,
      centerX: 0.45,
      centerY: 0,
      centerZ: 0,
      animate: false,
      animPlane: 'a03',
      animSpeed: 0.06,
    },
    volume: {
      resolution: 112,
    },
    render: {
      rayMarchSteps: 384,
      exposure: 0.95,
      expR: 1.7,
      expG: 1.0,
      expB: 0.7,
      gamma: 2.2,
      logDensity: true,
      logScale: 20,
      density: 1.0,
      absorb: 2.4,
      toneMap: 'aces',
      saturation: 1.5,
      background: '#05060a',
      showBox: false,
      jitter: 1.0,
    },
    camera: {
      autoRotate: true,
      autoRotateSpeed: 0.35,
      fov: 45,
    },
    perf: {
      workerCount: Math.max(2, Math.min(hwThreads, 12)),
      uploadInterval: 450,
    },
  };
}

// ---------------------------------------------------------------------------
// Presets — curated viewpoints into the 4D structure.
// ---------------------------------------------------------------------------

export interface Preset {
  name: string;
  apply: (c: Config) => void;
}

export const PRESETS: Preset[] = [
  {
    name: 'Golden Relief',
    apply: (c) => {
      Object.assign(c.geometry, { a01: 0, a02: 0.35, a03: 0, a12: 0, a13: 0.55, a23: 0, span: 2.3, centerX: 0.45 });
      Object.assign(c.sampling, { capR: 2400, capG: 360, capB: 64, minIter: 16 });
      Object.assign(c.render, {
        logScale: 20, absorb: 2.4, exposure: 0.95, density: 1.0,
        expR: 1.7, expG: 1.0, expB: 0.7, saturation: 1.5, gamma: 2.2, toneMap: 'aces',
      });
    },
  },
  {
    name: 'Cosmic Nebula',
    apply: (c) => {
      Object.assign(c.geometry, { a01: 0.0, a02: 0.9, a03: 0.6, a12: 0.4, a13: 0.9, a23: 0.3, span: 2.4, centerX: 0.2 });
      Object.assign(c.sampling, { capR: 5000, capG: 700, capB: 90, minIter: 10 });
      Object.assign(c.render, {
        logScale: 28, absorb: 2.2, exposure: 1.0, density: 1.0,
        expR: 1.2, expG: 1.05, expB: 1.4, saturation: 1.5, gamma: 2.1, toneMap: 'aces',
      });
    },
  },
  {
    name: 'Orbit Tunnel',
    apply: (c) => {
      Object.assign(c.geometry, { a01: 0.5, a02: 1.2, a03: 0.0, a12: 0.0, a13: 1.2, a23: 0.7, span: 2.6, centerX: 0.1 });
      Object.assign(c.sampling, { capR: 3000, capG: 450, capB: 70, minIter: 24 });
      Object.assign(c.render, {
        logScale: 16, absorb: 3.0, exposure: 1.1, density: 1.1,
        expR: 1.6, expG: 1.1, expB: 0.9, saturation: 1.7, gamma: 2.0, toneMap: 'filmic',
      });
    },
  },
  {
    name: 'Stardust',
    apply: (c) => {
      Object.assign(c.geometry, { a01: 0.2, a02: 0.6, a03: 0.4, a12: 0.3, a13: 0.7, a23: 0.2, span: 2.4, centerX: 0.25 });
      Object.assign(c.sampling, { capR: 8000, capG: 1100, capB: 130, minIter: 6 });
      Object.assign(c.render, {
        logScale: 40, absorb: 1.6, exposure: 0.85, density: 0.9,
        expR: 1.4, expG: 1.0, expB: 1.2, saturation: 1.4, gamma: 2.2, toneMap: 'aces',
      });
    },
  },
  {
    name: 'Deep Filaments',
    apply: (c) => {
      Object.assign(c.geometry, { a01: 0.1, a02: 0.5, a03: 0.2, a12: 0.1, a13: 0.6, a23: 0.1, span: 2.3, centerX: 0.4 });
      Object.assign(c.sampling, { capR: 16000, capG: 2000, capB: 240, minIter: 40 });
      Object.assign(c.render, {
        logScale: 60, absorb: 1.4, exposure: 0.9, density: 0.9,
        expR: 1.5, expG: 1.1, expB: 0.95, saturation: 1.6, gamma: 2.2, toneMap: 'aces',
      });
    },
  },
  {
    name: 'Monochrome Ink',
    apply: (c) => {
      Object.assign(c.sampling, { capR: 1400, capG: 1400, capB: 1400, minIter: 8 });
      Object.assign(c.render, {
        logScale: 18, absorb: 3.2, exposure: 1.0, density: 1.1,
        expR: 1.0, expG: 1.0, expB: 1.0, saturation: 0.0, gamma: 2.1, toneMap: 'filmic',
      });
    },
  },
];

export function clone(c: Config): Config {
  return JSON.parse(JSON.stringify(c));
}

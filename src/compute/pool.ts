// ---------------------------------------------------------------------------
// Worker pool: owns the shared density volume and coordinates the sampling
// workers. The volume is a single SharedArrayBuffer holding three Uint32 grids
// (R/G/B). Workers accumulate into it atomically; the renderer reads from it.
// ---------------------------------------------------------------------------

import type { Config } from '../state';
import { buildRotation } from './rotation';

export interface PoolStats {
  samples: number;
  hits: number;
}

export class WorkerPool {
  private workers: Worker[] = [];
  private volumeSAB!: SharedArrayBuffer;
  private ctrlSAB!: SharedArrayBuffer;
  ctrl!: Int32Array;
  volR!: Uint32Array;
  volG!: Uint32Array;
  volB!: Uint32Array;
  res = 0;
  running = false;
  stats: PoolStats = { samples: 0, hits: 0 };
  private seedCounter = 0x9e3779b9;

  constructor(public workerCount: number) {
    if (typeof SharedArrayBuffer === 'undefined' || !self.crossOriginIsolated) {
      throw new Error(
        'SharedArrayBuffer is unavailable. The page must be cross-origin isolated ' +
        '(Cross-Origin-Opener-Policy: same-origin and Cross-Origin-Embedder-Policy: require-corp).'
      );
    }
  }

  /** Allocate the volume for a given resolution and (re)spawn workers. */
  allocate(res: number) {
    this.res = res;
    const n = res * res * res;
    this.volumeSAB = new SharedArrayBuffer(n * 3 * 4);
    this.volR = new Uint32Array(this.volumeSAB, 0, n);
    this.volG = new Uint32Array(this.volumeSAB, n * 4, n);
    this.volB = new Uint32Array(this.volumeSAB, n * 8, n);
    if (!this.ctrlSAB) {
      this.ctrlSAB = new SharedArrayBuffer(16);
      this.ctrl = new Int32Array(this.ctrlSAB);
    }
    this.spawn();
  }

  private spawn() {
    this.terminate();
    for (let i = 0; i < this.workerCount; i++) {
      const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
      w.postMessage({ type: 'init', volume: this.volumeSAB, ctrl: this.ctrlSAB, res: this.res });
      this.workers.push(w);
    }
  }

  private terminate() {
    for (const w of this.workers) w.terminate();
    this.workers = [];
  }

  setWorkerCount(n: number) {
    if (n === this.workerCount) return;
    this.workerCount = n;
    const wasRunning = this.running;
    this.spawn();
    if (wasRunning) this.start();
  }

  /** Restart accumulation with a fresh configuration. */
  reconfigure(cfg: Config) {
    const wasRunning = this.running;
    this.broadcast({ type: 'stop' });
    // Give in-flight chunks a beat to drain, then clear and reconfigure.
    setTimeout(() => {
      this.clearVolume();
      this.pushConfig(cfg);
      if (wasRunning) this.start();
    }, 40);
  }

  /** Live-update only the geometry (rotation/projection) without other churn. */
  pushConfig(cfg: Config) {
    const rot = Array.from(buildRotation(cfg.geometry));
    const s = cfg.sampling;
    this.workers.forEach((w, i) => {
      w.postMessage({
        type: 'config',
        cfg: {
          cMinRe: s.cMinRe, cMaxRe: s.cMaxRe, cMinIm: s.cMinIm, cMaxIm: s.cMaxIm,
          z0Re: s.z0Re, z0Im: s.z0Im,
          bailout: s.bailout, minIter: s.minIter,
          capR: s.capR, capG: s.capG, capB: s.capB,
          skipInterior: s.skipInterior, mirror: s.mirror,
        },
        rot,
        geom: {
          span: cfg.geometry.span,
          centerX: cfg.geometry.centerX,
          centerY: cfg.geometry.centerY,
          centerZ: cfg.geometry.centerZ,
        },
        index: i,
        count: this.workers.length,
        seed: (this.seedCounter = (this.seedCounter + 0x7f4a7c15) | 0) ^ (i * 0x85ebca6b),
      });
    });
  }

  clearVolume() {
    this.volR.fill(0);
    this.volG.fill(0);
    this.volB.fill(0);
    Atomics.store(this.ctrl, 0, 0);
    Atomics.store(this.ctrl, 1, 0);
    this.stats = { samples: 0, hits: 0 };
  }

  start() {
    this.running = true;
    this.broadcast({ type: 'start' });
  }

  stop() {
    this.running = false;
    this.broadcast({ type: 'stop' });
  }

  /** Drain the per-frame stat counters into running totals. */
  pollStats(): PoolStats {
    const s = Atomics.exchange(this.ctrl, 0, 0);
    const h = Atomics.exchange(this.ctrl, 1, 0);
    this.stats.samples += s;
    this.stats.hits += h;
    return this.stats;
  }

  private broadcast(msg: any) {
    for (const w of this.workers) w.postMessage(msg);
  }

  dispose() {
    this.terminate();
  }
}

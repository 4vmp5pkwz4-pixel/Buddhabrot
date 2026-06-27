import './styles.css';
import { defaultConfig, PRESETS, type Config } from './state';
import { WorkerPool } from './compute/pool';
import { VolumeRenderer } from './render/renderer';
import { Panel, type ChangeKind } from './ui/panel';

function fatal(message: string) {
  const o = document.createElement('div');
  o.className = 'fatal';
  o.innerHTML = `<div class="fatal-card">
    <h2>Unable to start</h2>
    <p>${message}</p>
    <p class="dim">This explorer needs a cross-origin-isolated context for multi-threaded
    SharedArrayBuffer sampling. Run it through <code>npm run dev</code> or
    <code>npm run preview</code> (which set the required COOP/COEP headers), or serve the
    built files with those headers.</p>
  </div>`;
  document.body.appendChild(o);
}

class App {
  cfg: Config = defaultConfig();
  pool: WorkerPool;
  renderer: VolumeRenderer;
  panel: Panel;
  private lastUpload = 0;
  private lastStatsTime = performance.now();
  private lastSamples = 0;
  private rate = 0;
  private frameTimes: number[] = [];
  private animRecomputeAt = 0;
  private animDirty = false;

  constructor(canvas: HTMLCanvasElement) {
    this.pool = new WorkerPool(this.cfg.perf.workerCount);
    this.renderer = new VolumeRenderer(canvas, this.cfg.volume.resolution);
    this.panel = new Panel(this.cfg, {
      apply: (k) => this.apply(k),
      toggleRun: () => this.toggleRun(),
      reset: () => this.reset(),
      screenshot: () => this.screenshot(),
      applyPreset: (i) => this.applyPreset(i),
    });
    document.body.appendChild(this.panel.el);

    window.addEventListener('reset-camera', () => this.renderer.resetCamera());
    // Expose a handle for console scripting / automation of any uniform or setting.
    (window as any).buddhabrot = this;

    this.renderer.applyConfig(this.cfg);
    this.rebuildVolume();
    requestAnimationFrame((t) => this.loop(t));
  }

  /** (Re)allocate the shared volume + texture for the current resolution. */
  private rebuildVolume() {
    this.pool.allocate(this.cfg.volume.resolution);
    this.renderer.setResolution(this.cfg.volume.resolution);
    this.pool.pushConfig(this.cfg);
    this.pool.start();
    this.lastSamples = 0;
  }

  private apply(kind: ChangeKind) {
    switch (kind) {
      case 'render':
        this.renderer.applyConfig(this.cfg);
        break;
      case 'camera':
        this.renderer.applyConfig(this.cfg);
        break;
      case 'workers':
        this.pool.setWorkerCount(this.cfg.perf.workerCount);
        this.pool.pushConfig(this.cfg);
        break;
      case 'resolution':
        this.rebuildVolume();
        break;
      case 'compute':
        this.pool.reconfigure(this.cfg);
        this.lastSamples = 0;
        break;
    }
  }

  private toggleRun(): boolean {
    if (this.pool.running) this.pool.stop();
    else this.pool.start();
    return this.pool.running;
  }

  private reset() {
    this.pool.clearVolume();
    this.lastSamples = 0;
    this.renderer.updateVolume(this.pool.volR, this.pool.volG, this.pool.volB);
  }

  private screenshot() {
    const url = this.renderer.screenshot();
    const a = document.createElement('a');
    a.href = url;
    a.download = `buddhabrot-${Date.now()}.png`;
    a.click();
  }

  private applyPreset(i: number) {
    PRESETS[i].apply(this.cfg);
    this.panel.refreshFromConfig();
    this.renderer.applyConfig(this.cfg);
    this.pool.reconfigure(this.cfg);
    this.lastSamples = 0;
  }

  private loop(t: number) {
    // FPS tracking.
    this.frameTimes.push(t);
    while (this.frameTimes.length > 30) this.frameTimes.shift();

    // 4D projection animation: advance the chosen plane angle, recompute
    // on a throttled cadence so each step accumulates a recognisable cloud.
    if (this.cfg.geometry.animate) {
      const g = this.cfg.geometry as any;
      g[g.animPlane] += this.cfg.geometry.animSpeed * 0.05;
      if (g[g.animPlane] > Math.PI) g[g.animPlane] -= 2 * Math.PI;
      this.animDirty = true;
      this.panel.refreshFromConfig();
    }

    const now = performance.now();
    const interval = Math.max(120, this.cfg.perf.uploadInterval);
    if (now - this.lastUpload >= interval) {
      this.lastUpload = now;

      if (this.animDirty && now >= this.animRecomputeAt) {
        this.animDirty = false;
        this.animRecomputeAt = now + Math.max(interval, 320);
        this.pool.reconfigure(this.cfg);
        this.lastSamples = 0;
      }

      this.renderer.updateVolume(this.pool.volR, this.pool.volG, this.pool.volB);
      const stats = this.pool.pollStats();

      const dt = (now - this.lastStatsTime) / 1000;
      if (dt > 0) {
        this.rate = (stats.samples - this.lastSamples) / dt;
        this.lastSamples = stats.samples;
        this.lastStatsTime = now;
      }
      const fps = this.frameTimes.length > 1
        ? (this.frameTimes.length - 1) * 1000 / (this.frameTimes[this.frameTimes.length - 1] - this.frameTimes[0])
        : 0;
      this.panel.setStats(stats.samples, stats.hits, Math.max(0, this.rate), fps);
    }

    this.renderer.render();
    requestAnimationFrame((tt) => this.loop(tt));
  }
}

function boot() {
  if (typeof SharedArrayBuffer === 'undefined' || !self.crossOriginIsolated) {
    fatal('SharedArrayBuffer / cross-origin isolation is not available in this context.');
    return;
  }
  const canvas = document.getElementById('view') as HTMLCanvasElement;
  try {
    new App(canvas);
  } catch (err: any) {
    fatal(err?.message ?? String(err));
  }
}

boot();

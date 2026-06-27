// ---------------------------------------------------------------------------
// Custom control panel. Declarative builder producing a polished, grouped UI
// bound directly to the live Config. Each control declares whether changing it
// requires recomputing the density volume ('compute') or merely re-shading
// ('render' / 'camera' / 'workers').
// ---------------------------------------------------------------------------

import type { Config } from '../state';
import { PRESETS } from '../state';

export type ChangeKind = 'compute' | 'render' | 'camera' | 'workers' | 'resolution';

export interface PanelHandlers {
  apply: (kind: ChangeKind) => void;
  toggleRun: () => boolean;       // returns new running state
  reset: () => void;
  screenshot: () => void;
  applyPreset: (index: number) => void;
}

export class Panel {
  el: HTMLElement;
  private runBtn!: HTMLButtonElement;
  private statSamples!: HTMLElement;
  private statHits!: HTMLElement;
  private statRate!: HTMLElement;
  private statFps!: HTMLElement;
  private valueLabels: Array<() => void> = [];

  constructor(private cfg: Config, private h: PanelHandlers) {
    this.el = document.createElement('div');
    this.el.className = 'panel';
    this.build();
  }

  private build() {
    this.el.appendChild(this.header());

    // -- Stats / transport ------------------------------------------------
    const transport = this.section('Session', true);
    this.runBtn = this.button(transport.body, '❚❚  Pause', () => {
      const running = this.h.toggleRun();
      this.runBtn.textContent = running ? '❚❚  Pause' : '▶  Resume';
      this.runBtn.classList.toggle('primary', running);
    });
    this.runBtn.classList.add('primary', 'wide');
    const row = document.createElement('div');
    row.className = 'btn-row';
    transport.body.appendChild(row);
    this.button(row, '↺  Reset', () => this.h.reset());
    this.button(row, '⤓  Save PNG', () => this.h.screenshot());

    const stats = document.createElement('div');
    stats.className = 'stats';
    stats.innerHTML = `
      <div><span>Samples</span><b id="st-samples">0</b></div>
      <div><span>Contributing</span><b id="st-hits">0</b></div>
      <div><span>Throughput</span><b id="st-rate">0/s</b></div>
      <div><span>Render</span><b id="st-fps">0 fps</b></div>`;
    transport.body.appendChild(stats);
    this.statSamples = stats.querySelector('#st-samples')!;
    this.statHits = stats.querySelector('#st-hits')!;
    this.statRate = stats.querySelector('#st-rate')!;
    this.statFps = stats.querySelector('#st-fps')!;

    // -- Presets ----------------------------------------------------------
    const presets = this.section('Presets', true);
    const pr = document.createElement('div');
    pr.className = 'preset-row';
    presets.body.appendChild(pr);
    PRESETS.forEach((p, i) => this.button(pr, p.name, () => this.h.applyPreset(i)));

    // -- Quality & Performance -------------------------------------------
    const q = this.section('Quality & Performance', true);
    this.select(q.body, 'Volume resolution', this.cfg.volume, 'resolution',
      [['48 · draft', 48], ['64', 64], ['80', 80], ['96', 96], ['112 · balanced', 112],
       ['128', 128], ['160', 160], ['192 · high', 192], ['256 · ultra', 256]], 'resolution');
    this.slider(q.body, 'Raymarch steps', this.cfg.render, 'rayMarchSteps', 32, 1024, 1, 'render');
    this.slider(q.body, 'Worker threads', this.cfg.perf, 'workerCount', 1, 32, 1, 'workers');
    this.slider(q.body, 'Refresh interval (ms)', this.cfg.perf, 'uploadInterval', 100, 2000, 10, 'render');

    // -- Colour, exposure, tone ------------------------------------------
    const c = this.section('Colour & Tone', true);
    this.slider(c.body, 'Master exposure', this.cfg.render, 'exposure', 0, 6, 0.01, 'render');
    this.slider(c.body, 'Density / opacity', this.cfg.render, 'density', 0.05, 6, 0.01, 'render');
    this.slider(c.body, 'Opacity falloff', this.cfg.render, 'absorb', 0.5, 60, 0.5, 'render');
    this.slider(c.body, 'Exposure · R', this.cfg.render, 'expR', 0, 4, 0.01, 'render');
    this.slider(c.body, 'Exposure · G', this.cfg.render, 'expG', 0, 4, 0.01, 'render');
    this.slider(c.body, 'Exposure · B', this.cfg.render, 'expB', 0, 4, 0.01, 'render');
    this.checkbox(c.body, 'Logarithmic density', this.cfg.render, 'logDensity', 'render');
    this.slider(c.body, 'Log compression', this.cfg.render, 'logScale', 1, 2000, 1, 'render');
    this.slider(c.body, 'Gamma', this.cfg.render, 'gamma', 0.5, 4, 0.01, 'render');
    this.slider(c.body, 'Saturation', this.cfg.render, 'saturation', 0, 2.5, 0.01, 'render');
    this.select(c.body, 'Tone mapping', this.cfg.render, 'toneMap',
      [['None', 'none'], ['Reinhard', 'reinhard'], ['ACES', 'aces'], ['Filmic', 'filmic']], 'render');
    this.slider(c.body, 'Dither / jitter', this.cfg.render, 'jitter', 0, 2, 0.01, 'render');
    this.color(c.body, 'Background', this.cfg.render, 'background', 'render');
    this.checkbox(c.body, 'Show bounding box', this.cfg.render, 'showBox', 'render');

    // -- Fractal / sampling ----------------------------------------------
    const f = this.section('Fractal & Sampling', false);
    this.slider(f.body, 'Iterations · Red', this.cfg.sampling, 'capR', 10, 50000, 10, 'compute');
    this.slider(f.body, 'Iterations · Green', this.cfg.sampling, 'capG', 10, 20000, 10, 'compute');
    this.slider(f.body, 'Iterations · Blue', this.cfg.sampling, 'capB', 5, 10000, 5, 'compute');
    this.slider(f.body, 'Minimum iterations', this.cfg.sampling, 'minIter', 0, 500, 1, 'compute');
    this.slider(f.body, 'Bailout |z|²', this.cfg.sampling, 'bailout', 4, 256, 1, 'compute');
    this.slider(f.body, 'Seed z₀ · Re', this.cfg.sampling, 'z0Re', -2, 2, 0.001, 'compute');
    this.slider(f.body, 'Seed z₀ · Im', this.cfg.sampling, 'z0Im', -2, 2, 0.001, 'compute');
    this.checkbox(f.body, 'Skip interior (cardioid/bulb)', this.cfg.sampling, 'skipInterior', 'compute');
    this.checkbox(f.body, 'Mirror (Im symmetry)', this.cfg.sampling, 'mirror', 'compute');
    this.slider(f.body, 'Sample region Re·min', this.cfg.sampling, 'cMinRe', -3, 1, 0.01, 'compute');
    this.slider(f.body, 'Sample region Re·max', this.cfg.sampling, 'cMaxRe', -1, 2, 0.01, 'compute');
    this.slider(f.body, 'Sample region Im·min', this.cfg.sampling, 'cMinIm', -3, 0, 0.01, 'compute');
    this.slider(f.body, 'Sample region Im·max', this.cfg.sampling, 'cMaxIm', 0, 3, 0.01, 'compute');

    // -- 4D projection ----------------------------------------------------
    const g = this.section('4D Projection', false);
    const note = document.createElement('p');
    note.className = 'note';
    note.textContent = 'Rotate the 4D space (Re c, Im c, Re z, Im z) before projecting to 3D. Each plane reveals a different cross-section of the hyper-structure.';
    g.body.appendChild(note);
    this.slider(g.body, '∠ Re c · Im c', this.cfg.geometry, 'a01', -Math.PI, Math.PI, 0.005, 'compute');
    this.slider(g.body, '∠ Re c · Re z', this.cfg.geometry, 'a02', -Math.PI, Math.PI, 0.005, 'compute');
    this.slider(g.body, '∠ Re c · Im z', this.cfg.geometry, 'a03', -Math.PI, Math.PI, 0.005, 'compute');
    this.slider(g.body, '∠ Im c · Re z', this.cfg.geometry, 'a12', -Math.PI, Math.PI, 0.005, 'compute');
    this.slider(g.body, '∠ Im c · Im z', this.cfg.geometry, 'a13', -Math.PI, Math.PI, 0.005, 'compute');
    this.slider(g.body, '∠ Re z · Im z', this.cfg.geometry, 'a23', -Math.PI, Math.PI, 0.005, 'compute');
    this.slider(g.body, 'Volume span', this.cfg.geometry, 'span', 0.5, 5, 0.01, 'compute');
    this.slider(g.body, 'Center X', this.cfg.geometry, 'centerX', -2, 2, 0.01, 'compute');
    this.slider(g.body, 'Center Y', this.cfg.geometry, 'centerY', -2, 2, 0.01, 'compute');
    this.slider(g.body, 'Center Z', this.cfg.geometry, 'centerZ', -2, 2, 0.01, 'compute');
    this.checkbox(g.body, 'Animate plane', this.cfg.geometry, 'animate', 'render');
    this.select(g.body, 'Animated plane', this.cfg.geometry, 'animPlane',
      [['Re c · Im c', 'a01'], ['Re c · Re z', 'a02'], ['Re c · Im z', 'a03'],
       ['Im c · Re z', 'a12'], ['Im c · Im z', 'a13'], ['Re z · Im z', 'a23']], 'render');
    this.slider(g.body, 'Animation speed', this.cfg.geometry, 'animSpeed', 0, 0.5, 0.001, 'render');

    // -- Camera -----------------------------------------------------------
    const cam = this.section('Camera', false);
    this.checkbox(cam.body, 'Auto-orbit', this.cfg.camera, 'autoRotate', 'camera');
    this.slider(cam.body, 'Orbit speed', this.cfg.camera, 'autoRotateSpeed', -3, 3, 0.01, 'camera');
    this.slider(cam.body, 'Field of view', this.cfg.camera, 'fov', 15, 90, 1, 'camera');
    this.button(cam.body, 'Reset camera', () => window.dispatchEvent(new CustomEvent('reset-camera')));

    this.refreshValueLabels();
  }

  // -- Live readouts ------------------------------------------------------
  setStats(samples: number, hits: number, rate: number, fps: number) {
    this.statSamples.textContent = fmt(samples);
    this.statHits.textContent = fmt(hits);
    this.statRate.textContent = fmt(rate) + '/s';
    this.statFps.textContent = fps.toFixed(0) + ' fps';
  }

  /** Re-sync slider/checkbox displays after presets mutate the config. */
  refreshFromConfig() {
    this.el.querySelectorAll<HTMLInputElement>('[data-bound]').forEach((input) => {
      const obj = (input as any)._obj;
      const key = (input as any)._key;
      if (!obj) return;
      if (input.type === 'checkbox') input.checked = !!obj[key];
      else input.value = String(obj[key]);
    });
    this.el.querySelectorAll<HTMLSelectElement>('select[data-bound]').forEach((sel) => {
      const obj = (sel as any)._obj;
      const key = (sel as any)._key;
      if (obj) sel.value = String(obj[key]);
    });
    this.refreshValueLabels();
  }

  private refreshValueLabels() {
    for (const f of this.valueLabels) f();
  }

  // -- Builders -----------------------------------------------------------
  private header(): HTMLElement {
    const h = document.createElement('div');
    h.className = 'panel-header';
    h.innerHTML = `<div class="logo">B</div>
      <div class="titles"><h1>BUDDHABROT</h1><span>4D Volumetric Explorer · Studio</span></div>`;
    return h;
  }

  private section(title: string, open: boolean) {
    const wrap = document.createElement('div');
    wrap.className = 'section' + (open ? ' open' : '');
    const head = document.createElement('button');
    head.className = 'section-head';
    head.innerHTML = `<span class="chev">▸</span><span>${title}</span>`;
    const body = document.createElement('div');
    body.className = 'section-body';
    head.addEventListener('click', () => wrap.classList.toggle('open'));
    wrap.appendChild(head);
    wrap.appendChild(body);
    this.el.appendChild(wrap);
    return { body };
  }

  private slider(parent: HTMLElement, label: string, obj: any, key: string,
                 min: number, max: number, step: number, kind: ChangeKind) {
    const row = document.createElement('div');
    row.className = 'ctrl';
    const lab = document.createElement('label');
    const val = document.createElement('span');
    val.className = 'val';
    lab.textContent = label;
    lab.appendChild(val);
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min); input.max = String(max); input.step = String(step);
    input.value = String(obj[key]);
    input.setAttribute('data-bound', '');
    (input as any)._obj = obj; (input as any)._key = key;
    const update = () => { val.textContent = formatNum(obj[key], step); };
    this.valueLabels.push(update);
    input.addEventListener('input', () => {
      obj[key] = step >= 1 ? Math.round(parseFloat(input.value)) : parseFloat(input.value);
      update();
      this.h.apply(kind);
    });
    row.appendChild(lab); row.appendChild(input);
    parent.appendChild(row);
    update();
  }

  private checkbox(parent: HTMLElement, label: string, obj: any, key: string, kind: ChangeKind) {
    const row = document.createElement('label');
    row.className = 'ctrl check';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = !!obj[key];
    input.setAttribute('data-bound', '');
    (input as any)._obj = obj; (input as any)._key = key;
    input.addEventListener('change', () => { obj[key] = input.checked; this.h.apply(kind); });
    const span = document.createElement('span');
    span.textContent = label;
    row.appendChild(input); row.appendChild(span);
    parent.appendChild(row);
  }

  private select(parent: HTMLElement, label: string, obj: any, key: string,
                 options: [string, any][], kind: ChangeKind) {
    const row = document.createElement('div');
    row.className = 'ctrl';
    const lab = document.createElement('label');
    lab.textContent = label;
    const sel = document.createElement('select');
    sel.setAttribute('data-bound', '');
    (sel as any)._obj = obj; (sel as any)._key = key;
    for (const [text, value] of options) {
      const o = document.createElement('option');
      o.textContent = text; o.value = String(value);
      sel.appendChild(o);
    }
    sel.value = String(obj[key]);
    sel.addEventListener('change', () => {
      const raw = sel.value;
      obj[key] = typeof obj[key] === 'number' ? Number(raw) : raw;
      this.h.apply(kind);
    });
    row.appendChild(lab); row.appendChild(sel);
    parent.appendChild(row);
  }

  private color(parent: HTMLElement, label: string, obj: any, key: string, kind: ChangeKind) {
    const row = document.createElement('div');
    row.className = 'ctrl';
    const lab = document.createElement('label');
    lab.textContent = label;
    const input = document.createElement('input');
    input.type = 'color';
    input.value = obj[key];
    input.setAttribute('data-bound', '');
    (input as any)._obj = obj; (input as any)._key = key;
    input.addEventListener('input', () => { obj[key] = input.value; this.h.apply(kind); });
    row.appendChild(lab); row.appendChild(input);
    parent.appendChild(row);
  }

  private button(parent: HTMLElement, text: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.className = 'btn';
    b.textContent = text;
    b.addEventListener('click', onClick);
    parent.appendChild(b);
    return b;
  }
}

function fmt(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
  return String(Math.round(n));
}

function formatNum(n: number, step: number): string {
  if (step >= 1) return String(Math.round(n));
  const dp = step >= 0.1 ? 2 : step >= 0.01 ? 2 : 3;
  return n.toFixed(dp);
}

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Config } from '../state';
import { createVolumeMaterial } from './volumeMaterial';

const TONE_INDEX: Record<string, number> = { none: 0, reinhard: 1, aces: 2, filmic: 3 };

export class VolumeRenderer {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  private mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  private texture: THREE.Data3DTexture;
  private data: Float32Array;
  private res: number;
  private box: THREE.LineSegments;
  private clock = new THREE.Clock();

  constructor(canvas: HTMLCanvasElement, res: number) {
    this.res = res;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    // Linear filtering of float textures requires this extension on WebGL2.
    this.renderer.getContext().getExtension('OES_texture_float_linear');

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.01, 100);
    this.camera.position.set(0.0, 0.6, 3.4);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.rotateSpeed = 0.7;
    this.controls.minDistance = 1.2;
    this.controls.maxDistance = 20;

    const n = res * res * res;
    this.data = new Float32Array(n * 4);
    this.texture = this.makeTexture(res, this.data);
    this.material = createVolumeMaterial(this.texture);
    this.mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), this.material);
    this.scene.add(this.mesh);

    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(2, 2, 2));
    this.box = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: 0x2a3550, transparent: true, opacity: 0.5 })
    );
    this.box.visible = false;
    this.scene.add(this.box);

    window.addEventListener('resize', () => this.onResize());
  }

  private makeTexture(res: number, data: Float32Array): THREE.Data3DTexture {
    const tex = new THREE.Data3DTexture(data, res, res, res);
    tex.format = THREE.RGBAFormat;
    tex.type = THREE.FloatType;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.wrapR = tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.unpackAlignment = 1;
    tex.needsUpdate = true;
    return tex;
  }

  /** Resize the volume texture for a new grid resolution. */
  setResolution(res: number) {
    if (res === this.res) return;
    this.res = res;
    const n = res * res * res;
    this.data = new Float32Array(n * 4);
    this.texture.dispose();
    this.texture = this.makeTexture(res, this.data);
    this.material.uniforms.uVolume.value = this.texture;
  }

  /** Copy the shared count grids into the float texture, tracking per-channel max. */
  updateVolume(volR: Uint32Array, volG: Uint32Array, volB: Uint32Array) {
    const n = this.res * this.res * this.res;
    const data = this.data;
    let maxR = 1, maxG = 1, maxB = 1;
    for (let i = 0; i < n; i++) {
      const r = volR[i], g = volG[i], b = volB[i];
      const j = i * 4;
      data[j] = r; data[j + 1] = g; data[j + 2] = b;
      if (r > maxR) maxR = r;
      if (g > maxG) maxG = g;
      if (b > maxB) maxB = b;
    }
    (this.material.uniforms.uMaxCount.value as THREE.Vector3).set(maxR, maxG, maxB);
    this.texture.needsUpdate = true;
  }

  applyConfig(cfg: Config) {
    const r = cfg.render;
    const u = this.material.uniforms;
    u.uSteps.value = r.rayMarchSteps;
    u.uExposure.value = r.exposure;
    u.uDensity.value = r.density;
    u.uAbsorb.value = r.absorb;
    (u.uChanExp.value as THREE.Vector3).set(r.expR, r.expG, r.expB);
    u.uGamma.value = r.gamma;
    u.uLog.value = r.logDensity ? 1 : 0;
    u.uLogScale.value = r.logScale;
    u.uTone.value = TONE_INDEX[r.toneMap];
    u.uSat.value = r.saturation;
    u.uJitter.value = r.jitter;

    this.box.visible = r.showBox;
    this.renderer.setClearColor(new THREE.Color(r.background), 1);

    this.camera.fov = cfg.camera.fov;
    this.camera.updateProjectionMatrix();
    this.controls.autoRotate = cfg.camera.autoRotate;
    this.controls.autoRotateSpeed = cfg.camera.autoRotateSpeed;
  }

  resetCamera() {
    this.camera.position.set(0.0, 0.6, 3.4);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  private onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  render() {
    this.material.uniforms.uTime.value = this.clock.getElapsedTime();
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  screenshot(): string {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL('image/png');
  }
}

import * as THREE from 'three';
import { DEPTH_MAX, DEPTH_MIN } from '../../core/config';
import { toThree } from '../../core/coords';
import { overlapsAny } from '../../core/physics';
import { makeRng } from '../../core/rng';
import { clamp, lerp, type Solid } from '../../core/types';
import type { Boss } from '../../game/bosses';
import type { Enemy, Spikuto, Thrower } from '../../game/enemies';
import type { Game } from '../../game/game';
import * as M from './models';
import { mat, ps1Material, SHARED } from './ps1Material';

THREE.ColorManagement.enabled = false;

const W = 480;
const H = 270;

/**
 * 64N 用のローポリ3D描画。共通世界データ（stage.solids）をそのまま箱として立ち上げる。
 * 480×270 の低解像度で描画し、CSS でドットのまま拡大する。
 */
export class LowPolyRenderer {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(40, W / H, 0.1, 200);
  private solidMeshes = new Map<number, THREE.Mesh>();
  private hero = M.hero();
  private shadow: THREE.Mesh;
  private enemyViews = new Map<Enemy, THREE.Group>();
  private bossViews = new Map<Boss, THREE.Group>();
  private coinMeshes: THREE.Mesh[] = [];
  private pickupViews: THREE.Group[] = [];
  private projGroup = new THREE.Group();
  private projPool: Record<string, THREE.Mesh[]> = {};
  private particles: THREE.InstancedMesh;
  private telegraph = new THREE.Group();
  private lasers: THREE.Group[] = [];
  private builtFor: unknown = null;
  /** 2D→3D の変形演出（0..1） */
  private intro = 1;
  private introFrom2D = false;
  private bossAir = 0;
  ok = true;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'view view-3d';
    let r: THREE.WebGLRenderer | null = null;
    try {
      r = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    } catch {
      this.ok = false;
    }
    this.renderer = r!;
    if (r) {
      r.setPixelRatio(1);
      r.setSize(W, H, false);
      r.outputColorSpace = THREE.LinearSRGBColorSpace;
    }
    this.scene.background = new THREE.Color(0x7cc4ff);
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.38, 8), mat(0x000000, { opacity: 0.35 }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.scene.add(this.hero.root, this.shadow, this.projGroup, this.telegraph);
    const pg = new THREE.BoxGeometry(1, 1, 1);
    this.particles = new THREE.InstancedMesh(pg, new THREE.MeshBasicMaterial({ vertexColors: false }), 600);
    this.particles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.particles.frustumCulled = false;
    this.scene.add(this.particles);
    this.buildBackdrop();
  }

  private buildBackdrop(): void {
    const rng = makeRng(64);
    // 遠くの低地（地平線を作る）
    const low = new THREE.Mesh(new THREE.PlaneGeometry(600, 140, 30, 8), mat(0x2e6650, { checker: 0.5 }));
    low.rotation.x = -Math.PI / 2;
    low.position.set(150, -7, -74);
    this.scene.add(low);
    const front = new THREE.Mesh(new THREE.PlaneGeometry(600, 40, 30, 4), mat(0x2e6650, { checker: 0.5 }));
    front.rotation.x = -Math.PI / 2;
    front.position.set(150, -7, 22);
    this.scene.add(front);
    // 遠景の山（5角錐）
    for (let i = 0; i < 40; i++) {
      const h = 7 + rng() * 11;
      const m = new THREE.Mesh(new THREE.ConeGeometry(5 + rng() * 6, h, 5), mat(i % 2 ? 0x5aa884 : 0x7cc8a0));
      m.position.set(-20 + i * 9 + rng() * 5, h / 2 - 7, -40 - rng() * 20);
      m.rotation.y = rng() * Math.PI;
      this.scene.add(m);
      if (h > 14.5) {
        const cap = new THREE.Mesh(new THREE.ConeGeometry(1.6, 3, 5), mat(0xffffff));
        cap.position.set(m.position.x, h - 7 - 1.2, m.position.z);
        this.scene.add(cap);
      }
    }
    // 雲（箱の集まり）
    for (let i = 0; i < 30; i++) {
      const g = new THREE.Group();
      const n = 2 + Math.floor(rng() * 3);
      for (let k = 0; k < n; k++) g.add(M.box(1.6 + rng(), 0.8 + rng() * 0.5, 1.2, 0xffffff, k * 1.1, rng() * 0.4, 0, { emissive: 0.6 }));
      g.position.set(i * 11 + rng() * 6, 10 + rng() * 6, -24 - rng() * 12);
      this.scene.add(g);
    }
    // 浮島
    for (let i = 0; i < 12; i++) {
      const g = new THREE.Group();
      const r = 1.5 + rng() * 2;
      const top = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.9, 0.6, 6), mat(M.COL.grass));
      const bot = new THREE.Mesh(new THREE.ConeGeometry(r * 0.9, r * 1.6, 6), mat(M.COL.dirt));
      bot.rotation.x = Math.PI;
      bot.position.y = -0.3 - r * 0.8;
      g.add(top, bot);
      g.position.set(10 + i * 26 + rng() * 10, 7 + rng() * 6, -18 - rng() * 10);
      this.scene.add(g);
    }
  }

  /** 共通世界データから3Dのステージを組み立てる */
  private build(g: Game): void {
    for (const m of this.solidMeshes.values()) this.scene.remove(m);
    this.solidMeshes.clear();
    for (const s of g.stage.index.all) {
      const mesh = this.solidMesh(s);
      this.solidMeshes.set(s.id, mesh);
      this.scene.add(mesh);
    }
    for (const c of this.coinMeshes) this.scene.remove(c);
    this.coinMeshes = g.stage.coins.map((c) => {
      const m = M.coin();
      m.position.set(...toThree(c.x + 0.5, c.y + 0.5, c.z));
      this.scene.add(m);
      return m;
    });
    for (const l of this.lasers) this.scene.remove(l);
    this.lasers = g.stage.lasers.map((l) => {
      const grp = new THREE.Group();
      for (let z = DEPTH_MIN + 0.3; z < DEPTH_MAX; z += 0.55) {
        const beam = M.box(0.08, l.y1 - l.y0, 0.08, M.COL.red, l.x, (l.y0 + l.y1) / 2, z, { emissive: 1 });
        grp.add(beam);
      }
      grp.add(M.box(0.6, 0.3, DEPTH_MAX - DEPTH_MIN, 0x5c5c70, l.x, 0.15, (DEPTH_MIN + DEPTH_MAX) / 2));
      this.scene.add(grp);
      return grp;
    });
    // ゴール
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 6, 6), mat(0xd4d4e2));
    pole.position.set(g.stage.goalX, 3, 0);
    const flag = M.box(1.1, 0.75, 0.05, M.COL.teal, g.stage.goalX + 0.6, 5.5, 0);
    const star = M.box(0.3, 0.3, 0.07, M.COL.scarf, g.stage.goalX + 0.6, 5.5, 0, { emissive: 0.6 });
    this.scene.add(pole, flag, star);
    this.builtFor = g.stage;
  }

  private solidMesh(s: Solid): THREE.Mesh {
    const w = s.x1 - s.x0, h = s.y1 - s.y0, d = s.z1 - s.z0;
    let mesh: THREE.Mesh;
    switch (s.kind) {
      case 'ground':
        mesh = new THREE.Mesh(M.terrainBox(w, h, d, M.COL.grass, M.COL.dirt), ps1Material(0xffffff, { vertexColors: true, checker: 1 }));
        break;
      case 'flat': {
        // 厚み0の“ドット足場”: 3D では紙のように薄く、乗れない
        mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), ps1Material(M.COL.flat, { opacity: 0.45, emissive: 0.6, side: THREE.DoubleSide, checker: 1 }));
        break;
      }
      default: {
        const colors: Record<string, number> = { brick: M.COL.brick, stone: M.COL.stone, wall: M.COL.wall, bump: M.COL.bump, used: M.COL.used, gate: M.COL.gate };
        mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), ps1Material(colors[s.kind] ?? 0xffffff, { checker: 1 }));
      }
    }
    mesh.position.set(...toThree((s.x0 + s.x1) / 2, (s.y0 + s.y1) / 2, (s.z0 + s.z1) / 2));
    mesh.userData.kind = s.kind;
    return mesh;
  }

  /** 媒体に入ったとき（2D からなら変形演出） */
  enter(fromSpatial: boolean): void {
    this.intro = fromSpatial ? 1 : 0;
    this.introFrom2D = !fromSpatial;
  }

  project(x: number, y: number, z: number): { x: number; y: number } {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    return { x: (v.x + 1) / 2, y: (1 - v.y) / 2 };
  }

  render(g: Game, dt: number): void {
    if (!this.ok) return;
    if (this.builtFor !== g.stage) this.build(g);
    this.intro = Math.min(1, this.intro + dt / 0.9);
    this.updateSolids(g);
    this.updateHero(g, dt);
    this.updateEnemies(g);
    this.updateBosses(g);
    this.updateItems(g);
    this.updateProjectiles(g);
    this.updateParticles(g);
    this.updateCamera(g);
    this.renderer.render(this.scene, this.camera);
  }

  private updateCamera(g: Game): void {
    const p = g.player.body;
    const e = this.introFrom2D ? 1 - Math.pow(1 - this.intro, 3) : 1;
    // 空中のボスがいるときは少し引いて見上げる
    const boss = g.activeBoss;
    const air = boss && boss.body.y > 2 ? 1 : 0;
    this.bossAir += (air - this.bossAir) * 0.05;
    const d0 = 11.5 + this.bossAir * 3;
    const target = new THREE.Vector3(g.cam.x, g.cam.y - lerp(0, 2.5 - this.bossAir * 1.2, e), lerp(0, p.z * 0.4 - 0.8, e));
    const dist = lerp(90, d0, e);
    const visH = lerp(11.25, 2 * d0 * Math.tan(THREE.MathUtils.degToRad(20)), e);
    this.camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(visH / 2 / dist));
    this.camera.updateProjectionMatrix();
    const shake = g.cam.shake > 0 ? (Math.random() - 0.5) * g.cam.shake * 0.6 : 0;
    this.camera.position.set(target.x + shake, target.y + lerp(0, 6.2 - this.bossAir * 1.5, e) + shake, target.z + dist);
    this.camera.lookAt(target);
    SHARED.uFog.value.set(30 + (1 - e) * 80, 95 + (1 - e) * 80);
  }

  private updateSolids(g: Game): void {
    const p = g.player.body;
    for (const s of g.stage.index.all) {
      const m = this.solidMeshes.get(s.id)!;
      m.visible = s.active;
      if (s.kind !== m.userData.kind) {
        // 叩いた後のブロックなど、種類が変わったら作り直す
        this.scene.remove(m);
        const nm = this.solidMesh(s);
        this.solidMeshes.set(s.id, nm);
        this.scene.add(nm);
        continue;
      }
      m.position.y = (s.y0 + s.y1) / 2 + (s.bumpT ? Math.sin((s.bumpT / 0.2) * Math.PI) * 0.25 : 0);
      // カットアウェイ: 主人公より手前にある高い壁は半透明にする
      if (s.kind === 'wall' || s.kind === 'gate' || (s.kind === 'stone' && s.y1 - s.y0 > 4)) {
        const mm = m.material as THREE.ShaderMaterial;
        const occl = s.z1 > p.z + 0.5 && p.z < s.z0 + 0.2 && p.x > s.x0 - 4 && p.x < s.x1 + 4;
        const target = occl ? 0.4 : 1;
        const cur = mm.uniforms.uOpacity.value as number;
        const next = cur + (target - cur) * 0.2;
        mm.uniforms.uOpacity.value = next;
        mm.transparent = next < 0.99;
        mm.depthWrite = next >= 0.99;
      }
      if (s.kind === 'flat') {
        (m.material as THREE.ShaderMaterial).uniforms.uOpacity.value = 0.35 + Math.sin(g.time * 4 + s.x0) * 0.1;
      }
    }
  }

  private updateHero(g: Game, dt: number): void {
    const pl = g.player;
    const b = pl.body;
    const rig = this.hero;
    rig.root.position.set(...toThree(b.x, b.y, b.z));
    rig.root.visible = !(pl.invuln > 0 && !pl.dead && Math.floor(g.time * 16) % 2 === 0);
    // 進行方向へ向く（少しカメラ側へ）
    let yaw = pl.facing > 0 ? Math.PI / 2 - 0.35 : -Math.PI / 2 + 0.35;
    if (Math.abs(b.vz) > Math.abs(b.vx) + 0.5) yaw = b.vz > 0 ? 0 : Math.PI;
    rig.root.rotation.y += (yaw - rig.root.rotation.y) * Math.min(1, dt * 14);
    rig.root.rotation.z = pl.dead ? Math.PI : 0;
    const run = b.onGround && (Math.abs(b.vx) > 0.5 || Math.abs(b.vz) > 0.5);
    const ph = g.time * 14;
    const sw = run ? Math.sin(ph) * 0.9 : 0;
    rig.legL.rotation.x = b.onGround ? sw : -0.5;
    rig.legR.rotation.x = b.onGround ? -sw : 0.3;
    rig.armL.rotation.x = b.onGround ? -sw * 0.8 : -2.6;
    rig.armR.rotation.x = pl.punching ? -1.57 : b.onGround ? sw * 0.8 : -2.6;
    rig.body.position.y = run ? Math.abs(Math.sin(ph)) * 0.06 : 0;
    const sq = pl.landT > 0 ? 1 - pl.landT * 1.5 : 1;
    rig.body.scale.set(2 - sq, sq, 2 - sq);
    // 足元の影（真下の地面を探す）
    let gy = b.y;
    for (let k = 0; k < 40; k++) {
      const test = { x0: b.x - 0.1, x1: b.x + 0.1, y0: gy - 0.25, y1: gy, z0: b.z - 0.1, z1: b.z + 0.1 };
      if (overlapsAny(g.stage.index, test, true)) break;
      gy -= 0.25;
    }
    this.shadow.visible = gy > -5 && !pl.dead;
    this.shadow.position.set(b.x, gy + 0.03, b.z);
    const hgt = b.y - gy;
    this.shadow.scale.setScalar(clamp(1 - hgt * 0.08, 0.4, 1));
  }

  private enemyView(e: Enemy): THREE.Group {
    let v = this.enemyViews.get(e);
    if (!v) {
      v = e.type === 'kuribot' ? M.kuribot() : e.type === 'spikuto' ? M.spikuto() : e.type === 'thrower' ? M.thrower() : M.turret();
      this.enemyViews.set(e, v);
      this.scene.add(v);
    }
    return v;
  }

  private updateEnemies(g: Game): void {
    for (const [e, v] of this.enemyViews) {
      if (!g.enemies.includes(e)) {
        this.scene.remove(v);
        this.enemyViews.delete(e);
      }
    }
    for (const e of g.enemies) {
      const v = this.enemyView(e);
      const b = e.body;
      v.position.set(b.x, b.y, b.z);
      v.visible = !(e.flash > 0 && Math.floor(g.time * 30) % 2 === 0);
      v.rotation.y = e.type === 'turret' ? 0 : e.facing > 0 ? 0.9 : -0.9;
      v.rotation.z = e.dying > 0 && !e.squashed ? Math.PI : 0;
      v.scale.set(1, e.squashed ? 0.3 : 1, 1);
      if (e.type === 'kuribot') {
        const feet = v.getObjectByName('feet')!;
        feet.position.z = Math.sin(g.time * 12) * 0.08;
        v.position.y += e.state === 'notice' ? 0.15 : 0;
      } else if (e.type === 'spikuto') {
        const sp = (e as Spikuto).spikes;
        v.getObjectByName('spikes')!.scale.setScalar(0.2 + sp * 0.8);
        v.scale.y = e.state === 'crouch' ? 0.8 : 1;
        v.rotation.y += g.time * (e.state === 'jump' ? 8 : 0);
      } else if (e.type === 'thrower') {
        const th = e as Thrower;
        const arm = v.getObjectByName('arm')!;
        arm.rotation.z = th.state === 'windup' ? 2.6 : th.state === 'recover' ? -1.2 : 0;
        const ball = v.getObjectByName('ball') as THREE.Mesh;
        ball.visible = th.state === 'windup';
        ball.material = mat(th.nextShot === 'iron' ? M.COL.iron : M.COL.red, { emissive: th.nextShot === 'iron' ? 0 : 1 });
      } else {
        const light = v.getObjectByName('light')!;
        light.visible = e.state !== 'charge' || Math.floor(g.time * 20) % 2 === 0;
      }
    }
  }

  private updateBosses(g: Game): void {
    for (const b of g.bosses) {
      let v = this.bossViews.get(b);
      if (!v) {
        v = b.type === 'guardian' ? M.guardian() : M.fortress();
        this.bossViews.set(b, v);
        this.scene.add(v);
      }
      v.visible = !b.defeated && !(b.dying && b.dyingT > 1.4) && !(b.flash > 0 && Math.floor(g.time * 24) % 2 === 0);
      if (!v.visible) continue;
      const shake = b.dying ? (Math.random() - 0.5) * 0.2 : 0;
      v.position.set(b.body.x + shake, b.body.y, b.body.z);
      v.rotation.y = b.facing > 0 ? 0.5 : -0.5;
      if (b.type === 'guardian') {
        const body = v.getObjectByName('body')!;
        body.scale.y = b.state === 'slamWind' ? 0.85 : b.state === 'stunned' ? 0.92 : 1;
        v.getObjectByName('rock')!.visible = b.state === 'throwWind';
        const up = b.state === 'throwWind' ? Math.PI : b.state === 'slamWind' ? 2.2 : 0;
        v.getObjectByName('armL')!.rotation.z = -up * 0.4;
        v.getObjectByName('armR')!.rotation.z = up * (b.state === 'throwWind' ? 1 : 0.4);
        v.getObjectByName('eyes')!.visible = b.state !== 'stunned' && b.state !== 'dormant';
      } else {
        const grounded = b.state === 'grounded' || b.state === 'descend';
        v.traverse((o) => {
          if (o.name === 'flame') o.visible = !grounded;
          if (o.name === 'leg') o.visible = grounded;
        });
        const core = v.getObjectByName('core')!;
        core.rotation.y = g.time * 3;
        core.scale.setScalar(b.state === 'volleyWind' || b.state === 'rainWind' ? 1 + Math.sin(g.time * 30) * 0.2 : 1);
      }
    }
    // 予告（赤いマーカーと照準線）
    for (const c of this.telegraph.children) (c as THREE.Mesh).geometry.dispose();
    this.telegraph.clear();
    for (const b of g.bosses) {
      for (const m of b.markers) {
        if (Math.floor(g.time * 12) % 2 === 0) continue;
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.55, 8), mat(M.COL.red, { emissive: 1, side: THREE.DoubleSide }));
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(m.x, 0.05, m.z);
        this.telegraph.add(ring);
        this.telegraph.add(M.box(0.06, 12, 0.06, M.COL.red, m.x, 6, m.z, { emissive: 1, opacity: 0.4 }));
      }
      for (const a of b.aims) {
        const from = new THREE.Vector3(b.body.x, b.body.y + 0.6, b.body.z);
        const to = new THREE.Vector3(a.x, a.y, a.z);
        const len = from.distanceTo(to);
        const beam = M.box(0.05, 0.05, len, M.COL.red, 0, 0, 0, { emissive: 1, opacity: 0.6 });
        beam.position.copy(from).lerp(to, 0.5);
        beam.lookAt(to);
        this.telegraph.add(beam);
      }
    }
  }

  private updateItems(g: Game): void {
    g.stage.coins.forEach((c, i) => {
      const m = this.coinMeshes[i];
      m.visible = !c.taken;
      m.rotation.z = g.time * 3 + c.x;
    });
    while (this.pickupViews.length < g.pickups.length) {
      const v = M.cartridge();
      this.pickupViews.push(v);
      this.scene.add(v);
    }
    g.pickups.forEach((pk, i) => {
      const v = this.pickupViews[i];
      v.visible = !pk.taken;
      v.position.set(pk.x, pk.y + Math.sin(pk.t * 4) * 0.2, pk.z);
      v.rotation.y = pk.t * 2;
    });
    for (const l of this.lasers) {
      l.children.forEach((c, i) => {
        if (i < l.children.length - 1) c.visible = g.laws.colorImmune ? false : Math.floor(g.time * 20 + i) % 3 !== 0;
      });
    }
  }

  private updateProjectiles(g: Game): void {
    const used: Record<string, number> = {};
    for (const pr of g.projectiles) {
      const k = pr.kind;
      used[k] = (used[k] ?? 0) + 1;
      const pool = (this.projPool[k] ??= []);
      if (pool.length < used[k]) {
        let m: THREE.Mesh;
        if (k === 'orb') m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 0), mat(M.COL.red, { emissive: 1 }));
        else if (k === 'bomb') m = new THREE.Mesh(new THREE.OctahedronGeometry(0.4, 0), mat(M.COL.red, { emissive: 1 }));
        else if (k === 'rock') m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.45, 0), mat(M.COL.rock));
        else if (k === 'iron') m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.32, 0), mat(M.COL.iron));
        else m = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.9, 5), mat(0xe09a5c, { opacity: 0.8 }));
        pool.push(m);
        this.projGroup.add(m);
      }
      const m = pool[used[k] - 1];
      m.visible = true;
      m.position.set(pr.x, pr.kind === 'wave' ? pr.y + 0.45 : pr.y, pr.z);
      m.rotation.set(pr.t * 5, pr.t * 7, 0);
      if (pr.kind === 'wave') m.scale.set(1, 0.8 + Math.sin(pr.t * 30) * 0.2, 2.5);
    }
    for (const k in this.projPool) {
      this.projPool[k].forEach((m, i) => {
        if (i >= (used[k] ?? 0)) m.visible = false;
      });
    }
  }

  private updateParticles(g: Game): void {
    const colors: Record<string, number[]> = {
      dust: [0xe09a5c, 0xd4d4e2], hit: [0xffffff, 0xfff6c0], spark: [0xffd23a, 0xffffff], boom: [0xff2a3c, 0xffd23a, 0xff9b2a],
      steam: [0xffffff, 0xc4e2ff], coin: [0xffd23a], nullify: [0xffffff], switch: [0xff6ec8, 0xffffff, 0x7fe8e8],
    };
    const m4 = new THREE.Matrix4();
    const col = new THREE.Color();
    const n = Math.min(600, g.particles.length);
    for (let i = 0; i < n; i++) {
      const p = g.particles[i];
      const s = Math.max(0.02, p.size * (p.life / p.max)) * (p.kind === 'coin' ? 2.5 : 1);
      m4.makeScale(s, s, s);
      m4.setPosition(p.x, p.y, p.z);
      this.particles.setMatrixAt(i, m4);
      const list = colors[p.kind];
      this.particles.setColorAt(i, col.setHex(list[i % list.length]));
    }
    this.particles.count = n;
    this.particles.instanceMatrix.needsUpdate = true;
    if (this.particles.instanceColor) this.particles.instanceColor.needsUpdate = true;
  }
}

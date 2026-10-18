import * as THREE from 'three';
import { mat } from './ps1Material';

/** ローポリモデルはすべてプログラムで組み立てる（後から GLB に差し替え可能なように関数単位で分ける） */
export const COL = {
  hair: 0xa8561e, hairDark: 0x6b3410, helmet: 0xf5c22a, goggle: 0x7fe8e8, skin: 0xf6c38e, eye: 0x1a1a2a,
  teal: 0x1fa39b, tealDark: 0x136e6a, cream: 0xf3e7c6, scarf: 0xffd84a, glove: 0x2d2f3d, device: 0xff9b2a,
  pants: 0x5a3a24, boot: 0x3a3446,
  grass: 0x52d04a, dirt: 0xc8743c, brick: 0xc05a2c, stone: 0x9c9cb0, wall: 0x7c6c94, bump: 0xf4b830, used: 0x946c50,
  flat: 0xff6ec8, gate: 0x4c4c60, coin: 0xffd23a, red: 0xff2a3c, iron: 0x5c5c68, rock: 0x9a6a44,
  kuri: 0xb5652b, kuriDark: 0x7a3c14, spik: 0x8a4fd8, spikTip: 0xf4e8ff, navy: 0x2c4a8c, blue: 0x4a78c8, orange: 0xff9b2a,
};

export function box(w: number, h: number, d: number, color: number, x = 0, y = 0, z = 0, o: Parameters<typeof mat>[1] = {}): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, o));
  m.position.set(x, y, z);
  return m;
}

/** 地形ブロック: 上面と側面で色を変える（頂点カラー） */
export function terrainBox(w: number, h: number, d: number, top: number, side: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const colors = new Float32Array(g.attributes.position.count * 3);
  const ct = new THREE.Color(top);
  const cs = new THREE.Color(side);
  // BoxGeometry の面の順: +x, -x, +y, -y, +z, -z（各4頂点）
  for (let f = 0; f < 6; f++) {
    const c = f === 2 ? ct : cs;
    for (let v = 0; v < 4; v++) {
      const i = (f * 4 + v) * 3;
      colors[i] = c.r;
      colors[i + 1] = c.g;
      colors[i + 2] = c.b;
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

export interface HeroRig {
  root: THREE.Group;
  body: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  head: THREE.Group;
}

/** 主人公（ローポリ版）。正面 +z 向きで組み、進行方向へ回転させる */
export function hero(): HeroRig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const limb = (x: number) => {
    const g = new THREE.Group();
    g.position.set(x, 0.42, 0);
    g.add(box(0.17, 0.26, 0.2, COL.pants, 0, -0.13, 0));
    g.add(box(0.21, 0.07, 0.24, COL.cream, 0, -0.27, 0.01));
    g.add(box(0.24, 0.16, 0.34, COL.boot, 0, -0.35, 0.04));
    return g;
  };
  const legL = limb(-0.11);
  const legR = limb(0.11);
  body.add(legL, legR);
  // 胴体
  body.add(box(0.42, 0.32, 0.28, COL.teal, 0, 0.58, 0));
  body.add(box(0.14, 0.3, 0.02, COL.cream, 0, 0.59, 0.145));
  body.add(box(0.46, 0.08, 0.32, COL.tealDark, 0, 0.44, 0));
  body.add(box(0.14, 0.1, 0.06, COL.device, 0.0, 0.44, 0.17, { emissive: 0.4 })); // 媒体切替装置
  body.add(box(0.36, 0.07, 0.3, COL.scarf, 0, 0.76, 0));
  const arm = (x: number) => {
    const g = new THREE.Group();
    g.position.set(x, 0.72, 0);
    g.add(box(0.12, 0.24, 0.13, COL.teal, 0, -0.1, 0));
    g.add(box(0.16, 0.14, 0.16, COL.glove, 0, -0.26, 0));
    return g;
  };
  const armL = arm(-0.29);
  const armR = arm(0.29);
  body.add(armL, armR);
  // 頭
  const head = new THREE.Group();
  head.position.set(0, 0.8, 0);
  head.add(box(0.4, 0.34, 0.36, COL.skin, 0, 0.18, 0));
  head.add(box(0.07, 0.09, 0.02, COL.eye, -0.09, 0.17, 0.185));
  head.add(box(0.07, 0.09, 0.02, COL.eye, 0.09, 0.17, 0.185));
  head.add(box(0.44, 0.14, 0.4, COL.hair, 0, 0.36, -0.01));
  head.add(box(0.44, 0.3, 0.12, COL.hair, 0, 0.24, -0.16));
  // ツンツン髪（四角錐）
  const spike = (x: number, z: number, rx: number, rz: number) => {
    const m = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.22, 4), mat(COL.hairDark));
    m.position.set(x, 0.48, z);
    m.rotation.set(rx, 0, rz);
    head.add(m);
  };
  spike(-0.14, 0.02, 0.2, 0.5);
  spike(0.0, -0.05, -0.2, 0);
  spike(0.14, 0.02, 0.2, -0.5);
  spike(0.0, -0.2, -0.8, 0);
  // ヘッドギアとゴーグル
  head.add(box(0.46, 0.08, 0.42, COL.helmet, 0, 0.3, 0));
  head.add(box(0.12, 0.08, 0.04, COL.goggle, -0.1, 0.3, 0.22, { emissive: 0.5 }));
  head.add(box(0.12, 0.08, 0.04, COL.goggle, 0.1, 0.3, 0.22, { emissive: 0.5 }));
  body.add(head);
  root.add(body);
  return { root, body, legL, legR, armL, armR, head };
}

export function kuribot(): THREE.Group {
  const g = new THREE.Group();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.45, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2), mat(COL.kuri));
  dome.position.y = 0.3;
  g.add(dome);
  g.add(box(0.8, 0.14, 0.7, COL.kuriDark, 0, 0.26, 0));
  g.add(box(0.6, 0.1, 0.5, 0x6c6c80, 0, 0.16, 0));
  for (const x of [-0.16, 0.16]) {
    g.add(box(0.14, 0.16, 0.04, 0xffffff, x, 0.48, 0.36, { emissive: 0.6 }));
    g.add(box(0.06, 0.1, 0.03, COL.eye, x + 0.03, 0.47, 0.385));
  }
  const ant = box(0.04, 0.2, 0.04, 0x9c9cb0, 0, 0.82, 0);
  g.add(ant);
  g.add(box(0.1, 0.1, 0.1, COL.coin, 0, 0.95, 0, { emissive: 0.6 }));
  const feet = new THREE.Group();
  feet.name = 'feet';
  feet.add(box(0.2, 0.12, 0.3, COL.glove, -0.2, 0.06, 0));
  feet.add(box(0.2, 0.12, 0.3, COL.glove, 0.2, 0.06, 0));
  g.add(feet);
  return g;
}

export function spikuto(): THREE.Group {
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.4, 0), mat(COL.spik));
  core.position.y = 0.42;
  g.add(core);
  const spikes = new THREE.Group();
  spikes.name = 'spikes';
  spikes.position.y = 0.42;
  const dirs = [
    [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, 0, 1], [0, 0, -1],
    [0.7, 0.7, 0], [-0.7, 0.7, 0], [0, 0.7, 0.7], [0, 0.7, -0.7], [0.7, -0.5, 0.5], [-0.7, -0.5, 0.5],
  ];
  for (const d of dirs) {
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.35, 4), mat(COL.spikTip));
    const v = new THREE.Vector3(...(d as [number, number, number])).normalize();
    c.position.copy(v.clone().multiplyScalar(0.45));
    c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v);
    spikes.add(c);
  }
  g.add(spikes);
  for (const x of [-0.13, 0.13]) g.add(box(0.1, 0.14, 0.04, 0xffffff, x, 0.48, 0.36, { emissive: 0.6 }));
  return g;
}

export function thrower(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(0.7, 0.6, 0.55, COL.navy, 0, 0.55, 0));
  g.add(box(0.6, 0.45, 0.5, COL.blue, 0, 1.05, 0));
  g.add(box(0.4, 0.1, 0.05, COL.goggle, 0, 1.05, 0.26, { emissive: 0.6 }));
  g.add(box(0.2, 0.25, 0.25, COL.glove, -0.18, 0.12, 0));
  g.add(box(0.2, 0.25, 0.25, COL.glove, 0.18, 0.12, 0));
  const arm = new THREE.Group();
  arm.name = 'arm';
  arm.position.set(0.42, 0.8, 0);
  arm.add(box(0.16, 0.5, 0.16, COL.navy, 0, -0.2, 0));
  const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.25, 0), mat(COL.iron));
  ball.name = 'ball';
  ball.position.set(0, 0.2, 0);
  arm.add(ball);
  g.add(arm);
  return g;
}

export function turret(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(1, 0.8, 0.9, 0x5c5c70, 0, 0.4, 0, { checker: 1 }));
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.7, 6), mat(COL.iron));
  barrel.rotation.z = Math.PI / 2;
  barrel.position.set(-0.7, 0.65, 0);
  g.add(barrel);
  const light = box(0.25, 0.3, 0.25, COL.red, 0, 0.95, 0, { emissive: 1 });
  light.name = 'light';
  g.add(light);
  return g;
}

export function guardian(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Group();
  body.name = 'body';
  g.add(body);
  body.add(box(0.7, 0.7, 0.8, 0x5a3a20, -0.55, 0.35, 0));
  body.add(box(0.7, 0.7, 0.8, 0x5a3a20, 0.55, 0.35, 0));
  body.add(box(2.2, 1.4, 1.5, COL.stone, 0, 1.4, 0, { checker: 1 }));
  body.add(box(0.6, 0.4, 0.2, COL.rock, -0.4, 1.3, 0.76));
  body.add(box(0.5, 0.35, 0.2, COL.rock, 0.5, 1.6, 0.76));
  const head = box(1.4, 1.0, 1.2, COL.stone, 0, 2.5, 0, { checker: 1 });
  body.add(head);
  body.add(box(1.42, 0.15, 1.22, 0x4caa50, 0, 2.95, 0));
  const eyes = new THREE.Group();
  eyes.name = 'eyes';
  eyes.add(box(0.3, 0.18, 0.05, COL.orange, -0.3, 2.55, 0.62, { emissive: 1 }));
  eyes.add(box(0.3, 0.18, 0.05, COL.orange, 0.3, 2.55, 0.62, { emissive: 1 }));
  body.add(eyes);
  for (const s of [-1, 1]) {
    const arm = new THREE.Group();
    arm.name = s < 0 ? 'armL' : 'armR';
    arm.position.set(s * 1.35, 2.0, 0);
    arm.add(box(0.5, 1.3, 0.6, 0x5c5c70, 0, -0.6, 0, { checker: 1 }));
    body.add(arm);
  }
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.55, 0), mat(COL.rock));
  rock.name = 'rock';
  rock.position.set(0, 3.8, 0);
  body.add(rock);
  return g;
}

export function fortress(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(2.6, 1.6, 1.8, COL.blue, 0, 1.2, 0, { checker: 1 }));
  g.add(box(2.7, 0.2, 1.9, COL.navy, 0, 2.05, 0));
  g.add(box(2.7, 0.2, 1.9, COL.navy, 0, 0.35, 0));
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), mat(COL.red, { emissive: 1 }));
  core.name = 'core';
  core.position.set(0, 1.2, 0.95);
  g.add(core);
  for (const s of [-1, 1]) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 0.8, 6), mat(COL.iron));
    c.rotation.x = Math.PI / 2;
    c.position.set(s * 1.55, 1.2, 0.3);
    g.add(c);
    const fl = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.6, 5), mat(COL.orange, { emissive: 1 }));
    fl.name = 'flame';
    fl.rotation.x = Math.PI;
    fl.position.set(s * 0.8, 0.0, 0);
    g.add(fl);
    const leg = box(0.35, 0.4, 0.5, COL.navy, s * 0.95, 0.2, 0);
    leg.name = 'leg';
    g.add(leg);
  }
  return g;
}

export function coin(): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.08, 8), mat(COL.coin, { emissive: 0.4 }));
  m.rotation.x = Math.PI / 2;
  return m;
}

export function cartridge(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(0.7, 0.8, 0.16, 0xd4d4e2));
  g.add(box(0.5, 0.35, 0.02, 0x64b4ff, 0, 0.1, 0.09, { emissive: 0.5 }));
  g.add(box(0.6, 0.12, 0.17, COL.coin, 0, -0.42, 0, { emissive: 0.4 }));
  return g;
}

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EMPTY_COLOR, FACE_COLORS } from '../../../shared/colors';
import { isInLayer, parseMove } from '../../../core/cube/cube-moves';
import { Face, Facelets } from '../../../core/cube/cube-validator';
import {
  CUBIE_POSITIONS, FACELETS, FACE_NORMALS, Vec3, faceletsOnCubie,
} from '../../../core/cube/facelet-map';

/** Everything the scene needs to draw a frame. Pushed in from CubeState; never read back. */
export interface SceneView {
  readonly facelets: Facelets;
  readonly errors: ReadonlySet<number>;
  readonly hovered: number | null;
  readonly selected: number | null;
}

export interface SceneCallbacks {
  /** Sticker index under the cursor, or null. Called only when it changes. */
  onHover(index: number | null): void;
  /** A click (not a drag) landed on this sticker. */
  onClick(index: number): void;
}

// Sizes in cubie units (cubie pitch = 1).
// Cubies touch (BODY = pitch) and stickers cover most of each face, so the
// dark body only shows as thin separator lines.
const BODY = 1;
const OVERLAY = 0.98;
const STICKER = 0.9;
const OVERLAY_LIFT = BODY / 2 + 0.005;
const STICKER_LIFT = BODY / 2 + 0.01;
const HOVER_SCALE = 1.1;
const CLICK_SLOP_PX = 4;
const TWEEN_MS = 650;

const ERROR_COLOR = '#ff2d2d';
const SELECTED_COLOR = '#38bdf8';

/** Camera angles (three.js Spherical: theta around y from +z toward +x, phi from +y) per view button. */
const VIEW_ANGLES: Record<Face, { theta: number; phi: number }> = {
  F: { theta: 0, phi: Math.PI / 2 },
  R: { theta: Math.PI / 2, phi: Math.PI / 2 },
  B: { theta: Math.PI, phi: Math.PI / 2 },
  L: { theta: -Math.PI / 2, phi: Math.PI / 2 },
  U: { theta: 0, phi: 1e-4 },
  D: { theta: 0, phi: Math.PI - 1e-4 },
};

interface Tween {
  start: number;
  fromTheta: number;
  fromPhi: number;
  toTheta: number;
  toPhi: number;
}

/** One of the 26 cubies: its group, and where it lives when no layer is turning. */
interface Cubie {
  group: THREE.Group;
  home: THREE.Vector3;
  grid: Vec3;
}

/** A layer turn in progress. The pivot stays rotated after `done` until the next update()/cancel. */
interface LayerTurn {
  pivot: THREE.Group;
  cubies: Cubie[];
  axis: THREE.Vector3;
  angle: number;
  start: number;
  duration: number;
  done: boolean;
  resolve(completed: boolean): void;
}

const QUARTER_TURN_MS = 380;
const HALF_TURN_MS = 540;

const easeInOutCubic = (k: number): number => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

/**
 * Plain Three.js scene: 26 cubies with 54 sticker planes. It only renders what
 * `update()` is given; colors are recomputed from that input on every call.
 */
export class CubeScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  private readonly controls: OrbitControls;
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();

  private readonly stickers: THREE.Mesh<THREE.ShapeGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly overlays: THREE.Mesh<THREE.ShapeGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly pickTargets: THREE.Mesh[] = [];
  private readonly faceletOfMesh = new Map<THREE.Object3D, number>();
  private readonly disposables: { dispose(): void }[] = [];
  private readonly cubies: Cubie[] = [];

  private view: SceneView | null = null;
  private turn: LayerTurn | null = null;
  private hoverIndex: number | null = null;
  private raf = 0;
  private tween: Tween | null = null;
  private downX = 0;
  private downY = 0;
  private downValid = false;
  private disposed = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly callbacks: SceneCallbacks,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    this.buildCube();

    // Default 3/4 view: front-right-top.
    this.camera.position.setFromSphericalCoords(11, 1.0, Math.PI / 4);
    this.camera.lookAt(0, 0, 0);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enablePan = false;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.minDistance = 7;
    this.controls.maxDistance = 18;
    this.controls.addEventListener('change', this.requestRender);
    this.controls.addEventListener('start', this.cancelTween);

    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerleave', this.onPointerLeave);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointerup', this.onPointerUp);
  }

  // ---------------------------------------------------------------- public

  /**
   * Play one face turn (e.g. "R", "U'", "F2") as an animation of that layer.
   * `reverse` plays it backwards, to go one step back. The colors are NOT changed:
   * the caller shows the cube after the move with update() once this resolves.
   * `speed` above 1 plays it faster, for when more moves are waiting.
   * Resolves true when finished, false if it was cancelled first.
   */
  animateMove(moveText: string, reverse: boolean, speed = 1): Promise<boolean> {
    this.settleTurn();
    const move = parseMove(moveText);
    const n = FACE_NORMALS[move.face];
    const layer = this.cubies.filter(c => isInLayer(move.face, c.grid));

    const pivot = new THREE.Group();
    this.scene.add(pivot);
    layer.forEach(c => pivot.attach(c.group));

    // A clockwise quarter turn seen from outside is -90° about the face normal.
    const angle = -(Math.PI / 2) * move.turns * (reverse ? -1 : 1);
    return new Promise<boolean>(resolve => {
      this.turn = {
        pivot,
        cubies: layer,
        axis: new THREE.Vector3(n.x, n.y, n.z),
        angle,
        start: performance.now(),
        duration: (Math.abs(move.turns) === 2 ? HALF_TURN_MS : QUARTER_TURN_MS) / Math.max(speed, 0.1),
        done: false,
        resolve,
      };
      this.requestRender();
    });
  }

  /** Stop a running face turn and put the cubies back as they were. */
  cancelAnimation(): void {
    if (!this.turn) return;
    this.settleTurn();
    this.requestRender();
  }

  /** Draw this view of the cube. */
  update(view: SceneView): void {
    this.settleTurn();
    this.view = view;
    this.hoverIndex = view.hovered;
    this.applyView();
    this.requestRender();
  }

  resize(width: number, height: number): void {
    if (width === 0 || height === 0) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.requestRender();
  }

  /** Smoothly rotate the camera to look straight at one side. */
  viewFace(face: Face): void {
    const cur = new THREE.Spherical().setFromVector3(this.camera.position);
    const target = VIEW_ANGLES[face];
    // Shortest way around the y axis.
    const dTheta = Math.atan2(Math.sin(target.theta - cur.theta), Math.cos(target.theta - cur.theta));
    this.tween = {
      start: performance.now(),
      fromTheta: cur.theta,
      fromPhi: cur.phi,
      toTheta: cur.theta + dTheta,
      toPhi: target.phi,
    };
    this.requestRender();
  }

  dispose(): void {
    this.settleTurn();
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerleave', this.onPointerLeave);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.controls.dispose();
    this.disposables.forEach(d => d.dispose());
    this.renderer.dispose();
  }

  // ----------------------------------------------------------------- build

  private buildCube(): void {
    const bodyGeo = new THREE.BoxGeometry(BODY, BODY, BODY);
    const bodyMat = new THREE.MeshBasicMaterial({ color: '#14161b' });
    const stickerGeo = roundedSquare(STICKER, 0.08);
    const overlayGeo = roundedSquare(OVERLAY, 0.1);
    this.disposables.push(bodyGeo, bodyMat, stickerGeo, overlayGeo);

    const zAxis = new THREE.Vector3(0, 0, 1);

    for (const pos of CUBIE_POSITIONS) {
      const cubie = new THREE.Group();
      cubie.position.set(pos.x, pos.y, pos.z);
      this.cubies.push({ group: cubie, home: cubie.position.clone(), grid: pos });

      const body = new THREE.Mesh(bodyGeo, bodyMat);
      cubie.add(body);
      this.pickTargets.push(body); // occludes stickers behind it; has no facelet → picks null

      for (const f of faceletsOnCubie(pos)) {
        const normal = new THREE.Vector3(f.normal.x, f.normal.y, f.normal.z);
        const quat = new THREE.Quaternion().setFromUnitVectors(zAxis, normal);

        const overlayMat = new THREE.MeshBasicMaterial({ color: ERROR_COLOR });
        const overlay = new THREE.Mesh(overlayGeo, overlayMat);
        overlay.quaternion.copy(quat);
        overlay.position.copy(normal).multiplyScalar(OVERLAY_LIFT);
        overlay.visible = false;
        cubie.add(overlay);

        const stickerMat = new THREE.MeshBasicMaterial({ color: EMPTY_COLOR });
        const sticker = new THREE.Mesh(stickerGeo, stickerMat);
        sticker.quaternion.copy(quat);
        sticker.position.copy(normal).multiplyScalar(STICKER_LIFT);
        cubie.add(sticker);

        this.disposables.push(overlayMat, stickerMat);
        this.stickers[f.index] = sticker;
        this.overlays[f.index] = overlay;
        this.pickTargets.push(sticker);
        this.faceletOfMesh.set(sticker, f.index);
      }
      this.scene.add(cubie);
    }
    if (FACELETS.length !== this.stickers.length) throw new Error('sticker count mismatch');
  }

  // ------------------------------------------------------------- rendering

  /** Recompute every sticker's look from the latest view input. */
  private applyView(): void {
    const v = this.view;
    if (!v) return;
    const tmp = new THREE.Color();
    for (let i = 0; i < 54; i++) {
      const sticker = this.stickers[i];
      const face = v.facelets[i];
      tmp.set(face ? FACE_COLORS[face] : EMPTY_COLOR);
      const hovered = v.hovered === i;
      if (hovered) tmp.lerp(new THREE.Color('#ffffff'), 0.35);
      sticker.material.color.copy(tmp);
      sticker.scale.setScalar(hovered ? HOVER_SCALE : 1);

      const overlay = this.overlays[i];
      const isError = v.errors.has(i);
      const isSelected = v.selected === i;
      overlay.visible = isError || isSelected;
      overlay.material.color.set(isError ? ERROR_COLOR : SELECTED_COLOR);
    }
  }

  private readonly requestRender = (): void => {
    if (this.disposed || this.raf) return;
    this.raf = requestAnimationFrame(this.frame);
  };

  private readonly frame = (): void => {
    this.raf = 0;
    if (this.disposed) return;
    this.stepTween();
    this.stepTurn();
    this.controls.update(); // fires 'change' (→ requestRender) while damping is still moving
    this.renderer.render(this.scene, this.camera);
    if (this.tween || (this.turn && !this.turn.done)) this.requestRender();
  };

  private stepTurn(): void {
    const t = this.turn;
    if (!t || t.done) return;
    const k = Math.min((performance.now() - t.start) / t.duration, 1);
    t.pivot.quaternion.setFromAxisAngle(t.axis, t.angle * easeInOutCubic(k));
    if (k >= 1) {
      // Leave the layer rotated: with the old colors it looks exactly like the
      // new colors un-rotated, so there is no jump when update() swaps them.
      t.done = true;
      t.resolve(true);
    }
  }

  /** Detach the turning layer and return every cubie to its home position and orientation. */
  private settleTurn(): void {
    const t = this.turn;
    if (!t) return;
    this.turn = null;
    for (const c of t.cubies) {
      this.scene.add(c.group); // leaves the pivot
      c.group.position.copy(c.home);
      c.group.quaternion.identity();
    }
    this.scene.remove(t.pivot);
    t.resolve(false); // no effect if it already resolved true
  }

  private stepTween(): void {
    const t = this.tween;
    if (!t) return;
    const k = Math.min((performance.now() - t.start) / TWEEN_MS, 1);
    const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; // easeInOutCubic
    const radius = this.camera.position.length();
    this.camera.position.setFromSphericalCoords(
      radius,
      t.fromPhi + (t.toPhi - t.fromPhi) * e,
      t.fromTheta + (t.toTheta - t.fromTheta) * e,
    );
    this.camera.lookAt(0, 0, 0);
    if (k >= 1) this.tween = null;
  }

  private readonly cancelTween = (): void => {
    this.tween = null;
  };

  // --------------------------------------------------------------- pointer

  private pick(ev: PointerEvent): number | null {
    const rect = this.canvas.getBoundingClientRect();
    this.ndc.set(
      ((ev.clientX - rect.left) / rect.width) * 2 - 1,
      -((ev.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const hit = this.raycaster.intersectObjects(this.pickTargets, false)[0];
    return hit ? (this.faceletOfMesh.get(hit.object) ?? null) : null;
  }

  private readonly onPointerMove = (ev: PointerEvent): void => {
    // No hover while dragging (orbiting).
    const index = ev.buttons === 0 ? this.pick(ev) : null;
    if (index !== this.hoverIndex) {
      this.hoverIndex = index;
      this.callbacks.onHover(index);
    }
  };

  private readonly onPointerLeave = (): void => {
    if (this.hoverIndex !== null) {
      this.hoverIndex = null;
      this.callbacks.onHover(null);
    }
  };

  private readonly onPointerDown = (ev: PointerEvent): void => {
    this.downValid = ev.button === 0;
    this.downX = ev.clientX;
    this.downY = ev.clientY;
  };

  private readonly onPointerUp = (ev: PointerEvent): void => {
    if (!this.downValid || ev.button !== 0) return;
    this.downValid = false;
    if (Math.hypot(ev.clientX - this.downX, ev.clientY - this.downY) > CLICK_SLOP_PX) return;
    const index = this.pick(ev);
    if (index !== null) this.callbacks.onClick(index);
  };
}

/** Rounded square in the XY plane facing +z. */
function roundedSquare(size: number, radius: number): THREE.ShapeGeometry {
  const h = size / 2;
  const r = radius;
  const s = new THREE.Shape();
  s.moveTo(-h + r, -h);
  s.lineTo(h - r, -h);
  s.quadraticCurveTo(h, -h, h, -h + r);
  s.lineTo(h, h - r);
  s.quadraticCurveTo(h, h, h - r, h);
  s.lineTo(-h + r, h);
  s.quadraticCurveTo(-h, h, -h, h - r);
  s.lineTo(-h, -h + r);
  s.quadraticCurveTo(-h, -h, -h + r, -h);
  return new THREE.ShapeGeometry(s);
}

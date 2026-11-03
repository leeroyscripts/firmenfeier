// Orbit camera: mouse, touch and pinch, with damping, flick inertia and idle auto-rotate.
import * as pc from 'playcanvas';

const DEG = Math.PI / 180;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const damp = (k, dt) => 1 - Math.exp(-k * dt);
const wrap180 = (a) => ((a + 180) % 360 + 360) % 360 - 180;

export class Orbit {
  constructor(camera, element, view) {
    this.camera = camera;
    this.el = element;
    this.home = view;
    this.limits = view.limits;

    this.target = new pc.Vec3(...view.target);
    this.yaw = view.yaw; this.pitch = view.pitch; this.dist = view.dist;
    this.goal = { target: this.target.clone(), yaw: this.yaw, pitch: this.pitch, dist: this.dist };

    this.vel = { yaw: 0, pitch: 0 };
    this.autoRotate = true;
    this.autoSpeed = view.autoSpeed ?? 5;
    this.autoDir = 1;
    this.autoVel = 0;
    this.autoRamp = 0;
    this.swayT = 0;
    this.idle = 0;
    this.idleDelay = 4.5;
    this.interacting = false;
    this.onInteract = null;

    this.pointers = new Map();
    this.pinch = null;
    this._bind();
  }

  _bind() {
    const el = this.el;
    el.addEventListener('pointerdown', (e) => this._down(e));
    el.addEventListener('pointermove', (e) => this._move(e));
    el.addEventListener('pointerup', (e) => this._up(e));
    el.addEventListener('pointercancel', (e) => this._up(e));
    el.addEventListener('lostpointercapture', (e) => this._up(e));
    el.addEventListener('wheel', (e) => this._wheel(e), { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('dblclick', () => this.reset());
    window.addEventListener('keydown', (e) => this._key(e));
  }

  _touch() {
    this.idle = 0;
    this.autoRamp = 0;
    this.onInteract?.();
  }

  _down(e) {
    this.el.setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, button: e.button, t: performance.now() });
    this.vel.yaw = this.vel.pitch = 0;
    this.interacting = true;
    this.el.classList.add('dragging');
    if (this.pointers.size === 2) this.pinch = this._pinchState();
    this._touch();
  }

  _move(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    const now = performance.now();
    const dt = Math.max(12, now - p.t) / 1000;
    p.x = e.clientX; p.y = e.clientY; p.t = now;

    if (this.pointers.size >= 2) {
      const s = this._pinchState();
      if (this.pinch) {
        this.goal.dist = clamp(this.goal.dist * (this.pinch.span / Math.max(1, s.span)), this.limits.dist[0], this.limits.dist[1]);
        this._pan(s.cx - this.pinch.cx, s.cy - this.pinch.cy);
      }
      this.pinch = s;
    } else {
      const pan = p.button === 1 || p.button === 2 || e.shiftKey || e.ctrlKey || e.metaKey;
      if (pan) this._pan(dx, dy);
      else {
        const k = this._rotSpeed();
        const dyaw = -dx * k, dpitch = dy * k * 0.8;
        this.goal.yaw = this._clampYaw(this.goal.yaw + dyaw);
        this.goal.pitch = clamp(this.goal.pitch + dpitch, this.limits.pitch[0], this.limits.pitch[1]);
        // velocity for flick inertia (deg/s), smoothed and capped
        this.vel.yaw = clamp(this.vel.yaw * 0.6 + (dyaw / dt) * 0.4, -90, 90);
        this.vel.pitch = clamp(this.vel.pitch * 0.6 + (dpitch / dt) * 0.4, -30, 30);
      }
    }
    this._touch();
  }

  _up(e) {
    if (!this.pointers.has(e.pointerId)) return;
    const p = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    // a pause before release kills the flick
    if (performance.now() - p.t > 80) this.vel.yaw = this.vel.pitch = 0;
    if (this.pointers.size < 2) this.pinch = null;
    if (this.pointers.size === 0) {
      this.interacting = false;
      this.el.classList.remove('dragging');
    }
    this._touch();
  }

  _wheel(e) {
    e.preventDefault();
    const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    this.goal.dist = clamp(this.goal.dist * Math.exp(delta * 0.0011), this.limits.dist[0], this.limits.dist[1]);
    this._touch();
  }

  _key(e) {
    const step = e.shiftKey ? 15 : 5;
    // left/right arrows switch scenes (main.js); A/D turn
    const map = {
      a: () => (this.goal.yaw = this._clampYaw(this.goal.yaw + step)),
      d: () => (this.goal.yaw = this._clampYaw(this.goal.yaw - step)),
      ArrowUp: () => (this.goal.pitch = clamp(this.goal.pitch + step, ...this.limits.pitch)),
      ArrowDown: () => (this.goal.pitch = clamp(this.goal.pitch - step, ...this.limits.pitch)),
      '+': () => (this.goal.dist = clamp(this.goal.dist * 0.88, ...this.limits.dist)),
      '=': () => (this.goal.dist = clamp(this.goal.dist * 0.88, ...this.limits.dist)),
      '-': () => (this.goal.dist = clamp(this.goal.dist * 1.14, ...this.limits.dist)),
      r: () => this.reset(),
    };
    const fn = map[e.key];
    if (fn) { fn(); this._touch(); }
  }

  _pinchState() {
    const [a, b] = [...this.pointers.values()];
    return { span: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
  }

  _rotSpeed() {
    // a full swipe across the screen covers ~120 deg, enough for the narrow capture window
    return 120 / Math.max(320, Math.min(this.el.clientWidth, this.el.clientHeight * 1.4));
  }

  _clampYaw(yaw) {
    const yl = this.limits.yaw;
    if (!yl) return yaw;
    return clamp(yaw, this.home.yaw + yl[0], this.home.yaw + yl[1]);
  }

  _pan(dx, dy) {
    const cam = this.camera.camera;
    const h = this.el.clientHeight || 1;
    const fovV = cam.horizontalFov ? 2 * Math.atan(Math.tan(cam.fov * DEG / 2) / cam.aspectRatio) : cam.fov * DEG;
    const k = 2 * Math.tan(fovV / 2) * this.goal.dist / h;
    const right = this.camera.right.clone().mulScalar(-dx * k);
    const up = this.camera.up.clone().mulScalar(dy * k);
    const t = this.goal.target.add(right).add(up);
    // keep the target inside the scene box
    const b = this.limits.target;
    t.set(clamp(t.x, b[0], b[3]), clamp(t.y, b[1], b[4]), clamp(t.z, b[2], b[5]));
  }

  // Cut to another scene: new home and limits, camera placed at home at once.
  setView(view) {
    this.home = view;
    this.limits = view.limits;
    this.autoSpeed = view.autoSpeed ?? 5;
    this.target.set(...view.target);
    this.yaw = view.yaw; this.pitch = view.pitch; this.dist = view.dist;
    this.goal = { target: this.target.clone(), yaw: this.yaw, pitch: this.pitch, dist: this.dist };
    this.vel.yaw = this.vel.pitch = 0;
    this.autoDir = 1; this.autoVel = 0; this.autoRamp = 0; this.swayT = 0;
  }

  reset() {
    const h = this.home;
    // take the short way home
    this.goal.yaw = this.yaw + wrap180(h.yaw - this.yaw);
    this.goal.pitch = h.pitch;
    this.goal.dist = h.dist;
    this.goal.target.set(...h.target);
    this.vel.yaw = this.vel.pitch = 0;
    this.autoDir = 1;
  }

  update(dt) {
    dt = Math.min(dt, 0.1);
    const g = this.goal;

    // flick inertia
    if (!this.interacting && (Math.abs(this.vel.yaw) > 0.01 || Math.abs(this.vel.pitch) > 0.01)) {
      g.yaw += this.vel.yaw * dt;
      g.pitch = clamp(g.pitch + this.vel.pitch * dt, this.limits.pitch[0], this.limits.pitch[1]);
      const f = Math.exp(-dt * 3.2);
      this.vel.yaw *= f; this.vel.pitch *= f;
    }

    // idle auto-rotate: soft start, eased sway inside autoRange, pitch breathes around home
    this.idle += dt;
    if (this.autoRotate && !this.interacting && this.idle > this.idleDelay) {
      this.autoRamp = Math.min(1, this.autoRamp + dt / 2.5);
      const ramp = this.autoRamp * this.autoRamp * (3 - 2 * this.autoRamp);
      const range = this.home.autoRange;
      if (range) {
        const rel = wrap180(g.yaw - this.home.yaw);
        if (rel > range[1]) this.autoDir = -1;
        else if (rel < range[0]) this.autoDir = 1;
      }
      this.autoVel += (this.autoDir * this.autoSpeed - this.autoVel) * damp(0.9, dt);
      g.yaw += this.autoVel * ramp * dt;
      this.swayT += dt * ramp;
      const pitchGoal = this.home.pitch + Math.sin(this.swayT * 0.23) * (this.home.autoPitch ?? 0);
      g.pitch += (pitchGoal - g.pitch) * damp(0.4, dt) * ramp;
    } else {
      this.autoVel = 0;
    }

    // yaw window (scene captured from the front only); the camera still eases into the edge
    const clamped = this._clampYaw(g.yaw);
    if (clamped !== g.yaw) { g.yaw = clamped; this.vel.yaw = 0; }

    const k = damp(this.interacting ? 14 : 7, dt);
    this.yaw += (g.yaw - this.yaw) * k;
    this.pitch += (g.pitch - this.pitch) * k;
    this.dist += (g.dist - this.dist) * damp(7, dt);
    this.target.lerp(this.target, g.target, damp(8, dt));

    const cy = Math.cos(this.pitch * DEG);
    const pos = new pc.Vec3(
      this.target.x + Math.sin(this.yaw * DEG) * cy * this.dist,
      this.target.y + Math.sin(this.pitch * DEG) * this.dist,
      this.target.z + Math.cos(this.yaw * DEG) * cy * this.dist,
    );
    this.camera.setPosition(pos);
    this.camera.lookAt(this.target);
  }

  get heading() { return ((this.yaw % 360) + 360) % 360; }
  get zoom01() { const [a, b] = this.limits.dist; return 1 - (Math.log(this.dist / a) / Math.log(b / a)); }
}

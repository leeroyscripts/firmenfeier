// Camera control: mouse, touch and pinch, with damping, flick inertia and idle auto-rotate.
// Two modes, chosen per scene:
//   orbit  around a target (group scans, captured from one side), yaw window per scene
//   free   look around from where you stand and move through the scene (panorama scans):
//          `target` is the eye, yaw/pitch are the view direction, nothing is limited but a box
import * as pc from 'playcanvas';

const DEG = Math.PI / 180;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const damp = (k, dt) => 1 - Math.exp(-k * dt);
const wrap180 = (a) => ((a + 180) % 360 + 360) % 360 - 180;

export class Orbit {
  constructor(camera, element, view) {
    this.camera = camera;
    this.el = element;

    this.vel = { yaw: 0, pitch: 0 };
    this.autoRotate = true;
    this.idle = 0;
    this.idleDelay = 4.5;
    this.interacting = false;
    this.onInteract = null;
    this.keys = new Set();

    this.target = new pc.Vec3();
    this.setView(view);

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
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
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
        if (this.free) this._walk(Math.log(Math.max(1, s.span) / Math.max(1, this.pinch.span)) * this.home.moveSpeed * 1.6);
        else this.goal.dist = clamp(this.goal.dist * (this.pinch.span / Math.max(1, s.span)), this.limits.dist[0], this.limits.dist[1]);
        this._pan(s.cx - this.pinch.cx, s.cy - this.pinch.cy);
      }
      this.pinch = s;
    } else {
      const pan = p.button === 1 || p.button === 2 || e.shiftKey || e.ctrlKey || e.metaKey;
      if (pan) this._pan(dx, dy);
      else {
        const k = this._rotSpeed();
        // orbit: the scan turns with the finger; free: the world follows the finger
        const dyaw = this.free ? dx * k : -dx * k;
        const dpitch = dy * k * 0.8;
        this.goal.yaw = this._clampYaw(this.goal.yaw + dyaw);
        this.goal.pitch = clamp(this.goal.pitch + dpitch, this.limits.pitch[0], this.limits.pitch[1]);
        // velocity for flick inertia (deg/s), smoothed and capped
        const cap = this.free ? 160 : 90;
        this.vel.yaw = clamp(this.vel.yaw * 0.6 + (dyaw / dt) * 0.4, -cap, cap);
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
    if (this.free) this._walk(-delta * 0.0025 * this.home.moveSpeed);
    else this.goal.dist = clamp(this.goal.dist * Math.exp(delta * 0.0011), this.limits.dist[0], this.limits.dist[1]);
    this._touch();
  }

  _key(e) {
    const key = e.key.toLowerCase();
    // left/right arrows switch scenes (main.js); free mode walks with WASD (held), orbit turns with A/D
    if (this.free && (key === 'shift' || (key.length === 1 && 'wasdqe'.includes(key)))) {
      this.keys.add(key);
      this._touch();
      return;
    }
    const step = e.shiftKey ? 15 : 5;
    const look = this.free ? -1 : 1; // free: up arrow looks up
    const map = {
      a: () => (this.goal.yaw = this._clampYaw(this.goal.yaw + step)),
      d: () => (this.goal.yaw = this._clampYaw(this.goal.yaw - step)),
      arrowup: () => (this.goal.pitch = clamp(this.goal.pitch + step * look, ...this.limits.pitch)),
      arrowdown: () => (this.goal.pitch = clamp(this.goal.pitch - step * look, ...this.limits.pitch)),
      '+': () => (this.goal.dist = clamp(this.goal.dist * 0.88, ...this.limits.dist)),
      '=': () => (this.goal.dist = clamp(this.goal.dist * 0.88, ...this.limits.dist)),
      '-': () => (this.goal.dist = clamp(this.goal.dist * 1.14, ...this.limits.dist)),
      r: () => this.reset(),
    };
    const fn = map[key];
    if (fn && !(this.free && (key === '+' || key === '=' || key === '-'))) { fn(); this._touch(); }
  }

  _pinchState() {
    const [a, b] = [...this.pointers.values()];
    return { span: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
  }

  _rotSpeed() {
    // orbit: a full swipe across the screen covers ~120 deg, enough for the narrow capture window;
    // free: about 200 deg, so turning around takes two swipes
    const deg = this.free ? 200 : 120;
    return deg / Math.max(320, Math.min(this.el.clientWidth, this.el.clientHeight * 1.4));
  }

  _clampYaw(yaw) {
    const yl = this.limits.yaw;
    if (!yl) return yaw;
    return clamp(yaw, this.home.yaw + yl[0], this.home.yaw + yl[1]);
  }

  _clampTarget(t) {
    const b = this.limits.target;
    t.set(clamp(t.x, b[0], b[3]), clamp(t.y, b[1], b[4]), clamp(t.z, b[2], b[5]));
  }

  _pan(dx, dy) {
    const cam = this.camera.camera;
    const h = this.el.clientHeight || 1;
    const fovV = cam.horizontalFov ? 2 * Math.atan(Math.tan(cam.fov * DEG / 2) / cam.aspectRatio) : cam.fov * DEG;
    // free mode slides as if the finger held a point a few metres away
    const depth = this.free ? this.home.moveSpeed * 2.5 : this.goal.dist;
    const k = 2 * Math.tan(fovV / 2) * depth / h;
    const right = this.camera.right.clone().mulScalar(-dx * k);
    const up = this.camera.up.clone().mulScalar(dy * k);
    this._clampTarget(this.goal.target.add(right).add(up));
  }

  // free mode: view direction from yaw/pitch (yaw 0 looks along -z, positive pitch looks up)
  _forward(yaw, pitch, out = new pc.Vec3()) {
    const cp = Math.cos(pitch * DEG);
    return out.set(-Math.sin(yaw * DEG) * cp, Math.sin(pitch * DEG), -Math.cos(yaw * DEG) * cp);
  }

  // free mode: move the eye along the view direction (negative = back)
  _walk(amount) {
    const f = this._forward(this.goal.yaw, this.goal.pitch);
    this._clampTarget(this.goal.target.add(f.mulScalar(amount)));
  }

  // New scene: home, limits and mode; the camera is placed at home at once.
  setView(view) {
    this.home = view;
    this.limits = view.limits;
    this.free = view.mode === 'free';
    this.autoSpeed = view.autoSpeed ?? 5;
    this.target.set(...view.target);
    this.yaw = view.yaw; this.pitch = view.pitch; this.dist = view.dist ?? 0;
    this.goal = { target: this.target.clone(), yaw: this.yaw, pitch: this.pitch, dist: this.dist };
    this.vel.yaw = this.vel.pitch = 0;
    this.autoDir = 1; this.autoVel = 0; this.autoRamp = 0; this.swayT = 0;
    this.keys.clear();
  }

  reset() {
    const h = this.home;
    // take the short way home
    this.goal.yaw = this.yaw + wrap180(h.yaw - this.yaw);
    this.goal.pitch = h.pitch;
    this.goal.dist = h.dist ?? 0;
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

    // free mode: held keys walk (W/S), strafe (A/D) and rise (E/Q)
    if (this.free && this.keys.size) {
      const v = this.home.moveSpeed * (this.keys.has('shift') ? 2 : 1) * dt;
      const k = this.keys;
      const fwd = this._forward(g.yaw, 0);
      const right = new pc.Vec3(-fwd.z, 0, fwd.x);
      const move = new pc.Vec3()
        .add(fwd.mulScalar((k.has('w') - k.has('s')) * v))
        .add(right.mulScalar((k.has('d') - k.has('a')) * v));
      move.y += (k.has('e') - k.has('q')) * v;
      this._clampTarget(g.target.add(move));
      this.idle = 0;
    }

    // idle auto-rotate: soft start, eased sway inside autoRange (or all the way round), pitch breathes around home
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
    this.target.lerp(this.target, g.target, damp(8, dt));

    if (this.free) {
      this.camera.setPosition(this.target);
      this.camera.lookAt(this._forward(this.yaw, this.pitch).add(this.target));
      // readout: how far you walked from the capture point
      this.dist = this.target.distance(new pc.Vec3(...this.home.target));
      return;
    }

    this.dist += (g.dist - this.dist) * damp(7, dt);
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
  get zoom01() {
    if (this.free) return 1 - Math.min(1, this.dist / (this.home.reach ?? 10));
    const [a, b] = this.limits.dist;
    return 1 - (Math.log(this.dist / a) / Math.log(b / a));
  }
}

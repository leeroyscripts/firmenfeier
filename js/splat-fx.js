// Splat shader effect (unified gsplat material, world space, WebGL2 / GLSL).
// 1. Reveal in two waves from the table: a fast, sparse point scan sweeps the scene,
//    then a slower wave resolves the points into the captured splats.
// 2. Edge dissolve: beyond a radius the scan breaks up into sparse floating points, so the group
//    sits in the abstract void instead of ending in a hard cut.
// 3. Scene exit: a wave from the same centre turns the scan back into points, which drift
//    outward and up and fade, before the next scene is revealed.

const GLSL = /* glsl */`
uniform vec3 uFxOrigin;
uniform vec3 uFxAxisScale;   // ellipsoid shaping of distance (x, y, z)
uniform float uFxTime;
uniform float uFxDots;       // point wave radius (m)
uniform float uFxFront;      // resolve wave radius (m)
uniform float uFxBand;       // point -> scan resolve band (m)
uniform float uFxDensity;    // share of splats shown as points during the reveal
uniform vec3 uFxTint;        // HUD accent, linear
uniform vec4 uFxEdge;        // x start, y end, z strength, w share of points kept far out
uniform float uFxPoint;      // point size (m)
uniform vec4 uFxOut;         // exit wave: x radius (m), y fade length (m), z drift (m)

float fx_d;
float fx_h;
float fx_dot;     // 0 not reached, 1 point visible
float fx_solid;   // 0 point, 1 captured splat
float fx_edge;    // 0 scan, 1 fully dissolved
float fx_pt;      // 1 if this splat belongs to the visible point cloud
float fx_out;     // exit wave: 0 untouched, 1 turned into a point
float fx_gone;    // exit wave: 0 point, 1 drifted away

float fxHash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }

void modifySplatCenter(inout vec3 center) {
    fx_d = length((center - uFxOrigin) * uFxAxisScale);
    fx_h = fxHash(center);
    float jitter = (fx_h - 0.5) * 0.45;

    fx_dot = clamp((uFxDots - fx_d + jitter) / 0.35, 0.0, 1.0);
    fx_solid = clamp((uFxFront - fx_d + jitter) / uFxBand, 0.0, 1.0);
    fx_edge = uFxEdge.z * smoothstep(uFxEdge.x, uFxEdge.y, fx_d + jitter);
    fx_pt = step(fx_h, mix(uFxDensity, uFxEdge.w, fx_edge));
    fx_out = clamp((uFxOut.x - fx_d + jitter) / uFxBand, 0.0, 1.0);
    fx_gone = clamp((uFxOut.x - fx_d + jitter - uFxBand) / uFxOut.y, 0.0, 1.0);

    // points float; the dissolving edge drifts upward
    float wave = fx_dot * (1.0 - fx_solid);
    center.y += sin(uFxTime * 0.9 + fx_h * 6.2832) * 0.012 * (wave + fx_edge + fx_out);
    center.y += fx_edge * fx_edge * (0.05 + 0.04 * sin(uFxTime * 0.35 + fx_h * 12.0));

    // exit: points scatter away from the centre and rise
    if (fx_gone > 0.0) {
        vec3 away = center - uFxOrigin;
        away /= max(length(away), 0.001);
        vec3 scatter = vec3(fx_h, fract(fx_h * 7.31), fract(fx_h * 13.7)) - 0.5;
        center += (away * 0.6 + vec3(0.0, 0.7, 0.0) + scatter) * (fx_gone * fx_gone * uFxOut.z);
    }
}

void modifySplatRotationScale(vec3 originalCenter, vec3 modifiedCenter, inout vec4 rotation, inout vec3 scale) {
    float solid = smoothstep(0.0, 1.0, fx_solid * (1.0 - fx_edge) * (1.0 - fx_out));
    if (solid >= 0.999) return;
    float pointVis = fx_dot * fx_pt * (1.0 - fx_gone);
    if (solid <= 0.001 && pointVis <= 0.001) {
        scale = vec3(0.0);
        return;
    }
    float origSize = gsplatGetSizeFromScale(scale);
    // points grow a little with distance so the far cloud stays visible
    float ps = min(uFxPoint * (0.45 + fx_h) * (1.0 + fx_d * 0.18), origSize) * pointVis;
    scale = mix(vec3(ps), scale, solid);
}

void modifySplatColor(vec3 center, inout vec4 color) {
    float solid = smoothstep(0.0, 1.0, fx_solid * (1.0 - fx_edge) * (1.0 - fx_out));
    if (solid >= 0.999) return;
    float pt = 1.0 - solid;

    // flashes on the leading edges of all waves
    float dotFlash = fx_dot * (1.0 - fx_dot) * 4.0;
    float rim = fx_solid * (1.0 - fx_solid) * 4.0 * (1.0 - fx_edge);
    float outRim = fx_out * (1.0 - fx_out) * 4.0;
    color.rgb += uFxTint * (dotFlash * 0.9 * pt + rim * 0.7 + outRim * 0.8);

    // points carry the accent tint, the scan keeps its captured colour
    color.rgb = mix(color.rgb, color.rgb * 0.45 + uFxTint * 0.6, pt * 0.75);
    color.a = mix(color.a, max(color.a, 0.8), pt) * mix(1.0, 0.8, fx_edge) * (1.0 - fx_gone * fx_gone);
}
`;

export class SplatFx {
  constructor(app, opts) {
    this.app = app;
    this.material = null;
    this.time = 0;
    this.setOptions(opts);
  }

  // New scene: everything hidden until reveal().
  setOptions(opts) {
    this.o = opts;
    this.dots = -1;
    this.front = -1;
    this.out = -1e4;
    this.revealing = false;
    this.dissolving = false;
  }

  get busy() { return this.revealing || this.dissolving; }

  attach() {
    const material = this.app.scene.gsplat.material;
    material.getShaderChunks('glsl').set('gsplatModifyVS', GLSL);
    material.update();
    this.material = material;
    this._push();
  }

  // Start the reveal; resolves when the resolve wave has passed the whole scene
  // (or early, when a dissolve takes over).
  reveal() {
    this.dots = -0.5;
    this.front = -this.o.band;
    this.revealT = 0;
    this.revealing = true;
    return new Promise((res) => (this._revealed = res));
  }

  // Exit wave; resolves when every splat has drifted away. A running reveal stops where it is.
  dissolve() {
    if (this.revealing) { this.revealing = false; this._revealed?.(); }
    this.out = -this.o.band;
    this.outT = 0;
    this.dissolving = true;
    return new Promise((res) => (this._dissolved = res));
  }

  update(dt) {
    if (!this.material) return;
    this.time += dt;
    if (this.revealing) {
      const r = this.o.reveal;
      this.revealT += dt;
      // both waves speed up as they travel
      this.dots += (r.dotSpeed + r.accel * Math.max(0, this.dots)) * dt;
      if (this.revealT > r.delay) this.front += (r.speed + r.accel * Math.max(0, this.front)) * dt;
      if (this.front > r.end) {
        this.dots = this.front = 1e4;
        this.revealing = false;
        this._revealed?.();
      }
    }
    if (this.dissolving) {
      const d = this.o.dissolve;
      this.outT += dt;
      this.out += (d.speed + d.accel * Math.max(0, this.out)) * dt;
      if (this.out > d.end) {
        this.dissolving = false;
        this._dissolved?.();
      }
    }
    this._push();
  }

  _push() {
    const m = this.material, o = this.o;
    m.setParameter('uFxOrigin', o.origin);
    m.setParameter('uFxAxisScale', o.axisScale);
    m.setParameter('uFxTime', this.time);
    m.setParameter('uFxDots', this.dots);
    m.setParameter('uFxFront', this.front);
    m.setParameter('uFxBand', o.band);
    m.setParameter('uFxDensity', o.density);
    m.setParameter('uFxTint', o.tint);
    m.setParameter('uFxEdge', o.edge);
    m.setParameter('uFxPoint', o.point);
    m.setParameter('uFxOut', [this.out, o.dissolve.fade, o.dissolve.drift, 0]);
    m.update();
  }
}

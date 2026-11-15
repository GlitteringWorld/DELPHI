import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider"

/**
 * GroundFlow  -  opening sequence: a swarm of individual twinkling stars is born on the
 * floor and drifts up together toward the ceiling, each one floating on its own path.
 * They gather overhead (pulling the viewer's gaze up), then softly fade away.
 *
 *  - Same star / dust sprites as the idle sparkles around the shapes (same procedural texture).
 *  - Plays automatically once at Lens start (set Loop to repeat). Call restart() to replay;
 *    onFinished(cb) tells you when it is over so the ceiling visual can take over.
 *  - getTarget() returns the point above the viewer where the stars gather.
 *  - One root script, scene built at runtime, CPU MeshBuilder geometry, Image material clone.
 *    Portable to Lens Studio 5.15.4.
 */

// ---------------------------------------------------------------- tuning
const STARS = 800 // individual stars / sparkles in the cluster
const FORM_SPAN = 3.0 // s over which the stars appear out of the floor into the cloud
const LIFT_AT = 1.2 // s before the whole cloud starts to lift
const RISE = 8.0 // s the cloud takes to float up to the ceiling
const HOLD_MIN = 3.0 // s it floats around up there before fading
const HOLD_MAX = 6.0
const FADE = 2.2 // s fade-out
const CLUSTER_R = 30 // cm radius of the cloud
const CLUSTER_DIST = 120 // cm in front of the viewer where it forms
const GLOWS = 0 // (no glow pools: just stars)
const BEACON_N = 80

const STRIDE = 5 // position(3) + uv(2)

// ---------------------------------------------------------------- atlas
// 4 columns x 3 rows of 64px tiles.
//  row 0: glows  [silver, blue, deep blue, ice white]
//  row 1: stars  [silver, blue, white, bokeh]
//  row 2: [ribbon silver, ribbon blue, glow violet, ribbon violet]
const ATLAS_COLS = 4
const ATLAS_ROWS = 3
const TILE = 64
const GLOW_SILVER = [0, 0],
  GLOW_BLUE = [1, 0],
  GLOW_DEEP = [2, 0],
  GLOW_ICE = [3, 0]
const STAR_SILVER = [0, 1],
  STAR_BLUE = [1, 1],
  STAR_WHITE = [2, 1],
  BOKEH = [3, 1]
const RIB_SILVER = [0, 2],
  RIB_BLUE = [1, 2],
  GLOW_VIOLET = [2, 2],
  RIB_VIOLET = [3, 2]
const RIB_TILES = [RIB_SILVER, RIB_BLUE, RIB_VIOLET]

const C_SILVER = [0.8, 0.86, 0.96]
const C_BLUE = [0.3, 0.58, 1.0]
const C_DEEP = [0.22, 0.35, 0.95]
const C_ICE = [0.92, 0.97, 1.0]
const C_VIOLET = [0.62, 0.5, 1.0]

function buildAtlas(): Texture {
  const W = TILE * ATLAS_COLS
  const H = TILE * ATLAS_ROWS
  let tex: Texture
  try {
    // newer API; falls back to create() on older Lens Studio (5.15)
    tex = (ProceduralTextureProvider as any).createWithFormat(W, H, (global as any).TextureFormat.RGBA8Unorm)
    if (!tex) throw new Error("no createWithFormat")
  } catch (e) {
    tex = ProceduralTextureProvider.create(W, H, Colorspace.RGBA)
  }
  const ctrl = tex.control as ProceduralTextureProvider
  const data = new Uint8Array(W * H * 4)

  function put(col: number, row: number, color: number[], fn: (dx: number, dy: number) => number): void {
    for (let py = 0; py < TILE; py++) {
      for (let px = 0; px < TILE; px++) {
        const dx = ((px + 0.5) / TILE) * 2 - 1
        const dy = ((py + 0.5) / TILE) * 2 - 1
        let f = fn(dx, dy)
        f = f < 0 ? 0 : f > 1 ? 1 : f
        const o = ((row * TILE + py) * W + (col * TILE + px)) * 4
        data[o] = Math.round(color[0] * f * 255)
        data[o + 1] = Math.round(color[1] * f * 255)
        data[o + 2] = Math.round(color[2] * f * 255)
        data[o + 3] = Math.round(f * 255)
      }
    }
  }
  const glow = (dx: number, dy: number): number => {
    const r = Math.sqrt(dx * dx + dy * dy)
    if (r >= 1) return 0
    return Math.pow(1 - r, 2.2) + Math.pow(Math.max(0, 1 - r * 3.2), 2) * 0.7
  }
  const star = (dx: number, dy: number): number => {
    const r = Math.sqrt(dx * dx + dy * dy)
    const ax = Math.abs(dx),
      ay = Math.abs(dy)
    const core = r < 1 ? Math.pow(Math.max(0, 1 - r * 2.2), 2) : 0
    const sh = Math.exp(-ay * 16) * Math.pow(Math.max(0, 1 - ax), 2.4)
    const sv = Math.exp(-ax * 16) * Math.pow(Math.max(0, 1 - ay), 2.4)
    return Math.max(core * 1.1, sh, sv)
  }
  // dim out-of-focus disc with a slightly brighter rim (the soft bokeh in the reference)
  const bokeh = (dx: number, dy: number): number => {
    const r = Math.sqrt(dx * dx + dy * dy)
    if (r >= 0.97) return 0
    const edge = Math.min(1, (0.97 - r) * 14)
    return (0.16 * (1 - r * 0.5) + 0.1 * Math.exp(-Math.pow((r - 0.8) / 0.15, 2))) * edge
  }
  // thin bright core + soft halo: the glowing filaments
  const ribbon = (_dx: number, dy: number): number => 0.4 * Math.exp(-dy * dy * 55) + 0.18 * Math.exp(-dy * dy * 6)

  put(GLOW_SILVER[0], GLOW_SILVER[1], C_SILVER, glow)
  put(GLOW_BLUE[0], GLOW_BLUE[1], C_BLUE, glow)
  put(GLOW_DEEP[0], GLOW_DEEP[1], C_DEEP, glow)
  put(GLOW_ICE[0], GLOW_ICE[1], C_ICE, glow)
  put(GLOW_VIOLET[0], GLOW_VIOLET[1], C_VIOLET, glow)
  put(STAR_SILVER[0], STAR_SILVER[1], [0.9, 0.94, 1.0], star)
  put(STAR_BLUE[0], STAR_BLUE[1], [0.5, 0.75, 1.0], star)
  put(STAR_WHITE[0], STAR_WHITE[1], [1, 1, 1], star)
  put(BOKEH[0], BOKEH[1], [0.6, 0.76, 1.0], bokeh)
  put(RIB_SILVER[0], RIB_SILVER[1], [0.82, 0.9, 1.0], ribbon)
  put(RIB_BLUE[0], RIB_BLUE[1], [0.34, 0.62, 1.0], ribbon)
  put(RIB_VIOLET[0], RIB_VIOLET[1], [0.62, 0.5, 1.0], ribbon)

  ctrl.setPixels(0, 0, W, H, data)
  return tex
}

// ---------------------------------------------------------------- helpers
function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x
}
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}
function tileRect(t: number[]): number[] {
  const e = 0.004
  return [t[0] / ATLAS_COLS + e, t[1] / ATLAS_ROWS + e, (t[0] + 1) / ATLAS_COLS - e, (t[1] + 1) / ATLAS_ROWS - e]
}
/** Fine dust colours: mostly blue / ice / silver with a violet tint (like the reference). */
function pickDust(blueBias: number): number[] {
  const r = Math.random()
  const ice = 0.2
  const silver = 0.2 - 0.1 * blueBias
  const violet = 0.16
  const blue = 0.3 + 0.1 * blueBias
  if (r < ice) return GLOW_ICE
  if (r < ice + silver) return GLOW_SILVER
  if (r < ice + silver + violet) return GLOW_VIOLET
  if (r < ice + silver + violet + blue) return GLOW_BLUE
  return GLOW_DEEP
}
function pickStar(blueBias: number): number[] {
  const r = Math.random()
  if (r < 0.4) return STAR_WHITE
  return r < 0.4 + 0.6 * (1 - blueBias * 0.7) ? STAR_SILVER : STAR_BLUE
}
function flow(x: number, y: number, z: number, t: number, out: number[]): void {
  out[0] = Math.sin(y * 0.19 + t * 0.9) - Math.cos(z * 0.16 - t * 0.7)
  out[1] = Math.sin(z * 0.21 + t * 0.8) - Math.cos(x * 0.17 + t * 0.95)
  out[2] = Math.sin(x * 0.18 + t * 1.1) - Math.cos(y * 0.2 - t * 0.6)
}
function gauss(): number {
  return (Math.random() + Math.random() + Math.random() - 1.5) / 1.5
}

// ---------------------------------------------------------------- mesh helpers
function writeQuad(
  d: number[],
  o: number,
  x: number,
  y: number,
  z: number,
  rx: number,
  ry: number,
  rz: number,
  ux: number,
  uy: number,
  uz: number,
  uv: number[]
): number {
  d[o++] = x - rx - ux
  d[o++] = y - ry - uy
  d[o++] = z - rz - uz
  d[o++] = uv[0]
  d[o++] = uv[1]
  d[o++] = x + rx - ux
  d[o++] = y + ry - uy
  d[o++] = z + rz - uz
  d[o++] = uv[2]
  d[o++] = uv[1]
  d[o++] = x + rx + ux
  d[o++] = y + ry + uy
  d[o++] = z + rz + uz
  d[o++] = uv[2]
  d[o++] = uv[3]
  d[o++] = x - rx + ux
  d[o++] = y - ry + uy
  d[o++] = z - rz + uz
  d[o++] = uv[0]
  d[o++] = uv[3]
  return o
}

function makeMesh(
  parent: SceneObject,
  name: string,
  material: Material,
  totalVerts: number,
  indices: number[]
): { obj: SceneObject; builder: MeshBuilder; data: number[] } {
  const obj = global.scene.createSceneObject(name)
  obj.setParent(parent)
  const builder = new MeshBuilder([
    { name: "position", components: 3 },
    { name: "texture0", components: 2 },
  ])
  builder.topology = MeshTopology.Triangles
  builder.indexType = MeshIndexType.UInt16
  const data = new Array(totalVerts * STRIDE).fill(0)
  builder.appendVerticesInterleaved(data)
  builder.appendIndices(indices)
  const rmv = obj.createComponent("Component.RenderMeshVisual") as RenderMeshVisual
  rmv.mesh = builder.getMesh()
  rmv.mainMaterial = material
  builder.updateMesh()
  return { obj: obj, builder: builder, data: data }
}

function pushData(builder: MeshBuilder, data: number[], totalVerts: number): void {
  builder.eraseVertices(0, totalVerts)
  builder.appendVerticesInterleaved(data)
  builder.updateMesh()
}

function quadIndices(first: number, count: number, out: number[]): void {
  for (let j = 0; j < count; j++) {
    const c = first + j * 4
    out.push(c, c + 1, c + 2, c, c + 2, c + 3)
  }
}

/** Fill a particle's quad extents (billboard, with optional spin for sparkles). */
function billboard(
  isStar: boolean,
  size: number,
  time: number,
  ph: number,
  r: vec3,
  u: vec3,
  out: number[]
): void {
  if (isStar) {
    const a = time * 1.0 + ph
    const c = Math.cos(a),
      s = Math.sin(a)
    out[0] = (r.x * c + u.x * s) * size
    out[1] = (r.y * c + u.y * s) * size
    out[2] = (r.z * c + u.z * s) * size
    out[3] = (-r.x * s + u.x * c) * size
    out[4] = (-r.y * s + u.y * c) * size
    out[5] = (-r.z * s + u.z * c) * size
  } else {
    out[0] = r.x * size
    out[1] = r.y * size
    out[2] = r.z * size
    out[3] = u.x * size
    out[4] = u.y * size
    out[5] = u.z * size
  }
}


// ---------------------------------------------------------------- the rising cluster
class Swarm {
  readonly obj: SceneObject
  private builder: MeshBuilder
  private data: number[]
  private idx: number[] = []

  private uv: number[][] = []
  private star: boolean[] = []
  private bokeh: boolean[] = []
  private lag: number[] = []
  private glowUV: number[][] = []
  private ctr = [0, 0, 0, 1]
  private ctr2 = [0, 0, 0, 1]
  private ox: number[] = []
  private oy: number[] = []
  private oz: number[] = []
  private delay: number[] = []
  private hold: number[] = []
  private base: number[] = []
  private seed: number[] = []
  private spin: number[] = []
  private amp: number[] = []
  private floorY = 0
  private sx = 0
  private sz = 0
  private tx = 0
  private ty = 0
  private tz = 0
  private fl = [0, 0, 0]
  private bb = [0, 0, 0, 0, 0, 0]
  /** total length of the sequence in seconds */
  duration = 0
  /** 0..1: how much of the cluster has arrived and is hovering overhead */
  arrivedK = 0

  constructor(parent: SceneObject, material: Material) {
    quadIndices(0, STARS + GLOWS, this.idx)
    const m = makeMesh(parent, "RisingStars", material, (STARS + GLOWS) * 4, this.idx)
    this.glowUV = [tileRect(GLOW_DEEP), tileRect(GLOW_VIOLET), tileRect(GLOW_BLUE)]
    this.obj = m.obj
    this.builder = m.builder
    this.data = m.data
    this.obj.enabled = false
  }

  /** One big cloud of stars: it forms on the floor in front of the viewer and rises as one. */
  setup(cam: vec3, fx: number, fz: number, floorY: number, target: vec3): void {
    this.floorY = floorY
    this.sx = cam.x + fx * CLUSTER_DIST
    this.sz = cam.z + fz * CLUSTER_DIST
    this.tx = target.x
    this.ty = target.y
    this.tz = target.z
    this.uv.length = 0
    this.star.length = 0
    for (let j = 0; j < STARS; j++) {
      const roll = Math.random()
      const st = roll < 0.36
      const bk = !st && roll < 0.42
      this.star[j] = st
      this.bokeh[j] = bk
      this.uv[j] = tileRect(st ? pickStar(0.5) : bk ? BOKEH : pickDust(0.5))
      // a quarter of the stars lag behind the cloud as it rises: a sparkling tail
      this.lag[j] = Math.random() < 0.25 ? lerp(0.04, 0.22, Math.random()) : 0
      // a soft round cloud, densest in the middle
      const a = Math.random() * 6.2832
      const b = Math.acos(2 * Math.random() - 1)
      const rr = CLUSTER_R * Math.pow(Math.random(), 0.55)
      this.ox[j] = Math.sin(b) * Math.cos(a) * rr
      this.oy[j] = Math.cos(b) * rr * 1.25
      this.oz[j] = Math.sin(b) * Math.sin(a) * rr
      this.delay[j] = Math.pow(Math.random(), 1.2) * FORM_SPAN
      this.hold[j] = lerp(HOLD_MIN, HOLD_MAX, Math.random())
      this.base[j] = st ? lerp(1.2, 2.2, Math.random()) : bk ? lerp(0.6, 1.2, Math.random()) : lerp(0.32, 0.65, Math.random())
      this.seed[j] = Math.random() * 6.28
      this.spin[j] = lerp(0.3, 0.9, Math.random()) * (Math.random() < 0.5 ? -1 : 1)
      this.amp[j] = lerp(4, 13, Math.random())
    }
    this.duration = LIFT_AT + RISE + HOLD_MAX + FADE
    this.obj.enabled = true
  }

  stop(): void {
    this.obj.enabled = false
  }

  /** centre of the cloud for climb progress f (out: x, y, z, spread) */
  private centre(f: number, out: number[]): void {
    const e = 0.3 * f + 0.7 * (f * f * (3 - 2 * f))
    out[0] = lerp(this.sx, this.tx, e) + Math.sin(f * 5 + 1) * 14 * Math.sin(Math.PI * f)
    out[2] = lerp(this.sz, this.tz, e) + Math.cos(f * 4) * 10 * Math.sin(Math.PI * f)
    out[1] = lerp(this.floorY + CLUSTER_R * 0.9, this.ty, Math.pow(e, 1.05))
    out[3] = 1 + 0.55 * e // the cloud opens up a little as it rises
  }

  update(t: number, time: number, r: vec3, u: vec3): void {
    const d = this.data
    const bb = this.bb
    const fl = this.fl
    const c = this.ctr
    const c2 = this.ctr2

    // the whole cloud climbs together: slow lift, steady rise, easing as it settles overhead
    const f = clamp01((t - LIFT_AT) / RISE)
    this.centre(f, c)
    const cx = c[0]
    const cy = c[1]
    const cz = c[2]
    const spread = c[3]
    // one shared flow for the whole body: it drifts and breathes as a single cloud
    flow(cx * 0.35, cy * 0.35, cz * 0.35, time * 0.35, fl)
    const bx = fl[0] * 9
    const by = fl[1] * 6 + Math.sin(time * 0.8) * 3
    const bz = fl[2] * 9
    let bk = clamp01(t / 2.5) // the whole cloud lifts off the floor together
    bk = bk * bk * (3 - 2 * bk)

    let arrived = 0
    for (let j = 0; j < STARS; j++) {
      const o = j * 4 * STRIDE
      const lt = t - this.delay[j]
      const holdEnd = LIFT_AT + RISE + this.hold[j]
      const fadeT = t - holdEnd
      if (lt < 0 || fadeT > FADE) {
        for (let q = 0; q < 4 * STRIDE; q++) d[o + q] = 0
        continue
      }
      // every star keeps its place in the cloud and moves with it (shared flow);
      // tail stars trail a little behind the body
      let sp = spread
      let x: number, y: number, z: number
      if (this.lag[j] > 0) {
        this.centre(Math.max(0, f - this.lag[j]), c2)
        sp = c2[3]
        x = c2[0] + bx + this.ox[j] * sp
        y = c2[1] + by + this.oy[j] * sp - this.lag[j] * 40
        z = c2[2] + bz + this.oz[j] * sp
      } else {
        x = cx + bx + this.ox[j] * sp
        y = cy + by + this.oy[j] * sp
        z = cz + bz + this.oz[j] * sp
      }
      y = lerp(this.floorY + 1, y, bk)

      // a gentle float of its own, so the cloud never looks static
      const oa = this.seed[j] + time * this.spin[j]
      flow(x, y, z, time * 0.5 + this.seed[j], fl)
      x += fl[0] * 3.2 + Math.cos(oa) * 2.2
      y += fl[1] * 2.6 + Math.sin(oa * 1.3) * 1.8
      z += fl[2] * 3.2 + Math.sin(oa) * 2.2

      let k = clamp01(lt / 0.9)
      k = k * k * (3 - 2 * k)
      const fadeOut = fadeT > 0 ? clamp01(1 - fadeT / FADE) : 1
      k *= fadeOut
      if (f >= 1) arrived += fadeOut
      let size = this.base[j] * k
      if (this.star[j]) {
        // sharp glints: each star flares bright now and then, like a camera-flash twinkle
        const pulse = Math.max(0, Math.sin(time * (2.5 + (this.seed[j] * 3) % 3.5) + this.seed[j] * 7))
        size *= (0.3 + 0.7 * pulse * pulse * pulse) * 3.4
      } else if (this.bokeh[j]) {
        size *= 2.2
      } else {
        size *= 2.7 * (0.7 + 0.3 * Math.sin(time * 7 + this.seed[j] * 5))
      }
      billboard(this.star[j], size, time, this.seed[j], r, u, bb)
      writeQuad(d, o, x, y, z, bb[0], bb[1], bb[2], bb[3], bb[4], bb[5], this.uv[j])
    }

    // soft pools of light inside the cloud so it glows as one
    const gk = bk * (1 - clamp01((t - (LIFT_AT + RISE + HOLD_MIN)) / (HOLD_MAX - HOLD_MIN + FADE)))
    for (let g = 0; g < GLOWS; g++) {
      const o = (STARS + g) * 4 * STRIDE
      const breath = 0.85 + 0.15 * Math.sin(time * 1.3 + g * 2.1)
      const gs = CLUSTER_R * (0.5 - 0.1 * g) * spread * breath * gk
      const gx = cx + bx + Math.cos(time * 0.3 + g * 2.1) * CLUSTER_R * 0.3
      const gy = Math.max(this.floorY + 1, cy + by + Math.sin(time * 0.4 + g) * CLUSTER_R * 0.3)
      const gz = cz + bz + Math.sin(time * 0.3 + g * 2.1) * CLUSTER_R * 0.3
      billboard(false, gs, time, 0, r, u, bb)
      writeQuad(d, o, gx, gy, gz, bb[0], bb[1], bb[2], bb[3], bb[4], bb[5], this.glowUV[g])
    }
    this.arrivedK = arrived / STARS
    pushData(this.builder, d, (STARS + GLOWS) * 4)
  }
}

// ---------------------------------------------------------------- beacon at the top
class Beacon {
  readonly obj: SceneObject
  private builder: MeshBuilder
  private data: number[]
  private idx: number[] = []
  private uvs: number[][] = []
  private th: number[] = []
  private ph: number[] = []
  private wth: number[] = []
  private wph: number[] = []
  private rad: number[] = []
  private sz: number[] = []
  private star: boolean[] = []
  private bb = [0, 0, 0, 0, 0, 0]
  private fl = [0, 0, 0]
  private readonly Q = BEACON_N + 3

  constructor(parent: SceneObject, material: Material) {
    quadIndices(0, this.Q, this.idx)
    const m = makeMesh(parent, "Beacon", material, this.Q * 4, this.idx)
    this.obj = m.obj
    this.builder = m.builder
    this.data = m.data
    this.uvs.push(tileRect(GLOW_BLUE), tileRect(GLOW_ICE), tileRect(STAR_WHITE))
    for (let j = 0; j < BEACON_N; j++) {
      const st = Math.random() < 0.3
      this.star.push(st)
      this.uvs.push(tileRect(st ? pickStar(0.5) : pickDust(0.5)))
      this.th.push(Math.random() * 6.28)
      this.ph.push(Math.random() * 6.28)
      this.wth.push(lerp(0.3, 0.9, Math.random()) * (Math.random() < 0.5 ? -1 : 1))
      this.wph.push(lerp(0.3, 0.9, Math.random()))
      this.rad.push(lerp(10, 90, Math.pow(Math.random(), 0.8)))
      this.sz.push(st ? lerp(0.6, 1.2, Math.random()) : lerp(0.15, 0.4, Math.random()))
    }
    this.obj.enabled = false
  }

  update(time: number, c: vec3, k: number, r: vec3, u: vec3): void {
    const d = this.data
    const bb = this.bb
    if (k < 0.01) {
      if (this.obj.enabled) {
        for (let q = 0; q < this.Q * 4 * STRIDE; q++) d[q] = 0
        pushData(this.builder, d, this.Q * 4)
        this.obj.enabled = false
      }
      return
    }
    this.obj.enabled = true
    const pulse = 0.9 + 0.1 * Math.sin(time * 2.2)
    // (no halo / core / flare: only orbiting stars)
    const fl = this.fl
    for (let j = 0; j < BEACON_N; j++) {
      const o = (3 + j) * 4 * STRIDE
      const th = this.th[j] + this.wth[j] * time
      const ph = 1.57 + 1.3 * Math.sin(this.ph[j] + this.wph[j] * time)
      const rad = this.rad[j] * (0.5 + 0.5 * k) * (1 + 0.12 * Math.sin(time * 1.3 + this.ph[j] * 3))
      let x = c.x + rad * Math.sin(ph) * Math.cos(th)
      let y = c.y + rad * Math.cos(ph)
      let z = c.z + rad * Math.sin(ph) * Math.sin(th)
      flow(x, y, z, time + this.ph[j], fl)
      x += fl[0] * 1.2
      y += fl[1] * 1.2
      z += fl[2] * 1.2
      const tw = 0.6 + 0.4 * Math.sin(time * (this.star[j] ? 5 : 2.5) + this.ph[j] * 5)
      const size = this.sz[j] * k * tw * (this.star[j] ? 2.6 : 2.2)
      billboard(this.star[j], size, time, this.ph[j], r, u, bb)
      writeQuad(d, o, x, y, z, bb[0], bb[1], bb[2], bb[3], bb[4], bb[5], this.uvs[3 + j])
    }
    pushData(this.builder, d, this.Q * 4)
  }
}


// ---------------------------------------------------------------- component
@component
export class GroundFlow extends BaseScriptComponent {
  @input
  @hint("Base material created from ImageMaterialPreset (e.g. TrailBaseMaterial). It is cloned; nothing is changed on the asset.")
  material: Material

  @input
  @hint("Distance from your eyes down to the floor, in cm.")
  eyeHeight: number = 150

  @input
  @hint("How high above your eyes (cm) the stars gather: aim this at your ceiling visual.")
  ceilingHeight: number = 120

  @input
  @hint("Start the sequence automatically when the Lens starts.")
  autoStart: boolean = true

  @input
  @hint("Replay the sequence again and again.")
  loop: boolean = false

  private mat: Material
  private camera: Camera
  private swarm: Swarm
  private beacon: Beacon
  private time = 0
  private seqT = 0
  private running = false
  private anchored = false
  private beaconK = 0
  private restartT = -1
  private finishCbs: (() => void)[] = []
  private target = vec3.zero()

  onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => this.onStart())
    this.createEvent("UpdateEvent").bind(() => this.onUpdate())
  }

  /** The point in space (above the viewer) where the stars gather. */
  getTarget(): vec3 {
    return this.target
  }

  /** Be told when the opening sequence has completely faded away. */
  onFinished(cb: () => void): void {
    this.finishCbs.push(cb)
  }

  /** Play the opening sequence (again). */
  restart(): void {
    this.running = true
    this.anchored = false
    this.seqT = 0
    this.beaconK = 0
    this.restartT = -1
  }

  private onStart(): void {
    if (!this.material) {
      print("[GroundFlow] ERROR: material not assigned")
      return
    }
    this.mat = this.material.clone()
    const pass = this.mat.mainPass
    pass.baseTex = buildAtlas()
    pass.baseColor = new vec4(1, 1, 1, 1)
    pass.blendMode = BlendMode.Add
    pass.twoSided = true
    pass.depthWrite = false
    this.camera = WorldCameraFinderProvider.getInstance().getComponent()
    this.swarm = new Swarm(this.sceneObject, this.mat)
    this.beacon = new Beacon(this.sceneObject, this.mat)
    if (this.autoStart) this.restart()
  }

  private anchor(camPos: vec3, rot: quat): void {
    this.anchored = true
    const fwd = rot.multiplyVec3(new vec3(0, 0, -1))
    const fl = Math.sqrt(fwd.x * fwd.x + fwd.z * fwd.z)
    const fx = fl < 1e-3 ? 0 : fwd.x / fl
    const fz = fl < 1e-3 ? -1 : fwd.z / fl
    this.target = new vec3(camPos.x + fx * 25, camPos.y + this.ceilingHeight, camPos.z + fz * 25)
    this.swarm.setup(camPos, fx, fz, camPos.y - this.eyeHeight, this.target)
  }

  private onUpdate(): void {
    if (!this.mat) return
    const dt = Math.min(getDeltaTime(), 0.05)
    this.time += dt
    const camT = this.camera.getTransform()
    const rot = camT.getWorldRotation()
    const right = rot.multiplyVec3(new vec3(1, 0, 0))
    const up = rot.multiplyVec3(new vec3(0, 1, 0))

    if (this.restartT >= 0) {
      this.restartT -= dt
      if (this.restartT < 0) this.restart()
      return
    }
    if (!this.running) return
    if (!this.anchored) this.anchor(camT.getWorldPosition(), rot)
    this.seqT += dt

    this.swarm.update(this.seqT, this.time, right, up)

    // soft glow overhead that grows as the stars arrive, and fades with them
    const goal = clamp01(this.swarm.arrivedK * 1.6)
    this.beaconK = lerp(this.beaconK, goal, 1 - Math.exp(-dt * 2.5))
    this.beacon.update(this.time, this.target, this.beaconK * 0.85, right, up)

    if (this.seqT > this.swarm.duration) {
      this.running = false
      this.swarm.stop()
      this.beacon.update(this.time, this.target, 0, right, up)
      for (const cb of this.finishCbs) cb()
      if (this.loop) this.restartT = 2
    }
  }
}

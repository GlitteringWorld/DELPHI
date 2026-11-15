/**
 * FlowingTrails — silver / blue sparkle trail on the four Satie shapes.
 *
 * The trail and the resting aura are built with MeshBuilder and an unlit
 * material, the same path Lens Studio 5.15.4 can run. Pinch, pitch, and the
 * voice stay on NoteOrb. This script only follows the shape as it moves.
 *
 * Texture pixels use ProceduralTextureProvider.create (Colorspace.RGBA).
 * createWithFormat / TextureFormat are newer than 5.15.4 and are not used.
 */

const TARGET_CM = 7
const AURA_N = 40
const MOVE_ON = 9
const MOVE_OFF = 4

const LIVE_HIST = 34
const LIVE_POOL = 260
const LIVE_HIST_DT = 1 / 40
const STRIDE = 5
const SUB = 4
const LIVE_N = (LIVE_HIST - 1) * SUB + 1
const STRANDS = 3
const LIVE_STRANDS = STRANDS + 1
const RIBBON_VERTS = LIVE_STRANDS * LIVE_N * 2
const LIVE_VERTS = RIBBON_VERTS + LIVE_POOL * 4

const ATLAS_COLS = 4
const ATLAS_ROWS = 3
const TILE = 64
const GLOW_SILVER = [0, 0]
const GLOW_BLUE = [1, 0]
const GLOW_DEEP = [2, 0]
const GLOW_ICE = [3, 0]
const STAR_SILVER = [0, 1]
const STAR_BLUE = [1, 1]
const STAR_WHITE = [2, 1]
const BOKEH = [3, 1]
const RIB_SILVER = [0, 2]
const RIB_BLUE = [1, 2]
const GLOW_VIOLET = [2, 2]
const RIB_VIOLET = [3, 2]
const RIB_TILES = [RIB_SILVER, RIB_BLUE, RIB_VIOLET]

const C_SILVER = [0.8, 0.86, 0.96]
const C_BLUE = [0.3, 0.58, 1.0]
const C_DEEP = [0.22, 0.35, 0.95]
const C_ICE = [0.92, 0.97, 1.0]
const C_VIOLET = [0.62, 0.5, 1.0]

const STRAND_WIDTH = [1.0, 0.75, 0.55]

function buildAtlas(): Texture {
  const width = TILE * ATLAS_COLS
  const height = TILE * ATLAS_ROWS
  const tex = ProceduralTextureProvider.create(width, height, Colorspace.RGBA)
  const ctrl = tex.control as ProceduralTextureProvider
  const data = new Uint8Array(width * height * 4)

  function put(col: number, row: number, color: number[], fn: (dx: number, dy: number) => number): void {
    for (let py = 0; py < TILE; py++) {
      for (let px = 0; px < TILE; px++) {
        const dx = ((px + 0.5) / TILE) * 2 - 1
        const dy = ((py + 0.5) / TILE) * 2 - 1
        let f = fn(dx, dy)
        if (f < 0) {
          f = 0
        }
        if (f > 1) {
          f = 1
        }
        const o = ((row * TILE + py) * width + (col * TILE + px)) * 4
        data[o] = Math.round(color[0] * f * 255)
        data[o + 1] = Math.round(color[1] * f * 255)
        data[o + 2] = Math.round(color[2] * f * 255)
        data[o + 3] = Math.round(f * 255)
      }
    }
  }

  const glow = (dx: number, dy: number): number => {
    const r = Math.sqrt(dx * dx + dy * dy)
    if (r >= 1) {
      return 0
    }
    return Math.pow(1 - r, 2.2) + Math.pow(Math.max(0, 1 - r * 3.2), 2) * 0.7
  }
  const star = (dx: number, dy: number): number => {
    const r = Math.sqrt(dx * dx + dy * dy)
    const ax = Math.abs(dx)
    const ay = Math.abs(dy)
    const core = r < 1 ? Math.pow(Math.max(0, 1 - r * 2.2), 2) : 0
    const sh = Math.exp(-ay * 16) * Math.pow(Math.max(0, 1 - ax), 2.4)
    const sv = Math.exp(-ax * 16) * Math.pow(Math.max(0, 1 - ay), 2.4)
    return Math.max(core * 1.1, sh, sv)
  }
  const bokeh = (dx: number, dy: number): number => {
    const r = Math.sqrt(dx * dx + dy * dy)
    if (r >= 0.97) {
      return 0
    }
    const edge = Math.min(1, (0.97 - r) * 14)
    return (0.16 * (1 - r * 0.5) + 0.1 * Math.exp(-Math.pow((r - 0.8) / 0.15, 2))) * edge
  }
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

  ctrl.setPixels(0, 0, width, height, data)
  return tex
}

function clamp01(x: number): number {
  if (x < 0) {
    return 0
  }
  if (x > 1) {
    return 1
  }
  return x
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function tileRect(t: number[]): number[] {
  const e = 0.004
  return [t[0] / ATLAS_COLS + e, t[1] / ATLAS_ROWS + e, (t[0] + 1) / ATLAS_COLS - e, (t[1] + 1) / ATLAS_ROWS - e]
}

function pickDust(): number[] {
  const r = Math.random()
  if (r < 0.2) {
    return GLOW_ICE
  }
  if (r < 0.35) {
    return GLOW_SILVER
  }
  if (r < 0.51) {
    return GLOW_VIOLET
  }
  if (r < 0.86) {
    return GLOW_BLUE
  }
  return GLOW_DEEP
}

function pickStar(): number[] {
  const r = Math.random()
  if (r < 0.4) {
    return STAR_WHITE
  }
  if (r < 0.7) {
    return STAR_SILVER
  }
  return STAR_BLUE
}

function flow(x: number, y: number, z: number, t: number, out: number[]): void {
  out[0] = Math.sin(y * 0.19 + t * 0.9) - Math.cos(z * 0.16 - t * 0.7)
  out[1] = Math.sin(z * 0.21 + t * 0.8) - Math.cos(x * 0.17 + t * 0.95)
  out[2] = Math.sin(x * 0.18 + t * 1.1) - Math.cos(y * 0.2 - t * 0.6)
}

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
): void {
  d[o] = x - rx - ux
  d[o + 1] = y - ry - uy
  d[o + 2] = z - rz - uz
  d[o + 3] = uv[0]
  d[o + 4] = uv[1]
  d[o + 5] = x + rx - ux
  d[o + 6] = y + ry - uy
  d[o + 7] = z + rz - uz
  d[o + 8] = uv[2]
  d[o + 9] = uv[1]
  d[o + 10] = x + rx + ux
  d[o + 11] = y + ry + uy
  d[o + 12] = z + rz + uz
  d[o + 13] = uv[2]
  d[o + 14] = uv[3]
  d[o + 15] = x - rx + ux
  d[o + 16] = y - ry + uy
  d[o + 17] = z - rz + uz
  d[o + 18] = uv[0]
  d[o + 19] = uv[3]
}

function makeMesh(
  parent: SceneObject,
  name: string,
  material: Material,
  totalVerts: number,
  indices: number[]
): { builder: MeshBuilder; data: number[] } {
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
  const visual = obj.createComponent("Component.RenderMeshVisual") as RenderMeshVisual
  visual.mesh = builder.getMesh()
  visual.mainMaterial = material
  visual.meshShadowMode = MeshShadowMode.None
  builder.updateMesh()
  return { builder: builder, data: data }
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

function billboard(isStar: boolean, size: number, time: number, ph: number, r: vec3, u: vec3, out: number[]): void {
  if (isStar) {
    const a = time * 1.0 + ph
    const c = Math.cos(a)
    const s = Math.sin(a)
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

function meshExtent(o: SceneObject): number {
  let best = 0
  const visual = o.getComponent("Component.RenderMeshVisual") as RenderMeshVisual
  if (visual && visual.mesh) {
    const a = visual.mesh.aabbMin
    const b = visual.mesh.aabbMax
    const ws = o.getTransform().getWorldScale()
    best = Math.max((b.x - a.x) * Math.abs(ws.x), (b.y - a.y) * Math.abs(ws.y), (b.z - a.z) * Math.abs(ws.z))
  }
  const count = o.getChildrenCount()
  for (let i = 0; i < count; i++) {
    const child = meshExtent(o.getChild(i))
    if (child > best) {
      best = child
    }
  }
  return best
}

class LiveTrail {
  private builder: MeshBuilder
  private data: number[]
  emitting = false
  private hasHead = false
  private head = [0, 0, 0]
  private prev = [0, 0, 0]
  private speed = 0
  private hx: number[] = new Array(LIVE_HIST).fill(0)
  private hy: number[] = new Array(LIVE_HIST).fill(0)
  private hz: number[] = new Array(LIVE_HIST).fill(0)
  private sx: number[] = new Array(LIVE_HIST).fill(0)
  private sy: number[] = new Array(LIVE_HIST).fill(0)
  private sz: number[] = new Array(LIVE_HIST).fill(0)
  private ix: number[] = new Array(LIVE_N).fill(0)
  private iy: number[] = new Array(LIVE_N).fill(0)
  private iz: number[] = new Array(LIVE_N).fill(0)
  private histAcc = 0
  private ribbonFade = 0
  private px: number[] = new Array(LIVE_POOL).fill(0)
  private py: number[] = new Array(LIVE_POOL).fill(0)
  private pz: number[] = new Array(LIVE_POOL).fill(0)
  private vx: number[] = new Array(LIVE_POOL).fill(0)
  private vy: number[] = new Array(LIVE_POOL).fill(0)
  private vz: number[] = new Array(LIVE_POOL).fill(0)
  private life: number[] = new Array(LIVE_POOL).fill(0)
  private maxLife: number[] = new Array(LIVE_POOL).fill(1)
  private size: number[] = new Array(LIVE_POOL).fill(0)
  private phase: number[] = new Array(LIVE_POOL).fill(0)
  private kind: number[] = new Array(LIVE_POOL).fill(0)
  private uvs: number[][] = []
  private cursor = 0
  private spawnAcc = 0
  private dirty = true
  private ribUV: number[][] = RIB_TILES.map((t) => tileRect(t))
  private fl = [0, 0, 0]
  private bb = [0, 0, 0, 0, 0, 0]

  constructor(parent: SceneObject, name: string, material: Material) {
    const idx: number[] = []
    for (let k = 0; k < LIVE_STRANDS; k++) {
      for (let i = 0; i < LIVE_N - 1; i++) {
        const a = (k * LIVE_N + i) * 2
        const b = a + 2
        idx.push(a, a + 1, b, a + 1, b + 1, b)
      }
    }
    quadIndices(RIBBON_VERTS, LIVE_POOL, idx)
    const mesh = makeMesh(parent, name, material, LIVE_VERTS, idx)
    this.builder = mesh.builder
    this.data = mesh.data
    for (let j = 0; j < LIVE_POOL; j++) {
      this.uvs.push(tileRect(GLOW_SILVER))
    }
  }

  private spawn(x: number, y: number, z: number, hvx: number, hvy: number, hvz: number): void {
    const j = this.cursor
    this.cursor = (this.cursor + 1) % LIVE_POOL
    const roll = Math.random()
    const kind = roll < 0.18 ? 1 : roll < 0.24 ? 2 : 0
    this.kind[j] = kind
    this.uvs[j] = tileRect(kind === 1 ? pickStar() : kind === 2 ? BOKEH : pickDust())
    this.px[j] = x + (Math.random() - 0.5) * 0.8
    this.py[j] = y + (Math.random() - 0.5) * 0.8
    this.pz[j] = z + (Math.random() - 0.5) * 0.8
    this.vx[j] = hvx * 0.1 + (Math.random() - 0.5) * 6
    this.vy[j] = hvy * 0.1 + (Math.random() - 0.5) * 6 + 1.2
    this.vz[j] = hvz * 0.1 + (Math.random() - 0.5) * 6
    this.maxLife[j] = lerp(1.0, 2.4, Math.random())
    this.life[j] = this.maxLife[j]
    if (kind === 1) {
      this.size[j] = lerp(0.6, 1.2, Math.random())
    } else if (kind === 2) {
      this.size[j] = lerp(0.5, 1.1, Math.random())
    } else {
      this.size[j] = lerp(0.1, 0.34, Math.random())
    }
    this.phase[j] = Math.random() * 6.28
  }

  update(dt: number, time: number, target: vec3 | null, right: vec3, up: vec3, view: vec3): void {
    if (target && this.emitting) {
      if (!this.hasHead) {
        this.head = [target.x, target.y, target.z]
        this.prev = [target.x, target.y, target.z]
        this.hasHead = true
        for (let i = 0; i < LIVE_HIST; i++) {
          this.hx[i] = target.x
          this.hy[i] = target.y
          this.hz[i] = target.z
        }
      }
      const k = 1 - Math.exp(-dt * 16)
      this.prev[0] = this.head[0]
      this.prev[1] = this.head[1]
      this.prev[2] = this.head[2]
      this.head[0] = lerp(this.head[0], target.x, k)
      this.head[1] = lerp(this.head[1], target.y, k)
      this.head[2] = lerp(this.head[2], target.z, k)
      const dx = this.head[0] - this.prev[0]
      const dy = this.head[1] - this.prev[1]
      const dz = this.head[2] - this.prev[2]
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
      this.speed = lerp(this.speed, dist / Math.max(dt, 0.001), 1 - Math.exp(-dt * 10))
      this.spawnAcc += dt * (60 + Math.min(this.speed, 140) * 2.2)
      const n = Math.min(12, Math.floor(this.spawnAcc))
      this.spawnAcc -= Math.floor(this.spawnAcc)
      const hvx = dx / Math.max(dt, 0.001)
      const hvy = dy / Math.max(dt, 0.001)
      const hvz = dz / Math.max(dt, 0.001)
      for (let s = 0; s < n; s++) {
        const f = (s + 1) / n
        this.spawn(lerp(this.prev[0], this.head[0], f), lerp(this.prev[1], this.head[1], f), lerp(this.prev[2], this.head[2], f), hvx, hvy, hvz)
      }
      this.dirty = true
    } else {
      this.hasHead = false
      this.speed = 0
    }

    this.ribbonFade = lerp(this.ribbonFade, target && this.emitting ? 1 : 0, 1 - Math.exp(-dt * (this.emitting ? 8 : 5)))
    this.histAcc += dt
    while (this.histAcc >= LIVE_HIST_DT) {
      this.histAcc -= LIVE_HIST_DT
      for (let i = LIVE_HIST - 1; i > 0; i--) {
        this.hx[i] = this.hx[i - 1]
        this.hy[i] = this.hy[i - 1]
        this.hz[i] = this.hz[i - 1]
      }
      if (this.hasHead) {
        this.hx[0] = this.head[0]
        this.hy[0] = this.head[1]
        this.hz[0] = this.head[2]
      }
    }
    if (this.hasHead) {
      this.hx[0] = this.head[0]
      this.hy[0] = this.head[1]
      this.hz[0] = this.head[2]
    }

    const fl = this.fl
    let alive = 0
    for (let j = 0; j < LIVE_POOL; j++) {
      if (this.life[j] <= 0) {
        continue
      }
      alive++
      this.life[j] -= dt
      flow(this.px[j], this.py[j], this.pz[j], time + this.phase[j], fl)
      const a = 16 * dt
      this.vx[j] += fl[0] * a
      this.vy[j] += fl[1] * a
      this.vz[j] += fl[2] * a
      const drag = Math.exp(-1.5 * dt)
      this.vx[j] *= drag
      this.vy[j] *= drag
      this.vz[j] *= drag
      this.px[j] += this.vx[j] * dt
      this.py[j] += this.vy[j] * dt
      this.pz[j] += this.vz[j] * dt
    }

    if (alive === 0 && this.ribbonFade < 0.01 && !this.dirty) {
      return
    }
    this.dirty = alive > 0 || this.ribbonFade >= 0.01 || this.emitting
    this.write(time, right, up, view)
  }

  private write(time: number, r: vec3, u: vec3, v: vec3): void {
    const d = this.data
    const rf = this.ribbonFade
    const bb = this.bb
    for (let i = 0; i < LIVE_HIST; i++) {
      this.sx[i] = this.hx[i]
      this.sy[i] = this.hy[i]
      this.sz[i] = this.hz[i]
    }
    for (let pass = 0; pass < 6; pass++) {
      for (let i = 1; i < LIVE_HIST - 1; i++) {
        this.sx[i] = 0.25 * this.sx[i - 1] + 0.5 * this.sx[i] + 0.25 * this.sx[i + 1]
        this.sy[i] = 0.25 * this.sy[i - 1] + 0.5 * this.sy[i] + 0.25 * this.sy[i + 1]
        this.sz[i] = 0.25 * this.sz[i - 1] + 0.5 * this.sz[i] + 0.25 * this.sz[i + 1]
      }
    }

    const history = LIVE_HIST
    for (let m = 0; m < LIVE_N; m++) {
      const seg = Math.min(history - 2, Math.floor(m / SUB))
      const f = m / SUB - seg
      const i0 = Math.max(seg - 1, 0)
      const i2 = seg + 1
      const i3 = Math.min(seg + 2, history - 1)
      const f2 = f * f
      const f3 = f2 * f
      const c0 = -0.5 * f3 + f2 - 0.5 * f
      const c1 = 1.5 * f3 - 2.5 * f2 + 1
      const c2 = -1.5 * f3 + 2 * f2 + 0.5 * f
      const c3 = 0.5 * f3 - 0.5 * f2
      this.ix[m] = c0 * this.sx[i0] + c1 * this.sx[seg] + c2 * this.sx[i2] + c3 * this.sx[i3]
      this.iy[m] = c0 * this.sy[i0] + c1 * this.sy[seg] + c2 * this.sy[i2] + c3 * this.sy[i3]
      this.iz[m] = c0 * this.sz[i0] + c1 * this.sz[seg] + c2 * this.sz[i2] + c3 * this.sz[i3]
    }

    for (let k = 0; k < LIVE_STRANDS; k++) {
      const halo = k === STRANDS
      const uv = this.ribUV[halo ? 2 : k]
      const um = (uv[0] + uv[2]) * 0.5
      for (let m = 0; m < LIVE_N; m++) {
        let o = (k * LIVE_N + m) * 2 * STRIDE
        const a = Math.max(0, m - 1)
        const b = Math.min(LIVE_N - 1, m + 1)
        const tx = this.ix[a] - this.ix[b]
        const ty = this.iy[a] - this.iy[b]
        const tz = this.iz[a] - this.iz[b]
        let wx = ty * v.z - tz * v.y
        let wy = tz * v.x - tx * v.z
        let wz = tx * v.y - ty * v.x
        let wl = Math.sqrt(wx * wx + wy * wy + wz * wz)
        if (wl < 1e-5) {
          wx = r.x
          wy = r.y
          wz = r.z
          wl = 1
        }
        wx /= wl
        wy /= wl
        wz /= wl
        const fi = m / SUB
        const uu = m / (LIVE_N - 1)
        const taper = Math.pow(1 - uu, halo ? 1.8 : 1.25)
        const weave = halo ? 0 : Math.sin(fi * (0.45 + 0.08 * k) - time * 7 + k * 2.09) * (0.5 + 0.35 * k) * (0.25 + uu)
        const cx = this.ix[m] + wx * weave
        const cy = this.iy[m] + wy * weave
        const cz = this.iz[m] + wz * weave
        const hw = (halo ? 3.2 * (0.9 + 0.1 * Math.sin(time * 3 + fi * 0.4)) : 1.1 * STRAND_WIDTH[k]) * taper * rf
        d[o] = cx - wx * hw
        d[o + 1] = cy - wy * hw
        d[o + 2] = cz - wz * hw
        d[o + 3] = um
        d[o + 4] = uv[1]
        d[o + 5] = cx + wx * hw
        d[o + 6] = cy + wy * hw
        d[o + 7] = cz + wz * hw
        d[o + 8] = um
        d[o + 9] = uv[3]
      }
    }

    for (let j = 0; j < LIVE_POOL; j++) {
      const o = (RIBBON_VERTS + j * 4) * STRIDE
      if (this.life[j] <= 0) {
        for (let q = 0; q < 4 * STRIDE; q++) {
          d[o + q] = 0
        }
        continue
      }
      const age = 1 - this.life[j] / this.maxLife[j]
      const env = Math.min(1, age * 9) * (1 - age * age)
      let size = this.size[j] * env
      const kind = this.kind[j]
      if (kind === 1) {
        const pulse = Math.max(0, Math.sin(time * 14 + this.phase[j] * 5))
        size *= (0.2 + 0.8 * pulse * pulse) * 2.4
      } else if (kind === 2) {
        size *= 2.0
      } else {
        size *= 2.0 * (0.75 + 0.25 * Math.sin(time * 8 + this.phase[j] * 5))
      }
      billboard(kind === 1, size, time, this.phase[j], r, u, bb)
      writeQuad(d, o, this.px[j], this.py[j], this.pz[j], bb[0], bb[1], bb[2], bb[3], bb[4], bb[5], this.uvs[j])
    }
    pushData(this.builder, d, LIVE_VERTS)
  }
}

class Aura {
  private builder: MeshBuilder
  private data: number[]
  private uvs: number[][] = []
  private th: number[] = []
  private ph: number[] = []
  private wth: number[] = []
  private wph: number[] = []
  private rad: number[] = []
  private sz: number[] = []
  private star: boolean[] = []
  private bb = [0, 0, 0, 0, 0, 0]

  constructor(parent: SceneObject, material: Material, radius: number) {
    const idx: number[] = []
    quadIndices(0, AURA_N, idx)
    const mesh = makeMesh(parent, "ShapeAura", material, AURA_N * 4, idx)
    this.builder = mesh.builder
    this.data = mesh.data
    for (let j = 0; j < AURA_N; j++) {
      const isStar = Math.random() < 0.25
      this.star.push(isStar)
      this.uvs.push(tileRect(isStar ? pickStar() : pickDust()))
      this.th.push(Math.random() * 6.28)
      this.ph.push(Math.random() * 6.28)
      this.wth.push(lerp(0.25, 0.8, Math.random()) * (Math.random() < 0.5 ? -1 : 1))
      this.wph.push(lerp(0.3, 0.9, Math.random()))
      this.rad.push(radius * lerp(0.95, 1.7, Math.random()))
      this.sz.push(isStar ? lerp(0.5, 0.9, Math.random()) : lerp(0.14, 0.32, Math.random()))
    }
  }

  update(time: number, center: vec3, k: number, right: vec3, up: vec3): void {
    const d = this.data
    const fl = [0, 0, 0]
    for (let j = 0; j < AURA_N; j++) {
      const o = j * 4 * STRIDE
      if (k < 0.01) {
        for (let q = 0; q < 4 * STRIDE; q++) {
          d[o + q] = 0
        }
        continue
      }
      const th = this.th[j] + this.wth[j] * time
      const ph = 1.57 + 1.2 * Math.sin(this.ph[j] + this.wph[j] * time)
      const rad = this.rad[j] * (1 + 0.12 * Math.sin(time * 1.3 + this.ph[j] * 3))
      let x = center.x + rad * Math.sin(ph) * Math.cos(th)
      let y = center.y + rad * Math.cos(ph)
      let z = center.z + rad * Math.sin(ph) * Math.sin(th)
      flow(x, y, z, time + this.ph[j], fl)
      x += fl[0] * 0.35
      y += fl[1] * 0.35
      z += fl[2] * 0.35
      const tw = 0.6 + 0.4 * Math.sin(time * (this.star[j] ? 5 : 2.5) + this.ph[j] * 5)
      const size = this.sz[j] * k * tw * (this.star[j] ? 2.4 : 2.0)
      billboard(this.star[j], size, time, this.ph[j], right, up, this.bb)
      writeQuad(d, o, x, y, z, this.bb[0], this.bb[1], this.bb[2], this.bb[3], this.bb[4], this.bb[5], this.uvs[j])
    }
    pushData(this.builder, d, AURA_N * 4)
  }
}

class ShapeFollow {
  private prev: vec3
  private moveSm = 0
  private moving = false
  private idleK = 1
  private trail: LiveTrail
  private aura: Aura

  constructor(parent: SceneObject, material: Material, private host: SceneObject) {
    this.prev = host.getTransform().getWorldPosition()
    this.trail = new LiveTrail(parent, "Trail_" + host.name, material)
    this.aura = new Aura(parent, material, TARGET_CM * 0.55)
  }

  update(dt: number, time: number, right: vec3, up: vec3, view: vec3): void {
    const pos = this.host.getTransform().getWorldPosition()
    const speed = pos.distance(this.prev) / Math.max(dt, 0.001)
    this.prev = pos
    this.moveSm = lerp(this.moveSm, speed, 1 - Math.exp(-dt * 8))
    if (this.moving) {
      if (this.moveSm < MOVE_OFF) {
        this.moving = false
      }
    } else if (this.moveSm > MOVE_ON) {
      this.moving = true
    }
    this.idleK = lerp(this.idleK, this.moving ? 0 : 1, 1 - Math.exp(-dt * (this.moving ? 7 : 2)))
    this.trail.emitting = this.moving
    this.trail.update(dt, time, pos, right, up, view)
    this.aura.update(time, pos, this.idleK, right, up)
  }
}

function fitModel(host: SceneObject): boolean {
  let found = false
  const count = host.getChildrenCount()
  for (let i = 0; i < count; i++) {
    const child = host.getChild(i)
    if (child.name === "Hit") {
      continue
    }
    const extent = meshExtent(child)
    if (extent < 0.05) {
      return false
    }
    const hostScale = host.getTransform().getLocalScale()
    const userScale = Math.max(Math.abs(hostScale.x), Math.abs(hostScale.y), Math.abs(hostScale.z), 0.001)
    const scale = child.getTransform().getLocalScale()
    const factor = (TARGET_CM * userScale) / extent
    child.getTransform().setLocalScale(new vec3(scale.x * factor, scale.y * factor, scale.z * factor))
    found = true
  }
  return found
}

function findCamera(): Camera | null {
  const count = global.scene.getRootObjectsCount()
  for (let i = 0; i < count; i++) {
    const camera = global.scene.getRootObject(i).getComponent("Component.Camera") as Camera
    if (camera) {
      return camera
    }
  }
  return null
}

@component
export class FlowingTrails extends BaseScriptComponent {
  @input
  @hint("Unlit material. The script clones it, then sets the sparkle texture and additive blending.")
  material: Material

  @input
  @hint("Gel. Pinch plays the silver-string family.")
  shape1: SceneObject

  @input
  @hint("Oval pebble. Pinch plays the mallet family.")
  shape2: SceneObject

  @input
  @hint("Starfish. Pinch plays the wind family.")
  shape3: SceneObject

  @input
  @hint("Pebble. Pinch plays the bell family.")
  shape4: SceneObject

  private follows: ShapeFollow[] = []
  private fitted: SceneObject[] = []
  private time = 0
  private mat: Material | null = null

  onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => this.onStart())
    this.createEvent("UpdateEvent").bind(() => this.onUpdate())
  }

  private onStart(): void {
    this.fitAll()
    if (!this.material) {
      print("[FlowingTrails] material is not assigned")
      return
    }
    this.mat = this.usableMaterial(this.material)
    try {
      const pass = this.mat.mainPass
      pass.baseTex = buildAtlas()
      pass.baseColor = new vec4(1, 1, 1, 1)
      pass.blendMode = BlendMode.Add
      pass.twoSided = true
      pass.depthWrite = false
    } catch (error) {
      print("[FlowingTrails] trail material has no pass, leaving the shapes as they are")
      return
    }
    const hosts = [this.shape1, this.shape2, this.shape3, this.shape4]
    for (let i = 0; i < hosts.length; i++) {
      if (!hosts[i]) {
        print("[FlowingTrails] a shape input is not assigned")
        continue
      }
      this.follows.push(new ShapeFollow(this.sceneObject, this.mat, hosts[i]))
    }
  }

  private usableMaterial(material: Material): Material {
    try {
      const copy = material.clone()
      const pass = copy.mainPass
      if (pass) {
        return copy
      }
    } catch (error) {
      print("[FlowingTrails] shared material")
    }
    return material
  }

  private alreadyFitted(host: SceneObject): boolean {
    for (let i = 0; i < this.fitted.length; i++) {
      if (this.fitted[i] === host) {
        return true
      }
    }
    return false
  }

  private fitAll(): void {
    const hosts = [this.shape1, this.shape2, this.shape3, this.shape4]
    for (let i = 0; i < hosts.length; i++) {
      const host = hosts[i]
      if (!host || this.alreadyFitted(host)) {
        continue
      }
      if (fitModel(host)) {
        this.fitted.push(host)
      }
    }
  }

  private onUpdate(): void {
    if (this.fitted.length < 4) {
      this.fitAll()
    }
    if (!this.mat || this.follows.length === 0) {
      return
    }
    const camera = findCamera()
    if (!camera) {
      return
    }
    const dt = Math.min(getDeltaTime(), 0.05)
    this.time += dt
    const rotation = camera.getTransform().getWorldRotation()
    const right = rotation.multiplyVec3(new vec3(1, 0, 0))
    const up = rotation.multiplyVec3(new vec3(0, 1, 0))
    const view = rotation.multiplyVec3(new vec3(0, 0, -1))
    for (let i = 0; i < this.follows.length; i++) {
      this.follows[i].update(dt, this.time, right, up, view)
    }
  }
}

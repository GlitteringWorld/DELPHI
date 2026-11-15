/**
 * StardustField — fine dust that meanders upward. Each path keeps climbing,
 * bending sideways as it goes, then starts again at the floor. Specks are
 * white, blue, or silver. Built with MeshBuilder for Lens Studio 5.15.4.
 */

const COLUMNS = 3
const ROWS = 2
const PATHS = COLUMNS * ROWS
const PER_PATH = 20
const TINTS = 3

const TINT_COLORS = [new vec4(1, 0.96, 0.86, 1), new vec4(0.22, 0.48, 1, 1), new vec4(0.84, 0.88, 0.96, 1)]

type Spark = {
  x: number
  z: number
  along: number
  speed: number
  size: number
  ampX: number
  ampZ: number
  freqX: number
  freqZ: number
  phaseX: number
  phaseZ: number
  tint: number
  slot: number
}

@component
export class StardustField extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">StardustField – dust rising off the floor</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">Settings</span>')
  @ui.group_start("Settings")
  @input
  @hint("Unlit material. The script assigns the glow texture and additive blending.")
  material: Material

  @input
  @hint("How far below this object the dust sits, in meters.")
  @widget(new SliderWidget(0.05, 1.6, 0.01))
  groundBelowM: number = 0.22

  @input
  @hint("How high the rising trails climb above the floor, in meters.")
  @widget(new SliderWidget(0.3, 2.2, 0.01))
  riseM: number = 0.8
  @ui.group_end

  private builders: MeshBuilder[] = []
  private sparks: Spark[] = []
  private right = new vec3(1, 0, 0)
  private up = new vec3(0, 1, 0)

  onAwake(): void {
    const materials = this.prepareMaterials()
    const counts = [0, 0, 0]
    this.sparks = this.buildSparks(counts)
    for (let tint = 0; tint < TINTS; tint++) {
      const visual = this.getSceneObject().createComponent("Component.RenderMeshVisual") as RenderMeshVisual
      const builder = this.makeBuilder(counts[tint])
      visual.mesh = builder.getMesh()
      visual.meshShadowMode = MeshShadowMode.None
      if (materials[tint]) {
        visual.mainMaterial = materials[tint]
      }
      builder.updateMesh()
      this.builders.push(builder)
    }

    this.createEvent("UpdateEvent").bind(() => this.onUpdate())
  }

  private prepareMaterials(): Material[] {
    if (!this.material) {
      return []
    }
    const texture = requireAsset("../Textures/StardustGlow.png") as Texture
    const materials: Material[] = []
    for (let tint = 0; tint < TINTS; tint++) {
      const material = this.material.clone()
      const pass = material.mainPass
      pass.twoSided = true
      pass.depthWrite = false
      pass.depthTest = true
      pass.blendMode = BlendMode.Add
      pass.baseColor = TINT_COLORS[tint]
      pass.baseTex = texture
      materials.push(material)
    }
    return materials
  }

  private makeBuilder(count: number): MeshBuilder {
    const builder = new MeshBuilder([
      { name: "position", components: 3 },
      { name: "normal", components: 3 },
      { name: "texture0", components: 2 },
    ])
    builder.topology = MeshTopology.Triangles
    builder.indexType = MeshIndexType.UInt16
    const positions: number[] = []
    const indices: number[] = []
    for (let i = 0; i < count; i++) {
      const base = i * 4
      const uvs = [0, 0, 1, 0, 1, 1, 0, 1]
      for (let v = 0; v < 4; v++) {
        positions.push(0, 0, 0, 0, 0, 1, uvs[v * 2], uvs[v * 2 + 1])
      }
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
    }
    builder.appendVerticesInterleaved(positions)
    builder.appendIndices(indices)
    return builder
  }

  private buildSparks(counts: number[]): Spark[] {
    const sparks: Spark[] = []
    for (let path = 0; path < PATHS; path++) {
      const column = path % COLUMNS
      const row = Math.floor(path / COLUMNS)
      const x = -16 + column * 16
      const z = -50 - row * 16
      const speed = 0.1 + (path % 4) * 0.025
      const size = 1.05 + (column % 3) * 0.18
      const ampX = 11 + (path % 3) * 3
      const ampZ = 4 + (path % 2) * 2
      const freqX = 1.7 + (path % 3) * 0.4
      const freqZ = 1.2 + (path % 3) * 0.3
      const phaseX = path * 1.9
      const phaseZ = path * 2.4 + 1.1
      for (let i = 0; i < PER_PATH; i++) {
        const tint = (path + i) % TINTS
        sparks.push({
          x: x,
          z: z,
          along: i / PER_PATH,
          speed: speed,
          size: size,
          ampX: ampX,
          ampZ: ampZ,
          freqX: freqX,
          freqZ: freqZ,
          phaseX: phaseX,
          phaseZ: phaseZ,
          tint: tint,
          slot: counts[tint],
        })
        counts[tint] += 1
      }
    }
    return sparks
  }

  private onUpdate(): void {
    if (this.builders.length === 0) {
      return
    }
    const camera = this.findCamera()
    if (!camera) {
      return
    }
    const hostRotation = this.getSceneObject().getTransform().getWorldRotation().invert()
    const cameraRotation = camera.getTransform().getWorldRotation()
    this.right = hostRotation.multiplyVec3(cameraRotation.multiplyVec3(new vec3(1, 0, 0)))
    this.up = hostRotation.multiplyVec3(cameraRotation.multiplyVec3(new vec3(0, 1, 0)))

    const dt = getDeltaTime()
    for (let i = 0; i < this.sparks.length; i++) {
      const spark = this.sparks[i]
      spark.along += spark.speed * dt
      if (spark.along > 1) {
        spark.along -= 1
      }
      const edge = Math.min(spark.along, 1 - spark.along) / 0.08
      const fade = Math.max(0.2, Math.min(1, edge))
      this.writeQuad(this.builders[spark.tint], spark.slot * 4, this.pathPoint(spark), spark.size * Math.max(0.12, fade))
    }
    for (let tint = 0; tint < this.builders.length; tint++) {
      this.builders[tint].updateMesh()
    }
  }

  private pathPoint(spark: Spark): vec3 {
    const t = spark.along
    const y = -this.groundBelowM * 100 + t * this.riseM * 100
    const x = spark.x + Math.sin(t * spark.freqX * Math.PI + spark.phaseX) * spark.ampX
    const z = spark.z + Math.sin(t * spark.freqZ * Math.PI + spark.phaseZ) * spark.ampZ
    return new vec3(x, y, z)
  }

  private writeQuad(builder: MeshBuilder, vertex: number, center: vec3, size: number): void {
    const right = this.right.uniformScale(size)
    const up = this.up.uniformScale(size)
    const corners = [
      center.sub(right).sub(up),
      center.add(right).sub(up),
      center.add(right).add(up),
      center.sub(right).add(up),
    ]
    const normal = this.right.cross(this.up)
    const uvs = [0, 0, 1, 0, 1, 1, 0, 1]
    for (let i = 0; i < 4; i++) {
      const p = corners[i]
      builder.setVertexInterleaved(vertex + i, [p.x, p.y, p.z, normal.x, normal.y, normal.z, uvs[i * 2], uvs[i * 2 + 1]])
    }
  }

  private findCamera(): SceneObject | null {
    const count = global.scene.getRootObjectsCount()
    for (let i = 0; i < count; i++) {
      const root = global.scene.getRootObject(i)
      if (root.getComponent("Component.Camera")) {
        return root
      }
    }
    return null
  }
}

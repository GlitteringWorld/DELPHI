/**
 * One instruction card at a time, on the upper band of the view.
 * 0 for 6 seconds at open, then a 3 second gap, then 1 and 2 for 4 seconds, then 3 for 6 seconds.
 */

const OPEN_SEC = 6
const SHOW_SEC = 4
const GAP_AFTER_OPEN = 3
const CARD_DISTANCE = 80
const BAND_X = -0.0162
const BAND_Y = 0.5898
const BAND_WIDTH = 0.5938

const CARD = requireAsset("../Materials/PromptCard.mat") as Material
const PROMPTS = [
  requireAsset("../Prompts/0.png") as Texture,
  requireAsset("../Prompts/1.png") as Texture,
  requireAsset("../Prompts/2.png") as Texture,
  requireAsset("../Prompts/3.png") as Texture,
]

@component
export class PromptCoach extends BaseScriptComponent {
  private card: SceneObject | null = null
  private camera: Camera | null = null
  private material: Material | null = null
  private elapsed = 0
  private current = -1
  private busyUntil = 0
  private holdUntil = 0
  private next = 1

  onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => this.onStart())
    this.createEvent("UpdateEvent").bind(() => this.onUpdate())
  }

  private onStart(): void {
    this.material = CARD
    this.buildCard()
    this.showNow(0)
  }

  private onUpdate(): void {
    this.elapsed += getDeltaTime()
    this.placeCard()
    if (this.current >= 0 && this.elapsed >= this.busyUntil) {
      this.finishCurrent()
    }
    if (this.current < 0) {
      this.tryNext()
    }
  }

  private tryNext(): void {
    if (this.current >= 0 || this.elapsed < this.holdUntil || this.next >= PROMPTS.length) {
      return
    }
    const index = this.next
    this.next += 1
    this.showNow(index)
  }

  private showNow(index: number): void {
    if (!this.card || !this.material || !PROMPTS[index]) {
      return
    }
    this.material.mainPass.baseTex = PROMPTS[index]
    this.card.enabled = true
    this.current = index
    const duration = index === 0 || index === 3 ? OPEN_SEC : SHOW_SEC
    this.busyUntil = this.elapsed + duration
  }

  private finishCurrent(): void {
    if (this.current === 0) {
      this.holdUntil = this.elapsed + GAP_AFTER_OPEN
    }
    if (this.card) {
      this.card.enabled = false
    }
    this.current = -1
  }

  private buildCard(): void {
    let cameraObject: SceneObject | null = null
    const roots = global.scene.getRootObjectsCount()
    for (let i = 0; i < roots; i++) {
      const root = global.scene.getRootObject(i)
      const camera = root.getComponent("Component.Camera") as Camera
      if (camera) {
        cameraObject = root
        this.camera = camera
        break
      }
    }
    const card = global.scene.createSceneObject("PromptCard")
    if (cameraObject) {
      card.setParent(cameraObject)
    }
    const builder = new MeshBuilder([
      { name: "position", components: 3 },
      { name: "texture0", components: 2 },
    ])
    builder.topology = MeshTopology.Triangles
    builder.indexType = MeshIndexType.UInt16
    const w = 1.5
    const h = 0.5
    builder.appendVerticesInterleaved([
      -w, -h, 0, 0, 0,
      w, -h, 0, 1, 0,
      w, h, 0, 1, 1,
      -w, h, 0, 0, 1,
    ])
    builder.appendIndices([0, 1, 2, 0, 2, 3])
    const visual = card.createComponent("Component.RenderMeshVisual") as RenderMeshVisual
    visual.mesh = builder.getMesh()
    visual.setRenderOrder(20000)
    if (this.material) {
      visual.mainMaterial = this.material
    }
    builder.updateMesh()
    card.enabled = false
    this.card = card
    this.placeCard()
  }

  private placeCard(): void {
    if (!this.card || !this.camera) {
      return
    }
    const fov = this.camera.fov
    const aspect = this.camera.aspect
    if (fov <= 0.01 || aspect <= 0.01) {
      return
    }
    const halfH = Math.tan(fov * 0.5) * CARD_DISTANCE
    const halfW = halfH * aspect
    this.card.getTransform().setLocalPosition(new vec3(BAND_X * halfW, BAND_Y * halfH, -CARD_DISTANCE))
    const scale = (BAND_WIDTH * 2 * halfW) / 3
    this.card.getTransform().setLocalScale(new vec3(scale, scale, scale))
  }
}

/**
 * Shows the seal intro for 2.7 seconds, then lets the rest of the experience start.
 */

const SPLASH_SEC = 2.7
const CARD_DISTANCE = 90
const GIF_W = 1080
const GIF_H = 608
const SEAL_FRACTION = (463 - 144) / GIF_H
const SEAL_VIEW = 0.46
const HELD = ["Experience", "FlowingTrails", "GroundFlow", "starcluster", "PromptCoach"]

const SEAL = requireAsset("../DelphiSealIntro.gif") as Texture
const MAT = requireAsset("../Materials/SplashSeal.mat") as Material

@component
export class SplashGate extends BaseScriptComponent {
  private card: SceneObject | null = null
  private camera: Camera | null = null
  private material: Material | null = null
  private held: SceneObject[] = []
  private elapsed = 0
  private released = false
  private started = false

  onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => this.onStart())
    this.createEvent("UpdateEvent").bind(() => this.onUpdate())
  }

  private onStart(): void {
    this.material = MAT
    this.holdProject()
    this.buildCard()
    this.playSeal()
    this.started = true
  }

  private onUpdate(): void {
    if (!this.started || this.released) {
      return
    }
    this.elapsed += getDeltaTime()
    this.placeCard()
    if (this.elapsed >= SPLASH_SEC) {
      this.release()
    }
  }

  private holdProject(): void {
    const roots = global.scene.getRootObjectsCount()
    for (let i = 0; i < roots; i++) {
      const root = global.scene.getRootObject(i)
      if (HELD.indexOf(root.name) >= 0) {
        root.enabled = false
        this.held.push(root)
      }
    }
  }

  private playSeal(): void {
    if (!this.material) {
      return
    }
    this.material.mainPass.baseTex = SEAL
    const provider = SEAL.control as AnimatedTextureFileProvider
    if (provider && provider.play) {
      provider.isAutoplay = false
      provider.play(1, 0)
    }
  }

  private release(): void {
    this.released = true
    if (this.card) {
      this.card.enabled = false
    }
    for (let i = 0; i < this.held.length; i++) {
      this.held[i].enabled = true
    }
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
    const card = global.scene.createSceneObject("SplashSeal")
    if (cameraObject) {
      card.setParent(cameraObject)
    }
    const builder = new MeshBuilder([
      { name: "position", components: 3 },
      { name: "texture0", components: 2 },
    ])
    builder.topology = MeshTopology.Triangles
    builder.indexType = MeshIndexType.UInt16
    const w = GIF_W / GIF_H
    const h = 1
    builder.appendVerticesInterleaved([
      -w, -h, 0, 0, 0,
      w, -h, 0, 1, 0,
      w, h, 0, 1, 1,
      -w, h, 0, 0, 1,
    ])
    builder.appendIndices([0, 1, 2, 0, 2, 3])
    const visual = card.createComponent("Component.RenderMeshVisual") as RenderMeshVisual
    visual.mesh = builder.getMesh()
    visual.setRenderOrder(30000)
    if (this.material) {
      visual.mainMaterial = this.material
    }
    builder.updateMesh()
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
    const worldH = (SEAL_VIEW / SEAL_FRACTION) * halfH * 2
    const scale = worldH / 2
    this.card.getTransform().setLocalPosition(new vec3(0, 0, -CARD_DISTANCE))
    this.card.getTransform().setLocalScale(new vec3(scale, scale, scale))
  }
}

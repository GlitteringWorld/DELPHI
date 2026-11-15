/**
 * ConstellationSway — plays the constellation in layers, then sends the
 * dolphin figure out of the circle toward the swimming dolphin.
 *
 * Sky holds alone, lines join it, then the animals and people appear and
 * sway back to the pose authored on the glb. The dolphin figure then flies
 * to the dolphin model in the scene.
 */

@component
export class ConstellationSway extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">ConstellationSway – reveal, sway, then the dolphin flies</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">Settings</span>')
  @ui.group_start("Settings")
  @input
  @hint("How far a figure slides during the sway, in centimeters.")
  @widget(new SliderWidget(0, 20, 0.1))
  swayCm: number = 8

  @input
  @hint("How far a figure rocks during the sway, in degrees.")
  @widget(new SliderWidget(0, 15, 0.1))
  swayDegrees: number = 5

  @input
  @hint("Seconds the figures sway after they appear, before the dolphin flies.")
  @widget(new SliderWidget(1.5, 12, 0.1))
  cycleSec: number = 3
  @ui.group_end

  private readonly skyHoldSec = 1.5
  private readonly linesHoldSec = 1.5
  private readonly fadeSec = 0.4
  private readonly flightSec = 3

  private sky: Layer | null = null
  private lines: Layer | null = null
  private figures: Figure[] = []
  private dolphin: Figure | null = null
  private swimmer: SceneObject | null = null
  private flying = false
  private flightStart = 0
  private flyOrigin = new vec3(0, 0, 0)
  private flyScale = new vec3(1, 1, 1)

  onAwake(): void {
    const found: SceneObject[] = []
    this.collect(this.getSceneObject(), found)
    let index = 0
    for (let i = 0; i < found.length; i++) {
      const obj = found[i]
      const visual = obj.getComponent("Component.RenderMeshVisual") as RenderMeshVisual
      if (!visual) {
        continue
      }
      const layer = this.prepare(obj, visual)
      if (obj.name.indexOf("Starry") !== -1) {
        this.sky = layer
        this.makeSolid(obj, visual, layer.material, 0)
        continue
      }
      if (obj.name.indexOf("Lines") !== -1) {
        this.lines = layer
        this.makeSolid(obj, visual, layer.material, 1)
        continue
      }
      if (!this.isFigure(obj.name)) {
        continue
      }
      const transform = obj.getTransform()
      const figure: Figure = {
        object: obj,
        visual: visual,
        material: layer.material,
        transform: transform,
        startPos: transform.getLocalPosition(),
        startRot: transform.getLocalRotation(),
        startScale: transform.getLocalScale(),
        axis: index % 2 === 0 ? 1 : -1,
        dolphin: obj.name.indexOf("Dolphin") !== -1,
      }
      this.makeSolid(obj, visual, layer.material, this.drawOrder(obj.name))
      this.figures.push(figure)
      if (figure.dolphin) {
        this.dolphin = figure
      }
      index++
    }
    this.swimmer = this.findExact("Dolphin")
  }

  private makeSolid(obj: SceneObject, visual: RenderMeshVisual, material: Material, order: number): void {
    obj.enabled = true
    visual.renderOrder = order
    this.setAlpha({ material: material }, 1)
    try {
      const pass = material.mainPass
      pass.depthWrite = false
      pass.depthTest = true
      pass.twoSided = false
    } catch (error) {
      // Keep the imported material if this pass has no depth inputs.
    }
    const transform = obj.getTransform()
    const position = transform.getWorldPosition()
    transform.setWorldPosition(new vec3(position.x, position.y, position.z + order * 0.2))
  }

  private onUpdate(): void {
    const time = getTime()
    const linesAt = this.skyHoldSec
    const figuresAt = this.skyHoldSec + this.linesHoldSec
    const swaySec = Math.max(1.5, this.cycleSec)
    const flightAt = figuresAt + swaySec

    if (this.sky) {
      this.sky.object.enabled = true
      this.setAlpha(this.sky, this.fade(time, 0))
    }
    if (this.lines) {
      const show = time >= linesAt
      this.lines.object.enabled = show
      this.setAlpha(this.lines, show ? this.fade(time, linesAt) : 0)
    }

    if (time < figuresAt) {
      this.setFiguresEnabled(false)
      return
    }

    this.setFiguresEnabled(true)
    const figureAlpha = this.fade(time, figuresAt)
    for (let i = 0; i < this.figures.length; i++) {
      if (!(this.flying && this.figures[i].dolphin)) {
        this.setAlpha(this.figures[i], figureAlpha)
      }
    }

    if (time < flightAt) {
      this.sway(time - figuresAt, swaySec)
      return
    }

    if (!this.flying) {
      this.restoreFigures()
      if (this.dolphin) {
        this.flyOrigin = this.dolphin.transform.getWorldPosition()
        this.flyScale = this.dolphin.transform.getLocalScale()
        this.dolphin.visual.renderOrder = 40
      }
      this.flightStart = time
      this.flying = true
    }
    this.fly(time)
  }

  private sway(elapsed: number, swaySec: number): void {
    const u = Math.min(1, Math.max(0, elapsed / swaySec))
    const envelope = Math.sin(u * Math.PI)
    for (let i = 0; i < this.figures.length; i++) {
      const figure = this.figures[i]
      const scale = Math.max(figure.transform.getWorldScale().x, 0.001)
      const local = (this.swayCm * envelope * figure.axis) / scale
      const slide = figure.startRot.multiplyVec3(new vec3(local, 0, local * 0.35))
      figure.transform.setLocalPosition(figure.startPos.add(slide))
      const rad = (this.swayDegrees * Math.PI / 180) * envelope * figure.axis
      const rock = quat.fromEulerAngles(rad * 0.35, 0, rad)
      figure.transform.setLocalRotation(figure.startRot.multiply(rock))
    }
  }

  private fly(time: number): void {
    this.restoreStillFigures()
    if (!this.dolphin) {
      return
    }
    const u = Math.min(1, Math.max(0, (time - this.flightStart) / this.flightSec))
    const target = this.swimTarget()
    const center = this.sky
      ? this.sky.transform.getWorldPosition()
      : this.getTransform().getWorldPosition()
    const radius = this.sky ? this.sky.transform.getWorldScale().x * 0.5 : 70
    const toTarget = target.sub(center)
    const dist = Math.max(toTarget.length, 0.001)
    const rim = center.add(toTarget.uniformScale(Math.min(dist, radius * 1.12) / dist))

    let pos: vec3
    if (u < 0.34) {
      pos = vec3.lerp(this.flyOrigin, rim, this.smooth(u / 0.34))
    } else {
      pos = vec3.lerp(rim, target, this.smooth((u - 0.34) / 0.66))
    }
    const lift = Math.sin(u * Math.PI) * 30
    this.dolphin.transform.setWorldPosition(new vec3(pos.x, pos.y + lift, pos.z))

    const shrink = 1 - 0.94 * this.smooth(u)
    this.dolphin.transform.setLocalScale(new vec3(
      this.flyScale.x * shrink,
      this.flyScale.y * shrink,
      this.flyScale.z * shrink
    ))
    if (u >= 0.97) {
      this.dolphin.object.enabled = false
      return
    }
    const alpha = u < 0.62 ? 1 : 1 - (u - 0.62) / 0.35
    this.setAlpha(this.dolphin, Math.max(0, alpha))
  }

  private swimTarget(): vec3 {
    if (this.swimmer) {
      return this.swimmer.getTransform().getWorldPosition()
    }
    return new vec3(0, -12, -60)
  }

  private restoreFigures(): void {
    for (let i = 0; i < this.figures.length; i++) {
      this.restore(this.figures[i])
    }
  }

  private restoreStillFigures(): void {
    for (let i = 0; i < this.figures.length; i++) {
      if (!this.figures[i].dolphin) {
        this.restore(this.figures[i])
      }
    }
  }

  private restore(figure: Figure): void {
    figure.transform.setLocalPosition(figure.startPos)
    figure.transform.setLocalRotation(figure.startRot)
    figure.transform.setLocalScale(figure.startScale)
  }

  private setFiguresEnabled(enabled: boolean): void {
    for (let i = 0; i < this.figures.length; i++) {
      this.figures[i].object.enabled = enabled
    }
  }

  private prepare(obj: SceneObject, visual: RenderMeshVisual): Layer {
    const material = visual.mainMaterial.clone()
    visual.mainMaterial = material
    return {
      object: obj,
      transform: obj.getTransform(),
      material: material,
    }
  }

  private setAlpha(layer: { material: Material }, alpha: number): void {
    const color = new vec4(1, 1, 1, alpha)
    const pass = layer.material.mainPass
    pass.baseColorFactor = color
    pass.baseColor = color
  }

  private fade(time: number, start: number): number {
    return Math.min(1, Math.max(0, (time - start) / this.fadeSec))
  }

  private smooth(t: number): number {
    const c = Math.max(0, Math.min(1, t))
    return c * c * (3 - 2 * c)
  }

  private drawOrder(name: string): number {
    if (name.indexOf("Water Bearer") !== -1) return 2
    if (name.indexOf("Bull") !== -1) return 3
    if (name.indexOf("Archer") !== -1) return 4
    if (name.indexOf("Winged") !== -1) return 5
    if (name.indexOf("Pegasus") !== -1) return 6
    if (name.indexOf("Reaching") !== -1) return 7
    if (name.indexOf("Sea Goat") !== -1) return 8
    if (name.indexOf("Lion") !== -1) return 9
    if (name.indexOf("Crab") !== -1) return 10
    if (name.indexOf("Dolphin") !== -1) return 11
    return 12
  }

  private isFigure(name: string): boolean {
    if (name.indexOf("Starry") !== -1 || name.indexOf("Lines") !== -1) {
      return false
    }
    if (name === "Scene" || name === "Scenes" || name === "CONSTELLATIONS") {
      return false
    }
    return true
  }

  private findExact(name: string): SceneObject | null {
    const count = global.scene.getRootObjectsCount()
    for (let i = 0; i < count; i++) {
      const found = this.findNamed(global.scene.getRootObject(i), name)
      if (found) {
        return found
      }
    }
    return null
  }

  private findNamed(obj: SceneObject, name: string): SceneObject | null {
    if (obj.name === name) {
      return obj
    }
    const count = obj.getChildrenCount()
    for (let i = 0; i < count; i++) {
      const found = this.findNamed(obj.getChild(i), name)
      if (found) {
        return found
      }
    }
    return null
  }

  private collect(obj: SceneObject, out: SceneObject[]): void {
    const count = obj.getChildrenCount()
    for (let i = 0; i < count; i++) {
      const child = obj.getChild(i)
      out.push(child)
      this.collect(child, out)
    }
  }
}

type Layer = {
  object: SceneObject
  transform: Transform
  material: Material
}

type Figure = {
  object: SceneObject
  visual: RenderMeshVisual
  material: Material
  transform: Transform
  startPos: vec3
  startRot: quat
  startScale: vec3
  axis: number
  dolphin: boolean
}

/**
 * Temporary pinch target. Plays the same melody Delphi plays when asked.
 * Remove this object when the voice path is confirmed on the glasses.
 */

import { bindPinch } from "./SikAdapter"
import { Interactable } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"

const MESH = requireAsset("../Meshes/NoteOrbSphere.mesh") as RenderMesh
const MATERIAL = requireAsset("../Materials/OrbGold.mat") as Material

@component
export class MelodyTestButton extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">Melody test – pinch plays one existing song</span>')
  @ui.separator

  @input
  @allowUndefined
  duet: ScriptComponent

  private interactable: Interactable | null = null
  private lastPinch = -10

  onAwake(): void {
    this.build()
    this.createEvent("OnStartEvent").bind(() => this.arm())
  }

  private build(): void {
    const host = this.sceneObject
    const visual = host.createComponent("Component.RenderMeshVisual") as RenderMeshVisual
    visual.mesh = MESH
    visual.mainMaterial = MATERIAL

    const collider = host.createComponent("Physics.ColliderComponent") as ColliderComponent
    const shape = Shape.createSphereShape()
    shape.radius = 1
    collider.shape = shape
    collider.intangible = false

    this.interactable = host.createComponent(Interactable.getTypeName()) as Interactable
  }

  private arm(): void {
    this.placeInFront()
    if (!this.interactable) {
      print("[Delphi] Test button has no pinch")
      return
    }
    bindPinch(
      this.interactable,
      () => this.play(),
      () => {}
    )
    print("[Delphi] Test button ready")
  }

  private play(): void {
    const now = getTime()
    if (now - this.lastPinch < 1) {
      return
    }
    const api = this.duet && (this.duet.api as { playAskedMelody?: () => void })
    if (!api || typeof api.playAskedMelody !== "function") {
      print("[Delphi] Test button has no melody")
      return
    }
    this.lastPinch = now
    print("[Delphi] Test pinch")
    api.playAskedMelody()
  }

  private placeInFront(): void {
    const camera = this.findCamera()
    if (!camera) {
      return
    }
    const host = this.sceneObject
    host.setParent(camera)
    const transform = host.getTransform()
    transform.setLocalPosition(new vec3(45, -8, 30))
    transform.setLocalRotation(quat.quatIdentity())
    transform.setLocalScale(new vec3(12, 12, 12))
  }

  private findCamera(): SceneObject | null {
    const count = global.scene.getRootObjectsCount()
    for (let i = 0; i < count; i++) {
      const found = this.cameraOn(global.scene.getRootObject(i))
      if (found) {
        return found
      }
    }
    return null
  }

  private cameraOn(host: SceneObject): SceneObject | null {
    if (host.getComponent("Component.Camera")) {
      return host
    }
    const children = host.getChildrenCount()
    for (let i = 0; i < children; i++) {
      const found = this.cameraOn(host.getChild(i))
      if (found) {
        return found
      }
    }
    return null
  }
}

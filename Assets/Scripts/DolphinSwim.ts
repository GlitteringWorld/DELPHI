/**
 * DolphinSwim — the dolphin meanders in from 1.22 m and holds at 0.6 m.
 *
 * The path is an S, like a swimmer weaving in: right, left, right, then
 * straight into the hold. The swim is in the parent's local space, so moving
 * the Experience object moves the dolphin with it. Inspector distances are meters.
 */

@component
export class DolphinSwim extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">DolphinSwim – approach the wearer, then hold</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">Settings</span>')
  @ui.group_start("Settings")
  @input
  @hint("Distance in front of the camera when the swim starts, in meters. 4 feet is 1.22.")
  @widget(new SliderWidget(0.4, 3, 0.01))
  startDistanceM: number = 1.22

  @input
  @hint("Distance in front of the camera where the dolphin holds, in meters. Arm's length is 0.6.")
  @widget(new SliderWidget(0.3, 2, 0.01))
  holdDistanceM: number = 0.6

  @input
  @hint("Seconds the dolphin takes to swim from the start distance to the hold distance.")
  @widget(new SliderWidget(0.5, 12, 0.1))
  swimDurationSec: number = 4

  @input
  @hint("How far below the camera the dolphin root sits, in meters.")
  @widget(new SliderWidget(0, 0.6, 0.01))
  belowEyeM: number = 0.12

  @input
  @hint("Width of the meander, in meters, from the center line to the outside of a curve.")
  @widget(new SliderWidget(0, 0.6, 0.01))
  swayM: number = 0.22

  @input
  @hint("Extra yaw in degrees if the imported dolphin's nose does not point at the wearer. 180 flips it.")
  @widget(new SliderWidget(-180, 180, 1))
  yawOffsetDeg: number = 0
  @ui.group_end

  /** Fired once, with the snout world position, when the hold begins. */
  onArrived: ((snoutWorld: vec3) => void) | null = null

  private elapsed = 0
  private arrived = false
  private snout: SceneObject | null = null
  private restPosition = new vec3(0, 0, 0)
  private restRotation = quat.quatIdentity()

  onAwake(): void {
    const transform = this.getTransform()
    const placed = transform.getLocalPosition()
    this.restPosition = new vec3(placed.x, placed.y, placed.z)
    this.restRotation = transform.getLocalRotation()
    this.snout = this.findNamedChild(this.getSceneObject(), "Snout")
    this.place(0)
    this.createEvent("UpdateEvent").bind(() => this.onUpdate())
  }

  hasArrived(): boolean {
    return this.arrived
  }

  snoutWorldPosition(): vec3 {
    if (this.snout) {
      return this.snout.getTransform().getWorldPosition()
    }
    return this.getTransform().getWorldPosition()
  }

  private onUpdate(): void {
    if (this.arrived) {
      return
    }
    this.elapsed += getDeltaTime()
    const duration = Math.max(0.2, this.swimDurationSec)
    const u = Math.min(1, this.elapsed / duration)
    this.place(u)
    if (u >= 1 && !this.arrived) {
      this.arrived = true
      if (this.onArrived) {
        this.onArrived(this.snoutWorldPosition())
      }
    }
  }

  private place(u: number): void {
    const transform = this.getTransform()
    const here = this.poseAt(u)
    transform.setLocalPosition(new vec3(here.x, here.y, here.z))
    if (u >= 1) {
      transform.setLocalRotation(this.landingRotation())
      return
    }
    const ahead = this.poseAt(Math.min(0.999, u + 0.02))
    transform.setLocalRotation(this.leadWithHead(ahead.x - here.x, ahead.z - here.z, u))
  }

  private poseAt(u: number): vec3 {
    const swayCm = this.meander(u) * this.swayM * 100
    const backCm = this.travelM(u) * 100
    return new vec3(
      this.restPosition.x + swayCm,
      this.restPosition.y,
      this.restPosition.z - backCm
    )
  }

  private landingRotation(): quat {
    const yawOffset = (this.yawOffsetDeg * Math.PI) / 180
    return this.restRotation.multiply(quat.fromEulerAngles(0, yawOffset, 0))
  }

  // The landing pose already points the head at the wearer. Yaw that pose by the
  // path's turn so the head stays in front, then settle exactly on the landing.
  private leadWithHead(vx: number, vz: number, u: number): quat {
    const len = Math.sqrt(vx * vx + vz * vz)
    let facing = this.landingRotation()
    if (len > 0.001) {
      const heading = Math.atan2(vx, vz)
      facing = this.landingRotation().multiply(quat.fromEulerAngles(0, heading, 0))
    }
    if (u > 0.78) {
      const t = (u - 0.78) / 0.22
      const smooth = t * t * (3 - 2 * t)
      facing = quat.slerp(facing, this.landingRotation(), smooth)
    }
    return facing
  }

  // Right, left, right, then straighten into the hold. u is 0 at the start and 1 at the hold.
  private meander(u: number): number {
    const waves = 1.5
    let envelope = 1
    if (u > 0.72) {
      const t = (u - 0.72) / 0.28
      envelope = 1 - t * t * (3 - 2 * t)
    }
    return Math.sin(u * Math.PI * 2 * waves + Math.PI / 2) * envelope
  }

  private travelM(u: number): number {
    const span = this.startDistanceM - this.holdDistanceM
    return (span > 0 ? span : 0) * (1 - u)
  }

  private findNamedChild(host: SceneObject, name: string): SceneObject | null {
    const count = host.getChildrenCount()
    for (let i = 0; i < count; i++) {
      const child = host.getChild(i)
      if (child.name === name) {
        return child
      }
      const nested = this.findNamedChild(child, name)
      if (nested) {
        return nested
      }
    }
    return null
  }
}

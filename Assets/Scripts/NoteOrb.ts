/**
 * NoteOrb — a pinchable sphere with a position-controlled instrument.
 *
 * Pinch starts a looping performance. Height picks the semitone while the
 * loop keeps its place in the bar. Release stops the sound. The orb stays
 * where it was left and can be pinched again.
 */

import { bindManipulation, bindPinch, findInteractable, findManipulation } from "./SikAdapter"
import { NOTES_PER_VOICE, VOICES, VOICE_FAMILIES } from "./SatiePitchBanks"
import { Interactable } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import { InteractableManipulation } from "SpectaclesInteractionKit.lspkg/Components/Interaction/InteractableManipulation/InteractableManipulation"

const PITCH_STEPS = NOTES_PER_VOICE

function enableSpatial(audio: AudioComponent | null): void {
  if (!audio) {
    return
  }
  try {
    audio.spatialAudio.enabled = true
    audio.spatialAudio.positionEffect.enabled = true
  } catch (error) {
    // The clip still plays if spatial playback is unavailable.
  }
}

type Mode = "parked" | "arcing" | "live" | "held" | "closed"

@component
export class NoteOrb extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">NoteOrb – pinch plays, height bends pitch</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">Settings</span>')
  @ui.group_start("Settings")
  @input
  @hint("Lowest pitch, in meters below the head height captured when the stage froze. C4.")
  @widget(new SliderWidget(0, 1, 0.01))
  pitchBelowM: number = 0.35

  @input
  @hint("Highest pitch, in meters above that head height. C5.")
  @widget(new SliderWidget(0, 1, 0.01))
  pitchAboveM: number = 0.45
  @ui.group_end

  private mode: Mode = "parked"
  private audio: AudioComponent | null = null
  private accent: AudioComponent | null = null
  private pinchOrigin: vec3 | null = null
  private pinchElapsed = 0
  private auditioning = false
  private accentLeft = 0
  private interactable: Interactable | null = null
  private manipulation: InteractableManipulation | null = null
  private stage: SceneObject | null = null
  private bank: AudioTrackAsset[] = []
  private instrument = 0
  private step = 6
  private rowSpanCm = 40
  private depthOriginCm = 0
  private articulation = 0
  private playbackElapsed = 0
  onFirstPinch: (() => void) | null = null
  onPlayerSound: (() => void) | null = null
  onAssignment: ((instrument: number, step: number) => void) | null = null

  isHeld(): boolean {
    return this.mode === "held"
  }

  isReady(): boolean {
    return this.mode === "live" || this.mode === "held"
  }

  isClosed(): boolean {
    return this.mode === "closed"
  }

  private restLocal = new vec3(0, 0, 0)
  private arcFrom = vec3.zero()
  private arcTo = vec3.zero()
  private arcElapsed = 0
  private arcDuration = 1.2
  private arcDone: (() => void) | null = null

  onAwake(): void {
    const host = this.getSceneObject()
    this.audio = host.getComponent("Component.AudioComponent") as AudioComponent
    this.interactable = findInteractable(host)
    this.manipulation = findManipulation(host)
    this.setPinchEnabled(false)
    const placed = host.getTransform().getLocalPosition()
    this.restLocal = new vec3(placed.x, placed.y, placed.z)

    this.createEvent("OnStartEvent").bind(() => {
      this.accent = host.createComponent("Component.AudioComponent")
      enableSpatial(this.audio)
      enableSpatial(this.accent)
      this.bindInteraction()
      this.tintShape()
    })
    this.createEvent("UpdateEvent").bind(() => this.onUpdate())
  }

  setStage(stage: SceneObject, rowSpanM: number): void {
    this.stage = stage
    this.rowSpanCm = Math.max(1, rowSpanM * 100)
  }

  setInstrument(index: number): void {
    this.instrument = index
    this.bank = VOICES[index]
    this.paint()
  }

  holdInPlace(): void {
    if (this.mode === "closed") {
      return
    }
    this.mode = "live"
    this.setPinchEnabled(true)
    this.depthOriginCm = this.stageLocal(this.getTransform().getWorldPosition()).z
  }

  restWorldPosition(): vec3 {
    const parent = this.getSceneObject().getParent()
    if (!parent) {
      return new vec3(this.restLocal.x, this.restLocal.y, this.restLocal.z)
    }
    const parentTransform = parent.getTransform()
    const origin = parentTransform.getWorldPosition()
    const rotation = parentTransform.getWorldRotation()
    const scale = parentTransform.getWorldScale()
    const scaled = new vec3(this.restLocal.x * scale.x, this.restLocal.y * scale.y, this.restLocal.z * scale.z)
    return origin.add(rotation.multiplyVec3(scaled))
  }

  readAssignment(): { instrument: number, step: number } {
    const local = this.stageLocal(this.getTransform().getWorldPosition())
    const laneSpacing = this.rowSpanCm / (VOICES.length - 1)
    const instrument = Math.min(VOICES.length - 1, Math.max(0, Math.round((local.x + this.rowSpanCm * 0.5) / laneSpacing)))
    return { instrument: instrument, step: this.pitchStep(local.y) }
  }

  beginArc(fromWorld: vec3, toWorld: vec3, durationSec: number, onDone: () => void): void {
    this.arcFrom = fromWorld
    this.arcTo = toWorld
    this.arcElapsed = 0
    this.arcDuration = Math.max(0.2, durationSec)
    this.arcDone = onDone
    this.mode = "arcing"
    this.getTransform().setWorldPosition(fromWorld)
  }

  endSession(): void {
    if (this.mode === "closed") {
      return
    }
    this.stopSound()
    if (this.accent && this.accent.isPlaying()) {
      this.accent.stop(true)
    }
    this.setPinchEnabled(false)
    this.mode = "closed"
  }

  private bindInteraction(): void {
    if (this.interactable) {
      bindPinch(this.interactable, () => this.onPinchStart(), () => this.onPinchEnd())
    }
    if (this.manipulation) {
      bindManipulation(this.manipulation, () => this.onPinchStart(), () => this.onPinchEnd())
    }
  }

  private onUpdate(): void {
    if (this.mode === "arcing") {
      this.advanceArc(getDeltaTime())
      return
    }
    if (this.mode === "held") {
      this.pinchElapsed += getDeltaTime()
      const position = this.getTransform().getWorldPosition()
      const origin = this.pinchOrigin
      const moved = origin && (
        Math.abs(position.x - origin.x) > 1 || Math.abs(position.y - origin.y) > 1 ||
        Math.abs(position.z - origin.z) > 1
      )
      if (this.auditioning || this.pinchElapsed >= 0.18 || moved) {
        this.auditioning = true
        this.followPitch()
      }
    }
    if (this.accentLeft > 0) {
      this.accentLeft -= getDeltaTime()
      if (this.accentLeft <= 0 && this.accent && this.accent.isPlaying()) {
        this.accent.stop(true)
      }
    }
    if (this.audio && this.audio.isPlaying()) {
      this.playbackElapsed += getDeltaTime()
      const time = this.playbackElapsed
      if (this.articulation === 1) {
        this.audio.volume = 0.48 * (0.53 + 0.45 * Math.cos(time * Math.PI * 1.7))
      } else if (this.articulation === 2) {
        const phrase = ((time + 0.65) % 6.4) / 6.4
        const swell = phrase < 0.68 ? Math.pow(Math.sin(Math.PI * phrase / 0.68), 2) : 0
        this.audio.volume = 0.52 * (0.025 + swell)
      } else {
        this.audio.volume = 0.55
      }
    }
  }

  private advanceArc(dt: number): void {
    this.arcElapsed += dt
    const t = Math.min(1, this.arcElapsed / this.arcDuration)
    const ease = t * t * (3 - 2 * t)
    const mid = vec3.lerp(this.arcFrom, this.arcTo, 0.5).add(new vec3(0, 14, 0))
    const position = vec3.lerp(vec3.lerp(this.arcFrom, mid, ease), vec3.lerp(mid, this.arcTo, ease), ease)
    this.getTransform().setWorldPosition(position)
    if (t < 1) {
      return
    }
    this.getTransform().setLocalPosition(new vec3(this.restLocal.x, this.restLocal.y, this.restLocal.z))
    this.depthOriginCm = this.stageLocal(this.getTransform().getWorldPosition()).z
    this.mode = "live"
    this.setPinchEnabled(true)
    const done = this.arcDone
    this.arcDone = null
    if (done) {
      done()
    }
  }

  private onPinchStart(): void {
    if (this.mode !== "live" && this.mode !== "held") {
      return
    }
    const starting = this.mode !== "held"
    this.mode = "held"
    if (starting) {
      this.onFirstPinch?.()
      this.onFirstPinch = null
      this.pinchElapsed = 0
      this.pinchOrigin = this.getTransform().getWorldPosition()
      this.auditioning = false
      this.playAccent()
    }
  }

  private onPinchEnd(): void {
    if (this.mode !== "held") {
      return
    }
    if (this.auditioning && this.articulation === 0) {
      this.stopSound()
    }
    this.mode = "live"
  }

  private playAccent(): void {
    const local = this.stageLocal(this.getTransform().getWorldPosition())
    const track = this.bank[this.pitchStep(local.y)]
    if (!this.accent || !track) {
      return
    }
    if (this.accent.isPlaying()) {
      this.accent.stop(false)
    }
    this.accent.audioTrack = track
    this.accent.volume = 0.62
    this.accent.fadeInTime = 0.004
    this.accent.fadeOutTime = 0.08
    this.accent.play(1)
    this.accentLeft = 0.52
  }

  private followPitch(): void {
    const local = this.stageLocal(this.getTransform().getWorldPosition())
    const step = this.pitchStep(local.y)
    // Starting positions align with the first selection in each instrument family.
    const laneSpacing = this.rowSpanCm / (VOICES.length - 1)
    const instrument = Math.min(VOICES.length - 1, Math.max(0, Math.round((local.x + this.rowSpanCm * 0.5) / laneSpacing)))
    const changed = instrument !== this.instrument
    const depth = this.depthOriginCm - local.z
    this.articulation = depth < 6 ? 0 : depth < 18 ? 1 : 2
    if (changed) {
      this.setInstrument(instrument)
    }
    if (this.onAssignment) {
      this.onAssignment(this.instrument, step)
    }
    if (!this.audio || !this.audio.isPlaying()) {
      this.step = step
      this.playLoop(step, false)
      return
    }
    if (step === this.step && !changed) {
      return
    }
    this.playLoop(step, true)
  }

  private playLoop(step: number, keepPhase: boolean): void {
    if (!this.audio || !this.bank[step]) {
      return
    }
    const track = this.bank[step]
    let phase = 0
    if (keepPhase && this.audio.duration > 0) {
      phase = this.audio.position / this.audio.duration
    }
    if (this.audio.isPlaying()) {
      this.audio.stop(false)
    }
    this.audio.audioTrack = track
    this.audio.volume = 0.5
    this.audio.fadeInTime = 0.08
    this.audio.fadeOutTime = 0.12
    if (!keepPhase) {
      this.playbackElapsed = 0
    }
    this.audio.play(-1)
    if (keepPhase && this.audio.duration > 0) {
      const wrapped = phase < 0 ? 0 : phase > 0.999 ? 0 : phase
      this.audio.position = wrapped * this.audio.duration
    }
    this.step = step
    if (this.onPlayerSound) {
      this.onPlayerSound()
    }
  }

  private stopSound(): void {
    if (this.audio && this.audio.isPlaying()) {
      this.audio.stop(true)
    }
  }

  private setPinchEnabled(enabled: boolean): void {
    if (this.interactable) {
      this.interactable.enabled = enabled
    }
    if (this.manipulation) {
      this.manipulation.enabled = enabled
    }
  }

  private shapeColor(): vec4 | null {
    const name = this.getSceneObject().name
    if (name === "Gel") {
      return new vec4(51 / 255, 128 / 255, 231 / 255, 1)
    }
    if (name === "OvalPebble") {
      return new vec4(121 / 255, 179 / 255, 218 / 255, 1)
    }
    if (name === "Pebble") {
      return new vec4(0, 151 / 255, 178 / 255, 1)
    }
    if (name === "starfish") {
      return new vec4(12 / 255, 192 / 255, 223 / 255, 1)
    }
    return null
  }

  private tintShape(): void {
    const color = this.shapeColor()
    if (!color) {
      return
    }
    this.tintTree(this.getSceneObject(), color)
  }

  private tintTree(obj: SceneObject, color: vec4): void {
    const count = obj.getChildrenCount()
    for (let i = 0; i < count; i++) {
      const child = obj.getChild(i)
      const visual = child.getComponent("Component.RenderMeshVisual") as RenderMeshVisual
      if (visual && visual.mainMaterial) {
        this.applyTint(visual, color)
      }
      this.tintTree(child, color)
    }
  }

  private applyTint(visual: RenderMeshVisual, color: vec4): void {
    const source = visual.mainMaterial
    let material = source
    try {
      const copy = source.clone()
      if (copy.mainPass) {
        material = copy
      }
    } catch (error) {
      material = source
    }
    try {
      material.mainPass.baseColor = color
      material.mainPass.baseColorFactor = color
      visual.mainMaterial = material
    } catch (error) {
      // Leave the imported material if this Lens Studio pass has no color input.
    }
  }

  private paint(): void {
    const host = this.getSceneObject()
    const count = host.getChildrenCount()
    for (let i = 0; i < count; i++) {
      const child = host.getChild(i)
      if (child.name !== "Visual") {
        continue
      }
      const visual = child.getComponent("Component.RenderMeshVisual") as RenderMeshVisual
      if (!visual || !visual.mainMaterial || !visual.mainMaterial.mainPass) {
        return
      }
      const material = this.orbMaterial || visual.mainMaterial.clone()
      this.orbMaterial = material
      material.mainPass.baseColor = this.colorFor(this.instrument)
      visual.mainMaterial = material
      return
    }
  }

  private orbMaterial: Material | null = null

  private colorFor(index: number): vec4 {
    const family = VOICE_FAMILIES[index]
    if (family === 0) {
      return new vec4(0.86, 0.18, 0.2, 1)
    }
    if (family === 1) {
      return new vec4(0.16, 0.74, 0.32, 1)
    }
    if (family === 2) {
      return new vec4(0.56, 0.34, 0.86, 1)
    }
    return new vec4(0.95, 0.78, 0.16, 1)
  }

  private stageLocal(world: vec3): vec3 {
    if (!this.stage) {
      return new vec3(world.x, world.y, world.z)
    }
    const transform = this.stage.getTransform()
    const origin = transform.getWorldPosition()
    const rotation = transform.getWorldRotation()
    const inverse = new quat(rotation.w, rotation.x, rotation.y, rotation.z).invert()
    return inverse.multiplyVec3(new vec3(world.x - origin.x, world.y - origin.y, world.z - origin.z))
  }

  private pitchStep(stageYcm: number): number {
    const below = this.pitchBelowM * 100
    const span = Math.max(1, below + this.pitchAboveM * 100)
    const t = this.clamp01((stageYcm + below) / span)
    const step = Math.round(t * (PITCH_STEPS - 1))
    if (step < 0) {
      return 0
    }
    if (step >= PITCH_STEPS) {
      return PITCH_STEPS - 1
    }
    return step
  }

  private clamp01(value: number): number {
    if (value < 0) {
      return 0
    }
    if (value > 1) {
      return 1
    }
    return value
  }
}

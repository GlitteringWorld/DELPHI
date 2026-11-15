/**
 * SpatialSonicMain — session orchestrator.
 *
 * Owns the play clock and the frozen stage. DolphinSwim moves the dolphin.
 * Each orb starts in one Satie family: red strings, green mallets, purple winds, yellow bells.
 */

import { DolphinSwim } from "./DolphinSwim"
import { NoteOrb } from "./NoteOrb"
import { FAMILY_STARTS, VOICES } from "./SatiePitchBanks"

const CELESTIAL_BED = requireAsset("../GeneratedSFX/CelestialBed.wav") as AudioTrackAsset
const DELPHI_VOICE = requireAsset("../Delphi_Voice.mp3") as AudioTrackAsset
const DRONE_VOLUME = 0.065

@component
export class SpatialSonicMain extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">SpatialSonic – spatial note composer</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @ui.group_start("References")
  @input
  @hint("Dolphin swim controller on the imported dolphin.")
  dolphin: DolphinSwim

  @input
  @hint("Empty anchor. Its pose is captured when the dolphin stops and then stays put.")
  stage: SceneObject

  @input
  @hint("Leftmost orb.")
  orb1: NoteOrb

  @input
  @hint("Second orb from the left.")
  orb2: NoteOrb

  @input
  @hint("Third orb from the left.")
  orb3: NoteOrb

  @input
  @hint("Rightmost orb.")
  orb4: NoteOrb
  @ui.group_end

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Settings</span>')
  @ui.group_start("Settings")
  @input
  @hint("Seconds of play after the shapes settle. Pinch then turns off and the sounds stop.")
  @widget(new SliderWidget(5, 120, 1))
  playDurationSec: number = 60

  @input
  @hint("Seconds the orbs take to arc from the snout into their row.")
  @widget(new SliderWidget(0.3, 4, 0.05))
  arcDurationSec: number = 1.2

  @input
  @hint("How far in front of the frozen head the orb row sits, in meters.")
  @widget(new SliderWidget(0.2, 1.2, 0.01))
  rowDistanceM: number = 0.45

  @input
  @hint("Width of the settled orb row, in meters.")
  @widget(new SliderWidget(0.1, 1, 0.01))
  rowSpanM: number = 0.4

  @input
  @hint("Draw collider wireframes on every collider in the scene.")
  debugColliders: boolean = false
  @ui.group_end

  private orbs: NoteOrb[] = []
  private bed: AudioComponent | null = null
  private drones: AudioComponent[] = []
  private droneKeys: number[] = []
  private playing = false
  private playLeft = 0
  private settled = 0
  private sessionClosed = false

  onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => this.onStart())
    this.createEvent("UpdateEvent").bind(() => this.onUpdate())
  }

  private onStart(): void {
    this.orbs = [this.orb1, this.orb2, this.orb3, this.orb4]
    if (!this.dolphin || !this.stage || !this.orbs[0] || !this.orbs[1] || !this.orbs[2] || !this.orbs[3]) {
      print("SpatialSonicMain: dolphin, stage, or an orb input is not wired.")
      return
    }
    this.attachAudioListener()
    this.playOpeningVoice()
    this.bed = this.stage.createComponent("Component.AudioComponent")
    this.bed.audioTrack = CELESTIAL_BED
    this.bed.volume = DRONE_VOLUME
    for (let i = 0; i < this.orbs.length; i++) {
      const host = global.scene.createSceneObject("DroneTone" + i)
      host.setParent(this.stage)
      this.drones.push(host.createComponent("Component.AudioComponent"))
      this.droneKeys.push(-1)
      this.orbs[i].setInstrument(FAMILY_STARTS[i])
      this.orbs[i].setStage(this.stage, this.rowSpanM)
      const piece = i
      this.orbs[i].onAssignment = (instrument, step) => this.sustainTone(piece, instrument, step)
      this.orbs[i].holdInPlace()
    }
    this.paintColliderDebug(global.scene.getRootObjectsCount())
    this.dolphin.onArrived = (snout) => this.onDolphinArrived(snout)
  }

  private playOpeningVoice(): void {
    const host = global.scene.createSceneObject("DelphiOpening")
    const audio = host.createComponent("Component.AudioComponent") as AudioComponent
    audio.audioTrack = DELPHI_VOICE
    audio.volume = 1
    audio.play(1)
  }

  private onUpdate(): void {
    if (!this.playing && !this.sessionClosed && this.instrumentsLoaded()) {
      this.openPlay()
    }
    if (!this.playing || this.sessionClosed) {
      return
    }
    if (this.bed && !this.bed.isPlaying()) {
      this.bed.play(-1)
    }
    this.playLeft -= getDeltaTime()
    if (this.playLeft > 0) {
      return
    }
    this.sessionClosed = true
    this.playing = false
    if (this.bed && this.bed.isPlaying()) {
      this.bed.stop(false)
    }
    for (let i = 0; i < this.drones.length; i++) {
      if (this.drones[i].isPlaying()) {
        this.drones[i].stop(false)
      }
    }
    for (let i = 0; i < this.orbs.length; i++) {
      this.orbs[i].endSession()
    }
  }

  private onDolphinArrived(_snoutWorld: vec3): void {
    this.freezeStage()
  }

  private instrumentsLoaded(): boolean {
    if (this.orbs.length < 4) {
      return false
    }
    for (let i = 0; i < this.orbs.length; i++) {
      if (!this.orbs[i] || !this.orbs[i].isReady()) {
        return false
      }
    }
    return true
  }

  private openPlay(): void {
    if (this.playing || this.sessionClosed) {
      return
    }
    this.settled = this.orbs.length
    this.playLeft = this.playDurationSec
    this.playing = true
    if (this.bed && !this.bed.isPlaying()) {
      this.bed.play(-1)
      print("SpatialSonic: celestial bed")
    }
  }

  private sustainTone(index: number, instrument: number, step: number): void {
    if (index < 0 || index >= this.drones.length) {
      return
    }
    const tone = this.drones[index]
    const bank = VOICES[instrument]
    const track = bank ? bank[step] : null
    if (!tone || !track || !this.playing || this.sessionClosed) {
      return
    }
    const key = instrument * 100 + step
    if (this.droneKeys[index] === key && tone.isPlaying()) {
      return
    }
    let phase = 0
    if (tone.isPlaying() && tone.duration > 0) {
      phase = tone.position / tone.duration
    }
    if (tone.isPlaying()) {
      tone.stop(false)
    }
    tone.audioTrack = track
    tone.volume = DRONE_VOLUME
    tone.play(-1)
    if (phase > 0 && phase < 0.999 && tone.duration > 0) {
      tone.position = phase * tone.duration
    }
    this.droneKeys[index] = key
    print("SpatialSonic: drone " + index + " " + instrument + " " + step)
  }

  private freezeStage(): void {
    // The stage stays where it is under Experience. Moving that parent
    // moves the orb row. The script no longer snaps the stage to the camera.
  }

  private attachAudioListener(): void {
    for (let i = 0; i < global.scene.getRootObjectsCount(); i++) {
      const root = global.scene.getRootObject(i)
      if (!root.getComponent("Component.Camera")) {
        continue
      }
      if (!root.getComponent("Component.AudioListenerComponent")) {
        root.createComponent("Component.AudioListenerComponent")
      }
      return
    }
  }

  private paintColliderDebug(rootCount: number): void {
    for (let i = 0; i < rootCount; i++) {
      this.paintObject(global.scene.getRootObject(i))
    }
  }

  private paintObject(host: SceneObject): void {
    const colliders = host.getComponents("Physics.ColliderComponent")
    for (let i = 0; i < colliders.length; i++) {
      colliders[i].debugDrawEnabled = this.debugColliders
    }
    const childCount = host.getChildrenCount()
    for (let i = 0; i < childCount; i++) {
      this.paintObject(host.getChild(i))
    }
  }

}

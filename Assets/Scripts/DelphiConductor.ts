/**
 * DelphiConductor — connects the 5.15.4 Delphi voice duet to this scene.
 *
 * Speech uses AsrModule, which Spectacles has had since Lens Studio 5.9.
 * Delphi's notes use the Satie loops already in the project. Moon Harp,
 * Soft Gong, Bellaton (Glass Bells), and Water Glass each have their own
 * AudioComponent on the dolphin, separate from the pinched shapes.
 * No UI Kit, no remote model, and no audio calls before OnStart.
 */

import { DolphinSwim } from "./DolphinSwim"
import { NoteOrb } from "./NoteOrb"
import { VOICES } from "./SatiePitchBanks"

const DELPHI_VOICES = [1, 4, 7, 8]
const PENTA = [0, 2, 4, 7, 9, 12, 12, 11, 9, 7, 4]
const MELODY_MAX_SEC = 9

const MELODY_TRACKS = [
  requireAsset("../CelestialSong/01 - Silver Strings.mp3") as AudioTrackAsset,
  requireAsset("../CelestialSong/02 - Moon Harp.mp3") as AudioTrackAsset,
  requireAsset("../CelestialSong/03 - Aurora Keys.mp3") as AudioTrackAsset,
  requireAsset("../CelestialSong/04 - Orbit Mallets.mp3") as AudioTrackAsset,
  requireAsset("../CelestialSong/05 - Soft Gong.mp3") as AudioTrackAsset,
  requireAsset("../CelestialSong/06 - Breath Flute.mp3") as AudioTrackAsset,
  requireAsset("../CelestialSong/07 - Velvet Horn.mp3") as AudioTrackAsset,
  requireAsset("../CelestialSong/08 - Glass Bells.mp3") as AudioTrackAsset,
  requireAsset("../CelestialSong/09 - Water Glass.mp3") as AudioTrackAsset,
  requireAsset("../CelestialSong/10 - Dew Drops.mp3") as AudioTrackAsset,
]

interface DolphinNote {
  star: number
  zone: number
  step: number
  gain: number
  duration?: number
}

interface ApproachEvent {
  star: number
  at: number
}

interface DuetApi {
  updateStar: (id: number, x: number, y: number, held: boolean) => void
  playerPlayed: (id: number, strength: number) => void
  onDolphinNote: ((note: DolphinNote) => void) | null
  onStop: (() => void) | null
  onApproach: ((event: ApproachEvent | null) => void) | null
  onStatus: ((message: string) => void) | null
  onMelody: (() => void) | null
}

interface Approach {
  star: number
  at: number
  started: number
  from: vec3
  fromRot: quat
  toRot: quat
}

@component
export class DelphiConductor extends BaseScriptComponent {
  @input
  @hint("DelphiDuet script.")
  duet: ScriptComponent

  @input
  @hint("DelphiVoice script. Its status line is filled in at start.")
  voice: ScriptComponent

  @input
  @hint("The dolphin.glb swim controller. Delphi glides toward a shape after the swim.")
  dolphin: DolphinSwim

  @input
  @hint("Stage anchor used to read shape position.")
  stage: SceneObject

  @input
  @hint("Gel.")
  star0: NoteOrb

  @input
  @hint("Oval pebble.")
  star1: NoteOrb

  @input
  @hint("Starfish.")
  star2: NoteOrb

  @input
  @hint("Pebble.")
  star3: NoteOrb

  @input
  @hint("Width of the shape row, in meters. Matches the session row.")
  rowSpanM: number = 0.4

  private stars: NoteOrb[] = []
  private duetApi: DuetApi | null = null
  private label: Text | null = null
  private approach: Approach | null = null
  private noteStopAt = -1
  private instrumentsReady = false
  private sessionEnded = false
  private listenState = "waiting"
  private actionLine = ""
  private shown = ""
  private snoutLocal: vec3 | null = null
  private arrivedSent = false
  private touchingStar = -1
  private starRest: (vec3 | null)[] = [null, null, null, null]
  private melodyVoices: AudioComponent[] = []
  private melodyStopAt = -1
  private melodyTour = false
  private nextMelody = 0
  private nextHopAt = -1
  private tourIndex = 0

  onAwake(): void {
    this.stars = [this.star0, this.star1, this.star2, this.star3]
    this.label = this.createStatus()
    if (this.voice && this.label) {
      ;(this.voice as ScriptComponent & { statusText?: Text }).statusText = this.label
    }
    if (this.duet && this.duet.api) {
      ;(this.duet.api as DuetApi).onMelody = () => this.playAskedMelody()
    }
    this.createEvent("OnStartEvent").bind(() => this.onStart())
    this.createEvent("UpdateEvent").bind(() => this.onUpdate())
  }

  private onStart(): void {
    if (!this.duet || !this.duet.api || !this.dolphin) {
      print("DelphiConductor: duet or dolphin is not wired.")
      return
    }
    this.duetApi = this.duet.api as DuetApi
    this.duetApi.onDolphinNote = (note) => this.playDolphin(note)
    this.duetApi.onStop = () => this.stopDolphin()
    this.duetApi.onApproach = (event) => this.onApproach(event)
    this.duetApi.onStatus = (message) => this.showStatus(message)
    this.duetApi.onMelody = () => this.playAskedMelody()
    if (this.voice && this.voice.api) {
      const voiceApi = this.voice.api as { onReport?: (kind: string, message: string) => void }
      voiceApi.onReport = (kind, message) => this.onVoice(kind, message)
    }
    this.refreshHud()
    print("[Delphi] Waiting for the instruments")
    for (let i = 0; i < this.stars.length; i++) {
      const star = this.stars[i]
      if (!star) {
        continue
      }
      const id = i
      star.onPlayerSound = () => {
        if (this.duetApi) {
          this.duetApi.playerPlayed(id, 0.55)
        }
      }
    }
    this.ensureVoices()
    this.melodyVoice()
  }

  private onUpdate(): void {
    if (!this.duetApi) {
      return
    }
    for (let i = 0; i < this.stars.length; i++) {
      const star = this.stars[i]
      if (!star) {
        continue
      }
      const place = this.normalized(star.getTransform().getWorldPosition())
      this.duetApi.updateStar(i, place.x, place.y, star.isHeld())
    }
    this.finishMelodyIfDue()
    this.continueMelodyTour()
    this.glide()
    this.releaseExpiredNote()
    this.watchInstruments()
    this.refreshHud()
  }

  private playAskedMelody(): void {
    if (!this.dolphin) {
      return
    }
    const track = MELODY_TRACKS[this.nextMelody]
    this.nextMelody = (this.nextMelody + 1) % MELODY_TRACKS.length
    const audio = this.melodyVoice()
    if (!audio || !track) {
      print("[Delphi] Melody track missing")
      return
    }
    if (audio.isPlaying()) {
      audio.stop(false)
    }
    audio.audioTrack = track
    try {
      audio.spatialAudio.enabled = false
    } catch (error) {
      // The melody still plays through the listener.
    }
    try {
      audio.playbackMode = Audio.PlaybackMode.LowLatency
    } catch (error) {
      // Preview keeps the player it already uses.
    }
    audio.volume = 1
    audio.play(1)
    const length = audio.duration > 1 ? audio.duration : MELODY_MAX_SEC
    this.melodyStopAt = getTime() + length
    this.melodyTour = true
    this.tourIndex = 0
    this.nextHopAt = -1
    this.approach = null
    this.arrivedSent = false
    this.showStatus("Playing")
    print("[Delphi] Melody")
  }

  private melodyVoice(): AudioComponent | null {
    if (this.melodyVoices.length > 0) {
      return this.melodyVoices[0]
    }
    if (!this.dolphin) {
      return null
    }
    const audio = this.dolphin.getSceneObject().createComponent("Component.AudioComponent") as AudioComponent
    try {
      audio.spatialAudio.enabled = false
    } catch (error) {
      // The melody still plays through the listener.
    }
    this.melodyVoices.push(audio)
    return audio
  }

  private finishMelodyIfDue(): void {
    if (this.melodyStopAt < 0 || getTime() < this.melodyStopAt) {
      return
    }
    this.melodyStopAt = -1
    this.melodyTour = false
    this.nextHopAt = -1
    this.approach = null
    this.arrivedSent = false
    this.releaseStar(this.touchingStar)
    this.touchingStar = -1
    for (let i = 0; i < this.melodyVoices.length; i++) {
      const audio = this.melodyVoices[i]
      if (audio.isPlaying()) {
        audio.stop(false)
      }
    }
    this.showStatus("")
    print("[Delphi] Melody ended")
  }

  private continueMelodyTour(): void {
    if (!this.melodyTour || !this.dolphin || !this.dolphin.hasArrived()) {
      return
    }
    if (!this.approach) {
      this.visitStar(this.tourIndex)
      return
    }
    if (this.nextHopAt >= 0 && getTime() >= this.nextHopAt) {
      const count = this.stars.length
      if (count < 1) {
        return
      }
      this.visitStar((this.tourIndex + 1) % count)
    }
  }

  private visitStar(index: number): void {
    if (!this.dolphin || !this.dolphin.hasArrived()) {
      return
    }
    const star = this.stars[index]
    if (!star) {
      return
    }
    this.tourIndex = index
    this.arrivedSent = false
    this.nextHopAt = -1
    const from = this.dolphin.getTransform().getWorldPosition()
    const aim = star.getTransform().getWorldPosition()
    this.approach = {
      star: index,
      at: getTime(),
      started: getTime(),
      from: from,
      fromRot: this.dolphin.getTransform().getWorldRotation(),
      toRot: this.facePoint(from, aim),
    }
  }

  private playDolphin(note: DolphinNote): void {
    if (!this.dolphin || !note) {
      return
    }
    let zone = note.zone
    if (zone < 0) {
      zone = 0
    }
    if (zone > 3) {
      zone = 3
    }
    let step = note.step
    if (step < 0) {
      step = 0
    }
    if (step > 10) {
      step = 10
    }
    const bank = VOICES[DELPHI_VOICES[zone]]
    const track = bank[PENTA[step]]
    const audio = this.voiceFor(zone)
    if (!audio || !track) {
      return
    }
    if (audio.isPlaying()) {
      audio.stop(false)
    }
    audio.audioTrack = track
    let gain = note.gain
    if (gain < 0.15) {
      gain = 0.15
    }
    if (gain > 1) {
      gain = 1
    }
    audio.volume = gain
    try {
      audio.fadeInTime = 0.02
      audio.fadeOutTime = 0.08
    } catch (error) {
      // The note still plays if the player is not ready for a fade.
    }
    audio.play(-1)
    const duration = note.duration && note.duration > 0 ? note.duration : 0.85
    this.noteStopAt = getTime() + duration
  }

  private stopDolphin(): void {
    this.noteStopAt = -1
    for (let i = 0; i < this.voiceList.length; i++) {
      const audio = this.voiceList[i]
      if (audio.isPlaying()) {
        audio.stop(false)
      }
    }
    if (this.melodyTour) {
      return
    }
    this.approach = null
    this.releaseStar(this.touchingStar)
    this.touchingStar = -1
  }

  private onApproach(event: ApproachEvent | null): void {
    if (!event || !this.dolphin) {
      return
    }
    this.arrivedSent = false
    if (this.touchingStar === event.star && this.approach && this.approach.star === event.star) {
      this.reportArrived(event.star)
      return
    }
    const from = this.dolphin.getTransform().getWorldPosition()
    const star = this.stars[event.star]
    const aim = star ? star.getTransform().getWorldPosition() : from
    this.approach = {
      star: event.star,
      at: event.at,
      started: getTime(),
      from: from,
      fromRot: this.dolphin.getTransform().getWorldRotation(),
      toRot: this.facePoint(from, aim),
    }
  }

  private glide(): void {
    if (!this.approach || !this.dolphin || !this.dolphin.hasArrived()) {
      return
    }
    const star = this.stars[this.approach.star]
    if (!star) {
      return
    }
    const starNow = this.starCenter(this.approach.star, star)
    const elapsed = getTime() - this.approach.started
    const span = 0.4
    let u = elapsed / span
    if (u < 0) {
      u = 0
    }
    if (u > 1) {
      u = 1
    }
    const ease = u * u * (3 - 2 * u)
    const rotation = quat.slerp(this.approach.fromRot, this.approach.toRot, ease)
    const nose = this.noseOf(rotation)
    const press = u >= 1 ? Math.max(0, Math.sin(getTime() * 6.5)) : 0
    const touch = new vec3(
      starNow.x + nose.x * (press * 2.5 - 1.2),
      starNow.y + nose.y * (press * 2.5 - 1.2),
      starNow.z + nose.z * (press * 2.5 - 1.2)
    )
    const hopped = this.rootForSnout(touch, rotation)
    const from = this.approach.from
    const travel = new vec3(
      from.x + (hopped.x - from.x) * ease,
      from.y + (hopped.y - from.y) * ease,
      from.z + (hopped.z - from.z) * ease
    )
    const arc = Math.sin(u * Math.PI)
    const side = nose.cross(vec3.up())
    if (side.length > 0.001) {
      travel.x += (side.x / side.length) * arc * 6
      travel.z += (side.z / side.length) * arc * 6
    }
    travel.y += arc * 12
    this.dolphin.getTransform().setWorldPosition(travel)
    this.dolphin.getTransform().setWorldRotation(rotation)
    if (u >= 1) {
      this.boopStar(this.approach.star, nose, press)
      this.reportArrived(this.approach.star)
    }
  }

  private reportArrived(id: number): void {
    if (this.melodyTour) {
      if (!this.arrivedSent) {
        this.arrivedSent = true
        this.nextHopAt = getTime() + 1.15
      }
      return
    }
    if (this.arrivedSent || !this.duet) {
      return
    }
    this.arrivedSent = true
    const arrived = (this.duet.api as { dolphinArrived?: (starId: number) => void }).dolphinArrived
    if (arrived) {
      arrived(id)
    }
  }

  private releaseExpiredNote(): void {
    if (this.noteStopAt < 0 || getTime() < this.noteStopAt) {
      return
    }
    this.noteStopAt = -1
    for (let i = 0; i < DELPHI_VOICES.length; i++) {
      const audio = this.voiceFor(i)
      if (audio && audio.isPlaying()) {
        audio.stop(true)
      }
    }
  }

  private voiceList: AudioComponent[] = []

  private voiceFor(zone: number): AudioComponent | null {
    this.ensureVoices()
    if (zone < 0 || zone >= this.voiceList.length) {
      return null
    }
    return this.voiceList[zone]
  }

  private ensureVoices(): void {
    if (this.voiceList.length === DELPHI_VOICES.length || !this.dolphin) {
      return
    }
    const host = this.dolphin.getSceneObject()
    while (this.voiceList.length < DELPHI_VOICES.length) {
      const audio = host.createComponent("Component.AudioComponent") as AudioComponent
      this.voiceList.push(audio)
    }
  }

  private starCenter(id: number, star: NoteOrb): vec3 {
    const rest = this.starRest[id]
    if (rest) {
      return new vec3(rest.x, rest.y, rest.z)
    }
    return star.getTransform().getWorldPosition()
  }

  private boopStar(id: number, nose: vec3, press: number): void {
    if (this.touchingStar !== id) {
      this.releaseStar(this.touchingStar)
      this.touchingStar = id
    }
    const star = this.stars[id]
    if (!star || star.isHeld()) {
      return
    }
    if (!this.starRest[id]) {
      const at = star.getTransform().getWorldPosition()
      this.starRest[id] = new vec3(at.x, at.y, at.z)
    }
    const rest = this.starRest[id] as vec3
    const push = nose.uniformScale(press * 3.2)
    star.getTransform().setWorldPosition(new vec3(rest.x + push.x, rest.y + push.y, rest.z + push.z))
  }

  private releaseStar(id: number): void {
    if (id < 0 || id >= this.stars.length) {
      return
    }
    const rest = this.starRest[id]
    const star = this.stars[id]
    this.starRest[id] = null
    if (rest && star && !star.isHeld()) {
      star.getTransform().setWorldPosition(new vec3(rest.x, rest.y, rest.z))
    }
  }

  private ensureSnout(): vec3 {
    if (this.snoutLocal) {
      return this.snoutLocal
    }
    const root = this.dolphin.getTransform().getWorldPosition()
    const snout = this.dolphin.snoutWorldPosition()
    const rot = this.dolphin.getTransform().getWorldRotation()
    const inv = new quat(rot.w, rot.x, rot.y, rot.z).invert()
    this.snoutLocal = inv.multiplyVec3(new vec3(snout.x - root.x, snout.y - root.y, snout.z - root.z))
    return this.snoutLocal
  }

  private rootForSnout(snoutAt: vec3, rotation: quat): vec3 {
    const offset = rotation.multiplyVec3(this.ensureSnout())
    return new vec3(snoutAt.x - offset.x, snoutAt.y - offset.y, snoutAt.z - offset.z)
  }

  private noseOf(rotation: quat): vec3 {
    const nose = rotation.multiplyVec3(new vec3(0, 0, 1))
    if (nose.length < 0.001) {
      return new vec3(0, 0, 1)
    }
    return new vec3(nose.x / nose.length, nose.y / nose.length, nose.z / nose.length)
  }

  private facePoint(from: vec3, point: vec3): quat {
    const dir = new vec3(point.x - from.x, point.y - from.y, point.z - from.z)
    if (dir.length < 1) {
      return this.dolphin.getTransform().getWorldRotation()
    }
    const away = new vec3(-dir.x / dir.length, -dir.y / dir.length, -dir.z / dir.length)
    const up = Math.abs(away.y) > 0.95 ? vec3.right() : vec3.up()
    return quat.lookAt(away, up)
  }

  private showStatus(message: string): void {
    this.actionLine = message
    if (message) {
      print("[Delphi] " + message)
    } else {
      print("[Delphi] Stopped")
    }
    if (this.listenState === "hearing") {
      this.listenState = "listening"
    }
    this.refreshHud()
  }

  private onVoice(kind: string, message: string): void {
    if (kind === "hearing") {
      this.listenState = "hearing"
    } else if (kind === "listening" || kind === "idle") {
      this.listenState = "listening"
    } else if (kind === "unavailable") {
      this.listenState = "unavailable"
      this.actionLine = message
    } else if (kind === "off") {
      this.listenState = "off"
      this.actionLine = message
    } else if (message) {
      this.actionLine = message
    }
    this.refreshHud()
  }

  private watchInstruments(): void {
    let ready = this.stars.length > 0
    let closed = this.stars.length > 0
    for (let i = 0; i < this.stars.length; i++) {
      const star = this.stars[i]
      if (!star || !star.isReady()) {
        ready = false
      }
      if (!star || !star.isClosed()) {
        closed = false
      }
    }
    if (!this.instrumentsReady && ready) {
      this.instrumentsReady = true
      this.listenState = "listening"
      this.actionLine = ""
      print("[Delphi] Instruments are ready")
      const open = (this.duet.api as { openSession?: (seconds: number) => void }).openSession
      if (open) {
        open(60)
      }
      const start = this.voice && (this.voice.api as { startListening?: () => void }).startListening
      if (start) {
        start()
      }
    }
    if (this.instrumentsReady && !this.sessionEnded && closed) {
      this.sessionEnded = true
      this.actionLine = "The session ended"
      print("[Delphi] The session ended")
    }
  }

  private refreshHud(): void {
    if (!this.label) {
      return
    }
    let title = "Waiting for the instruments"
    if (this.listenState === "hearing") {
      title = "Hearing"
    } else if (this.listenState === "listening") {
      const pulse = Math.floor(getTime() * 1.6) % 2 === 0
      title = (pulse ? "●" : "○") + "  Listening"
    } else if (this.listenState === "unavailable") {
      title = "Voice unavailable"
    } else if (this.listenState === "off") {
      title = "Voice off"
    }
    let body = title
    if (this.actionLine) {
      body += "\n" + this.actionLine
    }
    if (body === this.shown) {
      return
    }
    this.shown = body
    this.label.text = body
  }

  private createStatus(): Text | null {
    const camera = this.findCamera()
    const host = global.scene.createSceneObject("DelphiStatus")
    if (camera) {
      host.setParent(camera)
    }
    host.getTransform().setLocalPosition(new vec3(12, -38, -80))
    const label = host.createComponent("Component.Text") as Text
    label.text = "Waiting for the instruments"
    label.size = 28
    label.worldSpaceRect = Rect.create(-20, 20, -8, 8)
    label.horizontalAlignment = HorizontalAlignment.Right
    label.verticalAlignment = VerticalAlignment.Bottom
    try {
      label.textFill.color = new vec4(0.94, 0.97, 1, 1)
    } catch (error) {
      // The line still shows in the default color.
    }
    return label
  }

  private findCamera(): SceneObject | null {
    for (let i = 0; i < global.scene.getRootObjectsCount(); i++) {
      const root = global.scene.getRootObject(i)
      if (root.getComponent("Component.Camera")) {
        return root
      }
    }
    return null
  }

  private normalized(world: vec3): { x: number; y: number } {
    let local = world
    if (this.stage) {
      const origin = this.stage.getTransform().getWorldPosition()
      const rotation = this.stage.getTransform().getWorldRotation()
      const inverse = new quat(rotation.w, rotation.x, rotation.y, rotation.z).invert()
      local = inverse.multiplyVec3(new vec3(world.x - origin.x, world.y - origin.y, world.z - origin.z))
    }
    const span = Math.max(1, this.rowSpanM * 100)
    return { x: this.clamp01((local.x + span * 0.5) / span), y: this.clamp01((40 - local.y) / 80) }
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

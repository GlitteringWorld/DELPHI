/**
 * PitchBanks — one seamless loop per semitone, C4 at 0 through C5 at 12.
 *
 * AudioComponent has no live pitch control, in 5.23 or in 5.15.4. Each orb
 * keeps a single loop running and swaps to the neighboring semitone in phase
 * as the orb moves up or down.
 */

export type InstrumentName = "lyre" | "snare" | "flute" | "harp"

const LYRE: AudioTrackAsset[] = [
  requireAsset("../GeneratedSFX/LyreLoop_00.wav") as AudioTrackAsset,
  requireAsset("../GeneratedSFX/LyreLoop_01.wav") as AudioTrackAsset,
  requireAsset("../GeneratedSFX/LyreLoop_02.wav") as AudioTrackAsset,
  requireAsset("../GeneratedSFX/LyreLoop_03.wav") as AudioTrackAsset,
  requireAsset("../GeneratedSFX/LyreLoop_04.wav") as AudioTrackAsset,
  requireAsset("../GeneratedSFX/LyreLoop_05.wav") as AudioTrackAsset,
  requireAsset("../GeneratedSFX/LyreLoop_06.wav") as AudioTrackAsset,
  requireAsset("../GeneratedSFX/LyreLoop_07.wav") as AudioTrackAsset,
  requireAsset("../GeneratedSFX/LyreLoop_08.wav") as AudioTrackAsset,
  requireAsset("../GeneratedSFX/LyreLoop_09.wav") as AudioTrackAsset,
  requireAsset("../GeneratedSFX/LyreLoop_10.wav") as AudioTrackAsset,
  requireAsset("../GeneratedSFX/LyreLoop_11.wav") as AudioTrackAsset,
  requireAsset("../GeneratedSFX/LyreLoop_12.wav") as AudioTrackAsset,
]

const SNARE: AudioTrackAsset[] = [
  requireAsset("../GeneratedSFX/SnareLoop_00.wav") as AudioTrackAsset,
  requireAsset("../GeneratedSFX/SnareLoop_01.wav") as AudioTrackAsset,
  requireAsset("../GeneratedSFX/SnareLoop_02.wav") as AudioTrackAsset,
  requireAsset("../GeneratedSFX/SnareLoop_03.wav") as AudioTrackAsset,
  requireAsset("../GeneratedSFX/SnareLoop_04.wav") as AudioTrackAsset,
  requireAsset("../GeneratedSFX/SnareLoop_05.wav") as AudioTrackAsset,
  requireAsset("../GeneratedSFX/SnareLoop_06.wav") as AudioTrackAsset,
  requireAsset("../GeneratedSFX/SnareLoop_07.wav") as AudioTrackAsset,
  requireAsset("../GeneratedSFX/SnareLoop_08.wav") as AudioTrackAsset,
  requireAsset("../GeneratedSFX/SnareLoop_09.wav") as AudioTrackAsset,
  requireAsset("../GeneratedSFX/SnareLoop_10.wav") as AudioTrackAsset,
  requireAsset("../GeneratedSFX/SnareLoop_11.wav") as AudioTrackAsset,
  requireAsset("../GeneratedSFX/SnareLoop_12.wav") as AudioTrackAsset,
]

const FLUTE: AudioTrackAsset[] = [
  requireAsset("../GeneratedSFX/FluteLoop_00.wav") as AudioTrackAsset,
  requireAsset("../GeneratedSFX/FluteLoop_01.wav") as AudioTrackAsset,
  requireAsset("../GeneratedSFX/FluteLoop_02.wav") as AudioTrackAsset,
  requireAsset("../GeneratedSFX/FluteLoop_03.wav") as AudioTrackAsset,
  requireAsset("../GeneratedSFX/FluteLoop_04.wav") as AudioTrackAsset,
  requireAsset("../GeneratedSFX/FluteLoop_05.wav") as AudioTrackAsset,
  requireAsset("../GeneratedSFX/FluteLoop_06.wav") as AudioTrackAsset,
  requireAsset("../GeneratedSFX/FluteLoop_07.wav") as AudioTrackAsset,
  requireAsset("../GeneratedSFX/FluteLoop_08.wav") as AudioTrackAsset,
  requireAsset("../GeneratedSFX/FluteLoop_09.wav") as AudioTrackAsset,
  requireAsset("../GeneratedSFX/FluteLoop_10.wav") as AudioTrackAsset,
  requireAsset("../GeneratedSFX/FluteLoop_11.wav") as AudioTrackAsset,
  requireAsset("../GeneratedSFX/FluteLoop_12.wav") as AudioTrackAsset,
]

const HARP: AudioTrackAsset[] = [
  requireAsset("../GeneratedSFX/HarpLoop_00.wav") as AudioTrackAsset,
  requireAsset("../GeneratedSFX/HarpLoop_01.wav") as AudioTrackAsset,
  requireAsset("../GeneratedSFX/HarpLoop_02.wav") as AudioTrackAsset,
  requireAsset("../GeneratedSFX/HarpLoop_03.wav") as AudioTrackAsset,
  requireAsset("../GeneratedSFX/HarpLoop_04.wav") as AudioTrackAsset,
  requireAsset("../GeneratedSFX/HarpLoop_05.wav") as AudioTrackAsset,
  requireAsset("../GeneratedSFX/HarpLoop_06.wav") as AudioTrackAsset,
  requireAsset("../GeneratedSFX/HarpLoop_07.wav") as AudioTrackAsset,
  requireAsset("../GeneratedSFX/HarpLoop_08.wav") as AudioTrackAsset,
  requireAsset("../GeneratedSFX/HarpLoop_09.wav") as AudioTrackAsset,
  requireAsset("../GeneratedSFX/HarpLoop_10.wav") as AudioTrackAsset,
  requireAsset("../GeneratedSFX/HarpLoop_11.wav") as AudioTrackAsset,
  requireAsset("../GeneratedSFX/HarpLoop_12.wav") as AudioTrackAsset,
]

export function bankFor(name: InstrumentName): AudioTrackAsset[] {
  if (name === "lyre") {
    return LYRE
  }
  if (name === "snare") {
    return SNARE
  }
  if (name === "flute") {
    return FLUTE
  }
  return HARP
}

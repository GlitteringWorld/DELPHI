/**
 * SikAdapter — the only module that subscribes to Spectacles Interaction Kit.
 *
 * Owns pinch, manipulation, and index-tip reads. A Lens Studio 5.15.4 port
 * that still uses onClick / onClickEnd instead of onTriggerStart / onTriggerEnd
 * should be updated here and nowhere else.
 *
 * Call bindPinch and bindManipulation from OnStartEvent, not from onAwake.
 */

import { Interactable } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import { InteractableManipulation } from "SpectaclesInteractionKit.lspkg/Components/Interaction/InteractableManipulation/InteractableManipulation"
import { HandInputData } from "SpectaclesInteractionKit.lspkg/Providers/HandInputData/HandInputData"

type Handler = () => void
type EventSource = { add: (handler: Handler) => void }

function asEvents(target: object): Record<string, EventSource | undefined> {
  return target as unknown as Record<string, EventSource | undefined>
}

function bindFirst(target: object, names: string[], handler: Handler): void {
  const events = asEvents(target)
  for (let i = 0; i < names.length; i++) {
    const source = events[names[i]]
    if (source && source.add) {
      source.add(handler)
      return
    }
  }
}

export function findInteractable(host: SceneObject): Interactable | null {
  return host.getComponent(Interactable.getTypeName()) as Interactable
}

export function findManipulation(host: SceneObject): InteractableManipulation | null {
  return host.getComponent(InteractableManipulation.getTypeName()) as InteractableManipulation
}

/**
 * Pinch start / end. Prefers onTriggerStart + onTriggerEnd, then older click names.
 * onTriggerEndOutside is included so a pinch that slides off the orb still releases.
 */
export function bindPinch(interactable: Interactable, onStart: Handler, onEnd: Handler): void {
  bindFirst(interactable, ["onTriggerStart", "onClick", "onTap"], onStart)
  bindFirst(interactable, ["onTriggerEnd", "onClickEnd", "onRelease"], onEnd)
  const events = asEvents(interactable)
  const outside = events["onTriggerEndOutside"]
  if (outside && outside.add) {
    outside.add(onEnd)
  }
}

export function bindManipulation(manipulation: InteractableManipulation, onStart: Handler, onEnd: Handler): void {
  bindFirst(manipulation, ["onManipulationStart"], onStart)
  bindFirst(manipulation, ["onManipulationEnd"], onEnd)
}

export type TipSample = {
  tracked: boolean
  position: vec3
}

/**
 * World positions of both index fingertips, left then right.
 * Untracked hands are reported and must be ignored by the caller.
 */
export function readIndexTips(): TipSample[] {
  const samples: TipSample[] = [
    { tracked: false, position: vec3.zero() },
    { tracked: false, position: vec3.zero() },
  ]
  try {
    const hands = HandInputData.getInstance()
    const pair = [hands.getHand("left"), hands.getHand("right")]
    for (let i = 0; i < pair.length; i++) {
      const hand = pair[i]
      if (!hand || !hand.isTracked() || !hand.indexTip) {
        continue
      }
      samples[i] = { tracked: true, position: hand.indexTip.position }
    }
  } catch (error) {
    // Preview scenes without hand tracking throw; the device path still works.
  }
  return samples
}

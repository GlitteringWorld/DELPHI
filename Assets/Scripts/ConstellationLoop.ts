/**
 * Loops the constellation gif. The card itself is the scene object this
 * script is on, so its position, rotation, and scale stay editable.
 */

@component
export class ConstellationLoop extends BaseScriptComponent {
  @input
  @hint("Constellation gif.")
  texture: Texture

  onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => this.playLoop())
  }

  private playLoop(): void {
    if (!this.texture) {
      print("[ConstellationLoop] texture is not assigned")
      return
    }
    const provider = this.texture.control as AnimatedTextureFileProvider
    if (!provider || !provider.play) {
      print("[ConstellationLoop] texture is not an animated gif")
      return
    }
    provider.isAutoplay = true
    const again = () => {
      provider.play(-1, 0)
    }
    provider.setOnFinish(again)
    again()
  }
}

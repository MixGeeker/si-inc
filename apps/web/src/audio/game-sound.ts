import type { GameStore } from "../scenes/store.ts"
import { createSoundOutput } from "./player.ts"
import { saveSoundSettings } from "./settings.ts"

export function attachGameSound(store: GameStore, output = createSoundOutput(() => store.getSnapshot().sound),
  persist = saveSoundSettings) {
  function settingsChanged() {
    const { sound } = store.getSnapshot()
    output.syncSettings()
    persist(sound)
  }
  const off = [
    store.on("play-sound", ({ cue }) => output.play(cue)),
    store.on("event-occurred", () => store.dispatch({ type: "play-sound", cue: "test" })),
    store.on("set-sound-muted", settingsChanged),
    store.on("set-sound-volume", settingsChanged),
  ]
  return () => {
    off.forEach(stop => stop())
    output.dispose()
  }
}

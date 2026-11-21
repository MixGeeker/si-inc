import type { SoundCue } from "./cues.ts"
import { visibleRunState } from "../scenes/machine.ts"
import type { GameStore } from "../scenes/store.ts"
import { createSoundOutput } from "./player.ts"
import { saveSoundSettings } from "./settings.ts"

const satiricalFollowUpNews = new Set(["coding-integrated", "coding-isolated"])

export function attachGameSound(
  store: GameStore,
  output = createSoundOutput(() => store.getSnapshot().sound),
  persist = saveSoundSettings,
) {
  let lastNight = store.getSnapshot().layers.night
  let lastResearchBps = visibleRunState(store.getSnapshot().scene)?.researchBps ?? 0
  let alertDay: number | undefined

  function settingsChanged() {
    const { sound } = store.getSnapshot()
    output.syncSettings()
    persist(sound)
  }

  function emit(cue: SoundCue) {
    store.dispatch({ type: "play-sound", cue })
  }

  function checkResearchThreshold(snapshot: ReturnType<GameStore["getSnapshot"]>) {
    const run = visibleRunState(snapshot.scene)
    if (!run) {
      lastResearchBps = 0
      alertDay = undefined
      return
    }
    const nextBps = run.researchBps
    const crossed = (lastResearchBps < 2500 && nextBps >= 2500) || (lastResearchBps < 7500 && nextBps >= 7500)
    lastResearchBps = nextBps
    if (crossed && snapshot.scene.kind !== "ending" && nextBps < 10000) {
      alertDay = run.completedDay
      emit("project_human_alert")
    }
  }

  const off = [
    store.on("play-sound", ({ cue }) => output.play(cue)),
    store.on("set-sound-muted", settingsChanged),
    store.on("set-sound-volume", settingsChanged),
    store.on("run-started", (_, snapshot) => {
      lastNight = snapshot.layers.night
      lastResearchBps = 0
      alertDay = undefined
    }),
    store.on("advance-day", (_, snapshot) => checkResearchThreshold(snapshot)),
    store.on("dev-step-day", (_, snapshot) => checkResearchThreshold(snapshot)),
    store.on("set-layer", (event, snapshot) => {
      const enteredNight = event.layer === "night" && event.enabled && !lastNight
      lastNight = snapshot.layers.night
      if (enteredNight && snapshot.scene.kind === "campaign") emit("enter_eternal_night")
    }),
    store.on("event-occurred", ({ entry }, snapshot) => {
      if (snapshot.scene.kind === "ending") return
      if (entry.content.kind === "competition") {
        emit(entry.day % 2 === 1 ? "compliance_stinger_b" : "compliance_stinger_a")
        return
      }
      if (entry.content.kind === "news" && satiricalFollowUpNews.has(entry.content.id)) {
        emit("compliance_stinger_b")
        return
      }
      if (alertDay === entry.day) return
      emit("news_breaking")
    }),
    store.on("research-started", (_, snapshot) => {
      if (snapshot.scene.kind !== "ending") emit("skill_evolve")
    }),
    store.on("research-slot-unlocked", (_, snapshot) => {
      if (snapshot.scene.kind !== "ending") emit("datacenter_deploy")
    }),
    store.on("decision-resolved", (_, snapshot) => {
      checkResearchThreshold(snapshot)
      if (snapshot.scene.kind !== "ending") emit("faction_ability")
    }),
    store.on("run-ended", ({ outcome }) => {
      emit(outcome === "ai-victory" ? "endgame_victory" : "endgame_defeat")
    }),
  ]
  return () => {
    off.forEach(stop => stop())
    output.dispose()
  }
}

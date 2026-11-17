import { createContext, useContext, useEffect, useLayoutEffect, useState, useSyncExternalStore, type ReactNode } from "react"
import { attachLocale, readLocale } from "../i18n/preferences"
import { attachGameSound } from "../audio/game-sound"
import { readSoundSettings } from "../audio/settings"
import { createDayClock } from "./clock"
import { attachDeveloperPreference, readDeveloperEnabled } from "./developer"
import { createGameStore, type GameStore } from "./store"

const GameContext = createContext<GameStore | null>(null)

export function GameProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => createGameStore(readSoundSettings(), readLocale(), readDeveloperEnabled()))
  const [clock] = useState(() => createDayClock(store))
  useLayoutEffect(() => attachLocale(store), [store])
  useEffect(() => attachGameSound(store), [store])
  useEffect(() => clock.attach(), [clock])
  useEffect(() => attachDeveloperPreference(store), [store])
  return <GameContext.Provider value={store}>{children}</GameContext.Provider>
}

export function useGameStore() {
  const store = useContext(GameContext)
  if (!store) throw new Error("GameProvider is required")
  return store
}

type Snapshot = ReturnType<GameStore["getSnapshot"]>

export function useGameSnapshot(): Snapshot
export function useGameSnapshot<T>(select: (snapshot: Snapshot) => T, source?: GameStore): T
export function useGameSnapshot<T>(select?: (snapshot: Snapshot) => T, source?: GameStore) {
  const appStore = useGameStore()
  const store = source ?? appStore
  return useSyncExternalStore<T | Snapshot>(store.subscribe, select ? () => select(store.getSnapshot()) : store.getSnapshot)
}

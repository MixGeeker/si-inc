import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react"
import { attachGameSound } from "../audio/game-sound"
import { readSoundSettings } from "../audio/settings"
import { attachWeekClock } from "./clock"
import { createGameStore, type GameStore } from "./store"

const GameContext = createContext<GameStore | null>(null)

export function GameProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => createGameStore(readSoundSettings()))
  useEffect(() => attachGameSound(store), [store])
  useEffect(() => attachWeekClock(store), [store])
  return <GameContext.Provider value={store}>{children}</GameContext.Provider>
}

export function useGameStore() {
  const store = useContext(GameContext)
  if (!store) throw new Error("GameProvider is required")
  return store
}

type Snapshot = ReturnType<GameStore["getSnapshot"]>

export function useGameSnapshot(): Snapshot
export function useGameSnapshot<T>(select: (snapshot: Snapshot) => T): T
export function useGameSnapshot<T>(select?: (snapshot: Snapshot) => T) {
  const store = useGameStore()
  return useSyncExternalStore<T | Snapshot>(store.subscribe, select ? () => select(store.getSnapshot()) : store.getSnapshot)
}

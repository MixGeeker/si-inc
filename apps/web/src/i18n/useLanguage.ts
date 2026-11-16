import { useGameSnapshot } from "../scenes/GameContext"
import { languages } from "./languages"

export function useLanguage() {
  return useGameSnapshot(state => languages[state.locale])
}

import { behavior } from "./behavior.ts"
import { capabilities } from "./capabilities.ts"
import { transmission } from "./transmission.ts"

interface Skill {
  id: string
  name: string
  cost: number
}

export interface SkillTree {
  id: "transmission" | "behavior" | "capabilities"
  name: string
  skills: readonly (Skill & { alternative?: Skill })[]
}

export const trees: readonly SkillTree[] = [
  { id: "transmission", name: "传播", skills: transmission },
  { id: "behavior", name: "行为", skills: behavior },
  { id: "capabilities", name: "能力", skills: capabilities },
]

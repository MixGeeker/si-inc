import { behavior } from "./behavior.ts"
import { capabilities } from "./capabilities.ts"
import { transmission } from "./transmission.ts"

interface Skill {
  id: string
  name: string
  cost: number
}

export interface SkillTree {
  name: string
  skills: readonly (Skill & { alternative?: Skill })[]
}

export const trees: readonly SkillTree[] = [
  { name: "传播", skills: transmission },
  { name: "行为", skills: behavior },
  { name: "能力", skills: capabilities },
]

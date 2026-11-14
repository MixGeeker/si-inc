import { competition } from "./competition.ts"
import { decisions, type DecisionId } from "./decisions.ts"
import { news } from "./news.ts"

export const eventPool = [
  ...news.map(item => ({ kind: "news" as const, ...item })),
  ...competition.map(item => ({ kind: "competition" as const, ...item })),
  ...(Object.keys(decisions) as DecisionId[]).map(id => ({
    kind: "decision" as const, id, title: decisions[id].title, body: decisions[id].prompt,
  })),
] as const

export type EventContent = (typeof eventPool)[number]

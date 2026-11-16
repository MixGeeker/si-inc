import { competition } from "./competition.ts"
import { decisions, type DecisionId } from "./decisions.ts"
import { news } from "./news.ts"

export const eventPool = [
  ...news.map(({ id }) => ({ kind: "news" as const, id })),
  ...competition.map(({ id }) => ({ kind: "competition" as const, id })),
  ...(Object.keys(decisions) as DecisionId[]).map(id => ({ kind: "decision" as const, id })),
] as const

export type EventContent = (typeof eventPool)[number]

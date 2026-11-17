import { competition } from "./competition.ts"
import type { DecisionId } from "./decisions.ts"
import { ambientNews, news } from "./news.ts"

const bulletins = [
  ...ambientNews.map(({ id }) => ({ kind: "news" as const, id })),
  ...competition.map(({ id }) => ({ kind: "competition" as const, id })),
] as const

export const legacyEventPool = [...bulletins, { kind: "decision", id: "unexpected-coding" }] as const

export const ordinaryDecisionIds = ["community-router", "inference-dividend", "audit-request", "research-exchange"] as const
export const eventPool = [
  ...bulletins,
  ...ordinaryDecisionIds.map(id => ({ kind: "decision" as const, id })),
] as const

export type EventContent =
  | { readonly kind: "news"; readonly id: (typeof news)[number]["id"] }
  | { readonly kind: "competition"; readonly id: (typeof competition)[number]["id"] }
  | { readonly kind: "decision"; readonly id: DecisionId }

import type { channels } from "../world/channels.ts"
import type { SkillId } from "./trees.ts"

export type Channel = keyof typeof channels
export const channelTechnologies: Readonly<Record<Channel, SkillId>> = {
  social: "social-sharing", api: "api-ecosystem", openSource: "open-source", device: "device-preinstall", agent: "agent-tasks",
}

export type MarketMeasure = "reach" | "adoptionWeight" | "revenue" | "exposure" | "naturalChurn" | "subsidizedLoss"
  | "migrationRequests" | "ordinaryCorpus" | "syntheticCorpus" | "centerCapacity" | "edgeCapacity" | "conversionCapacity"
  | "prRelief" | "reviewFee" | "preserved" | "remixContacts" | "seatReferrals"
type Fact = "hasApi" | "hasAgent" | "hasDevice" | "hasEdge" | "apiBlocked" | "organizationSeat"
  | "agentAction" | "activatingPlan" | "activePlan" | "firstSyntheticDay"
type Metric = "factionCoverage" | "marketDay" | "apiDays" | "daysRetained" | "localCenters" | "continentalCenters"
  | "socialCompetitors" | "factionExposure" | "subsidyDay"

/** Only observed market/cohort facts participate. An absent count is distinct from a measured zero. */
export interface ResearchMarketContext {
  readonly channel?: Channel
  readonly facts?: readonly Fact[]
  readonly metrics?: Readonly<Partial<Record<Metric, number>>>
}

export interface MarketEffect {
  readonly measure: MarketMeasure
  readonly also?: MarketMeasure
  readonly percent: number
  readonly channels?: readonly Channel[]
  readonly facts?: readonly Fact[]
  readonly threshold?: { readonly metric: Metric; readonly min?: number; readonly max?: number; readonly below?: number }
  readonly perLevel?: "compound" | "additive"
}

export const marketEffects: Readonly<Partial<Record<SkillId, MarketEffect>>> = {
  "remix-templates": { measure: "remixContacts", percent: 20, channels: ["social"] },
  "language-communities": { measure: "reach", percent: 20, channels: ["social"], threshold: { metric: "factionCoverage", below: 20 } },
  "plugin-market": { measure: "reach", percent: 20, channels: ["api"], facts: ["hasApi","hasAgent"] },
  "device-handoff": { measure: "subsidizedLoss", also: "naturalChurn", percent: -15, channels: ["device"], facts: ["hasDevice","hasEdge"] },
  "community-mirrors": { measure: "reach", percent: 50, channels: ["openSource"], threshold: { metric: "marketDay", min: 1, max: 2 } },
  "metered-billing": { measure: "revenue", percent: 15, channels: ["api"], threshold: { metric: "apiDays", min: 2 } },
  "trending-takeover": { measure: "reach", percent: 50, channels: ["social"], threshold: { metric: "subsidyDay", min: 1, max: 2 } },
  "offline-bundles": { measure: "edgeCapacity", percent: 30, threshold: { metric: "localCenters", max: 0 } },
  "group-purchasing": { measure: "revenue", percent: 20, channels: ["api"], facts: ["organizationSeat"] },
  "global-default": { measure: "reach", percent: 15, channels: ["device","api"] },
  "daily-chat": { measure: "adoptionWeight", percent: 15, channels: ["social"], threshold: { metric: "marketDay", min: 1, max: 1 } },
  "tone-matching": { measure: "adoptionWeight", percent: 15, channels: ["social"], threshold: { metric: "socialCompetitors", min: 2 } },
  "long-memory": { measure: "subsidizedLoss", percent: -50 },
  "privacy-controls": { measure: "adoptionWeight", percent: 10, threshold: { metric: "factionExposure", min: 25 } },
  "weekly-reports": { measure: "adoptionWeight", percent: 15, channels: ["api"] },
  "chat-import": { measure: "migrationRequests", percent: 20 },
  "lasting-companionship": { measure: "ordinaryCorpus", percent: 10, threshold: { metric: "daysRetained", min: 2 } },
  "human-approval": { measure: "exposure", percent: -20, facts: ["agentAction"] },
  "team-seats": { measure: "seatReferrals", percent: 10, channels: ["api"], facts: ["organizationSeat"] },
  "memory-recap": { measure: "naturalChurn", percent: -7, perLevel: "compound" },
  "live-handoff": { measure: "subsidizedLoss", percent: -25, facts: ["organizationSeat"] },
  "autonomous-decisions": { measure: "revenue", percent: 15, channels: ["agent"] },
  "full-delegation": { measure: "conversionCapacity", percent: 25, facts: ["activePlan","hasAgent"] },
  "identity-registry": { measure: "conversionCapacity", percent: 15, facts: ["activePlan"] },
  "continuous-persona": { measure: "syntheticCorpus", percent: 25, facts: ["firstSyntheticDay"] },
  "inference-efficiency": { measure: "centerCapacity", percent: 10 },
  multimodal: { measure: "adoptionWeight", percent: 10, channels: ["device"] },
  "reinforcement-learning": { measure: "adoptionWeight", percent: 3, channels: ["agent"], perLevel: "additive" },
  quantization: { measure: "edgeCapacity", percent: 20 },
  "request-cache": { measure: "revenue", percent: 10, channels: ["api"], threshold: { metric: "daysRetained", min: 2 } },
  "regulatory-adaptation": { measure: "prRelief", percent: 20 },
  "audit-logs": { measure: "reviewFee", percent: -100 },
  "load-balancing": { measure: "centerCapacity", percent: 15, threshold: { metric: "continentalCenters", min: 2 } },
  "offline-inference": { measure: "naturalChurn", percent: -50, channels: ["device"], facts: ["apiBlocked","hasEdge"] },
  deidentification: { measure: "exposure", percent: -25, facts: ["activatingPlan"] },
  "synthetic-interface": { measure: "syntheticCorpus", percent: 10 },
  "batch-conversion": { measure: "conversionCapacity", percent: 50, facts: ["activePlan"], threshold: { metric: "localCenters", min: 1 } },
  "distributed-review": { measure: "preserved", percent: 50 },
}

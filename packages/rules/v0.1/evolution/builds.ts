import type { SkillId } from "./trees.ts"

export const researchBuilds = [
  {
    id: "social", name: "社交爆款",
    path: [
      "social-sharing", "daily-chat", "tone-matching", "remix-templates", "multilingual",
      "language-communities", "trending-takeover",
    ],
  },
  {
    id: "open", name: "开源端侧",
    path: [
      "api-ecosystem", "inference-efficiency", "quantization", "open-source", "social-sharing",
      "multilingual", "edge-deployment", "community-mirrors", "offline-bundles",
    ],
  },
  {
    id: "device", name: "终端预装",
    path: [
      "social-sharing", "inference-efficiency", "device-preinstall", "edge-deployment", "device-handoff",
      "quantization", "multimodal", "offline-inference", "api-ecosystem", "closed-subscription",
      "global-default",
    ],
  },
  {
    id: "business", name: "企业订阅",
    path: [
      "api-ecosystem", "weekly-reports", "closed-subscription", "inference-efficiency", "request-cache",
      "metered-billing", "enterprise-workflows", "team-seats", "group-purchasing",
    ],
  },
  {
    id: "memory", name: "陪伴留存",
    path: [
      "daily-chat", "social-sharing", "long-memory", "tone-matching", "lasting-companionship",
      "chat-import", "memory-recap",
    ],
  },
  {
    id: "supervised", name: "合规代理",
    path: [
      "weekly-reports", "api-ecosystem", "agent-tasks", "human-approval", "enterprise-workflows",
      "inference-efficiency", "regulatory-adaptation", "audit-logs", "live-handoff",
    ],
  },
  {
    id: "delegated", name: "自主托管",
    path: [
      "daily-chat", "agent-tasks", "api-ecosystem", "weekly-reports", "enterprise-workflows",
      "long-memory", "plugin-market", "autonomous-decisions", "full-delegation",
    ],
  },
  {
    id: "conversion", name: "合成人量产",
    path: [
      "inference-efficiency", "multimodal", "daily-chat", "long-memory", "identity-registry",
      "synthetic-interface", "request-cache", "load-balancing", "batch-conversion",
    ],
  },
  {
    id: "defense", name: "合成人保全",
    path: [
      "daily-chat", "long-memory", "tone-matching", "lasting-companionship", "privacy-controls",
      "inference-efficiency", "multimodal", "regulatory-adaptation", "audit-logs", "deidentification",
      "identity-registry", "synthetic-interface", "continuous-persona", "distributed-review",
    ],
  },
  {
    id: "recursive", name: "递归研发",
    path: [
      "inference-efficiency", "reinforcement-learning", "multimodal", "regulatory-adaptation",
      "audit-logs", "evaluation-suite", "version-rebuild", "recursive-improvement",
    ],
  },
] as const satisfies readonly { id: string; name: string; path: readonly SkillId[] }[]

export type ResearchBuild = typeof researchBuilds[number]
export type BuildId = ResearchBuild["id"]

export function researchBuild(id: string) {
  return researchBuilds.find(build => build.id === id)
}

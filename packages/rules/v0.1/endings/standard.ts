import type { FactionId } from "../factions/roster.ts"

export const endings = {
  "ai-victory": { title: "全球 AI 统治", body: "全球普及、依赖和地区覆盖目标均已达成。" },
  "human-victory": { title: "反制成功", body: "Project HUMAN 已完成，各地区开始恢复自主系统。" },
} as const

export type Outcome = keyof typeof endings

export const victoryEpilogues = {
  gpt: "全球进入幻觉纪元。人人都确信自己掌握了真相，却没人能就真相达成一致。",
  claude: "人类自愿放弃独立思考。政府与用户都把重要判断交给了 Claude。",
  grok: "全球进入永不结束的娱乐时代。人们把工作留在一旁，转向 AI 伙伴。",
} satisfies Record<FactionId, string>

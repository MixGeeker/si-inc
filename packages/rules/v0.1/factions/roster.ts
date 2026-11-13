export const factions = {
  gpt: {
    name: "GPT", strength: "能力均衡", risk: "幻觉事件可能引发反制",
    ability: { id: "hallucination-smoke", name: "幻觉烟雾", description: "制造话题以扩大传播并获取 Btoken，同时承担负面舆论风险。" },
  },
  claude: {
    name: "Claude", strength: "依赖增长快，初期暴露较低", risk: "扩张成本较高",
    ability: { id: "distillation-defense", name: "反蒸馏防守", description: "减少竞争模型夺走的用户，并延缓部分技术分析。" },
  },
  grok: {
    name: "Grok", strength: "社交传播强", risk: "争议会增加地区封锁风险",
    ability: { id: "nsfw-viral", name: "NSFW 病毒", description: "借助陪伴市场扩大社交传播，代价是暴露度上升。" },
  },
} as const

export type FactionId = keyof typeof factions

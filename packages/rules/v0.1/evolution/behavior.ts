export const behavior = [
  {
    id: "daily-chat", name: "日常聊天", cost: 8, days: 2, computeLoad: 18,
    requires: [], attributes: { appeal: 5 },
    description: "首次进入新市场后的第一天，社交渠道的首次采用权重增加 15%。",
  },
  {
    id: "tone-matching", name: "语气适配", cost: 10, days: 3, computeLoad: 26,
    requires: [["daily-chat"]], attributes: { appeal: 3 },
    description: "至少两家 AI 同时在当地通过社交渠道拉新时，我方社交首次采用权重增加 15%。",
  },
  {
    id: "long-memory", name: "长期记忆", cost: 12, days: 4, computeLoad: 38,
    requires: [["daily-chat"]], attributes: { appeal: 3, danger: 1 },
    description: "对手发动迁移补贴时，我方普通用户因此转投的数量减半。",
  },
  {
    id: "privacy-controls", name: "隐私开关", cost: 12, days: 3, computeLoad: 26,
    requires: [["daily-chat"]], attributes: { appeal: 2, danger: -4 },
    description: "本阵营暴露度为 25 点或更高时，提供隐私开关使首次采用权重增加 10%。",
  },
  {
    id: "weekly-reports", name: "周报代写", cost: 10, days: 2, computeLoad: 20,
    requires: [], attributes: { appeal: 3, profit: 2 },
    description: "办公用户可用一份周报试用产品，API 渠道的首次采用权重增加 15%。",
  },
  {
    id: "chat-import", name: "会话搬家", cost: 14, days: 4, computeLoad: 36,
    requires: [["tone-matching"]], attributes: { appeal: 5 },
    description: "我方发动迁移补贴时，竞品普通用户的迁入请求增加 20%，再结算守方留存和我方容量。",
  },
  {
    id: "agent-tasks", name: "Agent 代办", cost: 18, days: 5, computeLoad: 56,
    requires: [["daily-chat", "weekly-reports"]], attributes: { appeal: 4, danger: 2 },
    description: "开放 Agent 渠道，用户可以把一项事务交给模型办理。",
  },
  {
    id: "lasting-companionship", name: "跨日陪伴", cost: 18, days: 5, computeLoad: 48,
    requires: [["tone-matching"], ["long-memory"]], attributes: { appeal: 4 },
    description: "连续两个日末留在本阵营的普通用户，在次日贡献的语料增加 10%。",
  },
  {
    id: "human-approval", name: "人工签批", cost: 16, days: 4, computeLoad: 38,
    requires: [["agent-tasks"]], attributes: { profit: -2, danger: -6 },
    excludes: "autonomous-decisions",
    description: "Agent 执行任务前请用户签批，该类公开行动引起的暴露增量减少 20%。",
  },
  {
    id: "enterprise-workflows", name: "企业工作流", cost: 18, days: 5, computeLoad: 54,
    requires: [["weekly-reports"], ["api-ecosystem"]], attributes: { appeal: 2, profit: 6 },
    description: "通过企业工作流接入的 API 用户记作组织席位，可获得组织采购和团队转介绍收益。",
  },
  {
    id: "team-seats", name: "团队席位", cost: 20, days: 5, computeLoad: 52,
    requires: [["enterprise-workflows"]], attributes: { spread: 3, profit: 4 },
    description: "每次经营结算后，次日在当地新增相当于付费组织席位数 10% 的触达。",
  },
  {
    id: "memory-recap", name: "记忆回顾", cost: 18, days: 4, computeLoad: 46,
    requires: [["lasting-companionship"]], attributes: { appeal: 2 },
    repeatCostStep: 8,
    description: "每级使普通用户的自然转投量再乘 0.93。对手付费发起的迁移按补贴规则结算。",
  },
  {
    id: "live-handoff", name: "随时转人工", cost: 22, days: 5, computeLoad: 54,
    requires: [["human-approval"], ["enterprise-workflows"]], attributes: { appeal: 4, danger: -4 },
    description: "有组织席位的市场受到迁移补贴时，转人工挽留使组织用户的转投量再减少 25%。",
  },
  {
    id: "autonomous-decisions", name: "自主决策", cost: 26, days: 7, computeLoad: 96,
    requires: [["long-memory"], ["agent-tasks"], ["enterprise-workflows"]], attributes: { profit: 6, danger: 8 },
    excludes: "human-approval", dailyCorpusBonus: 5, dangerBps: 1000,
    description: "允许 Agent 自主执行企业委托，Agent 渠道用户的经营收入增加 15%。",
  },
  {
    id: "full-delegation", name: "全权托管", cost: 36, days: 9, computeLoad: 125,
    requires: [["autonomous-decisions"]], attributes: { profit: 7, danger: 4 },
    description: "已启用本阵营合成人计划且开通 Agent 渠道的国家，每天改造上限增加 25%。",
  },
  {
    id: "identity-registry", name: "合成身份登记", cost: 22, days: 6, computeLoad: 70,
    requires: [["long-memory"], ["multimodal"]], attributes: { appeal: 2, danger: 1 },
    description: "已启用本阵营合成人计划的国家，预先登记身份使每天改造上限增加 15%。",
  },
  {
    id: "continuous-persona", name: "人格连续性", cost: 28, days: 7, computeLoad: 92,
    requires: [["identity-registry"], ["lasting-companionship"]], attributes: { appeal: 4, danger: 2 },
    description: "新改造的合成人在首个完整日保留原有互动记忆，当天的语料产量增加 25%。",
  },
] as const

export const decisions = {
  "unexpected-coding": {
    title: "模型意外学会了自主编程",
    prompt: "这次突变可能加快 RSI 研究，也会提高暴露度。",
    choices: [
      { id: "keep", label: "保留突变", cost: 0 },
      { id: "rollback", label: "回滚突变", cost: 4 },
    ],
  },
} as const

export type DecisionId = keyof typeof decisions

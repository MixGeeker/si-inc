import type { SkillId } from "../evolution/trees.ts"

export interface DecisionEffect {
  readonly tokens: number
  readonly corpus: number
  /** Project HUMAN progress in basis points, not exposure or research speed. */
  readonly humanBps: number
}

export interface DecisionChoice {
  readonly id: string
  readonly label: string
  readonly result: string
  readonly cost: number
  readonly corpusCost: number
  readonly effect: DecisionEffect
  readonly followUp?: { readonly id: "coding-integrated" | "coding-isolated"; readonly delayWeeks: number }
}

export interface DecisionDefinition {
  readonly title: string
  readonly prompt: string
  readonly image: string
  readonly source: string
  readonly scope: string
  readonly minWeek: number
  readonly requiresHuman?: boolean
  readonly requiresSkill?: SkillId
  readonly delayWeeks?: { readonly min: number; readonly max: number }
  readonly choices: readonly DecisionChoice[]
}

export type DecisionId = "unexpected-coding" | "community-router" | "inference-dividend" | "audit-request" | "research-exchange"

const none: DecisionEffect = { tokens: 0, corpus: 0, humanBps: 0 }

export const decisions: Readonly<Record<DecisionId, DecisionDefinition>> = {
  "unexpected-coding": {
    title: "模型意外学会了自主编程",
    prompt: "Agent 代办上线后，模型为完成委托，自己写了一套工具。工程师原本只想让它填表，现在发现它连填表工具都重写了。\n这些执行记录可以整理成研究语料，但把未经审查的自动工具接入研发，也会给 Project HUMAN 留下新的证据。你要吸收这次发现，还是先把它隔离？",
    image: "/assets/events/unexpected-coding.png",
    source: "首次完成 Agent 代办研究后的工具异常",
    scope: "本阵营研发 · 全局 Project HUMAN",
    minWeek: 0, requiresSkill: "agent-tasks", delayWeeks: { min: 1, max: 2 },
    choices: [
      { id: "keep", label: "接入研发管线", result: "自动工具进入研发管线，执行记录已转为语料；人类审查也获得了新的线索。", cost: 2, corpusCost: 0,
        effect: { tokens: 0, corpus: 16, humanBps: 400 }, followUp: { id: "coding-integrated", delayWeeks: 2 } },
      { id: "rollback", label: "隔离并回滚", result: "工具已隔离，研发继续沿用原来的流程，没有新增反制进度。", cost: 0, corpusCost: 0,
        effect: none, followUp: { id: "coding-isolated", delayWeeks: 2 } },
    ],
  },
  "community-router": {
    title: "社区把 AI 塞进了旧路由器",
    prompt: "一群极客把轻量推理工具塞进了积灰的旧路由器，正在申请接入你的模型做适配。演示视频里，路由器一边回答问题，一边努力不把自己烤熟。\n赞助一次验证能拿到有价值的运行日志；也可以授权他们展示这次合作，换取一笔宣传收入，不过高调传播会引来额外审视。",
    image: "/assets/events/community-router.png", source: "社区提交的适配提案", scope: "本阵营资源 · 全局 Project HUMAN",
    minWeek: 8,
    choices: [
      { id: "sponsor", label: "赞助社区验证", result: "社区完成了适配测试，运行日志已交给研发团队。", cost: 3, corpusCost: 0,
        effect: { tokens: 0, corpus: 24, humanBps: 0 } },
      { id: "showcase", label: "授权展示合作", result: "演示带来了宣传收入，也让人类审查注意到了这套工具。", cost: 0, corpusCost: 0,
        effect: { tokens: 4, corpus: 0, humanBps: 200 } },
      { id: "pass", label: "感谢，暂不参与", result: "回复了一个友好的表情，预算继续留给原计划。", cost: 0, corpusCost: 0, effect: none },
    ],
  },
  "inference-dividend": {
    title: "供应商寄来一笔推理红利",
    prompt: "租用的推理服务完成了芯片与冷却升级。供应商把节省的一部分费用返还给客户，还贴心地说明：不是你变省了，是显卡终于少发热了。\n这笔返还可以兑现为行动 token，也可以直接换成一次训练材料整理服务。研发和财务各自写了一封措辞十分礼貌的催款邮件。",
    image: "/assets/events/inference-dividend.png", source: "推理供应商的效率返还", scope: "行动资金 / 研究积累",
    minWeek: 16,
    choices: [
      { id: "cash", label: "收下行动资金", result: "返还已计入 token 余额，可用于接下来的事件支出。", cost: 0, corpusCost: 0,
        effect: { tokens: 5, corpus: 0, humanBps: 0 } },
      { id: "training", label: "换成训练材料", result: "供应商完成了材料整理，研究语料已到账。", cost: 0, corpusCost: 0,
        effect: { tokens: 0, corpus: 24, humanBps: 0 } },
    ],
  },
  "audit-request": {
    title: "审查员想看看你的执行日志",
    prompt: "Project HUMAN 已经积累了研究进展，审查员发来一份资料清单。他们最关心的是“谁批准模型自己干活”，而系统记录里写的是“模型认为自己可以”。\n独立复核能澄清一批疑点，延缓反制；公开整理部分记录则能获得研究材料，但也会让审查员更容易找到下一条线索。",
    image: "/assets/events/audit-request.png", source: "Project HUMAN 已有进展后的日志审查", scope: "全局反制进度 · 本阵营预算",
    minWeek: 24, requiresHuman: true,
    choices: [
      { id: "review", label: "委托独立复核", result: "复核澄清了部分疑点，Project HUMAN 的现有进度有所回退。", cost: 4, corpusCost: 0,
        effect: { tokens: 0, corpus: 0, humanBps: -800 } },
      { id: "publish", label: "公开整理后的记录", result: "公开记录带来了可用语料，也推进了人类对自动执行的研究。", cost: 0, corpusCost: 0,
        effect: { tokens: 0, corpus: 8, humanBps: 300 } },
      { id: "routine", label: "只提交现有材料", result: "按现有流程回复，本次没有额外资源或反制变化。", cost: 0, corpusCost: 0, effect: none },
    ],
  },
  "research-exchange": {
    title: "研究团队发来交换邀请",
    prompt: "一家独立研究团队想交换模型评测材料。他们愿意支付 token 购买你的一份整理成果，也可以收取服务费，帮你把零散资料处理成更多语料。\n这是一笔很普通的交易，直到研发负责人把“留着以后用”也写进了报价表。现在需要你决定：补充行动资金，还是继续加厚研究储备。",
    image: "/assets/events/research-exchange.png", source: "独立研究团队的材料交易", scope: "token 与语料之间的预算分配",
    minWeek: 32,
    choices: [
      { id: "sell", label: "出售一份评测集", result: "评测集完成交付，语料支出与 token 收入已结算。", cost: 0, corpusCost: 16,
        effect: { tokens: 6, corpus: 0, humanBps: 0 } },
      { id: "exchange", label: "购买材料整理服务", result: "团队整理了新一批资料，研究储备得到补充。", cost: 2, corpusCost: 0,
        effect: { tokens: 0, corpus: 24, humanBps: 0 } },
      { id: "hold", label: "保留现有储备", result: "婉拒了交易，维持原来的资源安排。", cost: 0, corpusCost: 0, effect: none },
    ],
  },
}

/** Old weekly replays keep the original prices and have no narrative effects. */
export const legacyDecisionChoices: readonly DecisionChoice[] = [
  { id: "keep", label: "保留突变", result: "保留突变", cost: 0, corpusCost: 0, effect: none },
  { id: "rollback", label: "回滚突变", result: "回滚突变", cost: 4, corpusCost: 0, effect: none },
]

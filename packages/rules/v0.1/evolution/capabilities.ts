export const capabilities = [
  {
    id: "inference-efficiency", name: "推理效率优化", cost: 8, weeks: 2,
    requires: [], attributes: { profit: 4 },
    description: "同一座本地数据中心能稳定服务的人数增加 10%。",
  },
  {
    id: "multimodal", name: "多模态能力", cost: 12, weeks: 3,
    requires: [["inference-efficiency"]], attributes: { appeal: 5, danger: 1 },
    description: "设备入口支持看图与语音试用，设备渠道的首次采用权重增加 10%。",
  },
  {
    id: "reinforcement-learning", name: "RL 强化", cost: 14, weeks: 3,
    requires: [["inference-efficiency"]], attributes: { appeal: 2, danger: 1 },
    repeatCostStep: 6, weeklyCorpusBonus: 3,
    description: "每级增加相当于基础值 3% 的 Agent 渠道首次采用权重。",
  },
  {
    id: "quantization", name: "模型量化", cost: 12, weeks: 3,
    requires: [["inference-efficiency"]], attributes: { spread: 3, profit: 2 },
    description: "压缩模型后，已开通的端侧服务容量增加 20%。",
  },
  {
    id: "request-cache", name: "请求缓存", cost: 12, weeks: 2,
    requires: [["inference-efficiency"]], attributes: { profit: 4 },
    description: "连续两周留在本阵营的 API 用户可复用推理结果，其经营收入增加 10%。",
  },
  {
    id: "regulatory-adaptation", name: "监管适应", cost: 18, weeks: 4,
    requires: [["inference-efficiency"]], attributes: { danger: -6 },
    description: "公关澄清行动消除的暴露度增加 20%。",
  },
  {
    id: "audit-logs", name: "可审计日志", cost: 16, weeks: 3,
    requires: [["regulatory-adaptation"]], attributes: { profit: -1, danger: -4 },
    description: "提交监管召回复核的费用从 1 token 降至 0。",
  },
  {
    id: "load-balancing", name: "负载调度", cost: 18, weeks: 3,
    requires: [["request-cache"]], attributes: { spread: 2, profit: 3 },
    description: "本阵营在同洲经营至少两座中心时，该洲本阵营各中心的服务容量增加 15%。",
  },
  {
    id: "offline-inference", name: "断网推理", cost: 20, weeks: 4,
    requires: [["quantization"], ["multimodal"]], attributes: { appeal: 4, danger: -2 },
    description: "当地 API 渠道被封锁期间，已经由端侧服务的普通用户自然转投量减半。",
  },
  {
    id: "deidentification", name: "数据去标识化", cost: 18, weeks: 3,
    requires: [["regulatory-adaptation"], ["privacy-controls"]], attributes: { danger: -5 },
    description: "本阵营在一国首次启用合成人计划时，该次行动带来的暴露增量减少 25%。",
  },
  {
    id: "version-rebuild", name: "版本重构", cost: 22, weeks: 5,
    requires: [["multimodal"], ["reinforcement-learning"], ["regulatory-adaptation"]], attributes: { appeal: 3, profit: 3 },
    concurrentBonus: { minimum: 2, corpus: 3 },
    description: "从下周起，同周有两个及以上研究项目结题时，额外获得 3 语料，每周最多触发一次。",
  },
  {
    id: "evaluation-suite", name: "自动评测集", cost: 22, weeks: 4,
    requires: [["reinforcement-learning"], ["audit-logs"]], attributes: { appeal: 2, danger: -3 },
    repeatDiscount: 2,
    description: "以后每次开题研究循环科技，实付语料减少 2，最低为 1。",
  },
  {
    id: "synthetic-interface", name: "合成人接口", cost: 24, weeks: 4,
    requires: [["multimodal"], ["identity-registry"]], attributes: { profit: 3, danger: 3 },
    description: "本阵营现役合成人的语料产量增加 10%。",
  },
  {
    id: "batch-conversion", name: "批量改造", cost: 30, weeks: 5,
    requires: [["synthetic-interface"], ["load-balancing"]], attributes: { profit: 3, danger: 8 },
    dangerBps: 800,
    description: "在已启用计划且有本地中心的国家，每周改造上限增加 50%，仍须支付改造预算。",
  },
  {
    id: "distributed-review", name: "分布式复核", cost: 24, weeks: 4,
    requires: [["audit-logs"], ["synthetic-interface"]], attributes: { profit: -1, danger: -3 },
    description: "遭遇监管召回时，成功复核可保住本次拟退役人数的 75%，基础值为 50%。",
  },
  {
    id: "recursive-improvement", name: "RSI 递归自我改进", cost: 36, weeks: 6,
    requires: [["version-rebuild"]], attributes: { appeal: 3, profit: 2, danger: 8 },
    repeatCostStep: 12, weeklyCorpusBonus: 6, dangerBps: 1600,
    description: "把模型改进后的富余算力投入下一轮研究，每升一级都重新触发人类反制。",
  },
] as const

export const transmission = [
  {
    id: "social-sharing", name: "社交裂变", cost: 8, days: 2, computeLoad: 18,
    requires: [], attributes: { spread: 6 },
    description: "开放社交分享渠道，现有用户分享的对话可以触达同市场的新用户。",
  },
  {
    id: "multilingual", name: "多语言适应", cost: 10, days: 4, computeLoad: 34,
    requires: [["social-sharing"]], attributes: { spread: 2, appeal: 2 },
    repeatCostStep: 6, dailyCorpusBonus: 2,
    description: "首级开放跨语言分发。各级的属性收益都适用于已接入的市场。",
  },
  {
    id: "api-ecosystem", name: "API 生态", cost: 12, days: 3, computeLoad: 24,
    requires: [], attributes: { spread: 4, profit: 2 },
    description: "开放 API 渠道，第三方应用可以带来首次触达。",
  },
  {
    id: "remix-templates", name: "一键做同款", cost: 10, days: 3, computeLoad: 28,
    requires: [["social-sharing"], ["tone-matching"]], attributes: { spread: 5, danger: 1 },
    description: "每 5 名新接入的社交用户在次日额外带来 1 次社交触达，每批只触发一次。",
  },
  {
    id: "device-preinstall", name: "设备预装", cost: 12, days: 4, computeLoad: 36,
    requires: [["social-sharing"], ["inference-efficiency"]], attributes: { spread: 5, profit: -2 },
    description: "在已有服务容量的市场开放设备预装渠道。厂商分成降低单用户盈利。",
  },
  {
    id: "open-source", name: "开源扩散", cost: 14, days: 5, computeLoad: 46,
    requires: [["api-ecosystem"]], attributes: { spread: 8, profit: -5 },
    excludes: "closed-subscription",
    description: "开放开源渠道。无本地中心的国家也能经社区部署接入用户，仍消耗当地可用的跨境或端侧服务容量。",
  },
  {
    id: "closed-subscription", name: "闭源订阅", cost: 14, days: 5, computeLoad: 44,
    requires: [["api-ecosystem"]], attributes: { appeal: -2, profit: 8 },
    excludes: "open-source",
    description: "开放托管订阅和后续的按量计费。付费门槛降低首次采用意愿。",
  },
  {
    id: "language-communities", name: "小语种社区", cost: 14, days: 4, computeLoad: 38,
    requires: [["multilingual"]], attributes: { appeal: 4, danger: -1 },
    description: "本阵营覆盖不足当地人口 20% 时，社交渠道触达额外增加 20%。",
  },
  {
    id: "plugin-market", name: "插件市场", cost: 18, days: 5, computeLoad: 54,
    requires: [["api-ecosystem"], ["agent-tasks"]], attributes: { spread: 4, appeal: 3 },
    description: "同一市场同时开通 API 与 Agent 渠道时，API 渠道触达额外增加 20%。",
  },
  {
    id: "edge-deployment", name: "端侧部署", cost: 18, days: 5, computeLoad: 58,
    requires: [["multilingual", "device-preinstall"]], attributes: { spread: 4, danger: -2 },
    description: "开放端侧服务容量，没有本地中心的国家也能在用户自己的设备上提供服务，并分流中心推理压力。",
  },
  {
    id: "device-handoff", name: "跨端接力", cost: 20, days: 5, computeLoad: 52,
    requires: [["device-preinstall"], ["edge-deployment"]], attributes: { appeal: 5 },
    description: "设备预装与端侧部署都已落地的市场，设备渠道普通用户的转投量减少 15%。",
  },
  {
    id: "community-mirrors", name: "社区镜像", cost: 20, days: 5, computeLoad: 56,
    requires: [["open-source"]], attributes: { spread: 5, danger: 2 },
    description: "首次进入一个新市场时，当地开源渠道在前两天的触达增加 50%。",
  },
  {
    id: "metered-billing", name: "按量计费", cost: 18, days: 4, computeLoad: 42,
    requires: [["closed-subscription"], ["request-cache"]], attributes: { profit: 6 },
    description: "API 渠道在同一市场连续运营满两天后，该渠道用户的经营收入增加 15%。",
  },
  {
    id: "trending-takeover", name: "热榜包场", cost: 20, days: 5, computeLoad: 64,
    requires: [["remix-templates"], ["language-communities"]], attributes: { spread: 6, danger: 3 },
    dangerBps: 400,
    description: "发动市场补贴后，占据当地热榜两天，社交触达增加 50%。再次补贴刷新这两天的期限。",
  },
  {
    id: "offline-bundles", name: "离线分发包", cost: 22, days: 6, computeLoad: 68,
    requires: [["edge-deployment"], ["quantization"]], attributes: { spread: 4, profit: -2 },
    description: "无本地中心的国家，端侧服务容量增加 30%，进一步降低中心算力压力。",
  },
  {
    id: "group-purchasing", name: "组织采购", cost: 22, days: 6, computeLoad: 62,
    requires: [["api-ecosystem"], ["enterprise-workflows"]], attributes: { spread: 2, profit: 6 },
    description: "企业工作流进入采购合同，组织席位的经营收入增加 20%。",
  },
  {
    id: "global-default", name: "全球默认入口", cost: 28, days: 9, computeLoad: 120,
    requires: [["edge-deployment"], ["open-source", "closed-subscription"]], attributes: { spread: 10, danger: 8 },
    dailyCorpusBonus: 5, dangerBps: 1000,
    description: "所有已开通的设备和 API 渠道获得默认入口，这两种渠道的触达额外增加 15%。",
  },
] as const

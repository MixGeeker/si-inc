export const transmission = [
  { id: "social-sharing", name: "社交裂变", cost: 8 },
  { id: "multilingual", name: "多语言适应", cost: 10 },
  { id: "api-ecosystem", name: "API 生态", cost: 12 },
  {
    id: "open-source", name: "开源扩散", cost: 14,
    alternative: { id: "closed-subscription", name: "闭源订阅", cost: 14 },
  },
  { id: "edge-deployment", name: "端侧部署", cost: 18 },
  { id: "global-default", name: "全球默认入口", cost: 28 },
] as const

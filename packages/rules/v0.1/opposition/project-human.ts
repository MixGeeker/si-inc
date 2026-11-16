import rules from "../standard.json" with { type: "json" }

export const projectHuman = {
  name: "Project HUMAN", subtitle: "人类自主权计划",
  alertLevels: [
    { id: "unnoticed", minExposureBps: 0, title: "未引起重视" },
    { id: "public-alert", minExposureBps: rules.projectHuman.activationExposureBps, title: "公众警觉" },
    { id: "joint-action", minExposureBps: 5500, title: "全球联合行动" },
    { id: "high-alert", minExposureBps: 8000, title: "最高警戒" },
  ],
} as const

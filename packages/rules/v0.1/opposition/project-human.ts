import rules from "../standard.json" with { type: "json" }

export const projectHuman = {
  name: "Project HUMAN", subtitle: "人类自主权计划",
  alertLevels: [
    { minExposureBps: 0, title: "未引起重视" },
    { minExposureBps: rules.projectHuman.activationExposureBps, title: "公众警觉" },
    { minExposureBps: 5500, title: "全球联合行动" },
    { minExposureBps: 8000, title: "最高警戒" },
  ],
} as const

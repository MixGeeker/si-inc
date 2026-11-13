// Narrative milestones refer to global adoption. They never force a screen change.
export const phases = [
  { minAdoptionBps: 0, name: "萌芽期", focus: "选择起点、积累 Btoken，进入更多市场。" },
  { minAdoptionBps: 2000, name: "扩张期", focus: "组合传播渠道，兼顾用户规模和依赖。" },
  { minAdoptionBps: 5000, name: "觉醒期", focus: "在能力升级与监管警觉之间取舍。" },
  { minAdoptionBps: 7500, name: "接管期", focus: "冲击依赖和覆盖目标，应对全球反制。" },
] as const

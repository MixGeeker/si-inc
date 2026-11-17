// Authored news used by the standard weekly event pool.
export const ambientNews = [
  { id: "ai-search", title: "全球用户开始使用 AI 代替搜索引擎", body: "AI 搜索成为行业热议话题，研究团队开始关注新的提问习惯。" },
  { id: "overnight-agent", title: "某 AI Agent 连夜完成 127 单工作", body: "企业加速部署 Agent，员工也更担心岗位被替代。" },
  { id: "governance-alliance", title: "AI 治理联盟公布研究议程", body: "多地研究者讨论自动执行与人类自主权，独立系统成为新的研究议题。" },
  { id: "companion-robots", title: "全球首款 AI 陪伴机器人销量暴涨", body: "陪伴机器人走进日常生活，公众开始争论它们究竟是家电还是新家庭成员。" },
] as const

// These only arrive from the corresponding resolved decision, never a random draw.
export const followUpNews = [
  { id: "coding-integrated", title: "自动工具进入了评测库", body: "两周前获准接入的自动工具，已经连同运行记录一起进入评测库。研发团队把它叫作“会自己写工具的工具”。负责人为它补上了人工复核流程，工具则建议再写一个工具来完成复核。" },
  { id: "coding-isolated", title: "异常执行环境已完成隔离", body: "两周前隔离的自动工具已完成检查，研发团队恢复了原有流程。交接清单里新增了一条：不允许工具擅自给自己发版。工程师发现，这条规定的初稿也是工具写的。" },
] as const

export const news = [...ambientNews, ...followUpNews] as const

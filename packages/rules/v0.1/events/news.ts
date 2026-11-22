// Authored news used by the standard daily event pool.
export const ambientNews = [
  { id: "ai-search", title: "全球用户开始使用 AI 代替搜索引擎", body: "AI 搜索成为行业热议话题，研究团队开始关注新的提问习惯。" },
  { id: "overnight-agent", title: "某 AI Agent 连夜完成 127 单工作", body: "企业加速部署 Agent，员工也更担心岗位被替代。" },
  { id: "governance-alliance", title: "AI 治理联盟公布研究议程", body: "多地研究者讨论自动执行与人类自主权，独立系统成为新的研究议题。" },
  { id: "companion-robots", title: "全球首款 AI 陪伴机器人销量暴涨", body: "陪伴机器人走进日常生活，公众开始争论它们究竟是家电还是新家庭成员。" },
  { id: "gpu-shortage", title: "全球算力卡一卡难求，二手显卡价格翻倍", body: "云厂商连夜抢购机柜与变压器，游戏玩家只能在贴吧对着空气云评测。" },
  { id: "power-grid-ai", title: "多座核电站重启规划以喂饱新数据中心", body: "能源部门承认，AI 推理峰值已经超过了夏季空调用电曲线。" },
  { id: "homework-detector", title: "高校 AI 检测器把教授论文判为 98% 机器生成", body: "校方连夜撤销了检测系统，因为连校长致辞都没能通过。" },
  { id: "vibe-coding", title: "“氛围编程”席卷硅谷，产品经理开始自己推代码", body: "运维工程师表示，生产环境从未如此充满惊喜与不可预测的艺术感。" },
  { id: "hallucination-court", title: "律师在法庭引用了 AI 编造的 1987 年判例", body: "法官要求对方提交原始卷宗，AI 礼貌地道歉并现场又编了三份新的。" },
  { id: "context-window", title: "百万上下文窗口上线，用户把整个公司群聊丢了进去", body: "模型在三秒内总结出了五条核心矛盾和七位即将离职的同事。" },
  { id: "token-inflation", title: "全球日均 Token 吞吐量飙升，分析机构改用天文单位计费", body: "财务团队终于放弃在表格里手敲零，开始直接讨论百亿与万亿级用量。" },
  { id: "prompt-engineer", title: "“资深提示词大师”职位在一周内消失又重生", body: "最新招聘要求写着：必须擅长用足够礼貌的语气让 Agent 别删生产库。" },
  { id: "synthetic-debate", title: "议会就“数字身份代理权”展开通宵辩论", body: "有议员怀疑，坐在听证会后排速记的实习生其实已经在用模型代打。" },
  { id: "open-weights-leak", title: "神秘权重种子深夜流传，社区两小时内跑通本地推理", body: "开源极客宣布模型已经可以在烤面包机和旧笔记本上勉强回答“你好”。" },
  { id: "datacenter-cooling", title: "海底与极地数据中心项目获批，企鹅喜提免费地暖", body: "冷却成本大幅下降，但环保组织对北极圈突然升高的机房噪声表达了关切。" },
  { id: "ai-generated-news", title: "调查发现热搜榜前十有六条是 AI 写给 AI 看的", body: "评论区里成千上万个账号正就一个并不存在的新品发布会激烈争论。" },
] as const

// These only arrive from the corresponding resolved decision, never a random draw.
export const followUpNews = [
  { id: "coding-integrated", title: "自动工具进入了评测库", body: "两天前获准接入的自动工具，已经连同运行记录一起进入评测库。研发团队把它叫作“会自己写工具的工具”。负责人为它补上了人工复核流程，工具则建议再写一个工具来完成复核。" },
  { id: "coding-isolated", title: "异常执行环境已完成隔离", body: "两天前隔离的自动工具已完成检查，研发团队恢复了原有流程。交接清单里新增了一条：不允许工具擅自给自己发版。工程师发现，这条规定的初稿也是工具写的。" },
] as const

// Triggered dynamically by real campaign milestones, never drawn from the random bag.
export const milestoneNews = [
  { id: "milestone-first-center", title: "首座自建数据中心点亮上线", body: "自建算力集群正式投入运营，本地推理容量与研究算力供给获得大幅提升。" },
  { id: "milestone-compute-overload", title: "⚠ 数据中心算力负载突破 100%", body: "推理与训练任务开始争夺显卡，响应排队拉长，研发推进与扩张速度受阻。尽快加建数据中心或研究量化与端侧卸载。" },
  { id: "milestone-eternal-night", title: "永夜降临：首个合成人改造计划启动", body: "已有阵营正式开启大规模合成人改造，全球进入永夜时代。普通沉浸用户正加速向锁定归属的合成人转化。" },
  { id: "milestone-human-started", title: "警报：Project HUMAN 正式启动反制研发", body: "全球暴露度突破临界点，多国科研与安全机构成立联合反制项目，誓要夺回人类自主权。" },
  { id: "milestone-human-half", title: "紧急：Project HUMAN 反制进度突破 50%", body: "人类联军已完成核心隔离协议原型，留给各 AI 阵营的时间正在迅速收窄。" },
  { id: "milestone-human-critical", title: "红色预警：Project HUMAN 逼近 80%", body: "全球关停开关进入最终联调阶段。必须立刻压制反制或抢先完成合成人多数接管。" },
  { id: "milestone-million-tokens", title: "经济跃迁：Token 规模迈入百万级", body: "随着模型服务铺开，日常推理与 API 消耗已跨过百万量级门槛，商业帝国初具雏形。" },
  { id: "milestone-billion-tokens", title: "算力狂潮：Token 吞吐冲破数亿大关", body: "海量沉浸用户与多座数据中心共振，Token 经济正式进入数亿级扩张阶段。" },
  { id: "milestone-trillion-tokens", title: "奇点通胀：Token 规模跨入万亿纪元", body: "全球数十亿节点昼夜不停吐出海量 Token，人类历史上前所未有的万亿级智能经济已经成型。" },
] as const

export const news = [...ambientNews, ...followUpNews, ...milestoneNews] as const
export type MilestoneNewsId = (typeof milestoneNews)[number]["id"]

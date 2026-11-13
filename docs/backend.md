# Singularity Inc. 后端与 Cloudflare 托管规划

首版建议只启用 **Workers Static Assets**。玩家加载游戏后，浏览器负责推进 12 个地区的模拟，用 IndexedDB 存进度。一局从选择阵营到结算可以产生 **0 次动态 API 请求、0 次云端写入**。按 2026 年 11 月 12 日的价格，在免费托管限制内使用 `workers.dev` 试玩，预计 Cloudflare 运行费为 **0 美元/月**。公开挑战有了可比较的成绩后，再给同一站点加一个 Worker 和一个 D1 数据库。[游戏设计稿 V0.1（第十三节为首版范围）](https://chatgpt.com/s/t_6af5e2ee6e948191beaf56068a35d645) · [静态资源计费](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/) · [workers.dev 的适用范围](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/)

## Cloudflare 服务怎么选

| 启用时机 | 产品 | 在游戏里负责什么 | 成本依据 |
| --- | --- | --- | --- |
| 单人试玩 | Workers Static Assets | 同源托管 HTML、脚本、地图、规则包和新闻文案。按内容生成哈希文件名，浏览器可长期缓存 | 直接命中静态资源的请求免费且不限量。Free 每个版本最多 20,000 个文件，单文件上限 25 MiB。[静态资源计费](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/) · [平台限制](https://developers.cloudflare.com/workers/platform/limits/) |
| 公开挑战、可信战绩 | Workers Free + D1 | Worker 签发开局凭证并重放操作，D1 用唯一键保存已验证的胜局，按索引读榜 | Worker 每天 10 万次动态请求，每次限 10 ms CPU。D1 每天 500 万读行、10 万写行，单库 500 MB，账户合计 5 GB。[Workers 定价](https://developers.cloudflare.com/workers/platform/pricing/) · [D1 定价](https://developers.cloudflare.com/d1/platform/pricing/) · [D1 限制](https://developers.cloudflare.com/d1/platform/limits/) |
| 实时联机 | SQLite-backed Durable Objects | 每个房间一个对象，统一排序玩家操作并广播。回合之间用 WebSocket Hibernation 保持连接 | 独立核算对象请求、活动时长及存储。届时用房间数和活跃时间估算。[Durable Objects 定价](https://developers.cloudflare.com/durable-objects/platform/pricing/) · [WebSocket 休眠](https://developers.cloudflare.com/durable-objects/best-practices/websockets/) |
| 大文件或可下载回放 | R2 Standard | 单个结局视频超过 25 MiB，或产品承诺长期保存完整回放时，按对象存文件，D1 只留索引 | 每月含 10 GB·月、100 万次 A 类操作、1,000 万次 B 类操作。公网出站流量免费。[R2 定价](https://developers.cloudflare.com/r2/pricing/) |

Pages 也能托管静态游戏。选 Workers Static Assets 是为了让以后增加的 `/api/*` 与试玩沿用同一域名和部署配置。启用 API 时，只给 `/api/*` 配置 `assets.run_worker_first`，让地图和规则文件继续直接命中静态资源。试玩可用平台子域，商业发布时再核算自有域名年费。[静态资源路由](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/) · [域名路由](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/)

规则随版本发布，Btoken 随单局结算，因此首版可以省去 KV。公开成绩需要原子去重，D1 的唯一键更合适。新闻、突变、竞争模型和 Project HUMAN 都由规则表与随机种子驱动，Workers AI 没有推理任务。玩家暂停时世界也暂停，Cron 没有需要推进的时钟。Queues 留给将来确有积压、能异步完成的工作。[KV 一致性](https://developers.cloudflare.com/kv/concepts/how-kv-works/) · [Queues 计费](https://developers.cloudflare.com/queues/platform/pricing/)

## 玩法怎样落到代码和数据

首版包含 GPT、Claude、Grok，18 个通用技能、每阵营 1 个专属能力、12–15 条新闻，以及统一胜负和阵营结局文案。DeepSeek 等新增阵营、隐藏结局、沙盒和联机属于后续范围。下列阈值取自设计稿，作为首轮平衡测试参数。[游戏设计稿 V0.1](https://chatgpt.com/s/t_6af5e2ee6e948191beaf56068a35d645)

| 玩法 | 数据和执行方式 |
| --- | --- |
| 12 地区与五种传播渠道 | 规则表存人口权重、邻接关系、数字化、算力、监管及语言壁垒。每周用上周的地区快照同时计算各区增量。社交、API 集成、开源、终端预装、Agent 工作流分别修改本地或跨区系数。 |
| 普及与依赖 | 设 `w` 为归一化人口权重，`p` 为当地普及率，`d` 为当地用户的依赖度。全球普及率为 `Σ(w × p)`，全球依赖率为 `Σ(w × p × d)`。两项都以世界人口为分母。地区有 80% 的人使用 AI、其中一半依赖它，该区只有 40% 的人口计入全球依赖。 |
| Btoken 与三棵技能树 | 初始 18 Btoken，每两周发周期收益，上限为 4。每个地区记录首次进入及首次达到 30%、70% 的奖励标记。购买时按顺序核验余额、前置、互斥、进度门槛和主动能力冷却。开源扩散与闭源订阅共用互斥组。 |
| 新闻、突变与竞争 | 用可复现的伪随机序列，从当前版本的事件表抽取。新闻间隔建议 8–12 周，效果带有起止周。竞争厂商降价也是一条事件。玩家的应对选择记录事件实例 ID，同一事件只结算一次。 |
| 暴露度与 Project HUMAN | 暴露度达到 25/100 启动研究，按难度、暴露度和技能修正每周进展。地区封锁单独计算。协议重构增加研究需求，已完成研究量保留。 |
| 周推进与结局 | 常速每 4 秒一周，支持暂停和 2 倍速。每周结算时，Project HUMAN 到 100% 则人类胜利。研究尚未完成时，全球普及 ≥85%、全球依赖 ≥65%，且至少 10 个地区的当地普及 ≥60%，则玩家胜利。第 120 周先判胜负，此后仍未获胜才判超时。 |

规则引擎选用纯 TypeScript，浏览器用 React 呈现，用 IndexedDB 保存对局。共享引擎只接收上周状态、玩家指令和版本化规则，未来的挑战 Worker 直接调用这个引擎。前端、规则和 Worker 统一使用 tsrs 严格检查，各自只加载所在环境的类型。比例用整数基点表示，10,000 基点等于 100%。乘法和求和保留中间精度，显示时才四舍五入。规则 ID、技能和事件遍历顺序、伪随机算法也随版本固定。相同的初始条件和操作必须产生相同结局。[前端技术决策](./frontend-3d.md)

### 一局如何保存与恢复

1. 开局固定 `rulesVersion`、无符号 32 位种子、阵营、起始地区和难度。`completedWeek = 0` 表示第一个游戏周尚未推进。
2. 操作携带 `{ week, seq }`，其中 `week` 是操作发生时已完成的周数，`seq` 是局内严格递增的序号。暂停和变速只影响显示时钟。一次完整模拟依次处理玩家操作、地区传播与依赖、奖励和事件、反制、胜负。
3. 每次玩家决策或完成一周时，用一次 IndexedDB 事务覆盖本地存档。`ReplayV1` 存起始条件、已完成周数及操作日志。重开页面从固定种子重放，包含停在当前周、尚未推进到下一周的操作。浏览器在后台或关闭期间默认暂停。类型定义见[对局与回放契约](../packages/game/types.ts)。
4. 已发布规则内容使用独立版本号，旧存档通过 `saveVersion` 选择解码器、通过 `rulesVersion` 选择原来的规则和引擎版本。发布新版本时保留仍支持的旧包，测试跨版本读档。单设备试玩接受本地存档可能随浏览器数据清理而丢失。若以后需要跨设备续玩，再设计身份恢复、D1 私有存档及版本号条件更新。

## 公开挑战何时需要后端

公开成绩才需要服务端裁判。建议第一种挑战固定种子、阵营、起点、难度和规则版本，按**用最少游戏周取得标准胜利**排名。每名玩家可以反复尝试，每张开局凭证最多产生一条成绩。普通单人存档始终可以离线结算。

| 同源接口 | 处理与存储 |
| --- | --- |
| `POST /api/v1/challenges/{id}/runs` | Worker 根据已发布挑战配置生成随机 `runId`，用 Worker Secret 中的密钥签名起始参数、挑战 ID 和过期时间。返回凭证，开局无需写库。 |
| `PUT /api/v1/runs/{runId}/result` | 验证签名、期限和路径 ID，限制输入大小与操作数，再从凭证中的初始条件重放。服务端自行检查每次支出、事件选择及胜利周。胜局写入 D1，保存结果与规范化回放的哈希。败局返回结算结果即可。 |
| `GET /api/v1/challenges/{id}/leaderboard` | 以挑战和规则版本为过滤条件，按 `win_week, run_id` 升序返回前 20 行。同周用 `run_id` 稳定排序。每次主动查看读一次，游戏周不触发刷新。 |

`verified_runs.run_id` 是唯一键。用 `INSERT … ON CONFLICT(run_id) DO NOTHING` 竞争写入。首次成功返回 201，发生冲突时读回已有记录，与服务端计算的哈希一致则返回原回执和 200，有差异则返回 409。并发提交与响应丢失重试都遵守这条规则。D1 存储结论与哈希，普通局及完整回放留在本地。详情见[挑战成绩迁移](../apps/api/migrations/0001_verified_runs.sql)。

服务端重放可以验证操作合法性，公开种子允许玩家反复优化路线。上线前用最长合法对局（120 周、12 地区、密集操作）测 Worker CPU。Free 每次调用只有 10 ms CPU，网络和 D1 等待时间与 CPU 分开看。若完整验证超限，先优化模拟或基于实测选择 Paid。[Workers 限制](https://developers.cloudflare.com/workers/platform/limits/) · [Worker CPU 指标](https://developers.cloudflare.com/workers/observability/metrics-and-analytics/)

网络中断、配额耗尽或服务暂时不可用时，本地保留操作日志并显示“待提交”，在凭证有效期内用同一 `runId` 重试。凭证过期、回放含非法操作或内容冲突时，返回具体原因，结束该次成绩提交。

## 成本预算与升级点

以 30 天为一月，金额为美元。纯静态试玩保留默认静态资源路由，以下预算不含域名购买、税费或同一账户其他项目的用量。若改成每个游戏周请求一次服务器，1,000 局打满就会产生 120,000 次动态请求/日，已超过 Workers Free 的 100,000 次/日。[静态资源计费](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/) · [Workers 定价](https://developers.cloudflare.com/workers/platform/pricing/)

假设每天有 `N` 局挑战，每局开局、交卷、查榜各用一次请求，则每日动态请求为 `3N`。D1 暂按每局 **读 32 行、写 6 行**预留，即每日读 `32N` 行、写 `6N` 行。估值涵盖读取前 20 名、索引维护、去重和过期数据清理。D1 按扫描与修改的行计费，索引更新也会增加写行，发布后用 `meta.rows_read` 和 `meta.rows_written` 替换估值。[D1 计费口径](https://developers.cloudflare.com/d1/platform/pricing/) · [D1 查询指标](https://developers.cloudflare.com/d1/worker-api/return-object/)

| 场景 | 动态请求/日 | D1 读行/日 | D1 写行/日 | 预计 Cloudflare 月费 |
| --- | ---: | ---: | ---: | --- |
| 单人试玩，每天 1,000 局 | 0 | 0 | 0 | $0 |
| 公开挑战，每天 1,000 局 | 3,000 | 32,000 | 6,000 | Free 内 $0，前提是回放满足单次 CPU 限制且单库低于 500 MB |
| 公开挑战，每天 20,000 局 | 60,000 | 640,000 | 120,000 | 写行先超过 Free。按下列用量切换 Paid，约 $5 |

以上假设下，单看免费写入额度，每天可支持 `⌊100,000 ÷ 6⌋ = 16,666` 局。实际值取决于提交胜局的比例、索引更新次数、过期记录清理量和同一账户的其他写入。建议在写行达到日额度 80% 时检查高耗 SQL 和历史记录大小。Free 用尽任一读写日额度后，D1 查询会返回错误，升级需主动选择。[D1 免费额度与超限行为](https://developers.cloudflare.com/d1/platform/pricing/)

20,000 局/日对应每月 180 万动态请求、1,920 万读行、360 万写行。若所有请求平均 5 ms CPU（估算），合计 900 万 CPU-ms。Workers Paid 每账户每月 $5 起，含 1,000 万次请求和 3,000 万 CPU-ms。D1 含 250 亿读行、5,000 万写行和 5 GB 存储。示例假设存储在包含量内。超量单价分别为每百万请求 $0.30、每百万 CPU-ms $0.02、D1 每百万读行 $0.001、每百万写行 $1、超额存储 $0.75/GB·月。实际决定升级的也可能是单次回放 CPU 或单库大小。[Workers 价格](https://developers.cloudflare.com/workers/platform/pricing/) · [D1 价格](https://developers.cloudflare.com/d1/platform/pricing/) · [单库限制](https://developers.cloudflare.com/d1/platform/limits/)

## 仓库文件树

当前工程从根目录构建。首页的全屏 3D 地形、SVG 国界、风湿场和洋流采样文件随静态资源发布。环境动画在浏览器运行，API 目录中的迁移和类型配置供公开挑战阶段使用。[地图数据与渲染](map-rendering.md)

```text
Singularity-Inc/
├── package.json / package-lock.json    # React、tsrs、构建命令与锁定版本
├── tsconfig.json / tsconfig.tools.json # 无 DOM 的共享规则；构建工具单独检查
├── wrangler.jsonc                      # 先经 tsrs 和 Vite，再发布 apps/web/dist/
├── docs/{backend,frontend-3d}.md
├── apps/
│   ├── web/
│   │   ├── index.html / vite.config.ts / tsconfig.json
│   │   ├── src/
│   │   │   ├── main.tsx / App.tsx / style.css
│   │   │   ├── cartography/            # 当前地图、图标和 HUD
│   │   │   └── world/                  # 旧版 R3F 地球组件
│   │   └── public/                     # _headers、图标与地图数据许可
│   └── api/
│       ├── README.md / tsconfig.json   # Worker 接入时机与运行时类型
│       └── migrations/
│           └── 0001_verified_runs.sql  # 成绩唯一键和查榜索引
└── packages/
    ├── game/
    │   └── types.ts                    # 地区状态、玩家指令和版本化回放
    └── rules/v0.1/
        ├── regions.ts                  # 12 区稳定 ID 与定位点
        └── standard.json               # 节奏、阵营和胜利阈值
```

Vite 从 `apps/web/index.html` 构建到 `apps/web/dist/`。它将哈希脚本和样式写入 `dist/assets/`，并复制 `public/_headers`；长期缓存规则只匹配 `/assets/*`。玩法开发还需补上下列部分。[静态响应头](https://developers.cloudflare.com/workers/static-assets/headers/)

| 阶段 | 待建路径 | 职责 |
| --- | --- | --- |
| 单人模拟 | `packages/game/{simulation,replay}.ts` | 初始化、逐周推进、终局与重放，共用于浏览器、本地平衡模拟和挑战 Worker |
| 内容制作 | `packages/rules/v0.1/regions.ts`、待建的 `{channels,skills,factions,events}.json` | 在现有地区 ID 上补全人口权重和正式传播系数；增加技能图、阵营能力、新闻与突变，检查引用、互斥及技能环路 |
| 浏览器接入 | 待建 `apps/web/src/{clock,save}.ts` | 在现有 React 地图接入周状态、暂停/倍速、IndexedDB 保存与读档 |
| 平衡验证 | `packages/game/tests/` | 固定种子回放样本和三种策略的批量平衡测试，在开发机执行 |
| 公开挑战 | `apps/api/src/{index,tickets,results,leaderboard}.ts` | 原生 `fetch` 入口、签名凭证、同引擎验分和参数化 SQL。Wrangler 增加 `main` 和 D1 绑定 `DB`，迁移目录指向 `apps/api/migrations` |

## 落地与验收

1. **静态试玩。** 根目录执行 `npm ci`，然后用 `npm run dev` 开发，或用 `npx wrangler@4.161.0 deploy --dry-run` 验证发布。Wrangler 的自定义构建会调用 `npm run build`；任一 tsrs 检查失败便停止。实际发布命令为 `npx wrangler@4.161.0 deploy`。[Wrangler 部署命令](https://developers.cloudflare.com/workers/wrangler/commands/workers/)
2. **首版玩法。** 用同一种子和操作分别跑常速、2 倍速、暂停恢复和重开页面，要求同周状态与结果一致。测试 85%/65% 刚好达标、仅 9 区达标、反制与胜利同周、第 120 周首次获胜、重复领取里程碑。批量跑潜伏扩张、病毒营销、技术爆炸三类策略，查看胜率与通关周数。浏览器加载资源后断网打一局，验证逐周模拟和本机结算都能完成。
3. **挑战上线。** 绑定独立的测试 D1 后先运行 `npx wrangler@4.161.0 d1 migrations apply DB --local`。验证篡改余额或非法技能顺序无法上榜、重复交卷只有一行、榜单查询命中索引、最坏回放满足 CPU 预算。用独立预发布数据库演练迁移，再将同一迁移应用到生产。数据库迁移与 Worker 版本分别管理。[D1 迁移](https://developers.cloudflare.com/d1/reference/migrations/) · [D1 恢复窗口](https://developers.cloudflare.com/d1/platform/limits/)

# Singularity Inc. 后端与 Cloudflare 托管规划

当前浏览器已经使用共享规则引擎按日推进，常速 4 秒/日，支持 1、2、5 倍速及独立暂停；对局没有固定到期日。`apps/api/` 目前只有说明、类型配置和初始 D1 DDL，尚无 Worker 请求处理器、公开榜单或服务端验分。浏览器的 IndexedDB 对局存读档同样尚未接入。[当前运行规范](game-runtime.md) · [API 接入说明](../apps/api/README.md)

托管方案先使用 **Workers Static Assets**。单人模拟在浏览器本地运行，计划补充 IndexedDB 保存后仍无需逐日访问服务器。公开挑战有了可比较的成绩后，再接入 Worker 和 D1。本文的服务额度与成本数字沿用 2026 年 11 月 12 日的规划记录，上线前需要重新核对，不能视为已部署能力或当前报价。[静态资源计费](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/) · [平台域名](https://developers.cloudflare.com/workers/configuration/workers-dev/)
## Cloudflare 服务怎么选

| 启用时机 | 产品 | 在游戏里负责什么 | 成本依据 |
| --- | --- | --- | --- |
| 单人试玩 | Workers Static Assets | 同源托管 HTML、脚本、地图、规则包和新闻文案。按内容生成哈希文件名，浏览器可长期缓存 | 直接命中静态资源的请求免费且不限量。Free 每个版本最多 20,000 个文件，单文件上限 25 MiB。[静态资源计费](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/) · [平台限制](https://developers.cloudflare.com/workers/platform/limits/) |
| 公开挑战、可信战绩 | Workers Free + D1 | Worker 签发开局凭证并重放操作，D1 用唯一键保存已验证的胜局，按索引读榜 | Worker 每天 10 万次动态请求，每次限 10 ms CPU。D1 每天 500 万读行、10 万写行，单库 500 MB，账户合计 5 GB。[Workers 定价](https://developers.cloudflare.com/workers/platform/pricing/) · [D1 定价](https://developers.cloudflare.com/d1/platform/pricing/) · [D1 限制](https://developers.cloudflare.com/d1/platform/limits/) |
| 实时联机 | SQLite-backed Durable Objects | 每个房间一个对象，统一排序玩家操作并广播。回合之间用 WebSocket Hibernation 保持连接 | 独立核算对象请求、活动时长及存储。届时用房间数和活跃时间估算。[Durable Objects 定价](https://developers.cloudflare.com/durable-objects/platform/pricing/) · [WebSocket 休眠](https://developers.cloudflare.com/durable-objects/best-practices/websockets/) |
| 大文件或可下载回放 | R2 Standard | 单个结局视频超过 25 MiB，或产品承诺长期保存完整回放时，按对象存文件，D1 只留索引 | 每月含 10 GB·月、100 万次 A 类操作、1,000 万次 B 类操作。公网出站流量免费。[R2 定价](https://developers.cloudflare.com/r2/pricing/) |

Pages 也能托管静态游戏。选 Workers Static Assets 是为了让以后增加的 `/api/*` 与试玩沿用同一域名和部署配置。启用 API 时，只给 `/api/*` 配置 `assets.run_worker_first`，让地图和规则文件继续直接命中静态资源。试玩可用平台子域，商业发布时再核算自有域名年费。[静态资源路由](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/) · [域名路由](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/)

规则随版本发布，token 随单局结算，因此首版可以省去 KV。公开成绩需要原子去重，D1 的唯一键更合适。新闻、突变、竞争模型和 Project HUMAN 都由规则表与随机种子驱动，Workers AI 没有推理任务。玩家暂停时世界也暂停，Cron 没有需要推进的时钟。Queues 留给将来确有积压、能异步完成的工作。[KV 一致性](https://developers.cloudflare.com/kv/concepts/how-kv-works/) · [Queues 计费](https://developers.cloudflare.com/queues/platform/pricing/)

## 玩法怎样落到代码和数据

现有可运行部分包括 GPT、Claude、Grok 的开局目录、日制收入、七个研究槽和 50 项科技、种子事件、正式选择及 HUMAN 完成判定。地区经营、多阵营电脑行动、持续暴露研发和完整 AI 胜负仍待接入。下面分别说明当前基础和后续规划。

| 玩法 | 当前基础与后续执行边界 |
| --- | --- |
| 6 个市场与传播渠道 | 已有规则目录和地图展示，完整人口经营尚未接入。后续每日从同一份日初快照计算各区和各阵营增量，不能让先结算的一方改写后算一方的输入。 |
| 普及与依赖 | 已有指标与条件效果接口，真实人口汇总尚待经营规则提供。规划按实际服务人数去重，再汇总全球和市场占比。 |
| token 与研究 | 开局 18 token，每两天结算经营收入，单次最高 4 token。研究按天计算工期，新完成的增产科技次日起供数；购买核验余额、前置、互斥和槽位。 |
| 新闻、决策与竞争 | 按种子和当前规则抽取，随机间隔 8–12 天；正式选择记录实例 ID、实际选择日与后续日。未来持续经营效果也必须明确生效日和失效日。 |
| 暴露度与 Project HUMAN | 危险研究和正式决策已能直接改变反制进度，达到 100% 时结束。由暴露启动并逐日研发、地区封锁等完整经营机制仍待接入。 |
| 日推进与结局 | 常速每 4 秒一天，1、2、5 倍速，手动暂停独立保存。新局不按日期超时，只有已成立的局势终局或玩家确认退出才结束。未来 AI 胜负条件由玩法规则确定。 |

规则引擎为纯 TypeScript，浏览器用 React 呈现。每个应用根拥有独立 store 和日时钟；`advance-day` 带 `runId` 与预期的 `completedDay`，用于拒绝旧局、重复和过期输入。暂停原因从场景、手动暂停及页面环境推导，关闭菜单不能解除手动暂停，回到前台也不能绕过决策暂停。浏览器后台不补天数。[场景和时钟](game-architecture.md) · [事件与状态](game-runtime.md)

未来挑战 Worker 复用相同的日结算和指令校验，不引入 React 或图形库。比例仍使用整数基点，规则 ID、遍历顺序及伪随机算法由当前规则固定；同一初始条件与按序指令必须重演出相同结果。帧率、倍速和实际暂停时长不影响业务结果。[前端技术决策](./frontend-3d.md)

### 对局保存与恢复的接入规划

当前已有 `ReplayV2` 导出及从运行快照重演的时间线检查，尚无回放文件导入、IndexedDB 保存或读档入口。下列是接入时应遵守的契约：

1. 开局保存 `runId`、`rulesVersion`、无符号 32 位种子、阵营、起始地区和难度。`completedDay = 0` 表示第一天尚未结算。同一种子新开局仍生成不同的 `runId`，运行身份不进入业务随机序列。
2. 指令携带 `{ day, seq }`；`day = N` 表示在第 N 天结算完成后、下一次日结算前接受，`seq` 在局内严格递增。每日先应用该窗口内接受的指令，再按当前引擎的固定顺序推进一次日结算。
3. 计划在有效决策和日结算后，用同一次 IndexedDB 事务保存业务快照与匹配的时钟检查点。业务回放不保存帧、暂停时长或速度切换；独立检查点可保存所选倍速、手动暂停和本日进度，并绑定 `runId`、日期与快照版本。重新载入时不补关闭期间的天数，先以暂停状态恢复。
4. 普通回放直接使用 `ReplayV2`（`saveVersion: 2`）；调试回放使用 `format: "debug-replay"`、`version: 2`。只接受明确支持的当前格式和规则，未知组合拒绝导入，不回退至其他引擎，也不保留周制兼容或迁移层。
5. 单设备存档可能随浏览器数据清理而丢失。跨设备续玩、账号身份和云端冲突处理另行设计，不能从本地回放导出能力推定已经支持。

## 公开挑战何时需要后端

以下接口、成绩去重和排名均为规划，当前没有请求处理器或公开榜单。挑战应固定初始条件和规则版本，允许玩家反复尝试，每张开局凭证最多产生一条已验证成绩。具体计分和排名规则尚未落地；若某类挑战比较最少获胜天数，可使用预留的 `win_day`，这不为普通局增加结束日期。

| 拟议同源接口 | 计划处理与存储 |
| --- | --- |
| `POST /api/v1/challenges/{id}/runs` | Worker 根据挑战配置生成随机 `runId`，签名规则版本、初始条件、挑战 ID 和凭证期限。返回凭证，开局不要求写库。 |
| `PUT /api/v1/runs/{runId}/result` | 核验签名、凭证和路径 ID，检查当前日制回放后重演。由服务端计算支出、选择和局势结果，不能直接相信客户端提交的余额或结局。有效成绩写入 D1 并保存回放摘要。 |
| `GET /api/v1/challenges/{id}/leaderboard` | 按挑战和规则版本过滤，排序由该挑战的正式计分契约决定。若采用最少获胜日数，则按 `win_day, run_id` 稳定排序。仅主动查看时请求，游戏日推进不触发榜单刷新。 |

初始 DDL 预留 `verified_runs.run_id` 唯一键。计划用 `INSERT … ON CONFLICT(run_id) DO NOTHING` 去重：首次成功返回 201，重复提交在摘要一致时返回已有结果与 200，不一致时返回 409。D1 保存结论和摘要，普通局及完整回放优先保留在本地。这些行为需要 Worker 实现后再验证。[初始成绩表](../apps/api/migrations/0001_verified_runs.sql)

游戏没有最大日数，服务端不能再用固定长度的一局作为最坏计算预算。接入时应以长局、密集操作和大量叙事记录测试 CPU、内存和输入大小，必要时采用有检查点的分段验证。验证预算只限制单次请求的工作量，不能伪造超时结局、截断合法日结算或改变玩法终局。本文记录的 Workers Free 10 ms CPU 额度需在上线前核对。[Workers 限制](https://developers.cloudflare.com/workers/platform/limits/) · [Worker CPU 指标](https://developers.cloudflare.com/workers/observability/metrics-and-analytics/)

网络中断、配额耗尽或服务暂时不可用时，计划在本地保留操作日志并显示“待提交”，在凭证有效期内以同一 `runId` 重试。凭证过期、回放非法或摘要冲突时返回具体原因；成绩提交失败不改变本地对局结果。

## 成本预算与升级点

以 30 天为一月，金额为美元。纯静态试玩保留默认静态资源路由，以下预算不含域名购买、税费或同一账户其他项目的用量。若每个游戏日都请求服务器，动态请求会随对局天数线性增长；当前没有固定局长，不能再按每局固定请求次数估算。因此日推进继续在浏览器本地完成。[静态资源计费](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/) · [Workers 定价](https://developers.cloudflare.com/workers/platform/pricing/)

假设每天有 `N` 局挑战，每局开局、交卷、查榜各用一次请求，则每日动态请求为 `3N`。D1 暂按每局 **读 32 行、写 6 行**预留，即每日读 `32N` 行、写 `6N` 行。估值涵盖读取前 20 名、索引维护、去重和过期数据清理。D1 按扫描与修改的行计费，索引更新也会增加写行，发布后用 `meta.rows_read` 和 `meta.rows_written` 替换估值。[D1 计费口径](https://developers.cloudflare.com/d1/platform/pricing/) · [D1 查询指标](https://developers.cloudflare.com/d1/worker-api/return-object/)

| 场景 | 动态请求/日 | D1 读行/日 | D1 写行/日 | 预计 Cloudflare 月费 |
| --- | ---: | ---: | ---: | --- |
| 单人试玩，每天 1,000 局 | 0 | 0 | 0 | $0 |
| 公开挑战，每天 1,000 局 | 3,000 | 32,000 | 6,000 | Free 内 $0，前提是回放满足单次 CPU 限制且单库低于 500 MB |
| 公开挑战，每天 20,000 局 | 60,000 | 640,000 | 120,000 | 写行先超过 Free。按下列用量切换 Paid，约 $5 |

以上假设下，单看免费写入额度，每天可支持 `⌊100,000 ÷ 6⌋ = 16,666` 局。实际值取决于提交胜局的比例、索引更新次数、过期记录清理量和同一账户的其他写入。建议在写行达到日额度 80% 时检查高耗 SQL 和历史记录大小。Free 用尽任一读写日额度后，D1 查询会返回错误，升级需主动选择。[D1 免费额度与超限行为](https://developers.cloudflare.com/d1/platform/pricing/)

20,000 局/日对应每月 180 万动态请求、1,920 万读行、360 万写行。若所有请求平均 5 ms CPU（估算），合计 900 万 CPU-ms。Workers Paid 每账户每月 $5 起，含 1,000 万次请求和 3,000 万 CPU-ms。D1 含 250 亿读行、5,000 万写行和 5 GB 存储。示例假设存储在包含量内。超量单价分别为每百万请求 $0.30、每百万 CPU-ms $0.02、D1 每百万读行 $0.001、每百万写行 $1、超额存储 $0.75/GB·月。实际决定升级的也可能是单次回放 CPU 或单库大小。[Workers 价格](https://developers.cloudflare.com/workers/platform/pricing/) · [D1 价格](https://developers.cloudflare.com/d1/platform/pricing/) · [单库限制](https://developers.cloudflare.com/d1/platform/limits/)

## 仓库文件树

当前工程从根目录构建。首页的全屏 3D 地形、SVG 国界、风湿场和洋流采样文件随静态资源发布。环境动画与场景切换在浏览器运行，API 目录中的初始 DDL 和类型配置供未来公开挑战阶段使用。[地图数据与渲染](map-rendering.md) · [剧本目录与场景状态机](game-architecture.md)

```text
Singularity-Inc/
├── package.json / package-lock.json    # React、tsrs、构建命令与锁定版本
├── tsconfig.json / tsconfig.tools.json # 无 DOM 的共享规则；构建工具单独检查
├── wrangler.jsonc                      # 先经 tsrs 和 Vite，再发布 apps/web/dist/
├── docs/                               # 托管、前端、地图、剧本与场景
├── apps/
│   ├── web/
│   │   ├── index.html / vite.config.ts / tsconfig.json
│   │   ├── src/
│   │   │   ├── main.tsx / App.tsx / style.css
│   │   │   ├── scenes/                 # 状态机、开局、地图 HUD 与结算
│   │   │   ├── cartography/            # 地形、海气场、镜头与地图数据
│   │   │   └── world/                  # 旧版 R3F 地球组件
│   │   └── public/                     # _headers、图标与地图数据许可
│   └── api/
│       ├── README.md / tsconfig.json   # Worker 接入时机与运行时类型
│       └── migrations/
│           └── 0001_verified_runs.sql  # 成绩唯一键和查榜索引
└── packages/
    ├── game/
    │   └── types.ts                    # 地区状态、玩家指令和版本化回放
    └── rules/
        ├── v0.1/                       # standard.json、开局目录与分模块剧本
        └── tests/                      # 内容一致性
```

Vite 从 `apps/web/index.html` 构建到 `apps/web/dist/`。它将哈希脚本和样式写入 `dist/assets/`，并复制 `public/_headers`；长期缓存规则只匹配 `/assets/*`。玩法开发还需补上下列部分。[静态响应头](https://developers.cloudflare.com/workers/static-assets/headers/)

| 阶段 | 代码位置 | 职责 |
| --- | --- | --- |
| 单人模拟 | `packages/game/run.ts` 和 `types.ts` | 已接入开局、日数、基础收益、研究、种子事件和决策日志。后续接入地区模拟、完整胜负与回放导入恢复。 |
| 内容制作 | `packages/rules/v0.1/` 的 world、evolution、factions、events 等目录 | 已有市场、渠道、三棵技能树、阵营能力和示例事件。后续补全权重、系数、技能前置和正式新闻池。 |
| 浏览器接入 | `apps/web/src/scenes/store.ts` 和 `clock.ts` | 时钟按有效速度发送带 runId 和已完成日数的日事件，页面隐藏或冻结时暂停；支持独立手动暂停、剩余日进度与有限追赶。IndexedDB 存档适配器待接入。 |
| 平衡验证 | `packages/game/tests/` | 固定种子回放样本和三种策略的批量平衡测试，在开发机执行 |
| 公开挑战（未实现） | 规划 `apps/api/src/{index,tickets,results,leaderboard}.ts` | 未来加入 `fetch` 入口、签名凭证、同引擎验分和参数化 SQL，并配置 Worker 入口与 D1 绑定。 |

## 落地与验收

1. **静态试玩。** 根目录执行 `npm ci`，然后用 `npm run dev` 开发，或用 `npx wrangler@4.161.0 deploy --dry-run` 验证发布。Wrangler 的自定义构建会调用 `npm run build`；任一 tsrs 检查失败便停止。实际发布命令为 `npx wrangler@4.161.0 deploy`。[Wrangler 部署命令](https://developers.cloudflare.com/workers/wrangler/commands/workers/)
2. **日制玩法。** 同一种子和 `day + seq` 指令分别运行 1、2、5 倍速与暂停恢复，比较同日状态和局势结果。覆盖多个暂停原因叠加、迟到追赶遇决策、同种子新局拒绝旧回调、无局势终局时跨过第 120 天继续运行、研究次日生效与重复事件选择拒绝。完整读档、人口经营和 AI 胜负用例在相应功能接入后补充；当前不能把刷新页面视为已支持的恢复路径。
3. **挑战上线。** 绑定独立的测试 D1 后先运行 `npx wrangler@4.161.0 d1 migrations apply DB --local`。验证篡改余额或非法技能顺序无法上榜、重复交卷只有一行、榜单查询命中索引、最坏回放满足 CPU 预算。用独立预发布数据库演练迁移，再将同一迁移应用到生产。数据库迁移与 Worker 版本分别管理。[D1 迁移](https://developers.cloudflare.com/d1/reference/migrations/) · [D1 恢复窗口](https://developers.cloudflare.com/d1/platform/limits/)

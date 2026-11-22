# Singularity Inc.

首页在全屏世界地图上提供「开始游戏」「游戏设置」和「探索地图」入口。开始游戏后先选择 AI 阵营与起始大洲，再进入独立的难度页确认开局；当前可用标准难度，其他档位显示为未开放。游戏设置集中管理语言、音量、显示图层和开发者选项。

地图由 React、React Three Fiber 和 Three.js 绘制。默认镜头覆盖欧洲和北非，并选中乌克兰。拖动平移，滚轮、双指和右侧滑杆连续缩放。拉近时视角随距离倾斜，高程网格呈现山脊和高原。键盘聚焦地图后可用方向键、加减键和 Home 操作。

缩到最远时，可操作区完整容纳从西经 180° 到东经 180°、从南极到北极的一幅地图。调整窗口会自动重新取景，四角 HUD 保持等比。游戏使用一个「中国」选区，包括大陆、台湾和南沙群岛；南沙的小菱形标记可直接点选。

在「世界」中切换云层和洋流，或返回全球总览。点选地图后打开底部地区档案，可读出当地海拔、风速及表层流速。环境使用十一月多年平均的风、湿度和漂流浮标数据，在浏览器中播放。右上独立暂停与 1／2／5 倍速控制游戏计时及环境动画。预览地图的日期和疾病数值为演示值，对局 HUD 读取真实日结快照。全仓使用 tsrs 检查 TypeScript。[地图实现与数据参数](docs/map-rendering.md)

从开始界面或「日期与菜单 → 游戏设置 → 语言 / Language」可以在简体中文和 English 之间切换。新闻档案和已处理的突变按当前语言显示，浏览器会记住选择。

在「游戏设置 → 开发者选项」勾选「启用开发者面板」，返回地图即可从右侧打开抽屉。可以切换昼夜、发放 token、逐日单步或停在下个事件，也可以从当前已完成日创建独立调试副本。单步与自动计时共用日结算入口。设置开关保存在本机。[开发者操作与回放](docs/game-runtime.md#开发者面板)

从右上角「日期与菜单 → 新建对局」进入 AI 剧本，选择阵营和起始市场。其余两个阵营由电脑经营，和玩家争夺各国用户与数据中心槽位。打开「世界」或「地区详情」可以对照各阵营的沉浸人口、合成人口和设施。常速每 4 秒推进一天，每两天发放 token 收益，每天结算研究语料与到期项目。新闻、竞争和突变按种子出现，正式决策会按选项结算，目录里的突变可免费预览。暂停、换速和后台恢复保留日内进度，对局没有固定到期日。持久化存档仍待接入。[日制场景入口](docs/game-architecture.md) · [玩法草案](docs/gameplay-design.md) · [当前实现与验收](docs/handoff.md)

全仓游戏事件和共享状态遵循根目录约定。界面通过类型化事件写入，HUD、地图和面板读取同一份只读快照。[全仓约定](AGENTS.md) · [事件与全局状态使用规范](docs/game-runtime.md)

游戏美术参考收录了 AI 公司、研究机构和产品的官方标志，可按公司或阵营名检索。[标志资产库与阵营对照](assets/ai-logos/README.md) · [离线预览](assets/ai-logos/index.html)

使用 Node 24 和 npm，在仓库根目录运行：

```sh
npm ci
npm run dev
```

| 命令 | 用途 |
| --- | --- |
| `npm test` | 验证事件分发、共享状态、时钟、决策结算、场景转移和剧本内容。 |
| `npm run sound:preview` | 将测试音效导出为 `output/audio/sound-check.wav`。[通过事件播放音效](docs/game-runtime.md#游戏音效) |
| `npm run typecheck` | 用锁定版本的 tsrs 分别检查共享规则、浏览器 TSX、Cloudflare Worker 类型环境和 Vite 配置。 |
| `npm run build` | 通过相同的检查后，生成可部署的 `apps/web/dist/`。 |
| `npm run preview` | 在本机查看最近一次生产构建。 |
| `npx wrangler@4.161.0 deploy --dry-run` | 运行完整构建并检查 Workers Static Assets 发布包。 |

地图、影像和海气数据都随构建发布到 Workers Static Assets。接入 Cloudflare Workers Builds 时使用仓库根目录，让 Wrangler 调用配置中的 `npm run build`。[3D 技术决策](docs/frontend-3d.md) · [后端规划](docs/backend.md) · [Workers Builds 配置](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)

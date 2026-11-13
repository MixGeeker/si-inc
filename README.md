# Singularity Inc.

首页是 React、React Three Fiber 和 Three.js 绘制的全屏世界地图。默认镜头覆盖欧洲和北非，并选中乌克兰。拖动平移，滚轮、双指和右侧滑杆连续缩放。拉近时视角随距离倾斜，高程网格呈现山脊和高原。键盘聚焦地图后可用方向键、加减键和 Home 操作。

缩到最远时，可操作区完整容纳从西经 180° 到东经 180°、从南极到北极的一幅地图。调整窗口会自动重新取景，四角 HUD 保持等比。游戏使用一个「中国」选区，包括大陆、台湾和南沙群岛；南沙的小菱形标记可直接点选。

在「世界」中切换云层和洋流，或返回全球总览。点选地图后打开底部地区档案，可读出当地海拔、风速及表层流速。环境使用十一月多年平均的风、湿度和漂流浮标数据，在浏览器中播放。右上暂停与倍速控制环境和装饰性交通动画。日期和疾病数值为界面演示值。全仓使用 tsrs 检查 TypeScript。[地图实现与数据参数](docs/map-rendering.md)

使用 Node 24 和 npm，在仓库根目录运行：

```sh
npm ci
npm run dev
```

| 命令 | 用途 |
| --- | --- |
| `npm run typecheck` | 用锁定版本的 tsrs 分别检查共享规则、浏览器 TSX、Cloudflare Worker 类型环境和 Vite 配置。 |
| `npm run build` | 通过相同的检查后，生成可部署的 `apps/web/dist/`。 |
| `npm run preview` | 在本机查看最近一次生产构建。 |
| `npx wrangler@4.161.0 deploy --dry-run` | 运行完整构建并检查 Workers Static Assets 发布包。 |

地图、影像和海气数据都随构建发布到 Workers Static Assets。接入 Cloudflare Workers Builds 时使用仓库根目录，让 Wrangler 调用配置中的 `npm run build`。[3D 技术决策](docs/frontend-3d.md) · [后端规划](docs/backend.md) · [Workers Builds 配置](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)

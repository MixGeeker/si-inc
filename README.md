# Singularity Inc.

React + React Three Fiber 驱动的 3D 策略游戏，使用 tsrs 统一检查所有 TypeScript。当前可运行的是全球态势台：点选 12 个地区，查看普及、依赖和封锁三种图层。数值与线路是演示快照；周模拟和公开挑战见[后端规划](docs/backend.md)。

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

3D 实现、画质参数、路线取舍和浏览器验证见[前端技术决策](docs/frontend-3d.md)。当前部署只需 Workers Static Assets。若接入 Cloudflare Workers Builds，以仓库根目录为工作目录，让 Wrangler 调用配置中的 `npm run build`，避免在同一次发布中重复构建。[Workers Builds 配置](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/) · [Wrangler 自定义构建](https://developers.cloudflare.com/workers/wrangler/custom-builds/)

# 公开挑战接口

这里预留同源 `/api/v1/` 的 Worker 入口。首版单人游戏直接使用根目录的静态托管配置。公开挑战进入开发时，在本目录加入请求处理器，复用 `packages/game` 的回放规则，并把 D1 绑定到该 Worker。接口、重试约定与本地迁移步骤见[后端规划](../../docs/backend.md)。

`src/` 下新增的 TypeScript 会自动纳入根目录的 `npm run typecheck`。这里的 tsrs 配置加载 Cloudflare Workers 的类型；共享规则另外在不含 DOM 的环境里检查。React 和 Three.js 只存在于浏览器端。

预留成绩表以 `win_day` 保存获胜时已完成的游戏日数。接口上线时按日制规则重演并验证结果，排行榜口径由挑战规则确定；表结构不规定对局结束日期。

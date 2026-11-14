# 全仓游戏事件与全局状态约定

- 浏览器、共享规则、测试和未来的 Worker 统一采用「发送有类型的事件 → 纯函数校验并更新 → 订阅者读取提交后的快照」。浏览器每个应用根由 `GameProvider` 创建一个 store，测试和独立对局各自创建实例。
- 局内可变数值、事件实例和操作日志归 `packages/game/run.ts` 的 `RunState`。剧本价格、周期、阈值和内容归 `packages/rules/<版本>/`。由现有字段可算出的显示值写成读取快照的函数。
- 跨场景的面板、速度、图层和选区走 `GameState`。React 用 `useGameSnapshot()` 读取，用 `useGameStore().dispatch(event)` 写入。展示组件可以接收快照和回调。相机插值、DOM、WebGL、表单草稿和资源缓存由实际使用者管理。
- 新操作先扩展 `GameEvent` 或 `SceneEvent`，再补对应 reducer。非法、过期或重复的操作返回原状态。余额、事件结果和操作日志在同一次转移中更新。输入和快照使用普通数据，避免写入 `window`、模块级可变单例或平行的组件副本。
- 跨模块副作用用 `store.on(type, handler)`。业务结果使用 `GameNotice`，由 store 在提交后发出。订阅方负责在卸载或任务结束时调用返回的取消函数。DOM 监听和时钟负责将外部输入转成有类型的事件。
- 修改公共事件或状态语义时，覆盖受影响的正常路径和拒绝路径，在根目录运行 `npm test` 和 `npm run build`。字段归属、命名、示例和回放边界见[事件与全局状态使用规范](docs/game-runtime.md)。

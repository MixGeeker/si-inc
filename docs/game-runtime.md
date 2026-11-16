# 事件与全局状态使用规范

一个浏览器应用根共享一个 `GameStore`。每次有效的 `start` 都创建新的 `RunState`。结算保留该局的最终快照，重开时重新初始化周数、余额、事件池和操作日志。独立测试、回放或服务端请求各自持有实例。[应用入口](../apps/web/src/main.tsx) · [store 与事件类型](../apps/web/src/scenes/store.ts) · [共享规则引擎](../packages/game/run.ts)

## 数据归属

| 要使用的数据 | 唯一来源 | 读写方式 |
| --- | --- | --- |
| 开局余额、事件间隔、速度、价格、阈值、剧本文案 | `packages/rules/v0.1/` | 按规则版本导入，结算和界面引用同一份配置。 |
| 阵营、起点、种子、已完成周数、当前余额、研究与普及指标、事件、操作日志 | `RunState` | 界面通过 `visibleRunState(snapshot.scene)` 读。纯函数 `createRun`、`advanceWeek`、`resolveDecision` 负责初始化和结算。 |
| 各国总人口、各阵营的普通沉浸人数和现役合成人数 | `RunState.countryPopulations` | 使用地图国家 ID。人口图层从计数求占比，旧快照缺少该字段时按空记录读取。 |
| 东亚人口示例的两项比例 | `GameState.populationPreview` | 预览地图用 `open-population-preview`、`set-preview-population`、`close-population-preview` 操作。开局清空示例。 |
| 场景、当前面板、选择的倍速 | `GameState.scene` | 用场景事件更新。显示和时钟都用 `playbackSpeed(scene)` 读取有效速度。 |
| 地图选区、昼夜、云层、洋流 | `GameState.selection` 和 `layers` | 地图拾取发 `pick-location`。点中可经营的大洲时保存市场 ID，点中站点或群岛标记时，地图点携带 `siteId` 或 `islandId`，显示名称按当前语言读取。其他经营范围以外的位置保存坐标。市场栏和地区目录用 `focus-place` 定位，全球用 `null`。镜头预设和图层分别走 `map-preset` 和 `set-layer`。 |
| 界面语言 | `GameState.locale` | `set-locale` 接受 `zh-CN` 或 `en`。首次打开匹配浏览器语言，默认简体中文。玩家选择的语言在本机保存，重开对局时沿用。 |
| 音效静音、音量 | `GameState.sound` | `set-sound-muted` 接受布尔值，`set-sound-volume` 接受 0–100 的整数。默认开启、音量 65%。静音保留音量；重开沿用设置，浏览器本地保存，下次打开时恢复。 |
| 滚轮与相机插值、DOM 焦点、画布资源、表单草稿 | 对应组件、渲染器或浏览器适配器 | 在本地处理，玩家确认的操作转成游戏事件。 |

周数表示已完成的整周，开局为 0。余额使用整数 token，比例使用整数基点（10,000 为 100%）。未计算的普及率和依赖率用 `null`，HUD 显示「—」。菜单、决策窗与后台标签页暂停计时，恢复时沿用当前周的剩余时间。

每个大洲共用一个市场 ID。开局、点选市场、地区目录和地图高亮都使用该 ID，同洲内重复点选普通地块沿用当前快照。俄罗斯整块使用亚洲的 `as`。旧开局指令按原起始镜头的所在大洲转换，`ee` 和 `mena` 归亚洲，`latam` 归南美，旧南亚 `sa` 归亚洲。南美的新 ID 是 `sam`。选区由每个应用根的 store 持有，回放记录经营指令。[大洲与地理选区](../packages/rules/v0.1/world/regions.ts)

剧本事件的 `content` 只含 `id` 和 `kind`。新闻档案按对局规则版本，用事件 ID 和已结算的 `choiceId` 读取当前语言的标题、正文和选项结果。界面词条归 Web，剧本译文跟随规则版本。价格、周数和基点从同一份对局或规则数据格式化。[界面语言包](../apps/web/src/i18n/languages.ts) · [剧本文案](../packages/rules/v0.1/locales/zh-CN.ts)

## 发送、读取与订阅

| 接口 | 行为 |
| --- | --- |
| `store.dispatch(event)` | 写入的唯一入口。输入由 `GameEvent` 约束，类型名使用已有的小写短横线形式。reducer 返回原对象表示忽略，返回新快照表示提交，返回 `acceptWithoutChange` 表示接受一次性事件并用当前快照通知 `store.on` 的订阅者。 |
| `store.getSnapshot()` / `useGameSnapshot()` | 读取当前只读快照。快照及其嵌套数据冻结，有效转移产生新引用。组件也可以用 `useGameSnapshot(s => s.layers.night)` 只订阅一个值。选择函数返回标量或快照内已有的引用。 |
| `store.subscribe(listener)` | 每次有效提交通知一次。监听器读取新快照，返回的函数取消订阅。 |
| `store.on(type, listener)` | 按类型订阅已接受的输入或业务结果，参数为该类型的载荷与本次提交的快照。回调内发送的事件按先后排队，等本次通知完成再处理。 |

结果通知有 `run-started`（种子与开局配置）、`event-occurred`（本局事件实例）、`decision-resolved`（本次结算的操作）、`run-ended`（结局）。需要响应所有结束原因时订阅 `run-ended`，包括主动退出、超时和规则结局。发送端只能提交输入，结果由 store 从有效转移生成。如果一个同步监听器抛错，其他监听器和已排队事件继续执行，最外层 `dispatch` 在队列结束后抛出 `AggregateError`。[分发实现](../packages/game/event-store.ts)

组件例如这样显示余额并打开新闻。其他展示组件也可以由父组件传入同一份数据和回调。

```tsx
const store = useGameStore()
const { scene } = useGameSnapshot()
const { ui } = useLanguage()
const run = visibleRunState(scene)
if (!run) return null
return <button onClick={() => store.dispatch({ type: "open-panel", panel: "news" })}>
  {ui.archive} · {ui.tokens(run.balance)}
</button>
```

在 React 中用 effect 管理订阅的生命周期。下面的 `showHeadline` 是调用方提供的显示回调。对局数值由 reducer 结算，订阅者负责展示等副作用。

```tsx
useEffect(() => store.on("event-occurred", ({ entry }, { locale }) => {
  showHeadline(languages[locale].scenario.events[entry.content.id].title)
}), [store, showHeadline])
```

## 游戏音效

目前只有 `test` 一个音效。在「日期与菜单 → 音效」点击「测试音效」，或在持有当前 store 的模块中发送同一条事件。

```ts
store.dispatch({ type: "play-sound", cue: "test" })
```

新剧本事件提交后，`event-occurred` 的订阅者发送 `play-sound`。store 校验音效名称、静音和音量，播放器通过 `store.on("play-sound", …)` 接收有效请求。播放请求复用已提交的快照，可以连续发送。[事件接线](../apps/web/src/audio/game-sound.ts)

在根目录运行 `npm run sound:preview` 可将同一测试音导出为 `output/audio/sound-check.wav`。

## 剧本事件和回放

### 开发者面板

「日期与菜单 → 设置」通过 `set-developer-enabled` 启用或关闭面板，默认关闭，启用偏好保存在本机。`GameState.developer.open` 由 `set-developer-open` 切换。展开时保留当前周的剩余计时，收起后恢复玩家原来的速度。手动完成一周后，下一周从完整时长开始。

「当前对局」操作应用根的 store。「调试副本」从已提交的快照创建独立 store，使用手动时钟。可以切回当前局、重新复制或收起面板结束试跑。昼夜按钮对当前显示的地图发送 `set-layer`。

`dev-step-week` 核对种子和已完成周数，复用战役的周结算、事件和到期通知。「到下个事件」逐周发送该输入。`dev-grant-token` 还核对下一条指令的 `seq`、正整数金额和余额的安全整数范围。发放与 `devGrantTokens` 指令在同一次转移中提交，随后发出 `dev-token-granted`。开启面板的有效对局可以在待决策时发放 token。

时间线从规则、开局、种子和按序指令重演每次余额变化。普通对局导出 `ReplayV1`，含开发者发放的对局导出 `format: "debug-replay"` 和含发放记录的完整指令序列。[回放与时间线](../packages/game/inspection.ts)

### 周制剧本

标准剧本按版本化配置每 8–12 周抽一次。在一轮内按种子抽完新闻、竞争事件和突变，再补满池。每次产生独立的 `instanceId`，同一剧本条目在不同周仍可分别处理。正式突变会打开决策窗，退出后可从新闻记录继续处理。

正式选择提交 `{ type: "choose", id, instanceId, choiceId }`。引擎核对待处理实例和余额，一次性提交选择、扣费和 `GameCommand`，并通知 `decision-resolved`。新闻目录的手动预览省略 `instanceId`，只更新上次预览选择。回放记录采用 `week`、递增的 `seq`、`eventInstanceId` 和 `choiceId`。[事件池](../packages/rules/v0.1/events/pool.ts) · [回放类型](../packages/game/types.ts)

新增共享变量时，在所属状态定义类型、单位、初值和更新它的事件。新增事件先定义载荷，再实现转移，测试非法输入、重发和新局隔离。浏览器时钟只发带种子和预期周数的 `advance-week`。共享规则从输入和旧快照计算结果，随机序列由局内种子驱动，供浏览器、Node 和未来的 Worker 复用。[场景转移](../apps/web/src/scenes/machine.ts) · [浏览器时钟](../apps/web/src/scenes/clock.ts)

# 事件与全局状态使用规范

一个浏览器应用根共享一个 `GameStore`。每次有效的 `start` 都创建新的 `RunState`。结算保留该局的最终快照，重开时重新初始化日数、余额、事件池和操作日志。独立测试、回放或服务端请求各自持有实例。[应用入口](../apps/web/src/main.tsx) · [store 与事件类型](../apps/web/src/scenes/store.ts) · [共享规则引擎](../packages/game/run.ts)

## 前台入口与设置

`createGameStore()` 默认处于地图预览，`GameProvider` 创建浏览器应用根时发送 `open-start` 进入开始页。界面依次通过 `open-setup` 选择阵营和起始大洲、`open-difficulty` 确认选择并进入难度页，最后发送 `start` 创建对局。难度页返回选择页时保留 `setup.selection`，再次进入难度页沿用该选择；从难度页开局必须与已确认的阵营、起点和标准难度一致。有效开局仅发出一次 `run-started`，重复或不匹配的输入不创建新局。测试和工具仍可在 `setup` 场景直接发送完整的开局输入。[前台场景](../apps/web/src/scenes/machine.ts) · [应用根初始化](../apps/web/src/scenes/GameContext.tsx)

开始页、预览菜单和局内菜单通过 `open-settings` 打开同一设置场景。设置保存原场景作为 `back`，返回时恢复该场景；从局内菜单进入设置，第一次返回仍是原菜单，第二次返回才回到地图。开始页、选择页、难度页和设置均暂停时间。设置期间可通过现有事件修改语言、音效和显示图层，局内日数、研究、事件与操作日志不变；菜单和设置保留当前日的剩余计时、所选倍速和手动暂停。

设置即时提交到当前应用根的 store。浏览器适配器把语言、音效静音、音量和开发者功能启用偏好写入本机 `localStorage`，下次打开时读取。存储不可用时，本次页面仍使用已提交的选择。云层、洋流和人口图层在当前 store 内跨场景、跨新局沿用，刷新后恢复默认值。昼夜跟随开局和合成人计划切换。前台场景、选局草稿、倍速、手动暂停和日内计时没有持久化。[语言偏好](../apps/web/src/i18n/preferences.ts) · [音效偏好](../apps/web/src/audio/settings.ts) · [开发者偏好](../apps/web/src/scenes/developer.ts)

## 数据归属

| 要使用的数据 | 唯一来源 | 读写方式 |
| --- | --- | --- |
| 开局余额、事件间隔、速度、价格、阈值、剧本文案 | `packages/rules/v0.1/` | 按规则版本导入，结算和界面引用同一份配置。 |
| 对局 ID、规则版本、阵营、起点、种子、已完成日数、当前余额、研究与普及指标、事件、操作日志 | `RunState` | 界面通过 `visibleRunState(snapshot.scene)` 读。纯函数 `createRun`、`advanceDay`、`resolveDecision` 负责初始化和结算。 |
| 各国总人口、各阵营的普通沉浸人数和现役合成人数 | `RunState.countryPopulations` | 使用地图国家 ID。人口图层从计数求占比。 |
| 电脑阵营的起点、余额、研究、市场、人口和设施 | `RunState.opponents` | `createRun` 初始化其余两个阵营。`advanceDay` 从同一日初快照结算各阵营的新增、转投和建设，界面用 `factionStandings` 读竞争结果。 |
| 玩家语料、已解锁的研究槽位、研究项目 | `RunState.research` | 项目保存科技 ID、槽号和开题日。等级、空槽、前置、每日语料和完工日都从快照读取。 |
| 东亚人口示例的两项比例 | `GameState.populationPreview` | 预览地图用 `open-population-preview`、`set-preview-population`、`close-population-preview` 操作。开局清空示例。 |
| 场景、当前面板、选择的倍速和手动暂停 | `GameState.scene` | 用场景事件更新。`speed` 只保存正倍速，`manualPaused` 保存玩家的暂停选择；显示和时钟都用 `gamePlaybackSpeed(snapshot)` 读取有效速度。 |
| 已确认的开局阵营和起始大洲 | `setup.selection`，难度页通过 `difficulty.back` 保留 | `open-difficulty` 校验并保存选择，返回选择页时读取。尚未确认的表单草稿由组件持有。 |
| 页面可见性与冻结状态 | `GameState.environment` | 浏览器适配器发送 `set-page-visible` 和 `set-page-suspended`。环境与场景一起参与暂停判定，不写入局内经营状态。 |
| 地图选区、昼夜、云层、洋流 | `GameState.selection` 和 `layers` | 地图拾取发 `pick-location`。点中可经营的大洲时保存市场 ID，点中站点或群岛标记时，地图点携带 `siteId` 或 `islandId`，显示名称按当前语言读取。其他经营范围以外的位置保存坐标。市场栏和地区目录用 `focus-place` 定位，全球用 `null`。镜头预设和图层分别走 `map-preset` 和 `set-layer`。 |
| 界面语言 | `GameState.locale` | `set-locale` 接受 `zh-CN` 或 `en`。首次打开匹配浏览器语言，默认简体中文。玩家选择的语言在本机保存，重开对局时沿用。 |
| 音效静音、音量 | `GameState.sound` | `set-sound-muted` 接受布尔值，`set-sound-volume` 接受 0–100 的整数。默认开启、音量 65%。静音保留音量；重开沿用设置，浏览器本地保存，下次打开时恢复。 |
| 滚轮与相机插值、DOM 焦点、画布资源、表单草稿 | 对应组件、渲染器或浏览器适配器 | 在本地处理，玩家确认的操作转成游戏事件。 |

`RunState.completedDay` 表示已完成的整日，开局为 0；当前指令影响接下来的一次日结算，日志中的 `day = N` 表示已完成第 N 天时接受的指令。第 0 天只发开局资源，第一笔周期经营收入在第 2 天末到账。余额使用整数 token，比例使用整数基点（10,000 为 100%）。未计算的普及率和依赖率用 `null`，HUD 显示「—」。自然收入在安全整数上界饱和，仍允许日期推进；会溢出的主动操作返回原状态。

## 日界线、倍速与暂停

标准规则默认常速每 4 秒推进一天，允许 1、2、5 倍速，分别为每 4 秒、2 秒和 0.8 秒一天。新局没有第 120 天或其他固定日期的超时结局；实际对局时长由玩家行动与局势决定。当前已有的收入、研究和叙事结算按天运行，多阵营经营与完整局势胜负仍待接入。

`set-speed` 只设置正倍速，`set-paused` 单独设置手动暂停。在地图面板或决策窗暂停期间可以调整所选速度，调整速度不会解除暂停。场景和页面环境决定自动暂停原因；开始页、选择页、难度页、设置、菜单、研究、决策、退出确认、开发者面板和后台均暂停，世界、地区及新闻面板继续运行。`pauseReasons(snapshot)` 从已有事实推导原因，`gamePlaybackSpeed(snapshot)` 在全部原因解除后才恢复所选倍速。关闭设置不会解除原菜单暂停，关闭菜单不会解除手动暂停，回到前台也不会解除尚未处理的决策暂停。

`GameProvider` 为每个应用根持有一个 `createDayClock` 适配器。计时基于 `performance.now()`，日内进度以 1 倍等效毫秒保存在适配器中；取消订阅或重挂同一个适配器时保留进度。页面可见性与冻结、恢复通过有类型的环境事件写入 store，隐藏期间不增加进度，也不补算关闭或后台经过的天数。页面重新载入后的对局存读档尚未接入，不能把同一适配器的重挂恢复视为持久化恢复。

前台迟到逐日补算，每次最多追赶三天。每提交一天立即读取快照，遇决策、其他暂停或终局立刻停止，并舍弃越过该断点的时间余量。普通迟到剩余的不足一天进度保留，超出追赶上限的时间不积压。单步完成一天后从下一天的完整时长开始。

浏览器开局为每局生成独立 `runId`，异步推进同时核对该 ID 和预期的 `completedDay`，同一种子重开也不能接受上一局的输入。相机、界面过渡和音频使用表现时间；地图环境可以跟随有效倍速，表现帧不参与业务结算。

每个大洲共用一个市场 ID。开局、点选市场、地区目录和地图高亮都使用该 ID，同洲内重复点选普通地块沿用当前快照。俄罗斯整块使用亚洲的 `as`，南美使用 `sam`。开局只接受当前六个大洲 ID。选区由每个应用根的 store 持有，回放记录经营指令。[大洲与地理选区](../packages/rules/v0.1/world/regions.ts)

剧本事件的 `content` 只含 `id` 和 `kind`。新闻档案按对局规则版本，用事件 ID 和已结算的 `choiceId` 读取当前语言的标题、正文和选项结果。界面词条归 Web，剧本译文跟随规则版本。价格、日数和基点从同一份对局或规则数据格式化。[界面语言包](../apps/web/src/i18n/languages.ts) · [剧本文案](../packages/rules/v0.1/locales/zh-CN.ts)

## 发送、读取与订阅

| 接口 | 行为 |
| --- | --- |
| `store.dispatch(event)` | 写入的唯一入口。输入由 `GameEvent` 约束，类型名使用已有的小写短横线形式。reducer 返回原对象表示忽略，返回新快照表示提交，返回 `acceptWithoutChange` 表示接受一次性事件并用当前快照通知 `store.on` 的订阅者。 |
| `store.getSnapshot()` / `useGameSnapshot()` | 读取当前只读快照。快照及其嵌套数据冻结，有效转移产生新引用。组件也可以用 `useGameSnapshot(s => s.layers.night)` 只订阅一个值。选择函数返回标量或快照内已有的引用。 |
| `store.subscribe(listener)` | 每次有效提交通知一次。监听器读取新快照，返回的函数取消订阅。 |
| `store.on(type, listener)` | 按类型订阅已接受的输入或业务结果，参数为该类型的载荷与本次提交的快照。回调内发送的事件按先后排队，等本次通知完成再处理。 |

结果通知有 `run-started`（种子与开局配置）、`event-occurred`（本局事件实例）、`decision-resolved`（本次结算的操作）、`run-ended`（结局）。需要响应所有结束原因时订阅 `run-ended`，包括主动退出和规则结局。发送端只能提交输入，结果由 store 从有效转移生成。如果一个同步监听器抛错，其他监听器和已排队事件继续执行，最外层 `dispatch` 在队列结束后抛出 `AggregateError`。[分发实现](../packages/game/event-store.ts)

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

### 多阵营日结算

标准对局的电脑阵营按各自策略扩张、建设、研究和改造。普通用户可以转投，合成人保留阵营归属。各国的人口和建设槽由所有阵营共用。电脑同日争用最后一个槽时，按对局种子和日期决定顺序，未建成的一方保留建设卡。电脑行为由日结算重演，无需单独记录成玩家指令。[竞争规则](../packages/rules/v0.1/opposition/computer-factions.ts) · [竞争结算](../packages/game/competition.ts)

有效开局在同一次状态提交中设为白昼。任意阵营首次启用合成人计划时，`RunState.syntheticActivatedDay` 和夜间图层随对应操作或日结算一同提交，图层由白昼转为永夜时发出 `eternal-night-started`。玩家仍可手动切换显示。全球改造完成时，玩家持有超过半数合成人即获胜，否则由对手获胜。Project HUMAN 完成时优先判定人类胜利。[对局结算](../packages/game/run.ts) · [图层与通知](../apps/web/src/scenes/store.ts)

### 开发者面板

「日期与菜单 → 设置」通过 `set-developer-enabled` 启用或关闭面板，默认关闭，启用偏好保存在本机。`GameState.developer.open` 由 `set-developer-open` 切换。展开时保留当前日的剩余计时，收起后恢复玩家原来的速度。手动完成一天后，下一天从完整时长开始。

「当前对局」操作应用根的 store。「调试副本」从已提交的快照创建独立 store，使用手动时钟。可以切回当前局、重新复制或收起面板结束试跑。昼夜按钮对当前显示的地图发送 `set-layer`。

`dev-step-day` 核对对局 ID 和已完成日数，复用战役的日结算、事件和到期通知。「下次事件」与「到下个事件」共用 `nextEventDay(run)`，读取随机排期、研究里程碑和未投递后续新闻中的最早未来日期，查询不消耗随机序列。「到下个事件」逐日发送该输入，在实际产生事件或终局时停止。`dev-grant-token` 还核对下一条指令的 `seq`、正整数金额和余额的安全整数范围。发放与 `devGrantTokens` 指令在同一次转移中提交，随后发出 `dev-token-granted`。开启面板的有效对局可以在待决策时发放 token。

时间线从规则、开局、种子和按序指令重演每次余额变化。普通对局导出 `ReplayV2`（`saveVersion: 2`），含开发者发放的对局导出 `format: "debug-replay"`、`version: 2` 和含发放记录的完整指令序列。多阵营日结算对应规则 `v0.1.1`，时间线会拒绝规则版本不一致的快照。日制使用当前规则，不保留旧周制解码、兼容或迁移分支。[回放与时间线](../packages/game/inspection.ts)

### 日制剧本

战役地图右下角的「研究」打开全屏科技树并暂停时钟。分页和节点选择发送 `select-research`，返回地图后恢复原速度。七个槽位从 1 号起按序购买，每个占用中的槽位承载一个项目。解锁和开题分别发送 `unlock-research-slot`、`start-research`，带当前对局 ID、已完成日数和下一条指令序号。有效操作扣除语料，记录 `unlockResearchSlot` 或 `buySkill`。每日结算先发当日语料，再按到期项目结题，释放槽位。商店价格和语料基础配额在[标准剧本](../packages/rules/v0.1/standard.json)，研究周期和前置关系在[科技树](../packages/rules/v0.1/evolution/trees.ts)。

循环科技每完成一级都可再次开题，按已完成等级递增标价，次日起享受新增的每日语料。危险科技每次结题按规则增加 `RunState.researchBps`（Project HUMAN 反制进度）。反制达到 100% 时以人类胜利结算。新局没有固定到期日，未满足终局条件时继续运行。订阅者可以接收 `research-slot-unlocked`、`research-started` 和逐项目的 `research-completed` 通知。

50 项科技分布在传播、行为和能力三页，分别有 17、17 和 16 个独立节点。每个前置组完成任意一项即可，所有组都需满足。互斥路线在开题时锁定，只有一方能解锁的后续项目也会标成互斥。四项模型指数由已结题项目及其等级计算，基准各为 100。

自动评测集降低后续循环项目价格。版本重构从次日起，在同日完成至少两项研究时发一次额外语料。用户经营收入按盈利能力调整，按百分之一 token 跨期累计，再遵守每次经营收益上限。科技详情中的条件试算与经营结算使用同一个纯函数。研究预览采用明示的样本值，真实市场的迁移、召回和改造还需要相应的对局行动提供人口和预算。[市场研究效果](../packages/game/market-research.ts) · [版本化条件](../packages/rules/v0.1/evolution/market-effects.ts)

随机时机为每 8–12 天一次；候选由未抽完的新闻袋和符合日数、反制条件且本局未发生的普通决策组成。普通决策每局一次，新闻袋抽完后补满。四条普通决策分别涉及社区验证、推理返还、审查和研究交换。内容、图片、条件和效果集中在[决策目录](../packages/rules/v0.1/events/decisions.ts)。

“自主编程”独立于随机池：首次完成 `agent-tasks` 后按种子等待 1–2 天，每局一次。其分支在实际选择后两天生成关联新闻，保存 `sourceInstanceId` 和 `sourceChoiceId`，不会再次结算资源。同日允许多条新闻和一个决策，store 逐条发出 `event-occurred`。结局判定优先于当日新事件，终局后不再投递后续。

每次产生独立的 `instanceId`。正式决策打开时暂停，Esc 或“稍后处理”保留实例，可从新闻待办继续处理。`decisionChoiceForRun` 读取当前规则的价格；`decisionChoiceStatus` 校验当前 token、语料与安全整数范围；`decisionEffectForRun` 同时用于预计净变化与实际结算。HUMAN 进度钳在 0–100%，事件选择使其达到 100% 时当场进入结算，并按顺序发送 `decision-resolved` 和一次 `run-ended`。

正式选择提交 `{ type: "choose", id, instanceId, choiceId }`。引擎核对待处理实例和资源，一次性提交选择、费用、收益、反制、实际净变化、后续日和 `GameCommand`。新闻目录的手动预览省略 `instanceId`，只更新上次预览选择。回放记录采用 `day`、递增的 `seq`、`eventInstanceId` 和 `choiceId`。[事件池](../packages/rules/v0.1/events/pool.ts) · [回放类型](../packages/game/types.ts)

新增共享变量时，在所属状态定义类型、单位、初值和更新它的事件。新增事件先定义载荷，再实现转移，测试非法输入、重发和新局隔离。浏览器时钟只发带 `runId` 和预期已完成日数的 `advance-day`。共享规则从输入和旧快照计算结果，随机序列由局内种子驱动，供浏览器、Node 和未来的 Worker 复用。[场景转移](../apps/web/src/scenes/machine.ts) · [浏览器时钟](../apps/web/src/scenes/clock.ts)

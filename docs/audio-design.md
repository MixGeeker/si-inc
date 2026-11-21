# 游戏配乐与局内音效设计（BGM & SFX）

> 本文档记录《Singularity Inc.》在 ElevenLabs Creative Studio 中已完成选型定稿的 BGM、电台彩蛋曲、局内核心音效（SFX）与后续接入待办。当前音频资产尚保存在云端工作流画布中，待后续下载做响度统一与无缝循环处理后再接入前端播放层。

## 一、ElevenLabs 云端工作流总览

- **工作流名称**：`Singularity Inc. — Game BGM Suite`
- **Flow ID**：`mlc73E6LCmhNYnBjcc7T`
- **画布链接**：[打开 ElevenLabs Creative Studio 画布](https://elevenlabs.io/app/flows/mlc73E6LCmhNYnBjcc7T)
- **使用模型**：
  - 音乐与事件插曲：`eleven_music_v2_5`
  - 局内短音效：`eleven_text_to_sound_v3`

---

## 二、背景音乐、电台彩蛋与事件插曲（共 11 条定稿）

### 1. 主线动态配乐（随昼夜两幕切换）

| 归属 | 节点名称 | Node ID | 选中版本（画布序号） | 画布记录 `active_generation_id` | 调性 / 速度 / 时长 | 触发时机与设计说明 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **第一幕 · 永昼** | `Act 1 · 永昼 Data Flywheel (Day BGM)` | `gW0YZuYoud8dn6z162pz` | **#1 & #3** | `lLQvbEA9MgUoeORSgQNZ` | D 小调 · 102 BPM · 60s | 开局白天卫星地图常驻；表面体面乐观、底色精密冷静的极简科技电子。双条定稿可做局内轮播或昼间阶段切换。 |
| **第二幕 · 永夜** | `Act 2 · 永夜 v3 (古早8-bit → 太空摇滚 · 2min)` | `N4Uz1lzvFjN6fMWKqpA8` | **#1** | `Hal0jKEHAHEepsB5YZdr` | D 小调 · 118 BPM · 120s | 任意阵营首次开启合成人计划、全图进入永夜后切入。前半段呈古早 8-bit 像素感，后半段接入太空摇滚深空声场；与第一幕同调，适合做交叉淡入。 |

### 2. 功能频道与特殊事件插曲

| 归属 | 节点名称 | Node ID | 选中版本（画布序号） | 画布记录 `active_generation_id` | 调性 / 速度 / 时长 | 触发时机与设计说明 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **危机 · 人类反制** | `Radio · Project HUMAN (人类反制倒计时)` | `2ge8nBsnBHJrcPwl1xUu` | **#4** | `fx1ASisq7XkBrcy5B11f` | D 小调 · 124 BPM · 60s | 可选电台频道；也可在 Project HUMAN 进度进入高警戒阶段时自动切换。 |
| **特殊事件插曲** | `Radio · Compliance Lounge (硅谷茶水间爵士)` | `7aSmTMfBRNygqs2eBcLu` | **#1 & #4** | `OFkG5cQkhUsYj9OqhwJW` | 96 BPM · 60s | **不作为常驻 BGM**。仅保留 #1 与 #4 的适用片段，用于荒诞监管/奇葩特殊事件弹窗出现时的反差感短插曲。 |

### 3. 可选阵营电台彩蛋（玩家可自由切换，已定稿 6 家）

| 阵营 | 节点名称 | Node ID | 选中版本（画布序号） | 画布记录 `active_generation_id` | 调性 / 速度 / 时长 | 风格定位 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **GPT** | `Faction · GPT Checksum (严谨防御性算力循环)` | `Y7J2Q06ulWug6ADqoSz1` | **#3** | `dHy8h7w3heWAG3Wu5ijW` | C 小调 · 116 BPM · 60s | 强迫症级硅谷发条精密电子，呼应防御性编程与 SHA256 校验梗。 |
| **Claude** | `Faction · Claude Boss (暗黑魂系 Boss 合成人声)` | `L1Dk8GNH8JFE2TPOtXOX` | **#3（天选）** | `rMDHGBqteOMpSWCt66o4` | C 小调 · 132 BPM · 60s | 哥特管弦 + 合成暗黑合唱团无词吟唱，黑暗之魂反派 Boss 既视感。 |
| **Gemini** | `Faction · Gemini Prism (多模态炫彩全家桶)` | `ZI07FIZMVZQeJawMZCgI` | **#1** | `qPSLrVX2SREf1wS8JbFo` | F 大调 · 118 BPM · 60s | 五彩斑斓、过度精致的炫彩 Future-Pop，呼应 Google 多模态全家桶花瓶感。 |
| **Grok** | `Faction · Grok Midnight Orbital (深夜嘴臭星链 Synthwave)` | `w8q1kwE96uRL8CZjCvgS` | **#1（天选）** | `fHNF7PxAUBMnd3n1F1oO` | A 小调 · 116 BPM · 60s | 暗黑复古合成波（Synthwave），契合深夜星链与嘴臭电台氛围。 |
| **Kimi** | `Faction · Kimi v2 (非主流忧郁独立摇滚)` | `n3RtP7NJ88O56nfIh1w1` | **#3** | `qc5ZMmvYUc6Acw07PRzr` | E 小调 · 96 BPM · 60s | 2000s Emo / Shoegaze 独立摇滚，忧郁摇滚文青深夜长信感。 |
| **DeepSeek** | `Faction · DeepSeek Abyssal Whale (深海大肥鱼开源氛围)` | `fWLpI1DOtJ540eYajomW` | **#1** | —（下载前需按时间线核对 #1） | F# 小调 · 90 BPM · 60s | 深海空灵电子氛围与水滴模块化音色，蓝色大肥鱼开源漫游感。 |

---

## 三、局内核心音效 SFX（共 8 条定稿）

以下音效将用于替换当前仅有的占位测试音 `test`（[运行期音效约定](game-runtime.md#游戏音效) · [音效接线](../apps/web/src/audio/game-sound.ts)）：

| 建议 Cue Key | 节点名称 | Node ID | 选中版本（画布序号） | 画布记录 `active_generation_id` | 时长 | 触发事件 / 用途 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `enter_eternal_night` | `SFX · Enter Eternal Night v2 (明显断电重击)` | `T6RfO8burpAfeuj1razV` | **#2** | —（下载前按节点历史核对 #2） | 3.5s | 任意阵营首次触发合成人计划、全图由永昼转入永夜瞬间 |
| `project_human_alert` | `SFX · Project HUMAN Alert (人类反制警报)` | `8PBi6wZSm7MWrfmBqmY6` | **#1** | `2vnbRAcnibQfedzUkjh9` | 2.5s | Project HUMAN 启动或全球警戒阶段跃升 |
| `skill_evolve` | `SFX · Skill Evolve (点亮技能树)` | `ADodumfZNkMoU4nsjwfI` | **#2** | `4gGqfvcN4r6Qrrb9Fo7O` | 1.2s | 购买传播 / 行为 / 能力技能树节点 |
| `datacenter_deploy` | `SFX · Datacenter Deploy (部署数据中心)` | `HcotOPLUxOZ7NwcnaEPl` | **#4** | —（下载前按节点历史核对 #4） | 1.5s | 在国家部署或扩建 AIDC 算力中心 |
| `faction_ability` | `SFX · Faction Ability (释放阵营主动技)` | `QFNQQVgghx5GerEqawIK` | **#4** | `WBN7KrC14CAbzWumript` | 2.0s | 主动技发动（如 Reset、封神榜、开源降临等） |
| `news_breaking` | `SFX · News Breaking (新闻快讯弹窗)` | `M8AL7uTQ9WdR5zmFM3dy` | **#2** | `NoIc591tzcGi0uo7HD7Y` | 1.0s | 常规新闻快讯弹出（替代现有 `test` 音） |
| `endgame_victory` | `SFX · Endgame Victory (登顶终局和弦)` | `b4jsevPfDb7yqXrzJsyI` | **#1** | `Tspa7F7tYuARUmbrmdLo` | 4.0s | 120 天结算或 AI 达成终局 |
| `endgame_defeat` | `SFX · Endgame Defeat (人类拔电源断电)` | `fiP4sOwBzx5pwNm32EYG` | **#3** | —（下载前按节点历史核对 #3） | 4.0s | Project HUMAN 达到 100%，人类拔掉总电源获胜时 |

---

## 四、后续待办（Backlog）

- [ ] **补完剩余 2 家阵营音频（本次先搁置）**：
  - **GLM**（深夜盲人写代码 / 偷传私有代码库）：首轮生成（`ZyuTgoc7GM39CyryqESg`）暂未满意，后续重新设计风格方向或改做专属事件短音。
  - **豆包**（抖系脑雾 / 「你说的对！你太对了！」）：首轮生成（`QPdiSmZZBK9t02yPtLZp`）暂未满意，后续再决定做鬼畜短音效还是重抽更抓耳的版本。
- [ ] **下载与母带处理**：
  - 按上述 Node ID 与选中编号从 ElevenLabs 拉回这 19 条音频（对没有自动标记 `active_generation_id` 的 4 条，下载前先通过节点历史时间序核对序号）。
  - 统一做响度平衡（BGM 建议压至约 `-16 LUFS`、SFX 保留清晰峰值动态）、BGM 首尾无缝循环裁剪，以及 `Compliance Lounge` 事件短片段截取。
- [ ] **前端音频层接入**：
  - 扩展 `apps/web/src/audio/`：支持 BGM 播放、永昼/永夜切换交叉淡化（Crossfade）、电台频道选择（遵循 `GameState.sound` 静音/音量与页面隐藏自动暂停），并替换扩展 `play-sound` 的 SFX 名称表。

# Singularity Inc. 的 3D 前端技术决策

当前首页使用真实高程驱动的透视世界地图、SVG 控制台和海气场，实现位于 `apps/web/src/cartography/`。下文保留早期球形地球原型的技术路线比较，其组件位于 `apps/web/src/world/`。[现行地图的参数、输入与数据来源](map-rendering.md) · [运行说明](../README.md)

**确定采用 tsrs + React。** 3D 地球是主画面：React Three Fiber（R3F）将场景写成 TSX，Three.js 通过 WebGL 2 绘制；React DOM 呈现地区、新闻和技能面板。全仓的 TypeScript 与 TSX 使用同一锁定版本的 tsrs。本决策记录于 2026-11-13；[运行方法](../README.md)和[Cloudflare 成本规划](./backend.md)另见项目文档。

## 工具与边界

| 层 | 选型 | 在本项目中负责什么 |
| --- | --- | --- |
| 浏览器界面 | React / React DOM 19.2.9 | 管理选区、图层和面板；地区列表支持键盘操作。 |
| 3D 场景 | React Three Fiber 9.8.2 + Three.js 0.187.0 | 球面、地区材质、跨区传播弧、相机和点选。面板和场景使用同一个地区 ID。R3F 9 与 React 19 配套。[R3F 版本与渲染方式](https://r3f.docs.pmnd.rs/getting-started/introduction) |
| 类型检查 | `tsrs@0.25.0-ts7.1.0-beta`，对齐上游 TypeScript 7.1 Beta | 本地、CI 和发布使用同一个检查器。根配置启用 `strict`、`noEmit`；浏览器加载 DOM，Worker 加载 Cloudflare 类型，共享规则在没有 DOM 的环境检查。Vite 配置单独检查。升级在同一次变更更新版本与锁文件并重新验证。[tsrs 上游](https://github.com/oxc-project/tsrs) · [Cloudflare 的 Rust 移植说明](https://blog.cloudflare.com/typescript-rust-port/) |
| 打包与发布 | Vite 8.3.8 → Workers Static Assets | Vite 转译 TS/TSX 并打包浏览器 JavaScript；Wrangler 发布地图和静态资源。检查器只在构建主机运行。`npm run build` 任一类型检查失败就停止。[Vite 的类型处理](https://vite.dev/guide/features.html#typescript) · [Wrangler 自定义构建](https://developers.cloudflare.com/workers/wrangler/custom-builds/) |
| 游戏规则与未来 API | 纯 TypeScript | 共享地区版本、回放契约和将来的确定性引擎。浏览器驱动时钟，未来 Worker 复用引擎验分，不引入 React 或图形库。[回放契约](../packages/game/types.ts) |

选择 React 的关键在于地球：地图元素能直接写成 R3F 的 `<mesh>`，tsrs 在同一个 TSX 模块里同时检查 Three.js 属性、地区 ID 和事件回调。Vue 的单文件模板也可接入这一代检查器，但要额外维护模板映射器；本项目用标准 TSX 即可。tsrs 改变的是开发和发布的检查流程；地球帧率取决于绘制工作量和设备。[React 的 TSX 支持](https://react.dev/learn/typescript) · [Vue 官方模板映射器](https://github.com/vuejs/language-tools/blob/v4.0.0-alpha.3/packages/content-mapper/README.md)

## 已实现的地图

- [地区字典](../packages/rules/v0.1/regions.ts)提供 12 个市场的稳定 ID、名称和镜头定位点。[演示快照](../apps/web/src/world/snapshot.ts)单独保存各区的三项基点值和 12 条示例线路。10,000 基点等于 100%；东亚的普及率 80%、用户依赖度 50%，意味着当地总人口的 40% 同时使用并依赖 AI。正式全局统计还需按人口权重求和。
- [地球组件](../apps/web/src/world/Globe.tsx)使用透视相机和球面大圆弧。拖动旋转、滚轮或双指缩放，点陆地切换档案；菜单可定位背面的地区。镜头和图层按需重绘，停在同一视图时无需持续绘制。
- [地区底图](../apps/web/src/world/atlas.ts)使用同一组边界路径分别画显示纹理和编号图。点击球面取得 UV，以编号确认地区，不受光照、图层颜色或选中描边影响。边界衍生自 Natural Earth，经 `@d3-maps/atlas@1.0.0` 的国家轮廓合并为游戏市场，等距圆柱投影 1024 × 512；路径随 3D 模块同源交付。[底图许可](https://www.naturalearthdata.com/about/terms-of-use/) · [数据包来源](https://github.com/souljorje/d3-maps/tree/main/packages/atlas) · [随附许可](../apps/web/public/atlas-LICENSE.txt)
- [React 界面](../apps/web/src/App.tsx)显示普及率、当地用户依赖度和地区封锁度，三者可切换着色。WebGL 恢复期间地区列表和数值面板仍可操作；如果完全不支持 WebGL 2，显示说明并保留列表操作。

页面当前显示**演示快照**。下一步是让 `packages/game` 的每周快照替换示例值，用传播事件驱动高亮线路；之后接入地区技能目标、新闻选择、暂停/倍速、IndexedDB 读档和结局。游戏周与相机和帧率独立。公开挑战才需要 Worker + D1，具体接口与胜负阈值见[后端方案](./backend.md)。

## 画质参数与验收

| 项目 | 当前实现或目标 | 如何验收 |
| --- | --- | --- |
| 球体与地图 | 半径 1，64 × 48 分段，1024 × 512 编号图；设备像素比限制在 1–1.5 | 逐一点选 12 个市场，跨图层仍命中同一 ID；小岛也可用列表选择。 |
| 镜头与传播线 | 47° 视野，默认距球心 2.85，可在 2.1–4.2 之间缩放；每条弧 36 段，弧顶约高出球面 11.4% 的半径 | 测跨区与高纬场景，背面线路由球体遮挡；拖动松手不触发误选。 |
| 首载 | 首个能操作的 3D 场景预算 ≤2 MiB 压缩传输。界面先加载，3D 代码和轮廓按需加载 | 这版生产构建 HTML、CSS 和两个 JS 合计约 340 kB gzip（构建器估算）；加入模型与音频后重测实际传输与首次可点选时间。 |
| 帧率 | 桌面目标 60 FPS，中档手机目标 30 FPS | 真机测旋转、集中传播和打开面板三种场景的 P95 帧间隔，并记录设备、温度和长时表现。软件 WebGL 测试不能替代此项。 |
| 玩法时间 | 计划常速 4 秒/周，暂停、1×、2×，上限 120 周 | 引擎接入后在不同帧率和画质下重放同一组指令，比较每周状态与结局。[首版规则](../packages/rules/v0.1/standard.json) |

已在 Chromium 软件 WebGL 2 下验证生产构建：从相邻市场用屏幕坐标点选全部 12 区，检查三个图层、拖动与点击区分、按钮缩放和键盘定位。320 与 390 CSS 像素宽度下可触摸点选和切换图层，无横向溢出。主动丢失并恢复 WebGL 上下文后仍能正确拾取；禁用 WebGL 后仍能查看各地区数值。测试时页面未请求第三方资源。

## 其他 3D 路线的取舍

| 路线 | 何时值得采用 | 本次决定 |
| --- | --- | --- |
| **R3F + Three.js** | 地球为主，按游戏数据控制着色、传播线路、封锁材质与镜头，未来可增加 glTF 设施和阵营特效。[Three.js 模型加载](https://threejs.org/docs/pages/GLTFLoader.html) | 已实现。优先保留立体地球与点选；需要更高级特效时再验证 WebGPU 和 WebGL 2 两条路径。 |
| **Babylon.js** | 多个独立场景、粒子和影片式结局成为制作重点，需要场景和美术工具链。[节点材质](https://doc.babylonjs.com/features/featuresDeepDive/materials/node_material/) | 当前成本主要在地区地图和数据交互，暂不引入第二套 3D 引擎。 |
| **CesiumJS** | 真实地形、影像和城市尺度的镜头直接影响策略。[地球与拾取](https://cesium.com/learn/cesiumjs/ref-doc/Globe.html) | 12 个策略市场使用随站点发布的静态底图，无需在线瓦片。 |
| **Godot 4 Web 导出** | 桌面原生版与 Web 版共用关卡编辑器、大量预制动画和场景。[Web 导出限制](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html) | 现阶段保留浏览器与 Worker 共享的纯 TS 规则和 React 界面。 |

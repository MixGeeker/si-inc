# AI 公司标志库

用浏览器打开[标志预览](index.html)，输入公司中英文名、产品名或游戏阵营名即可查找和下载原图。预览可离线使用，点击「官方来源」可回到品牌方的发布页面。

## 玩法草案中的阵营

| 阵营 | 所属公司或机构 | 可用素材 |
| --- | --- | --- |
| GPT | OpenAI | [OpenAI 字标](companies/openai.svg) · [Blossom 图形](companies/openai-blossom.svg) |
| Claude | Anthropic | [公司字标](companies/anthropic.svg) · [Claude Spark](products/claude.svg) |
| Gemini | Google DeepMind | [实验室字标](companies/google-deepmind.svg) · [Gemini 图标](products/gemini.svg) |
| Grok | SpaceXSI | [Grok 图标](products/grok.png) · [xAI 历史标志](companies/xai.webp) |
| DeepSeek | 深度求索 | [公司组合标志](companies/deepseek.svg) · [鲸鱼图形](companies/deepseek-symbol.svg) |
| GLM | 智谱 | [智谱公司标志](companies/zhipu.svg) · [GLM 官方仓库使用的 Z.ai 标志](companies/zai.svg) |
| Kimi | 月之暗面 | [Moonshot AI 字标](companies/moonshot.svg) · [Kimi 图标](products/kimi.png) |
| 豆包 | 字节跳动 | [字节跳动公司标志](companies/bytedance.svg) · [豆包图标](products/doubao.png) |

## 索引与来源

[机器可读索引](catalog.json) 按机构组织。每家有稳定的 `id`、显示名称、领域和官网。`aliases` 包含可检索的别名及产品名。`assets[].file` 是相对于本目录的本地路径，`kind` 区分机构、产品和历史标志。白色图形在预览中使用 `background: "dark"` 指定的深色底。

每份标志都有官方来源页和本地文件的 SHA-256。独立下载文件记录在 `assetUrl`，压缩包内的文件另记 `archiveMember`，取自官网内嵌图形的条目记录 `element`。SVG 保留矢量，位图按实际编码保存为 PNG 或 WebP。

标志权利归各品牌。发布时按条目所列的品牌规范和使用范围处理。阿里巴巴集团媒体素材的指定署名为 “Source: www.alibabagroup.com.”。[阿里巴巴集团媒体资源](https://home.alibabagroup.com/en-US/resource-logos)

## 更新资产

把原图放入 `companies/` 或 `products/`，在 `catalog.json` 登记来源和 SHA-256，再从仓库根目录生成预览。只校验时使用第二条命令。

```sh
node scripts/build_logo_gallery.mjs
node scripts/build_logo_gallery.mjs --check
```

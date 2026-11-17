import { createHash } from "node:crypto"
import { readFileSync, readdirSync, writeFileSync } from "node:fs"

const root = new URL("../assets/ai-logos/", import.meta.url)
const { collectedOn, organizations } = JSON.parse(readFileSync(new URL("catalog.json", root), "utf8"))
const kinds = { organization: "机构标志", product: "产品标志", historical: "历史标志" }
const files = new Set()

function escapeHtml(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;")
}

function card(org, asset) {
  const { name, kind, file, sourcePage, background } = asset
  const folder = kind === "product" ? "products" : "companies"
  if (!Object.hasOwn(kinds, kind) || !/^(companies|products)\/[a-z0-9-]+\.(svg|png|webp)$/.test(file) ||
      !file.startsWith(folder + "/") || files.has(file)) {
    throw new Error(`标志类型或文件路径有误 ${file}`)
  }
  const digest = createHash("sha256").update(readFileSync(new URL(file, root))).digest("hex")
  if (digest !== asset.sha256) throw new Error(`文件与索引的 SHA-256 不一致 ${file}`)
  files.add(file)

  const keywords = [org.id, org.name, ...(org.aliases ?? []), name, file].join(" ").toLowerCase()
  const format = file.slice(file.lastIndexOf(".") + 1).toUpperCase()
  const owner = name.toLowerCase().includes(org.name.toLowerCase()) ? "" : escapeHtml(org.name) + " · "
  const guidelines = org.guidelines && org.guidelines !== sourcePage
    ? `<a href="${escapeHtml(org.guidelines)}">品牌规范</a>` : ""
  return `    <li class="card" data-category="${escapeHtml(org.category)}" data-kind="${kind}" data-search="${escapeHtml(keywords)}">
      <a class="art${background === "dark" ? " dark" : ""}" href="${file}" aria-label="查看${escapeHtml(name)}原图">
        <img src="${file}" alt="${escapeHtml(name)}">
      </a>
      <div class="caption">
        <h2>${escapeHtml(name)}</h2>
        <p>${owner}${kinds[kind]} · ${format}</p>
      </div>
      <div class="links"><a href="${file}" download>下载 ${format}</a><a href="${escapeHtml(sourcePage)}">官方来源</a>${guidelines}</div>
    </li>`
}

const cards = organizations.flatMap(org => org.assets.map(asset => card(org, asset)))
for (const folder of ["companies", "products"]) {
  for (const entry of readdirSync(new URL(folder + "/", root))) {
    if (!files.has(`${folder}/${entry}`)) throw new Error(`文件尚未登记 ${folder}/${entry}`)
  }
}
const categories = [...new Set(organizations.map(org => org.category))]
const categoryOptions = categories.map(name => `<option>${escapeHtml(name)}</option>`).join("")
const kindOptions = Object.entries(kinds).map(([key, label]) => `<option value="${key}">${label}</option>`).join("")
const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AI 公司标志库 · Singularity Inc.</title>
  <link rel="icon" href="data:,">
  <link rel="stylesheet" href="gallery.css">
  <script src="gallery.js" defer></script>
</head>
<body>
<main>
  <header>
    <div>
      <h1>AI 公司标志库</h1>
      <p>${organizations.length} 家公司与研究机构 <span>·</span> <time datetime="${collectedOn}">${collectedOn}</time> 采集</p>
    </div>
    <a class="catalog-link" href="catalog.json" download>下载 JSON 索引 <span aria-hidden="true">↓</span></a>
  </header>
  <form id="filters" role="search" hidden>
    <label class="search">搜索<input type="search" id="query" placeholder="公司、产品或阵营名称" autocomplete="off"></label>
    <label>领域<select id="category"><option value="">全部领域</option>${categoryOptions}</select></label>
    <label>标志类型<select id="kind"><option value="">全部类型</option>${kindOptions}</select></label>
  </form>
  <div class="results"><output id="count" aria-live="polite">${cards.length} 份标志</output><button type="button" id="reset" hidden>清除筛选</button></div>
  <p id="empty" hidden>没有匹配的标志。可以试试公司的中英文名或产品名。</p>
  <ul id="gallery">
${cards.join("\n")}
  </ul>
  <footer>标志权利归各品牌，使用范围见官方来源与品牌规范。阿里巴巴集团标志署名为 Source: www.alibabagroup.com.</footer>
</main>
</body>
</html>
`

const output = new URL("index.html", root)
if (process.argv.includes("--check")) {
  if (readFileSync(output, "utf8").replaceAll("\r\n", "\n") !== html) throw new Error("预览与目录不同步，请重新生成")
} else {
  writeFileSync(output, html)
}
console.log(`${organizations.length} 家机构，${cards.length} 份标志，文件校验通过。`)

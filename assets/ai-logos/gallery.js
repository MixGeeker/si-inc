const filters = document.querySelector("#filters")
const query = document.querySelector("#query")
const category = document.querySelector("#category")
const kind = document.querySelector("#kind")
const cards = document.querySelectorAll("#gallery .card")
const count = document.querySelector("#count")
const reset = document.querySelector("#reset")
const empty = document.querySelector("#empty")

function filterGallery() {
  const terms = query.value.trim().toLowerCase().split(/\s+/).filter(Boolean)
  let visible = 0
  for (const card of cards) {
    const matches = (!category.value || card.dataset.category === category.value)
      && (!kind.value || card.dataset.kind === kind.value)
      && terms.every(term => card.dataset.search.includes(term))
    card.hidden = !matches
    if (matches) visible++
  }
  count.textContent = `${visible} 份标志`
  empty.hidden = visible > 0
  reset.hidden = !terms.length && !category.value && !kind.value
}

filters.addEventListener("input", filterGallery)
reset.addEventListener("click", () => {
  filters.reset()
  filterGallery()
})
filters.addEventListener("submit", event => event.preventDefault())
filters.hidden = false
filterGallery()

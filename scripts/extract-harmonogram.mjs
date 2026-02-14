import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
// Use legacy build for Node.js
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

async function main() {
  const pdfPath = process.argv[2] || 'public/harmonogram_nowy.pdf'
  const abs = path.resolve(pdfPath)
  const data = await fs.readFile(abs)
  const loadingTask = getDocument({ data: new Uint8Array(data) })
  const pdf = await loadingTask.promise
  const pages = []
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const content = await page.getTextContent()
    const lines = new Map()
    for (const itm of content.items) {
      if (typeof itm.str !== 'string') continue
      const y = Math.round(itm.transform[5])
      const x = itm.transform[4]
      if (!lines.has(y)) lines.set(y, [])
      lines.get(y).push({ x, text: itm.str })
    }
    const ordered = [...lines.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([_, arr]) => arr.sort((a, b) => a.x - b.x).map(o => o.text).join(' ').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
    pages.push(ordered.join('\n'))
  }
  console.log(`PAGES: ${pages.length}`)
  pages.forEach((txt, idx) => {
    console.log(`\n===== PAGE ${idx + 1} =====\n`)
    console.log(txt)
  })
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})

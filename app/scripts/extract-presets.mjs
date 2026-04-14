// Run from the app/ directory: node scripts/extract-presets.mjs
import butterchurnPresets from 'butterchurn-presets'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(__dirname, '..', '..', 'presets')
fs.mkdirSync(outDir, { recursive: true })

const allPresets = butterchurnPresets.getPresets()
const names = Object.keys(allPresets).slice(0, 20)

for (const name of names) {
  // Strip characters that are invalid in Windows filenames
  const filename = name.replace(/[/\\?%*:|"<>]/g, '_') + '.json'
  fs.writeFileSync(path.join(outDir, filename), JSON.stringify(allPresets[name]))
  console.log('  wrote', filename)
}

console.log(`\nExtracted ${names.length} presets to ${outDir}`)

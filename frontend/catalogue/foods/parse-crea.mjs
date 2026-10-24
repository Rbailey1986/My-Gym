// One-off: CREA "Tabelle di composizione degli alimenti" pages (alimentinutrizione.it/tabelle-nutrizionali/<code>)
// saved as <code>.html in a folder -> crea.csv.  Usage: node parse-crea.mjs <pagesDir>
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = process.argv[2]
const text = h => h.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ')
// "Energia (kcal) kcal 353 282 C" -> 353: the first number after the label and its unit
const val = (t, label) => { const i = t.indexOf(label + ' '); return i < 0 ? '' : (t.slice(i + label.length).match(/^ \S+(?: \([^)]*\))? ([\d.]+)(?: |$)/) || [])[1] ?? '' }
const q = s => '"' + String(s).replace(/"/g, '""') + '"'
const rows = [['code', 'name', 'english', 'category', 'edible', 'portion', 'kcal', 'protein', 'fat', 'carbs', 'sugars', 'fibre', 'sodium'].join(',')]
for (const f of readdirSync(dir).filter(f => f.endsWith('.html')).sort()) {
  const h = readFileSync(join(dir, f), 'utf8')
  const name = (h.match(/<title>AlimentiNUTrizione - ([^<]*)<\/title>/) || [])[1]?.trim()
  const t = text(h)
  const i = t.indexOf('Categoria ')
  if (!name || i < 0) { console.error('skipped', f); continue }
  const b = t.slice(i)
  const get = re => (b.match(re) || [])[1]?.trim() ?? ''
  rows.push([f.slice(0, -5), q(name), q(get(/English Name (.*?)(?: Informazioni | Parte Edibile)/)), q(get(/Categoria (.*?) Codice Alimento/)),
    get(/Parte Edibile ([\d.]+)/), get(/Porzione ([\d.]+) g/),
    val(b, 'Energia (kcal)'), val(b, 'Proteine (g)'), val(b, 'Lipidi (g)'), val(b, 'Carboidrati disponibili (g)'),
    val(b, 'Zuccheri solubili (g)'), val(b, 'Fibra totale (g)'), val(b, 'Sodio (mg)')].join(','))
}
writeFileSync('crea.csv', rows.join('\n') + '\n')
console.log(rows.length - 1, 'foods')

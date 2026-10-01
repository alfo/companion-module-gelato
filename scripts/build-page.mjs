// Writes the Stream Deck + XL page Companion imports. Run it through `yarn page`.
import { mkdirSync, writeFileSync } from 'node:fs'
import { buildPage } from '../dist/page.js'

mkdirSync(new URL('../pages/', import.meta.url), { recursive: true })
writeFileSync(
	new URL('../pages/stream-deck-plus-xl.companionconfig', import.meta.url),
	JSON.stringify(buildPage()) + '\n',
)
console.log('Wrote pages/stream-deck-plus-xl.companionconfig')

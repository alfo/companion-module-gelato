import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { buildPage, PAGE_LABEL } from '../page.js'
import { buildPresets, XL_PAGE } from '../presets.js'

type Control = ReturnType<typeof buildPage>['page']['controls'][string][string]

describe('the Stream Deck + XL page file', () => {
	const page = buildPage()
	const control = (row: number, column: number): Control => {
		const found = page.page.controls[row]?.[column]
		assert.ok(found, `a control at row ${row}, column ${column}`)
		return found
	}

	it('is up to date: `yarn page` writes it, and it matches what the presets make now', () => {
		const file = readFileSync(new URL('../../pages/stream-deck-plus-xl.companionconfig', import.meta.url), 'utf8')
		assert.equal(file, JSON.stringify(page) + '\n', 'run `yarn page` and commit pages/')
	})

	it('is nine columns by six rows, with a control wherever XL_PAGE puts a preset', () => {
		assert.deepEqual(page.page.gridSize, { minColumn: 0, maxColumn: 8, minRow: 0, maxRow: 5 })
		for (const [row, cells] of Object.entries(XL_PAGE))
			assert.deepEqual(Object.keys(page.page.controls[Number(row)] ?? {}), Object.keys(cells))
	})

	it('turns only the six knobs into rotary buttons, and presses real actions of the connection', () => {
		const rotary = Object.entries(page.page.controls).flatMap(([row, cells]) =>
			Object.entries(cells)
				.filter(([, c]) => c.options.rotaryActions)
				.map(([column]) => `${row}/${column}`),
		)
		assert.deepEqual(rotary, ['5/0', '5/2', '5/5']) // the knobs that turn: brand, preview, edited
		const connections = Object.keys(page.instances)
		for (const cells of Object.values(page.page.controls))
			for (const c of Object.values(cells))
				for (const set of Object.values(c.steps['0'].action_sets))
					for (const action of set) assert.ok(connections.includes(action.connectionId))
	})

	it('names the connection the way the presets name their variables', () => {
		assert.equal(Object.values(page.instances)[0]?.label, PAGE_LABEL)
		const { presets } = buildPresets(PAGE_LABEL)
		const text = control(4, 0).style.layers.find((l) => l.id === 'text0') as unknown as { text: { value: string } }
		assert.equal(text.text.value, presets['display_entry']?.style.text)
	})

	it('draws text at 5/3 of the preset size, and recolours with the feedback', () => {
		const layers = control(4, 1).style.layers as unknown as { id: string; fontsize?: { value: number } }[]
		const { presets } = buildPresets(PAGE_LABEL)
		const size = Number(presets['display_pending']?.style.size)
		assert.equal(layers.find((l) => l.id === 'text0')?.fontsize?.value, Math.round((size * 50) / 3) / 10)
		assert.ok(control(4, 1).feedbacks.some((f) => f.styleOverrides.some((o) => o.elementId === 'box0')))
	})
})

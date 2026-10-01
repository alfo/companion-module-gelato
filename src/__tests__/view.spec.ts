import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { initialValues } from '../state.js'
import { scrolled, viewDefinitions, viewValues } from '../view.js'

describe('edited palette view', () => {
	it('scrolls round the slots in use, both ways, and back to the first', () => {
		assert.equal(scrolled(1, 3, 'next'), 2)
		assert.equal(scrolled(3, 3, 'next'), 1)
		assert.equal(scrolled(1, 3, 'previous'), 3)
		assert.equal(scrolled(3, 3, 'first'), 1)
	})

	it('stays on slot 1 with none or one in use, and never goes past the eight slots', () => {
		assert.equal(scrolled(1, 0, 'next'), 1)
		assert.equal(scrolled(1, 1, 'previous'), 1)
		assert.equal(scrolled(8, 20, 'next'), 1)
		assert.equal(scrolled(5, 2, 'next'), 1)
	})

	it('publishes the slot shown, and nothing when none are edited', () => {
		const values = {
			...initialValues(),
			edited_count: 2,
			edited_2_palette: '201',
			edited_2_label: 'L201',
			edited_2_how_text: 'Update',
			edited_2_user: 3,
		}
		const shown = viewValues(values, 2)
		assert.equal(shown.edited_shown, 2)
		assert.equal(shown.edited_shown_palette, '201')
		assert.equal(shown.edited_shown_label, 'L201')
		assert.equal(shown.edited_shown_user, 3)
		assert.equal(viewValues(initialValues(), 1).edited_shown, 0)
		assert.equal(viewValues(values, 7).edited_shown, 2, 'clamped to the slots in use')
		assert.deepEqual(Object.keys(viewDefinitions()).sort(), Object.keys(shown).sort())
	})
})

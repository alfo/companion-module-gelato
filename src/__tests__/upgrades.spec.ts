import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { ModuleConfig } from '../config.js'
import { renameColourActions } from '../upgrades.js'

describe('upgrades', () => {
	it('renames the 0.1.0 add-colour actions and leaves every other action alone', () => {
		const action = (id: string, actionId: string) => ({ id, controlId: 'c', actionId, options: {} })
		const props = {
			config: null,
			secrets: null,
			actions: [action('1', 'add_colour'), action('2', 'add_colour_brand'), action('3', 'confirm')],
			feedbacks: [],
		}
		const result = renameColourActions({ currentConfig: {} as ModuleConfig }, props)
		assert.deepEqual(
			result.updatedActions.map((a) => [a.id, a.actionId]),
			[
				['1', 'add_color'],
				['2', 'add_color_brand'],
			],
		)
		assert.equal(result.updatedConfig, null)
	})
})

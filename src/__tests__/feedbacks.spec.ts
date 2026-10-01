import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CHECKS } from '../feedbacks.js'
import { initialValues, parseFeedback } from '../state.js'

describe('feedbacks', () => {
	it('are all off when nothing has been heard', () => {
		const values = initialValues()
		assert.equal(CHECKS.status_is(values, 'awaiting-confirm'), false)
		assert.equal(CHECKS.lock_on(values), false)
		assert.equal(CHECKS.console_connected(values), false)
		assert.equal(CHECKS.readback_waiting(values), false)
		assert.equal(CHECKS.edited_any(values), false)
		assert.equal(CHECKS.new_types(values), false)
		for (let slot = 1; slot <= 8; slot++) assert.equal(CHECKS.edited_slot(values, slot), false)
	})

	it('follow what Gelato says', () => {
		const values = initialValues()
		const hear = (address: string, ...args: (string | number)[]): void =>
			void Object.assign(values, parseFeedback({ address, args }))
		hear('/gelato/out/status', 'writing', 'Writing')
		assert.equal(CHECKS.status_is(values, 'writing'), true)
		assert.equal(CHECKS.status_is(values, 'awaiting-confirm'), false)
		hear('/gelato/out/lock', 1)
		hear('/gelato/out/eos/connected', 1)
		hear('/gelato/out/readback', 'waiting', 'Waiting', '', '', 0, 0)
		hear('/gelato/out/build/new/count', 2)
		hear('/gelato/out/edited/count', 1)
		hear('/gelato/out/edited/1', '201', 'L201', 'update', 'Update', 1, 0)
		assert.deepEqual(
			[
				CHECKS.lock_on(values),
				CHECKS.console_connected(values),
				CHECKS.readback_waiting(values),
				CHECKS.new_types(values),
				CHECKS.edited_any(values),
			],
			[true, true, true, true, true],
		)
		assert.equal(CHECKS.edited_slot(values, 1), true)
		assert.equal(CHECKS.edited_slot(values, 2), false)
	})

	it('turn off again when a list slot is cleared', () => {
		const values = initialValues()
		const hear = (address: string, ...args: (string | number)[]): void =>
			void Object.assign(values, parseFeedback({ address, args }))
		hear('/gelato/out/edited/count', 2)
		hear('/gelato/out/edited/1', '201', 'L201', 'update', 'Update', 1, 0)
		hear('/gelato/out/edited/2', '202', 'L202', 'update', 'Update', 1, 0)
		hear('/gelato/out/edited/count', 0)
		assert.equal(CHECKS.edited_any(values), false)
		hear('/gelato/out/edited/1', '', '', '', '', 0, 0)
		assert.equal(CHECKS.edited_slot(values, 1), false)
		assert.equal(CHECKS.edited_slot(values, 2), false, 'slot 2 was cleared by the count')
	})
})

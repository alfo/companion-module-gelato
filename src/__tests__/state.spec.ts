import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
	initialValues,
	LIST_SLOTS,
	LISTS,
	parseFeedback,
	SINGLE,
	variableDefinitions,
	type VariableValues,
} from '../state.js'
import type { OSCMessage } from '../osc.js'

const message = (address: string, ...args: OSCMessage['args']): OSCMessage => ({ address, args })

describe('feedback into variables', () => {
	it('defines a variable for every field, and starts every one cleared', () => {
		const definitions = variableDefinitions()
		const values = initialValues()
		assert.deepEqual(Object.keys(values).sort(), Object.keys(definitions).sort())
		for (const [id, value] of Object.entries(values)) assert.ok(value === '' || value === 0, `${id} starts cleared`)
	})

	it('has 8 slots of each list, and a count', () => {
		const definitions = variableDefinitions()
		assert.ok('edited_8_palette' in definitions)
		assert.ok(!('edited_9_palette' in definitions))
		assert.ok('build_new_8' in definitions)
		assert.ok('edited_count' in definitions && 'build_new_count' in definitions)
	})

	it('reads entry and status, with the display words', () => {
		assert.deepEqual(parseFeedback(message('/gelato/out/entry', 'L60')), { entry: 'L60' })
		assert.deepEqual(parseFeedback(message('/gelato/out/status', 'awaiting-confirm', 'Confirm?')), {
			status: 'awaiting-confirm',
			status_text: 'Confirm?',
		})
	})

	it('reads a colour pending: one fixed layout for every kind', () => {
		assert.deepEqual(
			parseFeedback(message('/gelato/out/pending', 'colour', 'Colour', 'L602', '602', 'Tour 2025', '', 9, 3, 0, 0)),
			{
				pending_kind: 'colour',
				pending_kind_text: 'Colour',
				pending_gel: 'L602',
				pending_palette: '602',
				pending_label: 'Tour 2025',
				pending_template: '',
				pending_ghosts: 9,
				pending_gel_matches: 3,
				pending_palettes: 0,
				pending_presets: 0,
			},
		)
	})

	it('reads a build pending, and a cleared one', () => {
		const build = parseFeedback(message('/gelato/out/pending', 'build', 'Build', '', '', '', 'Musicals', 12, 0, 40, 6))
		assert.equal(build?.pending_template, 'Musicals')
		assert.equal(build?.pending_palettes, 40)
		assert.equal(build?.pending_presets, 6)
		const cleared = parseFeedback(message('/gelato/out/pending', '', '', '', '', '', '', 0, 0, 0, 0))
		assert.deepEqual(Object.values(cleared ?? {}), ['', '', '', '', '', '', 0, 0, 0, 0])
	})

	it('keeps a palette number a string, so 0.10 survives', () => {
		const values = parseFeedback(message('/gelato/out/last', 'recorded', 'Recorded', '', '', 'O/W', '0.10', 'O/W', ''))
		assert.equal(values?.last_palette, '0.10')
	})

	it('reads last, with the result and reason', () => {
		assert.deepEqual(
			parseFeedback(
				message('/gelato/out/last', 'refused', 'Refused', 'unlisted-show', 'Unlisted', 'L602', '602', 'Tour', 'Wash'),
			),
			{
				last_result: 'refused',
				last_result_text: 'Refused',
				last_reason: 'unlisted-show',
				last_reason_text: 'Unlisted',
				last_gel: 'L602',
				last_palette: '602',
				last_label: 'Tour',
				last_template: 'Wash',
			},
		)
	})

	it('reads the flags as numbers', () => {
		assert.deepEqual(parseFeedback(message('/gelato/out/eos/connected', 1)), { eos_connected: 1 })
		assert.deepEqual(parseFeedback(message('/gelato/out/lock', 0)), { locked: 0 })
		assert.deepEqual(parseFeedback(message('/gelato/out/lock', true)), { locked: 1 })
	})

	it('reads preview, progress and readback', () => {
		assert.deepEqual(
			parseFeedback(
				message(
					'/gelato/out/preview',
					'previewing',
					'Previewing',
					'',
					'',
					'X4S',
					2,
					3,
					'gel-match',
					'Gel Match',
					'L602',
					'Tour 2025',
				),
			),
			{
				preview_state: 'previewing',
				preview_state_text: 'Previewing',
				preview_reason: '',
				preview_reason_text: '',
				preview_type: 'X4S',
				preview_option: 2,
				preview_of: 3,
				preview_kind: 'gel-match',
				preview_kind_text: 'Gel Match',
				preview_gel: 'L602',
				preview_source: 'Tour 2025',
			},
		)
		assert.deepEqual(parseFeedback(message('/gelato/out/progress', 5, 12)), { progress_done: 5, progress_total: 12 })
		assert.deepEqual(
			parseFeedback(message('/gelato/out/readback', 'waiting', 'Waiting', 'partition-in-use', 'Partition', 1, 901)),
			{
				readback_state: 'waiting',
				readback_state_text: 'Waiting',
				readback_reason: 'partition-in-use',
				readback_reason_text: 'Partition',
				readback_user: 1,
				readback_partition: 901,
			},
		)
	})

	it('reads a list slot, and a cleared one', () => {
		assert.deepEqual(parseFeedback(message('/gelato/out/edited/2', '201', 'L201', 'update', 'Update', 1, 0)), {
			edited_2_palette: '201',
			edited_2_label: 'L201',
			edited_2_how: 'update',
			edited_2_how_text: 'Update',
			edited_2_user: 1,
			edited_2_editing: 0,
		})
		assert.deepEqual(parseFeedback(message('/gelato/out/edited/3', '', '', '', '', 0, 0)), {
			edited_3_palette: '',
			edited_3_label: '',
			edited_3_how: '',
			edited_3_how_text: '',
			edited_3_user: 0,
			edited_3_editing: 0,
		})
		assert.deepEqual(parseFeedback(message('/gelato/out/build/new/1', 'Mac Aura XB')), { build_new_1: 'Mac Aura XB' })
		assert.deepEqual(parseFeedback(message('/gelato/out/build/new/4', '')), { build_new_4: '' })
	})

	it('a count clears the slots past it', () => {
		const values = parseFeedback(message('/gelato/out/edited/count', 1))
		assert.equal(values?.edited_count, 1)
		assert.equal(values?.edited_1_palette, undefined, 'slot 1 is left as sent')
		for (let slot = 2; slot <= LIST_SLOTS; slot++) {
			assert.equal(values?.[`edited_${slot}_palette`], '')
			assert.equal(values?.[`edited_${slot}_user`], 0)
			assert.equal(values?.[`edited_${slot}_editing`], 0)
		}
		const none = parseFeedback(message('/gelato/out/build/new/count', 0))
		assert.equal(none?.build_new_1, '')
		assert.equal(none?.build_new_8, '')
	})

	it('going from 3 edited palettes to 1 leaves slots 2 and 3 empty', () => {
		const values: VariableValues = initialValues()
		const apply = (m: OSCMessage): void => void Object.assign(values, parseFeedback(m))
		apply(message('/gelato/out/edited/count', 3))
		for (const slot of [1, 2, 3])
			apply(message(`/gelato/out/edited/${slot}`, String(200 + slot), `L${200 + slot}`, 'update', 'Update', 1, 0))
		assert.equal(values.edited_3_palette, '203')
		apply(message('/gelato/out/edited/count', 1))
		apply(message('/gelato/out/edited/1', '201', 'L201', 'update', 'Update', 1, 0))
		assert.equal(values.edited_count, 1)
		assert.equal(values.edited_1_palette, '201')
		for (const slot of [2, 3]) {
			assert.equal(values[`edited_${slot}_palette`], '')
			assert.equal(values[`edited_${slot}_how_text`], '')
		}
	})

	it('reads a missing argument as empty or 0, and ignores extras', () => {
		assert.deepEqual(parseFeedback(message('/gelato/out/status', 'idle')), { status: 'idle', status_text: '' })
		assert.equal(parseFeedback(message('/gelato/out/progress', 3))?.progress_total, 0)
		assert.equal(parseFeedback(message('/gelato/out/entry', 'L6', 'extra', 9))?.entry, 'L6')
	})

	it('coerces the other type rather than losing the value', () => {
		assert.equal(parseFeedback(message('/gelato/out/progress', '5', 12.7))?.progress_done, 5)
		assert.equal(parseFeedback(message('/gelato/out/progress', '5', 12.7))?.progress_total, 12)
		assert.equal(parseFeedback(message('/gelato/out/pending', 'colour', 'Colour', 'L1', 602))?.pending_palette, '602')
	})

	it('ignores addresses it does not know, and slots out of range', () => {
		assert.equal(parseFeedback(message('/gelato/out/ping')), undefined)
		assert.equal(parseFeedback(message('/gelato/out/unknown', 1)), undefined)
		assert.equal(parseFeedback(message('/gelato/out/edited')), undefined, 'the old sentence address')
		assert.equal(parseFeedback(message('/gelato/out/edited/0', 'x')), undefined)
		assert.equal(parseFeedback(message('/gelato/out/edited/9', 'x')), undefined)
		assert.equal(parseFeedback(message('/gelato/out/edited/two', 'x')), undefined)
	})

	it('parses every address the table lists, with every variable it defines', () => {
		const seen = new Set<string>()
		for (const address of Object.keys(SINGLE)) {
			for (const id of Object.keys(parseFeedback(message(address)) ?? assert.fail(address))) seen.add(id)
		}
		for (const [address, list] of Object.entries(LISTS)) {
			seen.add(list.count.id)
			assert.ok(parseFeedback(message(`${address}/count`, 0)))
			for (let slot = 1; slot <= LIST_SLOTS; slot++) {
				for (const id of Object.keys(parseFeedback(message(`${address}/${slot}`)) ?? assert.fail(address))) seen.add(id)
			}
		}
		assert.deepEqual([...seen].sort(), Object.keys(variableDefinitions()).sort())
	})
})

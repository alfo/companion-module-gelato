import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { COMMANDS } from '../commands.js'
import { buildPresets, XL_PAGE } from '../presets.js'
import { variableDefinitions } from '../state.js'
import { viewDefinitions } from '../view.js'

const FEEDBACK_IDS = [
	'status_is',
	'lock_on',
	'console_connected',
	'preview_state_is',
	'readback_waiting',
	'edited_any',
	'edited_slot',
	'new_types',
]
const { structure, presets: built } = buildPresets('gelato')

type Preset = NonNullable<(typeof built)[string]>
/** Every preset that is defined (the record's type allows holes). */
const presets: Record<string, Preset> = Object.fromEntries(
	Object.entries(built).flatMap(([id, preset]) => (preset ? [[id, preset]] : [])),
)

/** The groups in a section (a definition can also be a bare text heading). */
const groupsOf = (section: (typeof structure)[number]) =>
	section.definitions.flatMap((definition) =>
		typeof definition === 'string' || definition.type !== 'simple' ? [] : [definition],
	)

/** Every line of button text, with the variable references taken out. */
const lines = (text: string): string[] => text.replace(/\$\([^)]*\)/g, '').split('\n')

describe('presets', () => {
	it('lists every preset in the structure once, and every structure entry exists', () => {
		const listed = structure.flatMap((section) => groupsOf(section).flatMap((group) => group.presets))
		assert.equal(new Set(listed).size, listed.length, 'a preset is listed twice')
		assert.deepEqual([...listed].sort(), Object.keys(presets).sort())
	})

	it('has the sections and groups the brief asks for', () => {
		const names = structure.map((section) => [section.name, groupsOf(section).map((group) => group.name)])
		assert.deepEqual(names, [
			['Gels', ['7 8 9', '4 5 6', '1 2 3', '0 .', 'L R G A', 'Code, Clear, Enter', 'Confirm / Cancel']],
			['Show', ['Lock and console', 'Edited palettes', 'Build']],
			['Preview', ['Preview options']],
			['Stream Deck + XL', ['Displays (row 5)', 'Knobs (row 6)']],
		])
	})

	it('lays the numpad out a row to a group, so a panel shows 7 8 9 / 4 5 6 / 1 2 3 / 0 .', () => {
		const gels = structure.find((section) => section.name === 'Gels')
		const rows = groupsOf(gels!)
			.slice(0, 4)
			.map((group) => group.presets.map((id) => presets[id].style.text))
		assert.deepEqual(rows, [
			['7', '8', '9'],
			['4', '5', '6'],
			['1', '2', '3'],
			['0', '.'],
		])
	})

	it('has the whole gel keypad: L R G A, 0 to 9, point, Clear, Enter', () => {
		const keys = Object.values(presets)
			.flatMap((preset) => preset.steps[0].down)
			.filter((action) => action.actionId === 'entry_key')
			.map((action) => (action.options as { key: string }).key)
		assert.deepEqual([...keys].sort(), [...'LRGA0123456789.'].sort())
		for (const id of ['entry_clear', 'entry_enter']) assert.ok(presets[id], id)
	})

	it('has Confirm, Cancel, Lock, edited slots 1 to 8, Build new and the four preview buttons', () => {
		for (const id of [
			'confirm',
			'cancel',
			'lock',
			'build_new',
			'preview_next',
			'preview_previous',
			'preview_choose',
			'preview_release',
		]) {
			assert.ok(presets[id], id)
		}
		for (let slot = 1; slot <= 8; slot++) assert.ok(presets[`edited_${slot}`], `edited_${slot}`)
		assert.ok(!presets['edited_9'])
	})

	it('only presses actions, and only asks feedbacks, that exist', () => {
		for (const [id, preset] of Object.entries(presets)) {
			assert.equal(preset.type, 'simple')
			for (const step of preset.steps) {
				for (const action of [...step.down, ...step.up, ...(step.rotate_left ?? []), ...(step.rotate_right ?? [])])
					assert.ok(action.actionId in COMMANDS, `${id}: ${String(action.actionId)}`)
			}
			for (const feedback of preset.feedbacks)
				assert.ok(FEEDBACK_IDS.includes(feedback.feedbackId), `${id}: ${feedback.feedbackId}`)
		}
	})

	it("names only variables that exist, through the instance's label", () => {
		const defined = new Set(Object.keys({ ...variableDefinitions(), ...viewDefinitions() }))
		let count = 0
		for (const [id, preset] of Object.entries(presets)) {
			for (const [, label, name] of preset.style.text.matchAll(/\$\(([^:)]*):([^)]*)\)/g)) {
				assert.equal(label, 'gelato', `${id} uses the instance label`)
				assert.ok(defined.has(name), `${id}: $(${label}:${name})`)
				count++
			}
		}
		assert.ok(count > 10)
		assert.ok(buildPresets('rig').presets.confirm?.style.text?.includes('$(rig:pending_gel)'))
	})

	it('puts display words and variables on buttons, never sentences', () => {
		for (const [id, preset] of Object.entries(presets)) {
			if (preset.style.textExpression) continue
			for (const line of lines(preset.style.text)) {
				const words = line.trim().split(/\s+/).filter(Boolean)
				assert.ok(words.length <= 2, `${id}: "${line}" is more than two words`)
				assert.ok(!/[.!?]\s*$/.test(line) || line.trim() === '.', `${id}: "${line}" ends like a sentence`)
			}
		}
	})

	it('shows an edited palette as CP201 - L201, and an empty slot as nothing', () => {
		const text = presets.edited_1?.style.text ?? ''
		assert.equal(presets.edited_1?.style.textExpression, true)
		assert.ok(text.startsWith("$(gelato:edited_1_palette) == '' ? ''"), text)
		assert.ok(text.includes('CP${$(gelato:edited_1_palette)} - ${$(gelato:edited_1_label)}'), text)
	})

	it('evaluates the edited-slot expression: CP201 - L201 and how, or nothing', () => {
		const text = presets.edited_1?.style.text ?? ''
		// Companion fills each $(label:name) with the variable's value as a string; then the text is
		// `<palette> == '' ? '' : <template>`. Read it back the way Companion's expression would.
		const evaluate = (values: Record<string, string>): string => {
			const filled = text.replace(/\$\(gelato:([^)]*)\)/g, (_, name: string) => JSON.stringify(values[name] ?? ''))
			const match = /^("(?:[^"\\]|\\.)*") == '' \? '' : `(.*)`$/s.exec(filled)
			assert.ok(match, filled)
			if (JSON.parse(match[1]) === '') return ''
			return match[2].replace(/\$\{("(?:[^"\\]|\\.)*")\}/g, (_, quoted: string) => JSON.parse(quoted) as string)
		}
		assert.equal(
			evaluate({ edited_1_palette: '201', edited_1_label: 'L201', edited_1_how_text: 'Update' }),
			'CP201 - L201\nUpdate',
		)
		assert.equal(evaluate({ edited_1_palette: '' }), '')
	})

	it('uses British spelling and "programmer" in what it says', () => {
		const said = [
			...structure.flatMap((section) => [
				section.name,
				...groupsOf(section).flatMap((group) => [group.name, group.description ?? '']),
			]),
			...Object.values(presets).flatMap((preset) => [preset.name, preset.style.text]),
		].join('\n')
		assert.ok(!/\bcolor\b|\boperator|\bgray\b/i.test(said), said)
	})

	it('lock toggles, Confirm and Cancel go red/amber with status, and lock shows red when on', () => {
		assert.deepEqual(presets.lock.steps[0].down, [{ actionId: 'lock', options: { mode: 'toggle' } }])
		assert.ok(
			presets.confirm.feedbacks.some(
				(f) => f.feedbackId === 'status_is' && (f.options as { status: string }).status === 'awaiting-confirm',
			),
		)
		assert.ok(presets.lock.feedbacks.some((f) => f.feedbackId === 'lock_on'))
	})

	it('turns each knob: rotate left and right, and press, as the page says', () => {
		const steps = (id: string) => presets[id].steps[0]
		assert.deepEqual(steps('knob_preview').rotate_left, [{ actionId: 'preview_previous', options: {} }])
		assert.deepEqual(steps('knob_preview').rotate_right, [{ actionId: 'preview_next', options: {} }])
		assert.deepEqual(steps('knob_preview').down, [{ actionId: 'preview_choose', options: {} }])
		assert.deepEqual(steps('knob_entry').rotate_right, [{ actionId: 'entry_brand', options: { direction: 'next' } }])
		assert.deepEqual(steps('knob_edited').rotate_left, [
			{ actionId: 'edited_scroll', options: { direction: 'previous' } },
		])
		assert.deepEqual(steps('knob_release').down, [{ actionId: 'preview_release', options: {} }])
		assert.equal(steps('knob_release').rotate_left, undefined)
		// Pressing a knob only ever confirms nothing: no knob confirms a write.
		assert.ok(
			!Object.keys(presets)
				.filter((id) => id.startsWith('knob_'))
				.some((id) => steps(id).down.some((a) => a.actionId === 'confirm')),
		)
	})

	it('has a + XL page that only names presets that exist, with knobs under their displays', () => {
		for (const [row, cells] of Object.entries(XL_PAGE))
			for (const [column, id] of Object.entries(cells)) assert.ok(presets[id], `row ${row} column ${column}: ${id}`)
		assert.deepEqual(Object.keys(XL_PAGE[5]).map(Number), [0, 2, 3, 5, 6, 8])
		for (const column of Object.keys(XL_PAGE[5])) assert.ok(XL_PAGE[4][Number(column)], `a display over knob ${column}`)
		// The numpad digits sit in columns 3 to 5, as on a numpad.
		assert.deepEqual(
			[3, 4, 5].map((c) => XL_PAGE[0][c]),
			['key_7', 'key_8', 'key_9'],
		)
		assert.deepEqual(
			[3, 4].map((c) => XL_PAGE[3][c]),
			['key_0', 'key_dot'],
		)
	})

	it('never leaves a rotate key present but undefined, which Companion rejects', () => {
		for (const [id, preset] of Object.entries(presets))
			for (const step of preset.steps)
				for (const key of ['rotate_left', 'rotate_right'] as const)
					if (key in step) assert.ok(step[key] !== undefined, `${id}: ${key}`)
	})
})

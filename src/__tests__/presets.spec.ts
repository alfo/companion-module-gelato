import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { COMMANDS } from '../commands.js'
import { buildPresets } from '../presets.js'
import { variableDefinitions } from '../state.js'

const FEEDBACK_IDS = [
	'status_is',
	'lock_on',
	'console_connected',
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
			['Gels', ['Gel keypad', 'Confirm / Cancel']],
			['Show', ['Lock and console', 'Edited palettes', 'Build']],
			['Preview', ['Preview options']],
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
				for (const action of [...step.down, ...step.up])
					assert.ok(action.actionId in COMMANDS, `${id}: ${String(action.actionId)}`)
			}
			for (const feedback of preset.feedbacks)
				assert.ok(FEEDBACK_IDS.includes(feedback.feedbackId), `${id}: ${feedback.feedbackId}`)
		}
	})

	it("names only variables that exist, through the instance's label", () => {
		const defined = new Set(Object.keys(variableDefinitions()))
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
})

import { combineRgb, type CompanionPresetDefinitions, type CompanionPresetSection } from '@companion-module/base'
import type ModuleInstance from './main.js'
import type { ModuleSchema } from './main.js'
import { COLOURS } from './feedbacks.js'
import { LIST_SLOTS } from './state.js'

type Presets = CompanionPresetDefinitions<ModuleSchema>
type Preset = NonNullable<Presets[string]>
type Feedback = Preset['feedbacks'][number]
type Action = Preset['steps'][number]['down'][number]

const KEY_BG = COLOURS.grey
const BRAND_BG = combineRgb(30, 50, 80)

/**
 * The presets and how they're laid out. `label` is the instance's label, which variable
 * references in button text go through (`$(gelato:status_text)`). Button text is display words
 * and variables only, never a sentence.
 */
export function buildPresets(label: string): { structure: CompanionPresetSection<ModuleSchema>[]; presets: Presets } {
	const v = (id: string): string => `$(${label}:${id})`
	const presets: Presets = {}

	const add = (
		id: string,
		name: string,
		text: string,
		options: {
			actions?: Action[]
			feedbacks?: Feedback[]
			bgcolor?: number
			color?: number
			size?: 'auto' | '14' | '18' | '24' | '30' | '44'
		} = {},
	): string => {
		presets[id] = {
			type: 'simple',
			name,
			style: {
				text,
				size: options.size ?? 'auto',
				color: options.color ?? COLOURS.white,
				bgcolor: options.bgcolor ?? KEY_BG,
				show_topbar: false,
			},
			steps: [{ down: options.actions ?? [], up: [] }],
			feedbacks: options.feedbacks ?? [],
		}
		return id
	}

	const press = (actionId: Action['actionId'], options: Record<string, unknown> = {}): Action[] =>
		[{ actionId, options }] as Action[]

	const statusColour = (
		status: 'awaiting-confirm' | 'writing' | 'error',
		bgcolor: number,
		color: number,
	): Feedback => ({
		feedbackId: 'status_is',
		options: { status },
		style: { bgcolor, color },
	})

	// Gel keypad
	const keys = ['L', 'R', 'G', 'A', '7', '8', '9', '4', '5', '6', '1', '2', '3', '0', '.']
	const keypad = [
		add('entry_display', 'Code being typed', `CODE\n${v('entry')}`, { size: '18', bgcolor: COLOURS.black }),
		...keys.map((key) =>
			add(`key_${key === '.' ? 'dot' : key}`, `Key ${key}`, key, {
				actions: press('entry_key', { key }),
				bgcolor: 'LRGA'.includes(key) ? BRAND_BG : KEY_BG,
				size: '44',
			}),
		),
		add('entry_clear', 'Clear', 'CLEAR', { actions: press('entry_clear'), size: '18' }),
		add('entry_enter', 'Enter', 'ENTER', {
			actions: press('entry_enter'),
			size: '18',
			bgcolor: COLOURS.green,
		}),
	]

	// Confirm / Cancel
	const confirm = [
		add('confirm', 'Confirm', `CONFIRM\n${v('pending_gel')}${v('pending_template')}\n${v('pending_kind_text')}`, {
			actions: press('confirm'),
			feedbacks: [
				statusColour('awaiting-confirm', COLOURS.amber, COLOURS.black),
				statusColour('writing', COLOURS.blue, COLOURS.white),
				statusColour('error', COLOURS.red, COLOURS.white),
			],
		}),
		add('cancel', 'Cancel', 'CANCEL', {
			actions: press('cancel'),
			feedbacks: [statusColour('awaiting-confirm', COLOURS.red, COLOURS.white)],
		}),
		add('status', 'Status', v('status_text'), {
			feedbacks: [
				statusColour('awaiting-confirm', COLOURS.amber, COLOURS.black),
				statusColour('writing', COLOURS.blue, COLOURS.white),
				statusColour('error', COLOURS.red, COLOURS.white),
			],
		}),
		add('progress', 'Progress', `${v('progress_done')} / ${v('progress_total')}`, {
			feedbacks: [statusColour('writing', COLOURS.blue, COLOURS.white)],
		}),
		add('last', 'Last result', `${v('last_result_text')}\n${v('last_gel')}\n${v('last_reason_text')}`),
	]

	// Lock, console and readback
	const state = [
		add('lock', 'Lock', 'LOCK', {
			actions: press('lock', { mode: 'toggle' }),
			size: '24',
			feedbacks: [{ feedbackId: 'lock_on', options: {}, style: { bgcolor: COLOURS.red, color: COLOURS.white } }],
		}),
		add('console', 'Console', 'CONSOLE', {
			size: '18',
			feedbacks: [
				{ feedbackId: 'console_connected', options: {}, style: { bgcolor: COLOURS.green, color: COLOURS.white } },
			],
		}),
		add('readback', 'Readback', `READBACK\n${v('readback_state_text')}`, {
			feedbacks: [
				{ feedbackId: 'readback_waiting', options: {}, style: { bgcolor: COLOURS.amber, color: COLOURS.black } },
			],
		}),
		add('ping', 'Ping', 'PING', { actions: press('ping'), size: '18' }),
	]

	// Edited palettes
	const edited = [
		add('edited_count', 'Edited palettes', `EDITED\n${v('edited_count')}`, {
			feedbacks: [{ feedbackId: 'edited_any', options: {}, style: { bgcolor: COLOURS.amber, color: COLOURS.black } }],
		}),
	]
	for (let slot = 1; slot <= LIST_SLOTS; slot++) {
		edited.push(
			add(
				`edited_${slot}`,
				`Edited palette ${slot}`,
				`${v(`edited_${slot}_palette`)}\n${v(`edited_${slot}_how_text`)}`,
				{
					feedbacks: [
						{ feedbackId: 'edited_slot', options: { slot }, style: { bgcolor: COLOURS.amber, color: COLOURS.black } },
					],
				},
			),
		)
	}

	// Build
	const build = [
		add('build_new', 'Build new types', `BUILD NEW\n${v('build_new_count')}`, {
			actions: press('build_new'),
			feedbacks: [{ feedbackId: 'new_types', options: {}, style: { bgcolor: COLOURS.amber, color: COLOURS.black } }],
		}),
		add('build_rerun', 'Re-run build', 'RE-RUN\nBUILD', { actions: press('build_rerun') }),
	]

	// Preview
	const preview = [
		add(
			'preview_info',
			'Preview option',
			`${v('preview_type')}\n${v('preview_option')} / ${v('preview_of')}\n${v('preview_gel')}`,
			{
				bgcolor: COLOURS.black,
			},
		),
		add('preview_previous', 'Preview previous', 'PREVIOUS', { actions: press('preview_previous'), size: '18' }),
		add('preview_next', 'Preview next', 'NEXT', { actions: press('preview_next'), size: '18' }),
		add('preview_choose', 'Preview choose', 'CHOOSE', {
			actions: press('preview_choose'),
			size: '18',
			bgcolor: COLOURS.green,
		}),
		add('preview_release', 'Preview release', 'RELEASE', { actions: press('preview_release'), size: '18' }),
	]

	const group = (id: string, name: string, ids: string[], description?: string) => ({
		id,
		name,
		description,
		type: 'simple' as const,
		presets: ids,
	})

	const structure: CompanionPresetSection<ModuleSchema>[] = [
		{
			id: 'gels',
			name: 'Gels',
			definitions: [
				group('keypad', 'Gel keypad', keypad, 'Type a code from the keys, then Enter.'),
				group('confirm', 'Confirm / Cancel', confirm, 'What is pending, and the result.'),
			],
		},
		{
			id: 'show',
			name: 'Show',
			definitions: [
				group('state', 'Lock and console', state),
				group('edited', 'Edited palettes', edited, 'Palettes Gelato wrote that were changed on the console.'),
				group('build', 'Build', build),
			],
		},
		{ id: 'preview', name: 'Preview', definitions: [group('preview', 'Preview options', preview)] },
	]

	return { structure, presets }
}

export function UpdatePresets(self: ModuleInstance): void {
	const { structure, presets } = buildPresets(self.label)
	self.setPresetDefinitions(structure, presets)
}

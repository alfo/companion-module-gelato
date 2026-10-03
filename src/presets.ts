import { combineRgb, type CompanionPresetDefinitions, type CompanionPresetSection } from '@companion-module/base'
import type ModuleInstance from './main.js'
import type { ModuleSchema } from './main.js'
import { COLOURS } from './feedbacks.js'
import { BRAND_KEYS } from './commands.js'
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
			size?: '14' | '18' | '24' | '30' | '44' | 12
			/** The text is an expression, not literal text with variable references. */
			expression?: boolean
		} = {},
	): string => {
		presets[id] = {
			type: 'simple',
			name,
			style: {
				text,
				size: options.size ?? '14',
				textExpression: options.expression ?? false,
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

	const lockFeedback: Feedback = {
		feedbackId: 'lock_on',
		options: {},
		style: { bgcolor: COLOURS.red, color: COLOURS.white },
	}
	const statusColours = [
		statusColour('awaiting-confirm', COLOURS.amber, COLOURS.black),
		statusColour('writing', COLOURS.blue, COLOURS.white),
		statusColour('error', COLOURS.red, COLOURS.white),
	]

	// Gel keypad: one group per row of the numpad, so a panel 3 wide or more shows a numpad
	const keyPreset = (key: string): string =>
		add(`key_${key === '.' ? 'dot' : key}`, `Key ${key}`, key, {
			actions: press('entry_key', { key }),
			bgcolor: BRAND_KEYS.includes(key) ? BRAND_BG : KEY_BG,
			size: '44',
		})
	const numpad = [
		['7', '8', '9'],
		['4', '5', '6'],
		['1', '2', '3'],
		['0', '.'],
	].map((row) => row.map(keyPreset))
	const brands = BRAND_KEYS.map(keyPreset)
	const entry = [
		add('entry_display', 'Code being typed', `CODE\n${v('entry')}`, { size: '18', bgcolor: COLOURS.black }),
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
			feedbacks: statusColours,
		}),
		add('cancel', 'Cancel', 'CANCEL', {
			actions: press('cancel'),
			feedbacks: [statusColour('awaiting-confirm', COLOURS.red, COLOURS.white)],
		}),
		add('status', 'Status', v('status_text'), { feedbacks: statusColours }),
		add('progress', 'Progress', `${v('progress_done')} / ${v('progress_total')}`, {
			size: '18',
			feedbacks: [statusColour('writing', COLOURS.blue, COLOURS.white)],
		}),
		add('last', 'Last result', `${v('last_result_text')}\n${v('last_gel')}\n${v('last_reason_text')}`),
	]

	// Lock, console and readback
	const state = [
		add('lock', 'Lock', 'LOCK', {
			actions: press('lock', { mode: 'toggle' }),
			size: '24',
			feedbacks: [lockFeedback],
		}),
		add('console', 'Console', 'CONSOLE', {
			size: 12,
			feedbacks: [
				{ feedbackId: 'console_connected', options: {}, style: { bgcolor: COLOURS.green, color: COLOURS.white } },
			],
		}),
		add('readback', 'Readback', `READ\nBACK\n${v('readback_state_text')}`, {
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
				// A palette reads as CP201 - L201; an empty slot reads as nothing.
				`${v(`edited_${slot}_palette`)} == '' ? '' : \`CP\${${v(`edited_${slot}_palette`)}} - \${${v(`edited_${slot}_label`)}}\n\${${v(`edited_${slot}_how_text`)}}\``,
				{
					expression: true,
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
		add(
			'preview_state',
			'Preview state and reason',
			`PREVIEW\n${v('preview_state_text')}\n${v('preview_reason_text')}`,
			{
				bgcolor: COLOURS.black,
				feedbacks: [
					{
						feedbackId: 'preview_state_is',
						options: { state: 'previewing' },
						style: { bgcolor: COLOURS.green, color: COLOURS.white },
					},
					{
						feedbackId: 'preview_state_is',
						options: { state: 'refused' },
						style: { bgcolor: COLOURS.red, color: COLOURS.white },
					},
				],
			},
		),
		add('preview_previous', 'Preview previous', 'PREVIOUS', { actions: press('preview_previous'), size: 12 }),
		add('preview_next', 'Preview next', 'NEXT', { actions: press('preview_next'), size: '18' }),
		add('preview_choose', 'Preview choose', 'CHOOSE', {
			actions: press('preview_choose'),
			bgcolor: COLOURS.green,
		}),
		add('preview_release', 'Preview release', 'RELEASE', { actions: press('preview_release'), size: 12 }),
	]

	// Stream Deck + XL, row 5: displays (live status, always in view). Row 6: the knob under each
	// display, which turns and presses. Their key text is for Companion's grid; the knobs show nothing.
	const display = (id: string, name: string, text: string, options: Parameters<typeof add>[3] = {}): string =>
		add(id, name, text, { size: '14', bgcolor: COLOURS.black, ...options })
	const knob = (
		id: string,
		name: string,
		text: string,
		steps: { down?: Action[]; rotate_left?: Action[]; rotate_right?: Action[] },
	): string => {
		add(id, name, text, { size: '14', bgcolor: BRAND_BG })
		// Companion rejects a step whose rotate_left or rotate_right is present but undefined.
		presets[id]!.steps = [
			{
				down: steps.down ?? [],
				up: [],
				...(steps.rotate_left && { rotate_left: steps.rotate_left }),
				...(steps.rotate_right && { rotate_right: steps.rotate_right }),
			},
		]
		return id
	}
	const displays = [
		display('display_entry', 'Display: code being typed', `CODE\n${v('entry')}`, { size: '18' }),
		display(
			'display_pending',
			'Display: pending',
			`${v('pending_kind')} == '' ? \`PENDING\n\${${v('status_text')}}\` : \`\${${v('pending_kind_text')}}\n\${${v('pending_gel')}}\${${v('pending_template')}}\nGHOSTS \${${v('pending_ghosts')}}\``,
			{ expression: true, feedbacks: statusColours },
		),
		display(
			'display_preview',
			'Display: preview',
			`${v('preview_type')}\n${v('preview_option')} / ${v('preview_of')}\n${v('preview_gel')}`,
		),
		display('display_release', 'Display: release', `RELEASE\n${v('preview_type')}`),
		display(
			'display_console',
			'Display: console and readback',
			`CONSOLE\n${v('readback_state_text')}\n${v('readback_reason_text')}`,
			{
				actions: press('ping'),
				size: 12,
				feedbacks: [
					{ feedbackId: 'console_connected', options: {}, style: { bgcolor: COLOURS.green, color: COLOURS.white } },
					{ feedbackId: 'readback_waiting', options: {}, style: { bgcolor: COLOURS.amber, color: COLOURS.black } },
				],
			},
		),
		display(
			'display_edited',
			'Display: edited palette shown',
			`${v('edited_shown_palette')} == '' ? \`EDITED\n\${${v('edited_count')}}\` : \`CP\${${v('edited_shown_palette')}} - \${${v('edited_shown_label')}}\n\${${v('edited_shown_how_text')}}\n\${${v('edited_shown')}} / \${${v('edited_count')}}\``,
			{
				expression: true,
				feedbacks: [{ feedbackId: 'edited_any', options: {}, style: { bgcolor: COLOURS.amber, color: COLOURS.black } }],
			},
		),
		display('display_build', 'Display: build', `BUILD NEW\n${v('build_new_count')}`, {
			feedbacks: [{ feedbackId: 'new_types', options: {}, style: { bgcolor: COLOURS.amber, color: COLOURS.black } }],
		}),
		display(
			'display_last',
			'Display: last result',
			`${v('last_result_text')}\n${v('last_gel')}\n${v('last_reason_text')}`,
		),
		display('display_lock', 'Display: lock', 'LOCK', { size: '24', feedbacks: [lockFeedback] }),
	]
	const knobs = [
		knob('knob_entry', 'Knob: brand, press to clear', 'BRAND\nPRESS CLEAR', {
			down: press('entry_clear'),
			rotate_left: press('entry_brand', { direction: 'previous' }),
			rotate_right: press('entry_brand', { direction: 'next' }),
		}),
		knob('knob_preview', 'Knob: preview, press to choose', 'PREV-NEXT\nPRESS CHOOSE', {
			down: press('preview_choose'),
			rotate_left: press('preview_previous'),
			rotate_right: press('preview_next'),
		}),
		knob('knob_release', 'Knob: press to release', 'PRESS\nRELEASE', { down: press('preview_release') }),
		knob('knob_edited', 'Knob: scroll edited palettes, press for the first', 'SCROLL\nPRESS FIRST', {
			down: press('edited_scroll', { direction: 'first' }),
			rotate_left: press('edited_scroll', { direction: 'previous' }),
			rotate_right: press('edited_scroll', { direction: 'next' }),
		}),
		knob('knob_build', 'Knob: press to build new types', 'PRESS\nBUILD NEW', { down: press('build_new') }),
		knob('knob_lock', 'Knob: press to toggle the lock', 'PRESS\nLOCK', { down: press('lock', { mode: 'toggle' }) }),
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
				group('numpad_789', '7 8 9', numpad[0], 'The numpad, a row to a group: 7 8 9, 4 5 6, 1 2 3, 0 .'),
				group('numpad_456', '4 5 6', numpad[1]),
				group('numpad_123', '1 2 3', numpad[2]),
				group('numpad_0', '0 .', numpad[3]),
				group('brands', 'L R SG CG G A', brands, 'The brand keys, which start a new code.'),
				group('entry', 'Code, Clear, Enter', entry, 'Type a code from the keys, then Enter.'),
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
		{
			id: 'xl',
			name: 'Stream Deck + XL',
			definitions: [
				group(
					'xl_displays',
					'Displays (row 5)',
					displays,
					'Live status for the + XL display strip. Three sit between knobs.',
				),
				group('xl_knobs', 'Knobs (row 6)', knobs, 'Turn and press, one under each display that has a knob.'),
			],
		},
	]

	return { structure, presets }
}

/**
 * The Stream Deck + XL page: preset ids by [row][column], 0-indexed, in Companion's grid. Rows 0 to 3
 * are the keys, row 4 the nine display cells, row 5 the six knobs, under display columns 0, 2, 3, 5,
 * 6 and 8 (the cells between knobs, 1, 4 and 7, are displays only). The digits are a clean numpad
 * in columns 3 to 5; the six brand keys fill the top two rows of columns 0 to 2 in their stepping
 * order, and Clear and Enter sit beside 0 and the point.
 */
export const XL_PAGE: Record<number, Record<number, string>> = {
	0: {
		0: 'key_L',
		1: 'key_R',
		2: 'key_SG',
		3: 'key_7',
		4: 'key_8',
		5: 'key_9',
		6: 'confirm',
		7: 'cancel',
		8: 'lock',
	},
	1: {
		0: 'key_CG',
		1: 'key_G',
		2: 'key_A',
		3: 'key_4',
		4: 'key_5',
		5: 'key_6',
		6: 'preview_previous',
		7: 'preview_next',
		8: 'preview_choose',
	},
	2: {
		0: 'edited_1',
		1: 'edited_2',
		2: 'edited_3',
		3: 'key_1',
		4: 'key_2',
		5: 'key_3',
		6: 'preview_release',
		7: 'build_new',
		8: 'build_rerun',
	},
	3: {
		0: 'edited_4',
		1: 'edited_5',
		2: 'edited_6',
		3: 'key_0',
		4: 'key_dot',
		5: 'entry_clear',
		6: 'entry_enter',
		8: 'ping',
	},
	4: {
		0: 'display_entry',
		1: 'display_pending',
		2: 'display_preview',
		3: 'display_release',
		4: 'display_console',
		5: 'display_edited',
		6: 'display_build',
		7: 'display_last',
		8: 'display_lock',
	},
	5: { 0: 'knob_entry', 2: 'knob_preview', 3: 'knob_release', 5: 'knob_edited', 6: 'knob_build', 8: 'knob_lock' },
}

export function UpdatePresets(self: ModuleInstance): void {
	const { structure, presets } = buildPresets(self.label)
	self.setPresetDefinitions(structure, presets)
}

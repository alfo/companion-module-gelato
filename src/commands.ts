/**
 * Every `/gelato/...` command in docs/spec.md → "Remote control over OSC", as a Companion
 * action: its options, and the OSC message it sends.
 */
import type { SomeCompanionActionInputField } from '@companion-module/base'
import type { VariableValues } from './state.js'
import type { ScrollDirection } from './view.js'

export interface OSCCommand {
	address: string
	args: (string | number)[]
}

export type BrandId = 'lee' | 'rosco' | 'supergel' | 'roscoother' | 'gam' | 'apollo'

export const BRANDS: { id: BrandId; label: string }[] = [
	{ id: 'lee', label: 'Lee (L)' },
	{ id: 'rosco', label: 'Roscolux (R)' },
	{ id: 'supergel', label: 'Rosco Supergel (SG)' },
	{ id: 'roscoother', label: 'Rosco Other (CG)' },
	{ id: 'gam', label: 'GAM (G)' },
	{ id: 'apollo', label: 'Apollo (A)' },
]

/** The brand keys, in the order the brand step goes through them. */
export const BRAND_KEYS = ['L', 'R', 'SG', 'CG', 'G', 'A']

export const ENTRY_KEYS = [...BRAND_KEYS, '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '.']

export type ActionsSchema = {
	add_colour: { options: { code: string } }
	add_colour_brand: { options: { brand: BrandId; number: string } }
	entry_key: { options: { key: string } }
	entry_brand: { options: { direction: 'next' | 'previous' } }
	entry_clear: { options: Record<string, never> }
	entry_enter: { options: Record<string, never> }
	confirm: { options: Record<string, never> }
	cancel: { options: Record<string, never> }
	lock: { options: { mode: 'on' | 'off' | 'toggle' } }
	template_apply: { options: { name: string } }
	build_rerun: { options: Record<string, never> }
	build_new: { options: Record<string, never> }
	preview_option: { options: { option: number } }
	preview_next: { options: Record<string, never> }
	preview_previous: { options: Record<string, never> }
	preview_choose: { options: Record<string, never> }
	preview_release: { options: Record<string, never> }
	ping: { options: Record<string, never> }
	edited_scroll: { options: { direction: ScrollDirection } }
}

type ActionId = keyof ActionsSchema

export interface CommandDefinition<K extends ActionId = ActionId> {
	name: string
	description?: string
	options: SomeCompanionActionInputField<string>[]
	/** Sends nothing: changes what the module shows (the edited palette a knob has scrolled to). */
	local?: boolean
	/** The message to send, or undefined when the options can't make one (nothing is sent). */
	toOSC: (options: ActionsSchema[K]['options'], variables: VariableValues) => OSCCommand | undefined
}

const none = <K extends ActionId>(address: string, name: string, description?: string): CommandDefinition<K> => ({
	name,
	description,
	options: [],
	toOSC: () => ({ address, args: [] }),
})

/**
 * Palette and gel numbers go as an int when they are one that fits an OSC int32 (`602`), else as
 * text (`0.1`, or a number too large for an int, which Gelato will reject as a number).
 */
export function numberArgument(text: string): string | number {
	const trimmed = text.trim()
	if (!/^\d+$/.test(trimmed)) return trimmed
	const number = Number(trimmed)
	return number <= 2_147_483_647 ? number : trimmed
}

export const COMMANDS: { [K in ActionId]: CommandDefinition<K> } = {
	add_colour: {
		name: 'Add colour (gel code)',
		description: 'Adds a colour live, as the tech panel does. A write waits for Confirm unless Gelato skips it.',
		options: [
			{
				id: 'code',
				type: 'textinput',
				label: 'Gel code',
				default: 'L201',
				useVariables: true,
				tooltip: 'A brand and number, such as L201, R4590, SG6, CG3203 or G202',
			},
		],
		toOSC: ({ code }) =>
			String(code).trim() === '' ? undefined : { address: '/gelato/colour/add', args: [String(code).trim()] },
	},
	add_colour_brand: {
		name: 'Add colour (brand and number)',
		description: 'Same as Add colour, with the brand chosen from a list.',
		options: [
			{
				id: 'brand',
				type: 'dropdown',
				label: 'Brand',
				default: 'lee',
				choices: BRANDS,
			},
			{ id: 'number', type: 'textinput', label: 'Number', default: '201', useVariables: true },
		],
		toOSC: ({ brand, number }) =>
			String(number).trim() === ''
				? undefined
				: { address: `/gelato/colour/add/${brand}`, args: [numberArgument(String(number))] },
	},
	entry_key: {
		name: 'Entry: key',
		description: 'Adds one key to the code being typed. A brand key starts a new code.',
		options: [
			{
				id: 'key',
				type: 'dropdown',
				label: 'Key',
				default: 'L',
				choices: ENTRY_KEYS.map((key) => ({ id: key, label: key })),
			},
		],
		toOSC: ({ key }) => ({ address: '/gelato/entry/key', args: [String(key)] }),
	},
	entry_brand: {
		name: 'Entry: step the brand',
		description:
			'Moves L, R, SG, CG, G, A on to the next or previous brand, from the one being typed (L if none). Made for a knob.',
		options: [
			{
				id: 'direction',
				type: 'dropdown',
				label: 'Direction',
				default: 'next',
				choices: [
					{ id: 'next', label: 'Next' },
					{ id: 'previous', label: 'Previous' },
				],
			},
		],
		toOSC: ({ direction }, values) => {
			const typed = BRAND_KEYS.indexOf(/^(SG|CG|[LRGA])/.exec(String(values.entry ?? ''))?.[1] ?? '')
			const step = direction === 'previous' ? -1 : 1
			const index =
				typed < 0 ? (step > 0 ? 0 : BRAND_KEYS.length - 1) : (typed + step + BRAND_KEYS.length) % BRAND_KEYS.length
			return { address: '/gelato/entry/key', args: [BRAND_KEYS[index]] }
		},
	},
	entry_clear: none('/gelato/entry/clear', 'Entry: clear'),
	entry_enter: none('/gelato/entry/enter', 'Entry: enter', 'Submits the code that has been typed.'),
	confirm: none('/gelato/confirm', 'Confirm', 'Confirms the pending write.'),
	cancel: none('/gelato/cancel', 'Cancel', 'Cancels the pending write.'),
	lock: {
		name: 'Show-mode lock',
		description: 'While the lock is on, Gelato accepts nothing but unlocking.',
		options: [
			{
				id: 'mode',
				type: 'dropdown',
				label: 'Lock',
				default: 'toggle',
				choices: [
					{ id: 'on', label: 'On' },
					{ id: 'off', label: 'Off' },
					{ id: 'toggle', label: 'Toggle' },
				],
			},
		],
		toOSC: ({ mode }, variables) => {
			const on = mode === 'on' || (mode === 'toggle' && variables.locked !== 1)
			return { address: '/gelato/lock', args: [on ? 1 : 0] }
		},
	},
	template_apply: {
		name: 'Template: apply',
		description: "Writes a template's palettes to the current show. Waits for Confirm.",
		options: [{ id: 'name', type: 'textinput', label: 'Template name', default: '', useVariables: true }],
		toOSC: ({ name }) =>
			String(name).trim() === '' ? undefined : { address: '/gelato/template/apply', args: [String(name).trim()] },
	},
	build_rerun: none(
		'/gelato/build/rerun',
		'Build: re-run',
		'Re-runs the build with the last rig. Adds only what is missing.',
	),
	build_new: none(
		'/gelato/build/new',
		'Build: new types',
		'Ghosts and template palettes for the types patched since the last build, alone.',
	),
	preview_option: {
		name: 'Preview: option',
		description: "Types that option onto the programmer's command line, for the type the programmer has selected.",
		options: [{ id: 'option', type: 'number', label: 'Option', default: 1, min: 1, max: 99, asInteger: true }],
		toOSC: ({ option }) => ({ address: '/gelato/preview/option', args: [Math.max(1, Math.trunc(Number(option)))] }),
	},
	preview_next: none('/gelato/preview/next', 'Preview: next'),
	preview_previous: none('/gelato/preview/previous', 'Preview: previous'),
	preview_choose: none('/gelato/preview/choose', 'Preview: choose', 'Records the previewed option for this type.'),
	preview_release: none('/gelato/preview/release', 'Preview: release', 'Releases the preview channels.'),
	ping: none('/gelato/ping', 'Ping', 'Gelato replies with its full state.'),
	edited_scroll: {
		name: 'Edited palettes: scroll',
		description:
			'Shows the next or previous edited palette in the edited_shown variables, or the first. Made for a knob.',
		options: [
			{
				id: 'direction',
				type: 'dropdown',
				label: 'Direction',
				default: 'next',
				choices: [
					{ id: 'next', label: 'Next' },
					{ id: 'previous', label: 'Previous' },
					{ id: 'first', label: 'Back to the first' },
				],
			},
		],
		local: true,
		toOSC: () => undefined,
	},
}

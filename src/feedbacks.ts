import { combineRgb, type CompanionFeedbackDefinitions } from '@companion-module/base'
import type ModuleInstance from './main.js'
import { LIST_SLOTS, type VariableValues } from './state.js'

export type FeedbacksSchema = {
	status_is: { type: 'boolean'; options: { status: StatusCode } }
	lock_on: { type: 'boolean'; options: Record<string, never> }
	console_connected: { type: 'boolean'; options: Record<string, never> }
	readback_waiting: { type: 'boolean'; options: Record<string, never> }
	preview_state_is: { type: 'boolean'; options: { state: PreviewStateCode } }
	edited_any: { type: 'boolean'; options: Record<string, never> }
	edited_slot: { type: 'boolean'; options: { slot: number } }
	new_types: { type: 'boolean'; options: Record<string, never> }
}

export type StatusCode = 'idle' | 'awaiting-confirm' | 'writing' | 'error'

export type PreviewStateCode = 'previewing' | 'refused' | 'released' | 'idle'

export const COLOURS = {
	black: combineRgb(0, 0, 0),
	white: combineRgb(255, 255, 255),
	grey: combineRgb(40, 40, 40),
	amber: combineRgb(255, 160, 0),
	blue: combineRgb(0, 90, 200),
	red: combineRgb(200, 0, 0),
	green: combineRgb(0, 140, 60),
}

/** What each boolean feedback asks of the variables, apart from Companion. */
export const CHECKS = {
	status_is: (values: VariableValues, status: StatusCode): boolean => values.status === status,
	lock_on: (values: VariableValues): boolean => values.locked === 1,
	console_connected: (values: VariableValues): boolean => values.eos_connected === 1,
	readback_waiting: (values: VariableValues): boolean => values.readback_state === 'waiting',
	preview_state_is: (values: VariableValues, state: PreviewStateCode): boolean => values.preview_state === state,
	edited_any: (values: VariableValues): boolean => Number(values.edited_count) > 0,
	edited_slot: (values: VariableValues, slot: number): boolean =>
		values[`edited_${slot}_palette`] !== '' && values[`edited_${slot}_palette`] !== undefined,
	new_types: (values: VariableValues): boolean => Number(values.build_new_count) > 0,
}

export function UpdateFeedbacks(self: ModuleInstance): void {
	const definitions: CompanionFeedbackDefinitions<FeedbacksSchema> = {
		status_is: {
			type: 'boolean',
			name: 'Status is',
			description: 'Gelato is awaiting confirmation, writing, or in error',
			defaultStyle: { bgcolor: COLOURS.amber, color: COLOURS.black },
			options: [
				{
					id: 'status',
					type: 'dropdown',
					label: 'Status',
					default: 'awaiting-confirm',
					choices: [
						{ id: 'awaiting-confirm', label: 'Awaiting confirm' },
						{ id: 'writing', label: 'Writing' },
						{ id: 'error', label: 'Error' },
						{ id: 'idle', label: 'Idle' },
					],
				},
			],
			callback: ({ options }) => CHECKS.status_is(self.values, options.status),
		},
		lock_on: {
			type: 'boolean',
			name: 'Show-mode lock is on',
			defaultStyle: { bgcolor: COLOURS.red, color: COLOURS.white },
			options: [],
			callback: () => CHECKS.lock_on(self.values),
		},
		console_connected: {
			type: 'boolean',
			name: 'Console connected',
			description: 'Gelato is connected to the console',
			defaultStyle: { bgcolor: COLOURS.green, color: COLOURS.white },
			options: [],
			callback: () => CHECKS.console_connected(self.values),
		},
		readback_waiting: {
			type: 'boolean',
			name: 'Readback waiting',
			defaultStyle: { bgcolor: COLOURS.amber, color: COLOURS.black },
			options: [],
			callback: () => CHECKS.readback_waiting(self.values),
		},
		preview_state_is: {
			type: 'boolean',
			name: 'Preview state is',
			description: 'An option is on the light, the preview was refused, or it was released',
			defaultStyle: { bgcolor: COLOURS.green, color: COLOURS.white },
			options: [
				{
					id: 'state',
					type: 'dropdown',
					label: 'State',
					default: 'previewing',
					choices: [
						{ id: 'previewing', label: 'Previewing' },
						{ id: 'refused', label: 'Refused' },
						{ id: 'released', label: 'Released' },
						{ id: 'idle', label: 'Idle' },
					],
				},
			],
			callback: ({ options }) => CHECKS.preview_state_is(self.values, options.state),
		},
		edited_any: {
			type: 'boolean',
			name: 'Edited palettes: any',
			description: 'Palettes Gelato wrote were changed on the console',
			defaultStyle: { bgcolor: COLOURS.amber, color: COLOURS.black },
			options: [],
			callback: () => CHECKS.edited_any(self.values),
		},
		edited_slot: {
			type: 'boolean',
			name: 'Edited palettes: slot in use',
			options: [{ id: 'slot', type: 'number', label: 'Slot', default: 1, min: 1, max: LIST_SLOTS, asInteger: true }],
			defaultStyle: { bgcolor: COLOURS.amber, color: COLOURS.black },
			callback: ({ options }) => CHECKS.edited_slot(self.values, Number(options.slot)),
		},
		new_types: {
			type: 'boolean',
			name: 'New types in the rig',
			description: 'The rig has types with no ghost yet',
			defaultStyle: { bgcolor: COLOURS.amber, color: COLOURS.black },
			options: [],
			callback: () => CHECKS.new_types(self.values),
		},
	}
	self.setFeedbackDefinitions(definitions)
}

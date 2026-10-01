/**
 * Gelato's feedback (docs/spec.md → "Remote control over OSC", `/gelato/out/…`) as Companion
 * variables. Each address carries typed arguments; every code is followed by its display words.
 * The variables are the module's whole state: feedbacks and presets read them.
 */
import type { OSCMessage } from './osc.js'

export type VariableValues = Record<string, string | number>

/** How many slots a list address sends (`/1` … `/8`). */
export const LIST_SLOTS = 8

interface Field {
	/** Variable id (with `%` replaced by the slot number, for list slots). */
	id: string
	kind: 's' | 'i'
	/** The variable's name in Companion. */
	label: string
}

const s = (id: string, label: string): Field => ({ id, kind: 's', label })
const i = (id: string, label: string): Field => ({ id, kind: 'i', label })

/** Addresses with one message each, and the arguments in order. */
export const SINGLE: Record<string, Field[]> = {
	'/gelato/out/entry': [s('entry', 'Code being typed')],
	'/gelato/out/status': [s('status', 'Status code'), s('status_text', 'Status')],
	'/gelato/out/pending': [
		s('pending_kind', 'Pending kind code'),
		s('pending_kind_text', 'Pending kind'),
		s('pending_gel', 'Pending gel'),
		s('pending_palette', 'Pending palette number'),
		s('pending_label', 'Pending palette label'),
		s('pending_template', 'Pending build template'),
		i('pending_ghosts', 'Pending ghosts'),
		i('pending_gel_matches', 'Pending gel matches'),
		i('pending_palettes', 'Pending build palettes'),
		i('pending_presets', 'Pending build presets'),
	],
	'/gelato/out/last': [
		s('last_result', 'Last result code'),
		s('last_result_text', 'Last result'),
		s('last_reason', 'Last reason code'),
		s('last_reason_text', 'Last reason'),
		s('last_gel', 'Last gel'),
		s('last_palette', 'Last palette number'),
		s('last_label', 'Last palette label'),
		s('last_template', 'Last build template'),
	],
	'/gelato/out/eos/connected': [i('eos_connected', 'Console connected (1 or 0)')],
	'/gelato/out/lock': [i('locked', 'Lock on (1 or 0)')],
	'/gelato/out/preview': [
		s('preview_state', 'Preview state code'),
		s('preview_state_text', 'Preview state'),
		s('preview_reason', 'Preview reason code'),
		s('preview_reason_text', 'Preview reason'),
		s('preview_type', 'Preview fixture type'),
		i('preview_option', 'Preview option'),
		i('preview_of', 'Preview options in all'),
		s('preview_kind', 'Preview kind code'),
		s('preview_kind_text', 'Preview kind'),
		s('preview_gel', 'Preview gel'),
		s('preview_source', 'Preview source show'),
	],
	'/gelato/out/progress': [i('progress_done', 'Progress done'), i('progress_total', 'Progress total')],
	'/gelato/out/readback': [
		s('readback_state', 'Readback state code'),
		s('readback_state_text', 'Readback state'),
		s('readback_reason', 'Readback reason code'),
		s('readback_reason_text', 'Readback reason'),
		i('readback_user', 'Readback user'),
		i('readback_partition', 'Readback partition'),
	],
}

/** Lists: `<address>/count` plus slots `/1` … `/8`, newest first. */
export const LISTS: Record<string, { count: Field; slot: Field[] }> = {
	'/gelato/out/build/new': {
		count: i('build_new_count', 'New types'),
		slot: [s('build_new_%', 'New type %')],
	},
	'/gelato/out/edited': {
		count: i('edited_count', 'Edited palettes'),
		slot: [
			s('edited_%_palette', 'Edited %: palette number'),
			s('edited_%_label', 'Edited %: label'),
			s('edited_%_how', 'Edited %: how code'),
			s('edited_%_how_text', 'Edited %: how'),
			i('edited_%_user', 'Edited %: user'),
			i('edited_%_editing', 'Edited %: editing now (1 or 0)'),
		],
	},
}

const slotId = (field: Field, slot: number): string => field.id.replace('%', String(slot))
const slotLabel = (field: Field, slot: number): string => field.label.replace('%', String(slot))

/** Every variable the module has, with its name in Companion. */
export function variableDefinitions(): Record<string, { name: string }> {
	const definitions: Record<string, { name: string }> = {}
	for (const fields of Object.values(SINGLE)) {
		for (const field of fields) definitions[field.id] = { name: field.label }
	}
	for (const { count, slot } of Object.values(LISTS)) {
		definitions[count.id] = { name: count.label }
		for (let n = 1; n <= LIST_SLOTS; n++) {
			for (const field of slot) definitions[slotId(field, n)] = { name: slotLabel(field, n) }
		}
	}
	return definitions
}

const empty = (field: Field): string | number => (field.kind === 's' ? '' : 0)

/** Every variable cleared: what a button shows before Gelato has said anything, or once it's gone. */
export function initialValues(): VariableValues {
	const values: VariableValues = {}
	for (const fields of Object.values(SINGLE)) {
		for (const field of fields) values[field.id] = empty(field)
	}
	for (const { count, slot } of Object.values(LISTS)) {
		values[count.id] = 0
		for (let n = 1; n <= LIST_SLOTS; n++) {
			for (const field of slot) values[slotId(field, n)] = empty(field)
		}
	}
	return values
}

function text(argument: OSCMessage['args'][number] | undefined): string {
	if (typeof argument === 'string') return argument
	if (typeof argument === 'number') return String(argument)
	return ''
}

function integer(argument: OSCMessage['args'][number] | undefined): number {
	if (typeof argument === 'number') return Math.trunc(argument)
	if (typeof argument === 'boolean') return argument ? 1 : 0
	if (typeof argument === 'string' && argument.trim() !== '' && Number.isFinite(Number(argument))) {
		return Math.trunc(Number(argument))
	}
	return 0
}

function read(field: Field, argument: OSCMessage['args'][number] | undefined): string | number {
	return field.kind === 's' ? text(argument) : integer(argument)
}

/**
 * The variables one feedback message sets, or undefined for an address that isn't feedback the
 * module knows. A missing argument reads as empty or 0. A count also clears the slots past it,
 * so a list shrinks even if a datagram for a cleared slot is lost.
 */
export function parseFeedback(message: OSCMessage): VariableValues | undefined {
	const single = SINGLE[message.address]
	if (single) {
		const values: VariableValues = {}
		single.forEach((field, index) => (values[field.id] = read(field, message.args[index])))
		return values
	}

	for (const [address, list] of Object.entries(LISTS)) {
		if (message.address === `${address}/count`) {
			const count = Math.max(0, integer(message.args[0]))
			const values: VariableValues = { [list.count.id]: count }
			for (let n = count + 1; n <= LIST_SLOTS; n++) {
				for (const field of list.slot) values[slotId(field, n)] = empty(field)
			}
			return values
		}
		if (message.address.startsWith(`${address}/`)) {
			const n = Number(message.address.slice(address.length + 1))
			if (!Number.isInteger(n) || n < 1 || n > LIST_SLOTS) return undefined
			const values: VariableValues = {}
			list.slot.forEach((field, index) => (values[slotId(field, n)] = read(field, message.args[index])))
			return values
		}
	}
	return undefined
}

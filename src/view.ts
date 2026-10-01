/**
 * What the module shows beyond Gelato's own feedback: which edited palette a knob has scrolled
 * to. Companion has no state of its own, so the module keeps it and publishes it as variables
 * (`edited_shown_*`), which a display button reads. Nothing here goes to Gelato.
 */
import { LIST_SLOTS, type VariableValues } from './state.js'

export type ScrollDirection = 'next' | 'previous' | 'first'

/** Variables the module computes from Gelato's, for the display buttons. */
export function viewDefinitions(): Record<string, { name: string }> {
	return {
		edited_shown: { name: 'Edited palette shown (the slot a knob has scrolled to)' },
		edited_shown_palette: { name: 'Edited palette shown: palette number' },
		edited_shown_label: { name: 'Edited palette shown: label' },
		edited_shown_how_text: { name: 'Edited palette shown: how' },
		edited_shown_user: { name: 'Edited palette shown: user' },
	}
}

/** The slot after scrolling: round the used slots (the count), never past them. */
export function scrolled(shown: number, count: number, direction: ScrollDirection): number {
	const used = Math.min(Math.max(count, 1), LIST_SLOTS)
	if (direction === 'first') return 1
	const step = direction === 'next' ? 1 : -1
	return ((((Math.min(shown, used) - 1 + step) % used) + used) % used) + 1
}

/** The `edited_shown_*` variables for the slot shown, clamped to the slots in use. */
export function viewValues(values: VariableValues, shown: number): VariableValues {
	const count = Number(values.edited_count) || 0
	const slot = Math.min(Math.max(shown, 1), Math.max(count, 1), LIST_SLOTS)
	return {
		edited_shown: count === 0 ? 0 : slot,
		edited_shown_palette: values[`edited_${slot}_palette`] ?? '',
		edited_shown_label: values[`edited_${slot}_label`] ?? '',
		edited_shown_how_text: values[`edited_${slot}_how_text`] ?? '',
		edited_shown_user: values[`edited_${slot}_user`] ?? 0,
	}
}

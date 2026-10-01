/**
 * The Stream Deck + XL page as a file Companion imports (Import / Export ▸ Import page). It is
 * made from the presets, so the page and the presets cannot drift apart: `yarn page` writes
 * `pages/stream-deck-plus-xl.companionconfig`, and a test fails if the file is out of date.
 *
 * The shape is Companion 5's page export (version 12, `button-layered` controls), read from a
 * real export. Presets give a font size in the old units; Companion's layered buttons use 5/3 of
 * that.
 */
import { buildPresets, XL_PAGE } from './presets.js'

const CONNECTION_ID = 'gelato-connection'
/** The label the presets name their variables by. The README tells people to use it. */
export const PAGE_LABEL = 'Gelato'

const plain = <T>(value: T) => ({ value, isExpression: false })

type Preset = NonNullable<ReturnType<typeof buildPresets>['presets'][string]>

const fontSize = (size: Preset['style']['size']): number => Math.round((Number(size) * 5 * 10) / 3) / 10

function layers(style: Preset['style']) {
	const layer = (id: string, name: string, type: string, rest: Record<string, unknown>) => ({
		id,
		name,
		usage: 'auto',
		type,
		enabled: plain(true),
		opacity: plain(100),
		x: plain(0),
		y: plain(0),
		width: plain(100),
		height: plain(100),
		rotation: plain(0),
		...rest,
	})
	return [
		{
			id: 'canvas',
			name: 'Canvas',
			usage: 'auto',
			type: 'canvas',
			decoration: plain('border'),
			showStatusIcons: plain('default'),
		},
		layer('box0', 'Background', 'box', {
			color: plain(style.bgcolor),
			borderWidth: plain(0),
			borderColor: plain(0),
			borderPosition: plain('inside'),
		}),
		layer('image0', 'Image', 'image', {
			base64Image: plain(null),
			halign: plain('center'),
			valign: plain('center'),
			fillMode: plain('fit'),
		}),
		layer('text0', 'Text', 'text', {
			text: { isExpression: style.textExpression === true, value: style.text },
			color: plain(style.color),
			halign: plain('center'),
			valign: plain('center'),
			fontsize: plain(fontSize(style.size)),
			fontsizeAllowShrink: plain(false),
			font: plain('companion-sans'),
			outlineColor: plain(0xff000000),
		}),
	]
}

const wrapOptions = (options: Record<string, unknown> = {}) =>
	Object.fromEntries(Object.entries(options).map(([name, value]) => [name, plain(value)]))

function control(id: string, preset: Preset) {
	const step = preset.steps[0]
	const actions = (list: typeof step.down, set: string) =>
		list.map((action, index) => ({
			type: 'action',
			id: `${id}-${set}-${index}`,
			connectionId: CONNECTION_ID,
			definitionId: action.actionId,
			options: wrapOptions(action.options as Record<string, unknown>),
			upgradeIndex: -1,
		}))
	const rotary = step.rotate_left !== undefined || step.rotate_right !== undefined
	return {
		type: 'button-layered',
		style: { layers: layers(preset.style) },
		options: {
			stepProgression: 'auto',
			stepExpression: '',
			rotaryActions: rotary,
			canModifyStyleInApis: false,
			notes: preset.name,
		},
		feedbacks: preset.feedbacks.map((feedback, index) => ({
			type: 'feedback',
			id: `${id}-feedback-${index}`,
			connectionId: CONNECTION_ID,
			definitionId: feedback.feedbackId,
			options: wrapOptions(feedback.options as Record<string, unknown>),
			isInverted: plain(false),
			upgradeIndex: -1,
			styleOverrides: [
				['text0', feedback.style?.color],
				['box0', feedback.style?.bgcolor],
			]
				.filter(([, colour]) => colour !== undefined)
				.map(([elementId, colour]) => ({
					overrideId: `${id}-feedback-${index}-${elementId}`,
					elementId,
					elementProperty: 'color',
					override: plain(colour),
				})),
		})),
		steps: {
			'0': {
				action_sets: {
					down: actions(step.down, 'down'),
					up: actions(step.up, 'up'),
					...(rotary && {
						rotate_left: actions(step.rotate_left ?? [], 'left'),
						rotate_right: actions(step.rotate_right ?? [], 'right'),
					}),
				},
				options: { runWhileHeld: [] },
			},
		},
		localVariables: [],
	}
}

export interface PageExport {
	version: number
	type: string
	companionBuild: string
	page: {
		id: string
		name: string
		controls: Record<string, Record<string, ReturnType<typeof control>>>
		gridSize: { minColumn: number; maxColumn: number; minRow: number; maxRow: number }
	}
	instances: Record<string, Record<string, unknown>>
	connectionCollections: unknown[]
	oldPageNumber: number
	imageLibrary: unknown[]
	imageLibraryCollections: unknown[]
}

/** The page: nine columns by six rows, as a + XL needs (keys, then the displays, then the knobs). */
export function buildPage(): PageExport {
	const { presets } = buildPresets(PAGE_LABEL)
	const controls: Record<string, Record<string, ReturnType<typeof control>>> = {}
	for (const [row, cells] of Object.entries(XL_PAGE)) {
		controls[row] = {}
		for (const [column, id] of Object.entries(cells)) {
			const preset = presets[id]
			if (!preset) throw new Error(`The page names a preset that is not there: ${id}`)
			controls[row][column] = control(id, preset)
		}
	}
	return {
		version: 12,
		type: 'page',
		companionBuild: '5.0.6+9750-stable-1acd2318f5',
		page: {
			id: 'gelato-stream-deck-plus-xl',
			name: 'Gelato + XL',
			controls,
			gridSize: { minColumn: 0, maxColumn: 8, minRow: 0, maxRow: 5 },
		},
		instances: {
			[CONNECTION_ID]: {
				moduleInstanceType: 'connection',
				moduleId: 'gelato',
				moduleVersionId: 'dev',
				updatePolicy: 'stable',
				sortOrder: 0,
				label: PAGE_LABEL,
				isFirstInit: false,
				config: { host: '', port: 8100, protocol: 'tcp', feedbackPort: 8101 },
				secrets: {},
				lastUpgradeIndex: -1,
				enabled: true,
			},
		},
		connectionCollections: [],
		oldPageNumber: 1,
		imageLibrary: [],
		imageLibraryCollections: [],
	}
}

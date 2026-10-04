/**
 * The real module against a fake Gelato, with a stand-in for Companion's host context: connect,
 * press an action, and watch feedback turn into variables and feedbacks.
 */
import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { InstanceStatus } from '@companion-module/base'
import ModuleInstance from '../main.js'
import type { ModuleConfig } from '../config.js'
import { FakeGelato, until } from './fake-gelato.js'

/** What Companion's host would hold for the module, and the calls it would be sent. */
class FakeCompanion {
	label = 'gelato'
	status: { status: InstanceStatus; message: string | null }[] = []
	variables: Record<string, unknown> = {}
	actions: Record<string, { callback: (event: unknown, context: unknown) => unknown } | undefined> = {}
	feedbacks: Record<string, { callback: (event: unknown, context: unknown) => unknown } | undefined> = {}
	presets: Record<string, unknown> = {}
	structure: unknown[] = []
	variableDefinitions: Record<string, unknown> = {}
	feedbackChecks = 0

	readonly context = {
		_isInstanceContext: true as const,
		id: 'test-instance',
		get label(): string {
			return fake.label
		},
		upgradeScripts: [],
		updateStatus: (status: InstanceStatus, message: string | null) => void fake.status.push({ status, message }),
		setActionDefinitions: (actions: typeof fake.actions) => void (fake.actions = actions),
		setFeedbackDefinitions: (feedbacks: typeof fake.feedbacks) => void (fake.feedbacks = feedbacks),
		setPresetDefinitions: (structure: unknown[], presets: Record<string, unknown>) => {
			fake.structure = structure
			fake.presets = presets
		},
		setVariableDefinitions: (definitions: Record<string, unknown>) => void (fake.variableDefinitions = definitions),
		setVariableValues: (values: Record<string, unknown>) => void Object.assign(fake.variables, values),
		getVariableValue: (id: string) => fake.variables[id],
		checkAllFeedbacks: () => void fake.feedbackChecks++,
		checkFeedbacks: () => void fake.feedbackChecks++,
		checkFeedbacksById: () => void fake.feedbackChecks++,
		saveConfig: () => undefined,
		subscribeActions: () => undefined,
		unsubscribeActions: () => undefined,
		unsubscribeFeedbacks: () => undefined,
		recordAction: () => undefined,
		oscSend: () => undefined,
	}

	get lastStatus(): InstanceStatus | undefined {
		return this.status.at(-1)?.status
	}

	/** Companion presses a button: runs the action's callback. */
	async press(actionId: string, options: Record<string, unknown> = {}): Promise<void> {
		const action = this.actions[actionId] ?? assert.fail(`no action ${actionId}`)
		await action.callback({ id: 'a', actionId, controlId: 'c', options }, {})
	}

	/** Companion asks a boolean feedback whether to style the button. */
	async feedback(feedbackId: string, options: Record<string, unknown> = {}): Promise<unknown> {
		const feedback = this.feedbacks[feedbackId] ?? assert.fail(`no feedback ${feedbackId}`)
		return feedback.callback({ id: 'f', feedbackId, controlId: 'c', options }, {})
	}
}
let fake: FakeCompanion

describe('the module against a fake Gelato', () => {
	let gelato: FakeGelato
	let instance: ModuleInstance

	const start = async (config: Partial<ModuleConfig> = {}): Promise<void> => {
		instance = new ModuleInstance(fake.context)
		instance.timing = { pingIntervalMs: 80, pingTimeoutMs: 60, reconnectMs: 40 }
		await instance.init({ host: '127.0.0.1', port: gelato.port, protocol: 'tcp', feedbackPort: 8101, ...config })
	}

	beforeEach(async () => {
		fake = new FakeCompanion()
		gelato = new FakeGelato()
		await gelato.start()
	})
	afterEach(async () => {
		await instance?.destroy()
		await gelato.stop()
	})

	it('defines its actions, feedbacks, variables and presets at start', async () => {
		await start()
		assert.ok(Object.keys(fake.actions).length >= 17)
		assert.deepEqual(Object.keys(fake.feedbacks).sort(), [
			'console_connected',
			'edited_any',
			'edited_slot',
			'lock_on',
			'new_types',
			'preview_state_is',
			'readback_waiting',
			'status_is',
		])
		assert.ok('edited_8_palette' in fake.variableDefinitions)
		assert.ok('confirm' in fake.presets)
		assert.equal(fake.variables.edited_8_palette, '', 'every variable has a value from the start')
	})

	it('connects: Connecting, then Ok once Gelato answers the ping', async () => {
		await start()
		assert.equal(fake.status[0].status, InstanceStatus.Connecting)
		await until(() => fake.lastStatus === InstanceStatus.Ok, 2000, 'Ok')
		assert.ok(gelato.received.some((m) => m.address === '/gelato/ping'))
	})

	it('reports a bad config when there is no host', async () => {
		await start({ host: '' })
		assert.equal(fake.lastStatus, InstanceStatus.BadConfig)
		assert.equal(gelato.clientCount, 0)
	})

	it('reports a failure, and the buttons clear, when Gelato stays silent', async () => {
		gelato.answers = false
		await start()
		await until(() => fake.lastStatus === InstanceStatus.ConnectionFailure, 2000, 'ConnectionFailure')
		assert.equal(fake.status.at(-1)?.message, 'No reply to /gelato/ping')
	})

	it('presses actions: each sends its OSC command to Gelato', async () => {
		await start()
		await until(() => fake.lastStatus === InstanceStatus.Ok)
		await fake.press('entry_key', { key: 'L' })
		await fake.press('entry_key', { key: '6' })
		await fake.press('entry_enter')
		await fake.press('confirm')
		await fake.press('add_color_brand', { brand: 'rosco', number: '4590' })
		await fake.press('preview_next')
		await until(() => gelato.received.some((m) => m.address === '/gelato/preview/next'), 2000, 'the commands')
		const sent = gelato.received.filter((m) => m.address !== '/gelato/ping').map((m) => [m.address, ...m.args])
		assert.deepEqual(sent, [
			['/gelato/entry/key', 'L'],
			['/gelato/entry/key', '6'],
			['/gelato/entry/enter'],
			['/gelato/confirm'],
			['/gelato/color/add/rosco', 4590],
			['/gelato/preview/next'],
		])
	})

	it('feedback updates variables and feedbacks, and clearing it clears them', async () => {
		await start()
		await until(() => fake.lastStatus === InstanceStatus.Ok)
		assert.equal(await fake.feedback('status_is', { status: 'awaiting-confirm' }), false)
		const checksBefore = fake.feedbackChecks

		gelato.push('/gelato/out/entry', ['L60'])
		gelato.push('/gelato/out/status', ['awaiting-confirm', 'Confirm'])
		gelato.push('/gelato/out/pending', ['color', 'Color', 'L602', '602', 'Tour', '', 9, 3, 0, 0])
		gelato.push('/gelato/out/lock', [1])
		gelato.push('/gelato/out/eos/connected', [1])
		gelato.push('/gelato/out/edited/count', [2])
		gelato.push('/gelato/out/edited/1', ['201', 'L201', 'update', 'Update', 1, 0])
		gelato.push('/gelato/out/edited/2', ['202', 'L202', 'update', 'Update', 1, 0])
		await until(() => fake.variables.edited_2_palette === '202', 2000, 'feedback')

		assert.equal(fake.variables.entry, 'L60')
		assert.equal(fake.variables.status_text, 'Confirm')
		assert.equal(fake.variables.pending_gel, 'L602')
		assert.equal(fake.variables.pending_ghosts, 9)
		assert.equal(fake.variables.edited_count, 2)
		assert.equal(fake.variables.edited_1_how_text, 'Update')
		assert.ok(fake.feedbackChecks > checksBefore, 'feedbacks are asked again')

		assert.equal(await fake.feedback('status_is', { status: 'awaiting-confirm' }), true)
		assert.equal(await fake.feedback('status_is', { status: 'writing' }), false)
		assert.equal(await fake.feedback('lock_on'), true)
		assert.equal(await fake.feedback('console_connected'), true)
		assert.equal(await fake.feedback('edited_any'), true)
		assert.equal(await fake.feedback('edited_slot', { slot: 2 }), true)
		assert.equal(await fake.feedback('edited_slot', { slot: 3 }), false)
		assert.equal(await fake.feedback('new_types'), false)

		// One palette is put right; Gelato sends the new count and the cleared slots.
		gelato.push('/gelato/out/edited/count', [1])
		gelato.push('/gelato/out/edited/2', ['', '', '', '', 0, 0])
		await until(() => fake.variables.edited_count === 1 && fake.variables.edited_2_palette === '', 2000, 'cleared slot')
		assert.equal(await fake.feedback('edited_slot', { slot: 2 }), false)
		assert.equal(await fake.feedback('edited_slot', { slot: 1 }), true)
	})

	it('toggles the lock from what Gelato last said', async () => {
		await start()
		await until(() => fake.lastStatus === InstanceStatus.Ok)
		await fake.press('lock', { mode: 'toggle' })
		gelato.push('/gelato/out/lock', [1])
		await until(() => fake.variables.locked === 1)
		await fake.press('lock', { mode: 'toggle' })
		await until(() => gelato.received.filter((m) => m.address === '/gelato/lock').length === 2, 2000, 'both')
		assert.deepEqual(
			gelato.received.filter((m) => m.address === '/gelato/lock').map((m) => m.args),
			[[1], [0]],
		)
	})

	it('clears the buttons when the connection drops, and fills them again when it is back', async () => {
		await start()
		await until(() => fake.lastStatus === InstanceStatus.Ok)
		gelato.push('/gelato/out/entry', ['G'])
		await until(() => fake.variables.entry === 'G')
		gelato.state['/gelato/out/entry'] = ['G']
		gelato.dropClients()
		await until(() => fake.variables.entry === '', 2000, 'cleared')
		assert.equal(
			fake.status.some((s) => s.status === InstanceStatus.ConnectionFailure),
			true,
		)
		await until(() => fake.lastStatus === InstanceStatus.Ok && fake.variables.entry === 'G', 3000, 'refilled')
	})

	it('works over UDP too', async () => {
		const { createSocket } = await import('node:dgram')
		const probe = createSocket('udp4')
		await new Promise<void>((resolve) => probe.bind(0, '127.0.0.1', resolve))
		const feedbackPort = probe.address().port
		await new Promise<void>((resolve) => probe.close(() => resolve()))
		gelato.feedbackTo('127.0.0.1', feedbackPort)
		await start({ protocol: 'udp', feedbackPort })
		await until(() => fake.lastStatus === InstanceStatus.Ok, 2000, 'Ok')
		await fake.press('cancel')
		await until(() => gelato.received.some((m) => m.address === '/gelato/cancel'), 2000, 'cancel')
		gelato.push('/gelato/out/status', ['writing', 'Writing'])
		await until(() => fake.variables.status === 'writing', 2000, 'status')
		assert.equal(await fake.feedback('status_is', { status: 'writing' }), true)
	})

	it('reconnects with new settings', async () => {
		await start({ host: '' })
		assert.equal(fake.lastStatus, InstanceStatus.BadConfig)
		await instance.configUpdated({ host: '127.0.0.1', port: gelato.port, protocol: 'tcp', feedbackPort: 8101 })
		await until(() => fake.lastStatus === InstanceStatus.Ok, 2000, 'Ok')
	})

	it('a knob scrolls the edited palettes it shows, without sending anything', async () => {
		gelato.state['/gelato/out/edited/count'] = [2]
		gelato.state['/gelato/out/edited/1'] = ['201', 'L201', 'update', 'Update', 3, 1]
		gelato.state['/gelato/out/edited/2'] = ['202', 'L202', 'update', 'Update', 3, 1]
		await start()
		await until(() => fake.variables.edited_shown_palette === '201', 2000, 'the first edited palette')
		const before = gelato.received.length
		await fake.press('edited_scroll', { direction: 'next' })
		assert.equal(fake.variables.edited_shown_palette, '202')
		assert.equal(fake.variables.edited_shown, 2)
		await fake.press('edited_scroll', { direction: 'next' })
		assert.equal(fake.variables.edited_shown, 1, 'round again')
		assert.equal(gelato.received.length, before, 'nothing went to Gelato')
	})

	it('a knob steps the brand letter with an ordinary entry key', async () => {
		await start()
		await until(() => fake.lastStatus === InstanceStatus.Ok)
		await fake.press('entry_brand', { direction: 'next' })
		await until(() => gelato.received.some((m) => m.address === '/gelato/entry/key'), 2000, 'the key')
		assert.deepEqual(gelato.received.find((m) => m.address === '/gelato/entry/key')?.args, ['L'])
	})
})

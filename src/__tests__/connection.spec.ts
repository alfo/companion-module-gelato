import assert from 'node:assert/strict'
import dgram from 'node:dgram'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { defaultOptions, GelatoConnection, type ConnectionOptions, type LinkStatus } from '../connection.js'
import type { OSCMessage } from '../osc.js'
import { FakeGelato, until } from './fake-gelato.js'

const fast = { pingIntervalMs: 80, pingTimeoutMs: 60, reconnectMs: 40 }

/** A free UDP port, for feedback to arrive on. */
async function freeUdpPort(): Promise<number> {
	const socket = dgram.createSocket('udp4')
	await new Promise<void>((resolve) => socket.bind(0, '127.0.0.1', resolve))
	const { port } = socket.address()
	await new Promise<void>((resolve) => socket.close(() => resolve()))
	return port
}

describe('connection to a fake Gelato', () => {
	let gelato: FakeGelato
	let link: GelatoConnection | undefined
	let statuses: LinkStatus[]
	let messages: OSCMessage[]

	const open = (options: Partial<ConnectionOptions> = {}): GelatoConnection => {
		link = new GelatoConnection(
			{ ...defaultOptions, ...fast, host: '127.0.0.1', port: gelato.port, ...options },
			{ onMessage: (m) => messages.push(m), onStatus: (s) => statuses.push(s) },
		)
		link.start()
		return link
	}
	const states = (): string[] => statuses.map((s) => s.state)

	beforeEach(async () => {
		gelato = new FakeGelato()
		await gelato.start()
		statuses = []
		messages = []
	})
	afterEach(async () => {
		link?.stop()
		link = undefined
		await gelato.stop()
	})

	it('TCP: connects, pings, is ok once /gelato/out/ping comes back, and gets the full state', async () => {
		open()
		await until(() => link?.status === 'ok', 2000, 'ok')
		assert.deepEqual(states().slice(0, 2), ['connecting', 'ok'])
		assert.ok(gelato.received.some((m) => m.address === '/gelato/ping'))
		assert.ok(messages.some((m) => m.address === '/gelato/out/ping'))
		assert.ok(
			messages.some((m) => m.address === '/gelato/out/edited/8'),
			'cleared list slots arrive too',
		)
	})

	it('TCP: sends a command SLIP-framed, and takes pushed feedback', async () => {
		open()
		await until(() => link?.status === 'ok')
		assert.equal(link?.send('/gelato/color/add', ['L602']), true)
		await until(() => gelato.received.some((m) => m.address === '/gelato/color/add'), 2000, 'the command')
		assert.deepEqual(gelato.received.find((m) => m.address === '/gelato/color/add')?.args, ['L602'])
		gelato.push('/gelato/out/entry', ['L60'])
		await until(() => messages.some((m) => m.address === '/gelato/out/entry' && m.args[0] === 'L60'), 2000, 'feedback')
	})

	it('TCP: says no reply when Gelato stays silent, and recovers when it answers', async () => {
		gelato.answers = false
		open()
		await until(() => link?.status === 'no-reply', 2000, 'no-reply')
		assert.equal(statuses.find((s) => s.state === 'no-reply')?.message, 'No reply to /gelato/ping')
		gelato.answers = true
		await until(() => link?.status === 'ok', 2000, 'ok again')
	})

	it('TCP: reconnects when Gelato drops the connection', async () => {
		open()
		await until(() => link?.status === 'ok')
		gelato.dropClients()
		await until(() => states().includes('error'), 2000, 'error')
		await until(() => link?.status === 'ok' && gelato.clientCount === 1, 3000, 'reconnected')
	})

	it('TCP: reports an error, and keeps trying, when nothing is listening', async () => {
		const port = gelato.port
		await gelato.stop()
		open({ port })
		await until(() => states().includes('error'), 2000, 'error')
		const attempts = statuses.length
		await new Promise((resolve) => setTimeout(resolve, 200))
		assert.equal(link?.status, 'error')
		assert.ok(statuses.length >= attempts, 'still retrying quietly')
		gelato = new FakeGelato() // so afterEach has something to stop
		await gelato.start()
	})

	it('UDP: sends commands, takes feedback on the feedback port, and is ok on the ping reply', async () => {
		const feedbackPort = await freeUdpPort()
		gelato.feedbackTo('127.0.0.1', feedbackPort)
		open({ protocol: 'udp', feedbackPort })
		await until(() => link?.status === 'ok', 2000, 'ok')
		assert.ok(gelato.received.some((m) => m.address === '/gelato/ping'))
		link?.send('/gelato/confirm')
		await until(() => gelato.received.some((m) => m.address === '/gelato/confirm'), 2000, 'the command')
		gelato.push('/gelato/out/lock', [1])
		await until(() => messages.some((m) => m.address === '/gelato/out/lock' && m.args[0] === 1), 2000, 'feedback')
	})

	it('UDP: says no reply when feedback is not pointed here', async () => {
		const feedbackPort = await freeUdpPort()
		gelato.answers = false
		open({ protocol: 'udp', feedbackPort })
		await until(() => link?.status === 'no-reply', 2000, 'no-reply')
	})

	it('TCP: carries on past a malformed frame', async () => {
		open()
		await until(() => link?.status === 'ok')
		// Garbage with no address, a bad escape, then a good message.
		gelato.pushRaw(Buffer.from([0xc0, 0x01, 0x02, 0x03, 0xc0, 0xc0, 0x2f, 0xdb, 0x01, 0xc0]))
		gelato.push('/gelato/out/entry', ['G'])
		await until(
			() => messages.some((m) => m.address === '/gelato/out/entry' && m.args[0] === 'G'),
			2000,
			'good message',
		)
		assert.equal(link?.status, 'ok')
	})

	it('pings once on connect, then not again for the interval', async () => {
		open({ pingIntervalMs: 60_000 })
		await until(() => link?.status === 'ok')
		await new Promise((resolve) => setTimeout(resolve, 250))
		assert.equal(gelato.received.filter((m) => m.address === '/gelato/ping').length, 1)
		assert.equal(defaultOptions.pingIntervalMs >= 30_000, true)
	})

	it('says why when it still cannot connect, not just that it cannot', async () => {
		const port = gelato.port
		await gelato.stop()
		open({ port })
		await until(() => states().includes('error'), 2000, 'error')
		const first = statuses.filter((s) => s.state === 'error').length
		// The same failure on each retry is not a new status.
		await new Promise((resolve) => setTimeout(resolve, 300))
		assert.equal(statuses.filter((s) => s.state === 'error').length, first)
		gelato = new FakeGelato()
		await gelato.start()
	})

	it('UDP: closes and retries when the feedback port is taken, and does not send meanwhile', async () => {
		const taker = dgram.createSocket('udp4')
		await new Promise<void>((resolve) => taker.bind(0, resolve))
		const feedbackPort = taker.address().port
		gelato.answers = true
		open({ protocol: 'udp', feedbackPort })
		await until(() => states().includes('error'), 2000, 'error')
		assert.match(statuses.find((s) => s.state === 'error')?.message ?? '', /Feedback port/)
		assert.equal(link?.send('/gelato/confirm'), false)
		gelato.feedbackTo('127.0.0.1', feedbackPort)
		await new Promise<void>((resolve) => taker.close(() => resolve()))
		await until(() => link?.status === 'ok', 3000, 'ok once the port is free')
		assert.equal(link?.send('/gelato/confirm'), true)
	})

	it('does not send when there is no link', () => {
		const idle = new GelatoConnection(
			{ ...defaultOptions, host: '127.0.0.1', port: gelato.port },
			{ onMessage: () => undefined, onStatus: () => undefined },
		)
		assert.equal(idle.send('/gelato/confirm'), false)
	})

	it('stop closes the link and says so', async () => {
		open()
		await until(() => link?.status === 'ok')
		link?.stop()
		assert.equal(link?.status, 'closed')
		await until(() => gelato.clientCount === 0, 2000, 'client gone')
	})
})

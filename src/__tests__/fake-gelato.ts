/**
 * A fake Gelato Remote Control listener for the tests: OSC over UDP and over TCP (SLIP) on one
 * port, answering `/gelato/ping` the way Gelato does (`/gelato/out/ping` with no arguments, then
 * the full state, cleared list slots included). It never talks to a console. Its state follows
 * RC-01's table (docs/spec.md → "Remote control over OSC").
 */
import dgram from 'node:dgram'
import net from 'node:net'
import { decodePacket, encodeMessage, slipEncode, SlipDecoder, type OSCMessage } from '../osc.js'

export type Arg = string | number

export interface FakeState {
	[address: string]: Arg[]
}

/** The state of a quiet Gelato: everything cleared, as `/gelato/ping` sends it. */
export function quietState(): FakeState {
	const state: FakeState = {
		'/gelato/out/entry': [''],
		'/gelato/out/status': ['idle', 'Idle'],
		'/gelato/out/pending': ['', '', '', '', '', '', 0, 0, 0, 0],
		'/gelato/out/last': ['', '', '', '', '', '', ''],
		'/gelato/out/eos/connected': [0],
		'/gelato/out/lock': [0],
		'/gelato/out/preview': ['', 0, 0, '', '', '', ''],
		'/gelato/out/progress': [0, 0],
		'/gelato/out/build/new/count': [0],
		'/gelato/out/readback': ['idle', 'Idle', '', '', 0, 0],
		'/gelato/out/edited/count': [0],
	}
	for (let n = 1; n <= 8; n++) {
		state[`/gelato/out/build/new/${n}`] = ['']
		state[`/gelato/out/edited/${n}`] = ['', '', '', '', 0, 0]
	}
	return state
}

export class FakeGelato {
	state = quietState()
	/** Every command received, in order, ping included. */
	received: OSCMessage[] = []
	/** False: pings go unanswered, as when Remote Control is off or feedback points elsewhere. */
	answers = true
	private tcp = net.createServer((socket) => this.accept(socket))
	private udp = dgram.createSocket('udp4')
	private clients = new Set<net.Socket>()
	private udpTarget?: { host: string; port: number }
	port = 0

	/** Starts listening on a free port (TCP and UDP on the same number). */
	async start(): Promise<void> {
		await new Promise<void>((resolve) => this.tcp.listen(0, '127.0.0.1', resolve))
		this.port = (this.tcp.address() as net.AddressInfo).port
		await new Promise<void>((resolve) => this.udp.bind(this.port, '127.0.0.1', resolve))
		this.udp.on('message', (data, remote) => {
			if (this.udpTarget === undefined) this.udpTarget = { host: remote.address, port: remote.port }
			this.handle(data, (packet) => this.udp.send(packet, remote.port, remote.address))
		})
	}

	/** UDP feedback goes to this port, like Gelato's "feedback to" setting. */
	feedbackTo(host: string, port: number): void {
		this.udpTarget = { host, port }
	}

	async stop(): Promise<void> {
		this.dropClients()
		await new Promise<void>((resolve) => this.tcp.close(() => resolve()))
		await new Promise<void>((resolve) => this.udp.close(() => resolve()))
	}

	/** Closes every TCP connection, as when Gelato quits. */
	dropClients(): void {
		for (const client of this.clients) client.destroy()
		this.clients.clear()
	}

	get clientCount(): number {
		return this.clients.size
	}

	/** Sets a value and sends it to every client and the UDP feedback target. */
	push(address: string, args: Arg[]): void {
		this.state[address] = args
		this.broadcast([{ address, args }])
	}

	/** Every value, in the order a ping sends them. */
	fullState(): { address: string; args: Arg[] }[] {
		return Object.entries(this.state).map(([address, args]) => ({ address, args }))
	}

	private accept(socket: net.Socket): void {
		this.clients.add(socket)
		const decoder = new SlipDecoder()
		socket.on('data', (data) => {
			for (const packet of decoder.append(data)) this.handle(packet, (reply) => socket.write(slipEncode(reply)))
		})
		socket.on('close', () => this.clients.delete(socket))
		socket.on('error', () => undefined)
		// A new TCP client is told everything.
		if (this.answers)
			for (const message of this.fullState()) socket.write(slipEncode(encodeMessage(message.address, message.args)))
	}

	private handle(packet: Buffer, reply: (packet: Buffer) => void): void {
		for (const message of decodePacket(packet)) {
			this.received.push(message)
			if (message.address === '/gelato/ping' && this.answers) {
				reply(encodeMessage('/gelato/out/ping'))
				for (const item of this.fullState()) reply(encodeMessage(item.address, item.args))
			}
		}
	}

	private broadcast(messages: { address: string; args: Arg[] }[]): void {
		for (const message of messages) {
			const packet = encodeMessage(message.address, message.args)
			for (const client of this.clients) client.write(slipEncode(packet))
			if (this.udpTarget) this.udp.send(packet, this.udpTarget.port, this.udpTarget.host)
		}
	}
}

/** Waits until `check` is true, or fails after `ms`. */
export async function until(check: () => boolean, ms = 2000, what = 'condition'): Promise<void> {
	const start = Date.now()
	while (!check()) {
		if (Date.now() - start > ms) throw new Error(`Timed out waiting for ${what}`)
		await new Promise((resolve) => setTimeout(resolve, 10))
	}
}

/**
 * The link to Gelato's Remote Control listener: TCP (SLIP-framed, feedback comes back on the same
 * connection) or UDP (feedback comes to a local port Gelato's "feedback to" setting points at).
 * Status follows `/gelato/ping`: connected once it's answered, no reply when it isn't.
 * No Companion types in here, so tests drive it against a fake server.
 */
import dgram from 'node:dgram'
import net from 'node:net'
import { decodePacket, encodeMessage, slipEncode, SlipDecoder, type OSCMessage } from './osc.js'

export type Protocol = 'tcp' | 'udp'

export interface ConnectionOptions {
	host: string
	port: number
	protocol: Protocol
	/** UDP only: the local port feedback arrives on. */
	feedbackPort: number
	/** How often Gelato is pinged. */
	pingIntervalMs: number
	/** How long a ping may go unanswered before the status says so. */
	pingTimeoutMs: number
	/** How long to wait before connecting again after TCP drops. */
	reconnectMs: number
}

export const defaultOptions: Omit<ConnectionOptions, 'host'> = {
	port: 8100,
	protocol: 'tcp',
	feedbackPort: 8101,
	pingIntervalMs: 5000,
	pingTimeoutMs: 3000,
	reconnectMs: 3000,
}

export type LinkState = 'connecting' | 'ok' | 'no-reply' | 'error' | 'closed'

export interface LinkStatus {
	state: LinkState
	message?: string
}

export interface ConnectionHandlers {
	onMessage: (message: OSCMessage) => void
	onStatus: (status: LinkStatus) => void
	onLog?: (level: 'debug' | 'info' | 'warn' | 'error', text: string) => void
}

export class GelatoConnection {
	private socket?: net.Socket
	private datagrams?: dgram.Socket
	private decoder = new SlipDecoder()
	private pingTimer?: NodeJS.Timeout
	private timeoutTimer?: NodeJS.Timeout
	private reconnectTimer?: NodeJS.Timeout
	private stopped = true
	private state?: LinkState

	constructor(
		private readonly options: ConnectionOptions,
		private readonly handlers: ConnectionHandlers,
	) {}

	get status(): LinkState | undefined {
		return this.state
	}

	start(): void {
		if (!this.stopped) return
		this.stopped = false
		this.setStatus('connecting')
		if (this.options.protocol === 'tcp') this.connectTcp()
		else this.openUdp()
	}

	stop(): void {
		this.stopped = true
		clearTimeout(this.pingTimer)
		clearTimeout(this.timeoutTimer)
		clearTimeout(this.reconnectTimer)
		this.socket?.destroy()
		this.socket = undefined
		this.datagrams?.close()
		this.datagrams = undefined
		this.decoder = new SlipDecoder()
		this.setStatus('closed')
	}

	/** Sends a command. False if there's no link to send on. */
	send(address: string, args: (string | number)[] = []): boolean {
		const packet = encodeMessage(address, args)
		if (this.options.protocol === 'tcp') {
			if (!this.socket || this.socket.destroyed || this.socket.connecting) return false
			this.socket.write(slipEncode(packet))
			return true
		}
		if (!this.datagrams) return false
		this.datagrams.send(packet, this.options.port, this.options.host)
		return true
	}

	// MARK: - TCP

	private connectTcp(): void {
		const socket = net.createConnection({ host: this.options.host, port: this.options.port })
		this.socket = socket
		this.decoder = new SlipDecoder()
		socket.setNoDelay(true)
		socket.on('connect', () => {
			this.log('debug', `TCP connected to ${this.options.host}:${this.options.port}`)
			// Up, but not yet known to be Gelato: that's the ping's answer.
			this.setStatus('connecting')
			this.ping()
		})
		socket.on('data', (data) => this.received(this.decoder.append(data)))
		socket.on('error', (error) => {
			this.log('debug', `TCP error: ${error.message}`)
			this.setStatus('error', error.message)
		})
		socket.on('close', () => {
			if (this.stopped || this.socket !== socket) return
			this.socket = undefined
			clearTimeout(this.pingTimer)
			clearTimeout(this.timeoutTimer)
			if (this.state !== 'error') this.setStatus('error', 'Connection closed')
			this.reconnectTimer = setTimeout(() => {
				if (this.stopped) return
				this.connectTcp()
			}, this.options.reconnectMs)
		})
	}

	// MARK: - UDP

	private openUdp(): void {
		const socket = dgram.createSocket('udp4')
		this.datagrams = socket
		socket.on('message', (data) => this.received([data]))
		socket.on('error', (error) => {
			this.log('warn', `UDP error: ${error.message}`)
			this.setStatus('error', error.message)
		})
		socket.bind(this.options.feedbackPort, () => {
			this.log('debug', `Listening for feedback on UDP ${this.options.feedbackPort}`)
			this.ping()
		})
	}

	// MARK: - Ping and status

	private ping(): void {
		clearTimeout(this.pingTimer)
		this.send('/gelato/ping')
		if (!this.timeoutTimer) {
			this.timeoutTimer = setTimeout(() => {
				this.timeoutTimer = undefined
				// A socket that is up but silent is a Gelato not answering (Remote Control off, or
				// feedback not pointed here over UDP).
				if (!this.stopped && this.state !== 'error') this.setStatus('no-reply', 'No reply to /gelato/ping')
			}, this.options.pingTimeoutMs)
		}
		this.pingTimer = setTimeout(() => this.ping(), this.options.pingIntervalMs)
	}

	private received(packets: Buffer[]): void {
		for (const packet of packets) {
			let messages: OSCMessage[]
			try {
				messages = decodePacket(packet)
			} catch (error) {
				this.log('debug', `Dropped a malformed packet: ${(error as Error).message}`)
				continue
			}
			for (const message of messages) {
				if (message.address === '/gelato/out/ping') {
					clearTimeout(this.timeoutTimer)
					this.timeoutTimer = undefined
					this.setStatus('ok')
				}
				this.handlers.onMessage(message)
			}
		}
	}

	private setStatus(state: LinkState, message?: string): void {
		if (this.state === state) return
		this.state = state
		this.handlers.onStatus({ state, message })
	}

	private log(level: 'debug' | 'info' | 'warn' | 'error', text: string): void {
		this.handlers.onLog?.(level, text)
	}
}

/**
 * The small part of OSC 1.0 / 1.1 Gelato speaks: messages of int, float, string and the
 * argument-less tags, and SLIP framing for TCP (double-END, as Gelato's listener and Eos use).
 */

export interface OSCMessage {
	address: string
	args: (string | number | boolean | null)[]
}

const pad4 = (length: number): number => (4 - (length % 4)) % 4

function encodeString(text: string): Buffer {
	const bytes = Buffer.from(text, 'utf8')
	return Buffer.concat([bytes, Buffer.alloc(pad4(bytes.length + 1) + 1)])
}

const isInt32 = (arg: number): boolean => Number.isInteger(arg) && arg >= -2_147_483_648 && arg <= 2_147_483_647

/** Encodes a message. A JS integer that fits an int32 goes as `i`, any other number as `f`, a string as `s`. */
export function encodeMessage(address: string, args: (string | number)[] = []): Buffer {
	const tags = args.map((arg) => (typeof arg === 'string' ? 's' : isInt32(arg) ? 'i' : 'f')).join('')
	const parts: Buffer[] = [encodeString(address), encodeString(',' + tags)]
	for (const arg of args) {
		if (typeof arg === 'string') {
			parts.push(encodeString(arg))
		} else if (isInt32(arg)) {
			const buffer = Buffer.alloc(4)
			buffer.writeInt32BE(arg)
			parts.push(buffer)
		} else {
			const buffer = Buffer.alloc(4)
			buffer.writeFloatBE(arg)
			parts.push(buffer)
		}
	}
	return Buffer.concat(parts)
}

function readString(data: Buffer, offset: number): { text: string; next: number } {
	let end = offset
	while (end < data.length && data[end] !== 0) end++
	if (end >= data.length) throw new Error('OSC string is not terminated')
	const length = end - offset
	return { text: data.toString('utf8', offset, end), next: offset + length + 1 + pad4(length + 1) }
}

/** Decodes one message. Throws on anything malformed. Bundles are unpacked by {@link decodePacket}. */
export function decodeMessage(data: Buffer): OSCMessage {
	const { text: address, next } = readString(data, 0)
	if (!address.startsWith('/')) throw new Error('OSC address does not start with /')
	let offset = next
	let tags = ''
	if (offset < data.length) {
		const read = readString(data, offset)
		tags = read.text.startsWith(',') ? read.text.slice(1) : ''
		offset = read.next
	}
	const args: OSCMessage['args'] = []
	for (const tag of tags) {
		switch (tag) {
			case 'i':
				args.push(data.readInt32BE(offset))
				offset += 4
				break
			case 'f':
				args.push(data.readFloatBE(offset))
				offset += 4
				break
			case 'h':
				args.push(Number(data.readBigInt64BE(offset)))
				offset += 8
				break
			case 'd':
				args.push(data.readDoubleBE(offset))
				offset += 8
				break
			case 's':
			case 'S': {
				const read = readString(data, offset)
				args.push(read.text)
				offset = read.next
				break
			}
			case 'b': {
				const length = data.readInt32BE(offset)
				offset += 4 + length + pad4(length)
				args.push(null)
				break
			}
			case 't':
				offset += 8
				args.push(null)
				break
			case 'T':
				args.push(true)
				break
			case 'F':
				args.push(false)
				break
			case 'N':
			case 'I':
				args.push(null)
				break
			default:
				throw new Error(`Unknown OSC type tag ${tag}`)
		}
	}
	return { address, args }
}

/** A datagram or SLIP frame: one message, or a bundle of them. */
export function decodePacket(data: Buffer): OSCMessage[] {
	if (data.toString('utf8', 0, 8) !== '#bundle\0') return [decodeMessage(data)]
	const messages: OSCMessage[] = []
	let offset = 16
	while (offset + 4 <= data.length) {
		const size = data.readInt32BE(offset)
		offset += 4
		messages.push(...decodePacket(data.subarray(offset, offset + size)))
		offset += size
	}
	return messages
}

const END = 0xc0
const ESC = 0xdb
const ESC_END = 0xdc
const ESC_ESC = 0xdd

/** END, the packet with END and ESC escaped, END. */
export function slipEncode(packet: Buffer): Buffer {
	const out: number[] = [END]
	for (const byte of packet) {
		if (byte === END) out.push(ESC, ESC_END)
		else if (byte === ESC) out.push(ESC, ESC_ESC)
		else out.push(byte)
	}
	out.push(END)
	return Buffer.from(out)
}

/** Splits a TCP byte stream into packets, whatever sizes the bytes arrive in. */
export class SlipDecoder {
	private current: number[] = []
	private escaping = false
	private dropping = false

	/** Adds bytes and returns every packet they complete. A bad escape drops the rest of that frame. */
	append(bytes: Buffer): Buffer[] {
		const packets: Buffer[] = []
		for (const byte of bytes) {
			if (byte === END) {
				// Consecutive ENDs (double-END framing) give empty frames: skip them.
				if (this.current.length > 0 && !this.dropping) packets.push(Buffer.from(this.current))
				this.current = []
				this.escaping = false
				this.dropping = false
			} else if (this.dropping) {
				continue
			} else if (this.escaping) {
				this.escaping = false
				if (byte === ESC_END) this.current.push(END)
				else if (byte === ESC_ESC) this.current.push(ESC)
				else {
					this.current = []
					this.dropping = true
				}
			} else if (byte === ESC) {
				this.escaping = true
			} else {
				this.current.push(byte)
			}
		}
		return packets
	}
}

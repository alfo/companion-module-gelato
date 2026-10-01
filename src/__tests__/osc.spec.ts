import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { decodeMessage, decodePacket, encodeMessage, slipEncode, SlipDecoder } from '../osc.js'

describe('OSC messages', () => {
	it('encodes strings padded to four bytes, with the terminator', () => {
		// "/a" + NUL pads to 4; ",s" + NUL pads to 4; "L602" needs a full extra word for its NUL.
		const bytes = encodeMessage('/a', ['L602'])
		assert.equal(bytes.length, 4 + 4 + 8)
		assert.equal(bytes.toString('latin1'), '/a\0\0,s\0\0L602\0\0\0\0')
	})

	it('round-trips strings, ints and floats', () => {
		const message = decodeMessage(encodeMessage('/gelato/out/last', ['recorded', 'Recorded', '', 'L602', 7, 0.5]))
		assert.deepEqual(message, { address: '/gelato/out/last', args: ['recorded', 'Recorded', '', 'L602', 7, 0.5] })
	})

	it('round-trips every string length around the padding boundary', () => {
		for (let length = 0; length <= 9; length++) {
			const text = 'x'.repeat(length)
			assert.deepEqual(decodeMessage(encodeMessage('/s', [text, 3])).args, [text, 3])
		}
	})

	it('round-trips non-ASCII text', () => {
		assert.deepEqual(decodeMessage(encodeMessage('/s', ['Ré·Naïve'])).args, ['Ré·Naïve'])
	})

	it('decodes a message with no arguments, with or without a type tag string', () => {
		assert.deepEqual(decodeMessage(encodeMessage('/gelato/out/ping')), { address: '/gelato/out/ping', args: [] })
		assert.deepEqual(decodeMessage(Buffer.from('/ping\0\0\0')), { address: '/ping', args: [] })
	})

	it('decodes the argument-less tags and 64-bit numbers', () => {
		const data = Buffer.from('/x\0\0,TFNIhd\0', 'latin1')
		const body = Buffer.alloc(16)
		body.writeBigInt64BE(42n, 0)
		body.writeDoubleBE(1.5, 8)
		assert.deepEqual(decodeMessage(Buffer.concat([data, body])).args, [true, false, null, null, 42, 1.5])
	})

	it('rejects malformed packets', () => {
		assert.throws(() => decodeMessage(Buffer.from('gelato\0\0')))
		assert.throws(() => decodeMessage(Buffer.from('/x\0\0,i\0\0')))
		assert.throws(() => decodeMessage(Buffer.from('/x\0\0,q\0\0')))
	})

	it('unpacks a bundle', () => {
		const first = encodeMessage('/a', [1])
		const second = encodeMessage('/b', ['two'])
		const size = (buffer: Buffer): Buffer => {
			const length = Buffer.alloc(4)
			length.writeInt32BE(buffer.length)
			return length
		}
		const bundle = Buffer.concat([Buffer.from('#bundle\0'), Buffer.alloc(8), size(first), first, size(second), second])
		assert.deepEqual(
			decodePacket(bundle).map((message) => message.address),
			['/a', '/b'],
		)
	})
})

describe('SLIP framing', () => {
	it('frames with END at both ends, as Gelato and Eos do', () => {
		const framed = slipEncode(Buffer.from([1, 2]))
		assert.deepEqual([...framed], [0xc0, 1, 2, 0xc0])
	})

	it('escapes END and ESC in the packet, and undoes it', () => {
		const packet = Buffer.from([0x01, 0xc0, 0x02, 0xdb, 0x03])
		const framed = slipEncode(packet)
		assert.deepEqual([...framed], [0xc0, 0x01, 0xdb, 0xdc, 0x02, 0xdb, 0xdd, 0x03, 0xc0])
		assert.deepEqual(new SlipDecoder().append(framed), [packet])
	})

	it('splits a stream into packets, whatever sizes the bytes arrive in', () => {
		const stream = Buffer.concat([
			slipEncode(Buffer.from('one')),
			slipEncode(Buffer.from('two')),
			slipEncode(Buffer.from('three')),
		])
		for (const chunk of [1, 2, 3, 7, stream.length]) {
			const decoder = new SlipDecoder()
			const packets: string[] = []
			for (let offset = 0; offset < stream.length; offset += chunk) {
				for (const packet of decoder.append(stream.subarray(offset, offset + chunk))) packets.push(packet.toString())
			}
			assert.deepEqual(packets, ['one', 'two', 'three'], `chunks of ${chunk}`)
		}
	})

	it('drops a frame with a bad escape and carries on', () => {
		const decoder = new SlipDecoder()
		assert.deepEqual(decoder.append(Buffer.from([0xc0, 0x01, 0xdb, 0x09, 0x02, 0xc0, 0x05, 0xc0])), [
			Buffer.from([0x05]),
		])
	})
})

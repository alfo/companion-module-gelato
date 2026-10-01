import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { COMMANDS, ENTRY_KEYS, numberArgument, type ActionsSchema } from '../commands.js'
import { initialValues } from '../state.js'

type Id = keyof ActionsSchema

/** What each action sends, for the options it's given (docs/spec.md → "Remote control over OSC"). */
const send = <K extends Id>(id: K, options: ActionsSchema[K]['options'], locked = 0) =>
	COMMANDS[id].toOSC(options, { ...initialValues(), locked })

describe('actions', () => {
	it('steps the brand letter L R G A round, from the one typed, sending an ordinary entry key', () => {
		const step = (entry: string, direction: 'next' | 'previous') =>
			COMMANDS.entry_brand.toOSC({ direction }, { ...initialValues(), entry })
		assert.deepEqual(step('', 'next'), { address: '/gelato/entry/key', args: ['L'] })
		assert.deepEqual(step('', 'previous'), { address: '/gelato/entry/key', args: ['A'] })
		assert.deepEqual(step('L20', 'next')?.args, ['R'])
		assert.deepEqual(step('A', 'next')?.args, ['L'])
		assert.deepEqual(step('L', 'previous')?.args, ['A'])
		assert.deepEqual(step('G6', 'previous')?.args, ['R'])
	})

	it('scrolling the edited palettes sends nothing', () => {
		assert.equal(COMMANDS.edited_scroll.local, true)
		assert.equal(COMMANDS.edited_scroll.toOSC({ direction: 'next' }, initialValues()), undefined)
	})

	it('has an action for every /gelato command in the spec, and two that only the module does', () => {
		const moduleOnly = ['edited_scroll', 'entry_brand']
		assert.deepEqual(
			Object.keys(COMMANDS)
				.filter((id) => !moduleOnly.includes(id))
				.sort(),
			[
				'add_colour',
				'add_colour_brand',
				'build_new',
				'build_rerun',
				'cancel',
				'confirm',
				'entry_clear',
				'entry_enter',
				'entry_key',
				'lock',
				'ping',
				'preview_next',
				'preview_option',
				'preview_choose',
				'preview_previous',
				'preview_release',
				'template_apply',
			].sort(),
		)
	})

	it('adds a colour by code, trimmed', () => {
		assert.deepEqual(send('add_colour', { code: ' L602 ' }), { address: '/gelato/colour/add', args: ['L602'] })
		assert.equal(send('add_colour', { code: '  ' }), undefined)
	})

	it('adds a colour by brand and number, the number as an int when it is one', () => {
		assert.deepEqual(send('add_colour_brand', { brand: 'lee', number: '602' }), {
			address: '/gelato/colour/add/lee',
			args: [602],
		})
		assert.deepEqual(send('add_colour_brand', { brand: 'rosco', number: '4590' }), {
			address: '/gelato/colour/add/rosco',
			args: [4590],
		})
		assert.deepEqual(send('add_colour_brand', { brand: 'gam', number: '202.5' }), {
			address: '/gelato/colour/add/gam',
			args: ['202.5'],
		})
		assert.deepEqual(send('add_colour_brand', { brand: 'apollo', number: '7' })?.address, '/gelato/colour/add/apollo')
		assert.equal(send('add_colour_brand', { brand: 'lee', number: '' }), undefined)
	})

	it('sends entry keys: L R G A, 0 to 9 and the point', () => {
		assert.deepEqual(ENTRY_KEYS, ['L', 'R', 'G', 'A', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '.'])
		for (const key of ENTRY_KEYS)
			assert.deepEqual(send('entry_key', { key }), { address: '/gelato/entry/key', args: [key] })
	})

	it('sends the argument-less commands', () => {
		const expected: Partial<Record<Id, string>> = {
			entry_clear: '/gelato/entry/clear',
			entry_enter: '/gelato/entry/enter',
			confirm: '/gelato/confirm',
			cancel: '/gelato/cancel',
			build_rerun: '/gelato/build/rerun',
			build_new: '/gelato/build/new',
			preview_next: '/gelato/preview/next',
			preview_previous: '/gelato/preview/previous',
			preview_choose: '/gelato/preview/choose',
			preview_release: '/gelato/preview/release',
			ping: '/gelato/ping',
		}
		for (const [id, address] of Object.entries(expected)) {
			assert.deepEqual(send(id as Id, {}), { address, args: [] }, id)
		}
	})

	it('locks on, off, and toggles from the lock Gelato last reported', () => {
		assert.deepEqual(send('lock', { mode: 'on' }), { address: '/gelato/lock', args: [1] })
		assert.deepEqual(send('lock', { mode: 'off' }), { address: '/gelato/lock', args: [0] })
		assert.deepEqual(send('lock', { mode: 'toggle' }, 0), { address: '/gelato/lock', args: [1] })
		assert.deepEqual(send('lock', { mode: 'toggle' }, 1), { address: '/gelato/lock', args: [0] })
	})

	it('applies a template by name', () => {
		assert.deepEqual(send('template_apply', { name: 'Musicals' }), {
			address: '/gelato/template/apply',
			args: ['Musicals'],
		})
		assert.equal(send('template_apply', { name: '' }), undefined)
	})

	it('chooses a preview option, 1 or more', () => {
		assert.deepEqual(send('preview_option', { option: 2 }), { address: '/gelato/preview/option', args: [2] })
		assert.deepEqual(send('preview_option', { option: 0 }), { address: '/gelato/preview/option', args: [1] })
	})

	it('sends a number as an int when it fits an int32, else as text, and never throws', () => {
		assert.equal(numberArgument('602'), 602)
		assert.equal(numberArgument('2147483647'), 2147483647)
		assert.equal(numberArgument('2147483648'), '2147483648')
		assert.equal(numberArgument('99999999999'), '99999999999')
		assert.equal(numberArgument('0.1'), '0.1')
	})
})

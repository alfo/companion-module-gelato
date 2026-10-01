import type { CompanionActionDefinitions } from '@companion-module/base'
import type ModuleInstance from './main.js'
import { COMMANDS, type ActionsSchema } from './commands.js'

export type { ActionsSchema }

export function UpdateActions(self: ModuleInstance): void {
	const actions: Record<string, unknown> = {}
	for (const [id, command] of Object.entries(COMMANDS)) {
		actions[id] = {
			name: command.name,
			description: command.description,
			options: command.options,
			callback: (event: { options: never }) => {
				const message = command.toOSC(event.options, self.values)
				if (message) self.send(message.address, message.args)
			},
		}
	}
	self.setActionDefinitions(actions as CompanionActionDefinitions<ActionsSchema>)
}

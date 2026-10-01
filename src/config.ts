import { Regex, type SomeCompanionConfigField } from '@companion-module/base'
import { defaultOptions, type Protocol } from './connection.js'

export type ModuleConfig = {
	host: string
	port: number
	protocol: Protocol
	feedbackPort: number
}

export const defaultConfig: ModuleConfig = {
	host: '',
	port: defaultOptions.port,
	protocol: defaultOptions.protocol,
	feedbackPort: defaultOptions.feedbackPort,
}

export function GetConfigFields(): SomeCompanionConfigField[] {
	return [
		{
			type: 'static-text',
			id: 'info',
			label: 'Gelato',
			width: 12,
			value:
				'Turn on Remote Control in Gelato and use the host and port it shows. With TCP, feedback comes back on the same connection and nothing else needs setting in Gelato.',
		},
		{
			type: 'textinput',
			id: 'host',
			label: 'Gelato host',
			tooltip: 'The Mac running Gelato: its IP address or name',
			width: 8,
			regex: Regex.HOSTNAME,
		},
		{
			type: 'number',
			id: 'port',
			label: 'Port',
			width: 4,
			min: 1,
			max: 65535,
			default: defaultConfig.port,
		},
		{
			type: 'dropdown',
			id: 'protocol',
			label: 'Protocol',
			width: 6,
			disableAutoExpression: true,
			default: defaultConfig.protocol,
			choices: [
				{ id: 'tcp', label: 'TCP (recommended)' },
				{ id: 'udp', label: 'UDP' },
			],
		},
		{
			type: 'number',
			id: 'feedbackPort',
			label: 'Feedback port (UDP only)',
			tooltip:
				"The port this module listens on. In Gelato's Remote Control settings, set the feedback host to this computer and the feedback port to this number.",
			width: 6,
			min: 1,
			max: 65535,
			default: defaultConfig.feedbackPort,
			isVisibleExpression: '$(options:protocol) == "udp"',
		},
	]
}

/** The saved config with anything missing filled in. */
export function withDefaults(config: Partial<ModuleConfig> | undefined): ModuleConfig {
	return { ...defaultConfig, ...config }
}

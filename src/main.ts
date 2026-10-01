import { InstanceBase, InstanceStatus, type SomeCompanionConfigField } from '@companion-module/base'
import { GetConfigFields, withDefaults, type ModuleConfig } from './config.js'
import { defaultOptions, GelatoConnection, type ConnectionOptions, type LinkStatus } from './connection.js'
import { UpdateVariableDefinitions, type VariablesSchema } from './variables.js'
import { UpgradeScripts } from './upgrades.js'
import { UpdateActions, type ActionsSchema } from './actions.js'
import { UpdateFeedbacks, type FeedbacksSchema } from './feedbacks.js'
import { UpdatePresets } from './presets.js'
import { initialValues, parseFeedback, type VariableValues } from './state.js'
import type { OSCMessage } from './osc.js'

export type ModuleSchema = {
	config: ModuleConfig
	secrets: undefined
	actions: ActionsSchema
	feedbacks: FeedbacksSchema
	variables: VariablesSchema
}

export { UpgradeScripts }

export default class ModuleInstance extends InstanceBase<ModuleSchema> {
	config!: ModuleConfig // Set up in init()
	/** Every variable's current value: what feedbacks and actions read. */
	values: VariableValues = initialValues()
	/** Ping and reconnect timing: tests shorten it. */
	timing: Partial<ConnectionOptions> = {}
	private link?: GelatoConnection

	constructor(internal: unknown) {
		super(internal)
	}

	async init(config: ModuleConfig): Promise<void> {
		this.config = withDefaults(config)

		this.updateActions()
		this.updateFeedbacks()
		this.updatePresets()
		this.updateVariableDefinitions()
		this.setVariableValues(this.values)

		this.connect()
	}

	async destroy(): Promise<void> {
		this.link?.stop()
		this.link = undefined
	}

	async configUpdated(config: ModuleConfig): Promise<void> {
		this.config = withDefaults(config)
		this.connect()
	}

	getConfigFields(): SomeCompanionConfigField[] {
		return GetConfigFields()
	}

	/** Sends a command, or says why it didn't go. */
	send(address: string, args: (string | number)[]): void {
		if (!this.link?.send(address, args)) this.log('warn', `Not connected: ${address} was not sent`)
	}

	private connect(): void {
		this.link?.stop()
		this.link = undefined
		this.resetValues()
		const { host, port, protocol, feedbackPort } = this.config
		if (!host) {
			this.updateStatus(InstanceStatus.BadConfig, 'Set the Gelato host')
			return
		}
		this.updateStatus(InstanceStatus.Connecting)
		this.link = new GelatoConnection(
			{ ...defaultOptions, ...this.timing, host, port, protocol, feedbackPort },
			{
				onMessage: (message) => this.received(message),
				onStatus: (status) => this.linkChanged(status),
				onLog: (level, text) => this.log(level, text),
			},
		)
		this.link.start()
	}

	private received(message: OSCMessage): void {
		const patch = parseFeedback(message)
		if (!patch) return
		Object.assign(this.values, patch)
		this.setVariableValues(patch)
		this.checkAllFeedbacks()
	}

	private linkChanged({ state, message }: LinkStatus): void {
		switch (state) {
			case 'ok':
				this.updateStatus(InstanceStatus.Ok)
				return
			case 'connecting':
				this.updateStatus(InstanceStatus.Connecting)
				break
			case 'no-reply':
				this.updateStatus(InstanceStatus.ConnectionFailure, message)
				break
			case 'error':
				this.updateStatus(InstanceStatus.ConnectionFailure, message)
				break
			case 'closed':
				this.updateStatus(InstanceStatus.Disconnected)
				break
		}
		// Without a link the buttons show nothing, not the last thing Gelato said.
		this.resetValues()
	}

	private resetValues(): void {
		this.values = initialValues()
		this.setVariableValues(this.values)
		this.checkAllFeedbacks()
	}

	updateActions(): void {
		UpdateActions(this)
	}

	updateFeedbacks(): void {
		UpdateFeedbacks(this)
	}

	updatePresets(): void {
		UpdatePresets(this)
	}

	updateVariableDefinitions(): void {
		UpdateVariableDefinitions(this)
	}
}

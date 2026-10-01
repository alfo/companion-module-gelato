import type ModuleInstance from './main.js'
import { variableDefinitions, type VariableValues } from './state.js'

export type VariablesSchema = VariableValues

export function UpdateVariableDefinitions(self: ModuleInstance): void {
	self.setVariableDefinitions(variableDefinitions())
}

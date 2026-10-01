import type ModuleInstance from './main.js'
import { variableDefinitions, type VariableValues } from './state.js'
import { viewDefinitions } from './view.js'

export type VariablesSchema = VariableValues

export function UpdateVariableDefinitions(self: ModuleInstance): void {
	self.setVariableDefinitions({ ...variableDefinitions(), ...viewDefinitions() })
}

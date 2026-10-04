import type { CompanionStaticUpgradeScript } from '@companion-module/base'
import type { ModuleConfig } from './config.js'

/** Gelato's API is US English (Gelato R-06): the add-colour actions are the add-color actions. */
const RENAMED_ACTIONS: Record<string, string> = {
	add_colour: 'add_color',
	add_colour_brand: 'add_color_brand',
}

/** 0.2.0: buttons made with 0.1.0 press the renamed actions. */
export const renameColourActions: CompanionStaticUpgradeScript<ModuleConfig> = (_context, props) => {
	const updatedActions = props.actions.filter((action) => action.actionId in RENAMED_ACTIONS)
	for (const action of updatedActions) action.actionId = RENAMED_ACTIONS[action.actionId]
	return { updatedConfig: null, updatedActions, updatedFeedbacks: [] }
}

/** Once a script is added it cannot be removed or reordered. */
export const UpgradeScripts: CompanionStaticUpgradeScript<ModuleConfig>[] = [renameColourActions]

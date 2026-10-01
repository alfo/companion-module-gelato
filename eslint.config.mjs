import { generateEslintConfig } from '@companion-module/tools/eslint/config.mjs'

const config = await generateEslintConfig({
	enableTypescript: true,
})

export default [
	{ ignores: ['dist-test/**'] },
	...config,
	{
		// node:test's describe() and it() return promises that the runner awaits.
		files: ['src/__tests__/**'],
		rules: { '@typescript-eslint/no-floating-promises': 'off' },
	},
]

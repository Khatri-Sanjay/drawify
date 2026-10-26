// @ts-check
const eslint = require('@eslint/js');
const { defineConfig } = require('eslint/config');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');
const prettier = require('eslint-config-prettier');
const globals = require('globals');

module.exports = defineConfig([
	{
		ignores: [
			'node_modules/**',
			'dist/**',
			'out-tsc/**',
			'.angular/**',
			'.npm-cache/**',
			'.vercel/**',
			'coverage/**',
			'playwright-report/**',
			'test-results/**',
		],
	},
	{
		files: ['**/*.{js,cjs,mjs}'],
		extends: [eslint.configs.recommended],
		languageOptions: { globals: globals.node },
	},
	{
		files: ['**/*.ts'],
		extends: [
			eslint.configs.recommended,
			tseslint.configs.recommended,
			tseslint.configs.stylistic,
			angular.configs.tsRecommended,
		],
		processor: angular.processInlineTemplates,
		rules: {
			'@angular-eslint/directive-selector': [
				'error',
				{
					type: 'attribute',
					prefix: 'app',
					style: 'camelCase',
				},
			],
			'@angular-eslint/component-selector': [
				'error',
				{
					type: 'element',
					prefix: 'app',
					style: 'kebab-case',
				},
			],
		},
	},
	{
		files: ['**/*.html'],
		extends: [angular.configs.templateRecommended, angular.configs.templateAccessibility],
		rules: {},
	},
	prettier,
]);

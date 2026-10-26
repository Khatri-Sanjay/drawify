import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
	testDir: './e2e',
	fullyParallel: false,
	use: {
		baseURL: process.env['BASE_URL'] || 'http://localhost:4000',
		...devices['Desktop Chrome'],
	},
	webServer: process.env['BASE_URL']
		? undefined
		: {
				command: 'node dist/drawify/server/server.mjs',
				url: 'http://localhost:4000',
				reuseExistingServer: false,
			},
	reporter: 'list',
});

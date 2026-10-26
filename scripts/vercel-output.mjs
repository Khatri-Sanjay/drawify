import { cp, mkdir, writeFile } from 'node:fs/promises';
const output = '.vercel/output';
const fn = `${output}/functions/render.func`;
await mkdir(fn, { recursive: true });
await cp('dist/drawify/browser', `${output}/static`, { recursive: true });
await cp('dist/drawify/server', `${fn}/server`, { recursive: true });
// Angular's Node engine resolves its browser manifest relative to the server bundle.
await cp('dist/drawify/browser', `${fn}/browser`, { recursive: true });
await writeFile(
	`${fn}/index.mjs`,
	"export { reqHandler as default } from './server/server.mjs';\n",
);
await writeFile(
	`${fn}/.vc-config.json`,
	JSON.stringify({
		runtime: 'nodejs24.x',
		handler: 'index.mjs',
		launcherType: 'Nodejs',
		supportsResponseStreaming: true,
	}),
);
await writeFile(
	`${output}/config.json`,
	JSON.stringify(
		{ version: 3, routes: [{ handle: 'filesystem' }, { src: '/(.*)', dest: '/render' }] },
		null,
		2,
	),
);
console.log('Vercel Build Output API: static landing/assets + Angular Node SSR function.');

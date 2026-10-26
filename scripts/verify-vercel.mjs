import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import handler from '../.vercel/output/functions/render.func/index.mjs';
const config = JSON.parse(
	await readFile(new URL('../.vercel/output/config.json', import.meta.url), 'utf8'),
);
assert.equal(config.version, 3);
assert.equal(config.routes.at(-1).dest, '/render');
const server = createServer(handler);
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
try {
	const address = server.address();
	const base = `http://127.0.0.1:${address.port}`;
	const home = await fetch(base);
	assert.equal(home.status, 200);
	assert.match(await home.text(), /Big ideas\./);
	const editor = await fetch(`${base}/editor`);
	assert.equal(editor.status, 200);
	assert.match(await editor.text(), /Your creative space/);
	const missing = await fetch(`${base}/missing`);
	assert.equal(missing.status, 404);
	console.log('Packaged Vercel Node handler: landing 200, editor SSR 200, unknown route 404.');
} finally {
	server.closeAllConnections();
	await new Promise((resolve) => server.close(resolve));
}

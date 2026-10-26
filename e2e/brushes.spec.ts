import { expect, Page, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const names = [
	'Normal',
	'Sketchy',
	'Square',
	'Spray',
	'Calligraphy',
	'Charcoal',
	'Neon',
	'Dotted',
	'Watercolor',
	'Ink',
	'Marker',
	'Emboss',
];
async function choose(page: Page, name: string) {
	const toggle = page.getByRole('button', { name: /^Choose brush style/ });
	if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click();
	await page.getByRole('button', { name: 'All', exact: true }).click();
	await page.getByRole('button', { name: 'Use ' + name + ' brush', exact: true }).click();
	await expect(toggle).toHaveAttribute('aria-expanded', 'false');
	await expect(toggle).toHaveAttribute('aria-label', 'Choose brush style, current: ' + name);
}
async function draw(page: Page, x = 100, y = 120, length = 230) {
	const canvas = page.locator('canvas'),
		box = (await canvas.boundingBox())!,
		scale = box.width / 1200;
	await page.mouse.move(box.x + x * scale, box.y + y * scale);
	await page.mouse.down();
	await page.mouse.move(box.x + (x + length * 0.3) * scale, box.y + (y + 30) * scale, {
		steps: 8,
	});
	await page.mouse.move(box.x + (x + length * 0.65) * scale, box.y + (y - 20) * scale, {
		steps: 8,
	});
	await page.mouse.move(box.x + (x + length) * scale, box.y + (y + 12) * scale, { steps: 8 });
	await page.mouse.up();
}
async function pixels(page: Page) {
	return page.locator('canvas').evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
}
async function project(page: Page) {
	const wait = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Save project', exact: true }).click();
	return JSON.parse((await readFile((await (await wait).path())!)).toString());
}
test.beforeEach(async ({ page }) => {
	await page.goto('/editor');
	await expect(page.getByRole('button', { name: 'Projects', exact: true })).toBeEnabled();
});

test('all 12 brushes produce distinct real strokes and the library offers visual previews', async ({
	page,
}) => {
	await page.setViewportSize({ width: 1440, height: 1100 });
	await page.getByLabel('Stroke', { exact: true }).fill('#7254c9');
	await expect(
		page.getByRole('group', { name: 'Brush styles', exact: true }).getByRole('button'),
	).toHaveCount(12);
	await page.screenshot({ path: 'test-results/brush-library-desktop.png', fullPage: true });
	const signatures = new Set<string>();
	for (const name of names) {
		await choose(page, name);
		await page.locator('#size').fill('24');
		await draw(page);
		const signature = await pixels(page);
		signatures.add(signature);
		await page.getByRole('button', { name: 'Undo', exact: true }).click();
	}
	expect(signatures.size).toBe(12);
	for (const [i, name] of names.entries()) {
		await choose(page, name);
		await page.locator('#size').fill('24');
		await draw(page, 65 + (i % 3) * 380, 90 + Math.floor(i / 3) * 180, 230);
	}
	const saved = await project(page);
	expect(saved.scene.objects).toHaveLength(12);
	expect(
		saved.scene.objects.map((o: { config: { brushType: string } }) => o.config.brushType),
	).toEqual(names.map((n) => n.toLowerCase()));
	// Labels are only for the visual QA contact sheet; the editable document stores the actual strokes.
	await page.locator('canvas').evaluate((canvas: HTMLCanvasElement, names) => {
		const c = canvas.getContext('2d')!;
		c.font = '18px Arial';
		c.fillStyle = '#334155';
		names.forEach((name, i) =>
			c.fillText(name, 65 + (i % 3) * 380, 35 + Math.floor(i / 3) * 180),
		);
	}, names);
	await page.locator('canvas').screenshot({ path: 'test-results/brush-effects.png' });
});

test('textured strokes stay identical after undo, redo and reload, and match SVG export', async ({
	page,
}) => {
	for (const name of ['Spray', 'Charcoal', 'Neon', 'Watercolor']) {
		await choose(page, name);
		await page.getByLabel('Stroke', { exact: true }).fill('#8b5cf6');
		await draw(page);
		const before = await pixels(page);
		await page.getByRole('button', { name: 'Undo', exact: true }).click();
		expect(await pixels(page)).not.toBe(before);
		await page.getByRole('button', { name: 'Redo', exact: true }).click();
		expect(await pixels(page)).toBe(before);
		const document = await project(page);
		expect(document.scene.objects[0].config.brushSeed).toBeGreaterThanOrEqual(0);
		expect(document.scene.objects[0].config.brushType).toBe(name.toLowerCase());
		await page.getByRole('button', { name: 'More export options', exact: true }).click();
		const options = page.getByRole('dialog', { name: 'Export your artwork' });
		await options.getByLabel('Export format').selectOption('svg');
		const wait = page.waitForEvent('download');
		await options.getByRole('button', { name: 'Download SVG', exact: true }).click();
		const bytes = await readFile((await (await wait).path())!);
		const comparison = await page
			.locator('canvas')
			.evaluate(async (canvas: HTMLCanvasElement, data) => {
				const image = new Image();
				image.src = 'data:image/svg+xml;base64,' + data;
				await image.decode();
				const output = document.createElement('canvas');
				output.width = canvas.width;
				output.height = canvas.height;
				const c = output.getContext('2d')!;
				c.drawImage(image, 0, 0);
				const actual = canvas.getContext('2d')!.getImageData(50, 50, 360, 190).data,
					exported = c.getImageData(50, 50, 360, 190).data;
				let ink = 0,
					mismatch = 0;
				for (let i = 0; i < actual.length; i += 4) {
					const a = Math.min(actual[i], actual[i + 1], actual[i + 2]) < 250,
						b = Math.min(exported[i], exported[i + 1], exported[i + 2]) < 250;
					if (a || b) {
						ink++;
						if (
							Math.max(
								Math.abs(actual[i] - exported[i]),
								Math.abs(actual[i + 1] - exported[i + 1]),
								Math.abs(actual[i + 2] - exported[i + 2]),
							) > 12
						)
							mismatch++;
					}
				}
				return { ink, mismatch };
			}, bytes.toString('base64'));
		expect(comparison.ink).toBeGreaterThan(30);
		expect(comparison.mismatch / comparison.ink).toBeLessThan(0.06);
		await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
		await page.reload();
		await expect(page.getByRole('button', { name: 'Projects', exact: true })).toBeEnabled();
		await expect.poll(() => pixels(page)).toBe(before);
		// A recovered project starts a fresh history; create a new document for the next style.
		await page.getByRole('button', { name: 'Projects', exact: true }).click();
		await page.getByRole('button', { name: 'New drawing', exact: true }).click();
	}
});

test('flow, spacing and nib angle give immediate feedback and selected strokes can be restyled', async ({
	page,
}) => {
	await choose(page, 'Dotted');
	const preview = page.getByRole('img', { name: 'Dotted live stroke preview', exact: true }),
		count = await preview.locator('path').count();
	await page.getByLabel('Tip spacing', { exact: true }).fill('300');
	await expect.poll(() => preview.locator('path').count()).toBeLessThan(count);
	await choose(page, 'Calligraphy');
	await page.getByLabel('Tip angle', { exact: true }).fill('30');
	const before = await page
		.getByRole('img', { name: 'Calligraphy live stroke preview', exact: true })
		.locator('path')
		.first()
		.getAttribute('d');
	await page.getByLabel('Tip angle', { exact: true }).fill('-30');
	expect(
		await page
			.getByRole('img', { name: 'Calligraphy live stroke preview', exact: true })
			.locator('path')
			.first()
			.getAttribute('d'),
	).not.toBe(before);
	await page.getByLabel('Brush flow', { exact: true }).fill('60');
	await draw(page);
	const original = await project(page);
	expect(original.scene.objects[0].config).toMatchObject({
		brushType: 'calligraphy',
		brushFlow: 0.6,
		brushAngle: -30,
	});
	await page.getByRole('button', { name: 'Select objects (V)', exact: true }).click();
	await page.getByRole('button', { name: 'Select layer brush', exact: true }).click();
	await page.getByLabel('Selected brush style', { exact: true }).selectOption('spray');
	let edited = await project(page);
	expect(edited.scene.objects[0].config.brushType).toBe('spray');
	expect(edited.scene.objects[0].config.brushSeed).toBe(
		original.scene.objects[0].config.brushSeed,
	);
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	edited = await project(page);
	expect(edited.scene.objects[0].config.brushType).toBe('calligraphy');
});

test('brush library filtering, presets and controls remain usable on a phone', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	const studio = page.getByRole('region', { name: 'Brush studio' });
	await studio.getByRole('button', { name: 'Creative', exact: true }).click();
	await expect(studio.getByRole('button', { name: /^Use / })).toHaveCount(3);
	await expect(studio.getByRole('button', { name: 'Use Spray brush', exact: true })).toHaveCount(
		0,
	);
	await studio.getByRole('button', { name: 'Use Neon brush', exact: true }).click();
	await expect(
		studio.getByRole('img', { name: 'Neon live stroke preview', exact: true }),
	).toBeVisible();
	await page.getByLabel('Brush flow', { exact: true }).fill('50');
	await studio.getByRole('button', { name: 'Reset brush', exact: true }).click();
	await expect(page.getByLabel('Brush flow', { exact: true })).toHaveValue('100');
	expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
		390,
	);
	await page.screenshot({ path: 'test-results/brush-studio-mobile.png', fullPage: true });
});

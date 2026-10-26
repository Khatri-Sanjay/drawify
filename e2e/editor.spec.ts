import { readFile } from 'node:fs/promises';
import { expect, test, Page } from '@playwright/test';
async function pixel(page: Page, x: number, y: number) {
	return page
		.locator('canvas')
		.evaluate(
			(canvas: HTMLCanvasElement, p) => [
				...canvas.getContext('2d')!.getImageData(p.x, p.y, 1, 1).data,
			],
			{ x, y },
		);
}
async function draw(page: Page, x = 100, y = 100, endX = 260, endY = 200) {
	const canvas = page.locator('canvas');
	await canvas.scrollIntoViewIfNeeded();
	const box = (await canvas.boundingBox())!;
	const scale = box.width / 1200;
	await page.mouse.move(box.x + x * scale, box.y + y * scale);
	await page.mouse.down();
	await page.mouse.move(box.x + endX * scale, box.y + endY * scale, { steps: 12 });
	await page.mouse.up();
}
test('server renders landing, editor, and a true 404 without browser globals', async ({
	request,
}) => {
	const home = await request.get('/');
	expect(home.status()).toBe(200);
	expect(await home.text()).toContain('Big ideas.');
	const editor = await request.get('/editor');
	expect(editor.status()).toBe(200);
	expect(await editor.text()).toContain('Your creative space');
	expect((await request.get('/missing')).status()).toBe(404);
});
test.beforeEach(async ({ page }) => {
	await page.goto('/editor');
	await expect.poll(() => pixel(page, 50, 50)).toEqual([255, 255, 255, 255]);
});
test('freehand, selection, colors, size, undo, redo, and export', async ({ page }) => {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.getByRole('button', { name: 'Brush', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Brush', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true',
	);
	await page.locator('#size').fill('20');
	await page.getByLabel('Stroke', { exact: true }).fill('#ff0000');
	await draw(page);
	await expect.poll(() => pixel(page, 180, 150)).toEqual([255, 0, 0, 255]);
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	expect(await pixel(page, 180, 150)).toEqual([255, 255, 255, 255]);
	await page.getByRole('button', { name: 'Redo', exact: true }).click();
	expect(await pixel(page, 180, 150)).toEqual([255, 0, 0, 255]);
	const download = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Export PNG' }).click();
	const exported = await download;
	expect(exported.suggestedFilename()).toBe('Untitled drawing.png');
	const bytes = await readFile((await exported.path())!);
	expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
	expect(bytes.readUInt32BE(16)).toBe(1200);
	expect(bytes.readUInt32BE(20)).toBe(800);
	expect(errors).toEqual([]);
});
test('all shapes render, clear can be cancelled and undone, background replays', async ({
	page,
}) => {
	await page.getByRole('button', { name: 'Rectangle', exact: true }).click();
	await page.getByLabel('Shape style').selectOption('fill');
	await page.getByLabel('Fill', { exact: true }).fill('#00ff00');
	for (const tool of ['Rectangle', 'Circle', 'Ellipse']) {
		await page.getByRole('button', { name: tool, exact: true }).click();
		await draw(page);
		expect(await pixel(page, 180, 150)).toEqual([0, 255, 0, 255]);
		await page.getByRole('button', { name: 'Undo', exact: true }).click();
	}
	await page.getByRole('button', { name: 'Line', exact: true }).click();
	await draw(page);
	expect(await pixel(page, 180, 150)).not.toEqual([255, 255, 255, 255]);
	await page.getByRole('button', { name: 'Clear canvas', exact: true }).click();
	await page.getByRole('button', { name: 'Keep drawing' }).click();
	expect(await pixel(page, 180, 150)).not.toEqual([255, 255, 255, 255]);
	await page.getByRole('button', { name: 'Clear canvas', exact: true }).click();
	await page.getByRole('dialog').getByRole('button', { name: 'Clear canvas' }).click();
	expect(await pixel(page, 180, 150)).toEqual([255, 255, 255, 255]);
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	expect(await pixel(page, 180, 150)).not.toEqual([255, 255, 255, 255]);
	await page.getByLabel('Canvas background').fill('#0000ff');
	await page.getByLabel('Canvas background').dispatchEvent('change');
	expect(await pixel(page, 20, 20)).toEqual([0, 0, 255, 255]);
});
test('image import, picker, eraser, text, zoom and reload', async ({ page }) => {
	const image = await page.locator('canvas').evaluate((canvas: HTMLCanvasElement) => {
		const c = canvas.getContext('2d')!;
		c.fillStyle = '#ff0000';
		c.fillRect(0, 0, 50, 50);
		return canvas.toDataURL().split(',')[1];
	});
	await page.getByLabel('Import image file').setInputFiles({
		name: 'test.png',
		mimeType: 'image/png',
		buffer: Buffer.from(image, 'base64'),
	});
	await expect.poll(() => pixel(page, 20, 20)).toEqual([255, 0, 0, 255]);
	await page.getByRole('button', { name: 'Color picker', exact: true }).click();
	await draw(page, 20, 20, 20, 20);
	await expect(page.getByLabel('Stroke', { exact: true })).toHaveValue('#ff0000');
	await page.getByRole('button', { name: 'Eraser', exact: true }).click();
	await draw(page, 20, 20, 20, 20);
	expect(await pixel(page, 20, 20)).toEqual([255, 255, 255, 255]);
	await page.getByRole('button', { name: 'Text', exact: true }).click();
	await draw(page, 100, 100, 100, 100);
	await page.getByRole('textbox', { name: 'Canvas text', exact: true }).fill('Drawify');
	await page.getByRole('button', { name: 'Done', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled();
	const inkPixels = await page.locator('canvas').evaluate((canvas: HTMLCanvasElement) => {
		const data = canvas.getContext('2d')!.getImageData(95, 95, 180, 60).data;
		let count = 0;
		for (let i = 0; i < data.length; i += 4) if (data[i + 1] < 200) count++;
		return count;
	});
	expect(inkPixels).toBeGreaterThan(20);
	await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
	await expect(page.locator('canvas')).toHaveCSS('width', '1200px');
	page.on('dialog', (dialog) => dialog.accept());
	await page.reload();
	await expect(page.getByRole('heading', { name: 'Your creative space' })).toBeVisible();
});
test('mobile editor provides reachable tools and settings', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await expect(page.getByRole('button', { name: 'Projects', exact: true })).toBeInViewport({
		ratio: 1,
	});
	await expect(page.getByRole('button', { name: 'Save project', exact: true })).toBeInViewport({
		ratio: 1,
	});
	await expect(
		page.getByRole('button', { name: 'More export options', exact: true }),
	).toBeInViewport({ ratio: 1 });
	await page.getByRole('button', { name: 'Rectangle', exact: true }).click();
	await page.getByLabel('Shape style').selectOption('both');
	await expect(page.getByLabel('Shape style')).toHaveValue('both');
});

test('pencil click, keyboard history and invalid import', async ({ page }) => {
	await page.getByRole('button', { name: 'Pencil (1 px)', exact: true }).click();
	await draw(page, 100, 100, 250, 100);
	expect(await pixel(page, 170, 100)).not.toEqual([255, 255, 255, 255]);
	await page.locator('canvas').focus();
	await page.keyboard.press('Control+z');
	expect(await pixel(page, 170, 100)).toEqual([255, 255, 255, 255]);
	await page.keyboard.press('Control+Shift+z');
	expect(await pixel(page, 170, 100)).not.toEqual([255, 255, 255, 255]);
	await page.getByLabel('Import image file').setInputFiles({
		name: 'broken.png',
		mimeType: 'image/png',
		buffer: Buffer.from('invalid'),
	});
	await expect(page.getByRole('alert')).toBeVisible();
});
test('landing and editor visual review with no hydration errors', async ({ page }) => {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.setViewportSize({ width: 1440, height: 1000 });
	await page.goto('/');
	await page.screenshot({ path: 'test-results/home-desktop.png', fullPage: true });
	await page.getByRole('link', { name: 'Start creating' }).click();
	await expect.poll(() => pixel(page, 50, 50)).toEqual([255, 255, 255, 255]);
	await page.screenshot({ path: 'test-results/editor-desktop.png', fullPage: true });
	await page.setViewportSize({ width: 390, height: 844 });
	await page.screenshot({ path: 'test-results/editor-mobile.png', fullPage: true });
	expect(errors).toEqual([]);
});

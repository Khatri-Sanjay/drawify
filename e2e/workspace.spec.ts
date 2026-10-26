import { expect, Page, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

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
async function drag(page: Page, x: number, y: number, endX: number, endY: number) {
	const box = (await page.locator('canvas').boundingBox())!,
		scale = box.width / 1200;
	await page.mouse.move(box.x + x * scale, box.y + y * scale);
	await page.mouse.down();
	await page.mouse.move(box.x + endX * scale, box.y + endY * scale, { steps: 12 });
	await page.mouse.up();
}
async function rectangle(page: Page, color = '#ff0000') {
	await page.getByRole('button', { name: 'Rectangle', exact: true }).click();
	await page.getByLabel('Shape style').selectOption('fill');
	await page.getByLabel('Fill', { exact: true }).fill(color);
	await drag(page, 100, 100, 300, 250);
	await expect
		.poll(() => pixel(page, 150, 150))
		.toEqual(color === '#ff0000' ? [255, 0, 0, 255] : [0, 255, 0, 255]);
}
async function projectBytes(page: Page): Promise<Buffer> {
	const wait = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Save project', exact: true }).click();
	return readFile((await (await wait).path())!);
}
async function exportedPixels(
	page: Page,
	bytes: Buffer,
	type: string,
	points: { x: number; y: number }[],
) {
	return page.evaluate(
		async ({ data, type, points }) => {
			const image = new Image();
			image.src = `data:${type};base64,${data}`;
			await image.decode();
			const canvas = document.createElement('canvas');
			canvas.width = image.naturalWidth;
			canvas.height = image.naturalHeight;
			const c = canvas.getContext('2d')!;
			c.drawImage(image, 0, 0);
			return {
				width: canvas.width,
				height: canvas.height,
				pixels: points.map((p) => [...c.getImageData(p.x, p.y, 1, 1).data]),
			};
		},
		{ data: bytes.toString('base64'), type, points },
	);
}
test.beforeEach(async ({ page }) => {
	await page.goto('/editor');
	await expect(page.getByRole('button', { name: 'Projects', exact: true })).toBeEnabled();
});

test('autosave recovers editable artwork, name and tool settings after refresh', async ({
	page,
}) => {
	await page.getByLabel('Document name').fill('Recovered sketch');
	await rectangle(page);
	await page.getByRole('slider', { name: /^Opacity/ }).fill('60');
	await page.getByLabel('Dashed strokes').check();
	await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
	await page.reload();
	await expect(page.getByRole('button', { name: 'Projects', exact: true })).toBeEnabled();
	await expect(page.getByLabel('Document name')).toHaveValue('Recovered sketch');
	await expect.poll(() => pixel(page, 150, 150)).toEqual([255, 0, 0, 255]);
	await expect(page.getByRole('slider', { name: /^Opacity/ })).toHaveValue('60');
	await expect(page.getByLabel('Dashed strokes')).toBeChecked();
	await page.getByRole('button', { name: 'Select objects (V)', exact: true }).click();
	await drag(page, 150, 150, 200, 180);
	await expect(page.getByLabel('Offset X')).toHaveValue('50');
	await expect(page.getByLabel('Offset Y')).toHaveValue('30');
});

test('selection transforms, duplication, lock, hide, reordering and delete are undoable', async ({
	page,
}) => {
	await rectangle(page);
	await page.getByRole('button', { name: 'Select objects (V)', exact: true }).click();
	await drag(page, 150, 150, 250, 200);
	await expect(page.getByLabel('Offset X')).toHaveValue('100');
	await page.getByLabel('Object width').fill('300');
	await page.getByLabel('Object width').press('Tab');
	await page.getByLabel('Rotation (degrees)').fill('30');
	await page.getByLabel('Rotation (degrees)').press('Tab');
	await expect(page.getByLabel('Object width')).toHaveValue('300');
	await page.getByRole('button', { name: 'Duplicate', exact: true }).click();
	await expect(page.getByText('2 objects', { exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Lock rectangle copy', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Delete', exact: true })).toBeDisabled();
	await page.getByRole('button', { name: 'Unlock rectangle copy', exact: true }).click();
	await page.getByRole('button', { name: 'Hide rectangle copy', exact: true }).click();
	await expect(
		page.getByRole('button', { name: 'Show rectangle copy', exact: true }),
	).toBeVisible();
	await page.getByRole('button', { name: 'Show rectangle copy', exact: true }).click();
	await page.getByRole('button', { name: 'Lower rectangle copy', exact: true }).click();
	await page.getByRole('button', { name: 'Delete', exact: true }).click();
	await expect(page.getByText('1 objects', { exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect(page.getByText('2 objects', { exact: true })).toBeVisible();
	const project = JSON.parse((await projectBytes(page)).toString());
	expect(project.scene.objects[0].name).toBe('rectangle copy');
	expect(project.scene.objects[1].transform.rotation).toBe(30);
});

test('project gallery creates, opens, imports and deletes separate projects', async ({ page }) => {
	await page.getByLabel('Document name').fill('First drawing');
	await rectangle(page);
	const bytes = await projectBytes(page);
	await page.getByRole('button', { name: 'Projects', exact: true }).click();
	await page.getByRole('button', { name: 'New drawing', exact: true }).click();
	await expect(page.getByLabel('Document name')).toHaveValue('Untitled drawing');
	await expect.poll(() => pixel(page, 150, 150)).toEqual([255, 255, 255, 255]);
	await page.getByLabel('Document name').fill('Second drawing');
	await page.getByRole('button', { name: 'Projects', exact: true }).click();
	await expect(
		page.getByRole('button', { name: 'Open project First drawing', exact: true }),
	).toBeVisible();
	await page.getByRole('button', { name: 'Open project First drawing', exact: true }).click();
	await expect(page.getByLabel('Document name')).toHaveValue('First drawing');
	await expect.poll(() => pixel(page, 150, 150)).toEqual([255, 0, 0, 255]);
	await page.getByRole('button', { name: 'Projects', exact: true }).click();
	await page
		.getByLabel('Open project file')
		.setInputFiles({ name: 'art.drawify', mimeType: 'application/json', buffer: bytes });
	await expect(page.getByRole('dialog')).not.toBeVisible();
	await expect.poll(() => pixel(page, 150, 150)).toEqual([255, 0, 0, 255]);
	await page.getByRole('button', { name: 'Projects', exact: true }).click();
	await page.getByRole('button', { name: 'Delete project Second drawing', exact: true }).click();
	await page.getByRole('button', { name: 'Confirm delete', exact: true }).click();
	await expect(
		page.getByRole('button', { name: 'Open project Second drawing', exact: true }),
	).toHaveCount(0);
	await expect(page.locator('img[alt="First drawing preview"]').first()).toBeVisible();
	await page.getByRole('button', { name: 'Close projects', exact: true }).click();
	await page.getByRole('button', { name: 'Projects', exact: true }).click();
	await page.getByLabel('Open project file').setInputFiles({
		name: 'broken.drawify',
		mimeType: 'application/json',
		buffer: Buffer.from('{"format":"wrong"}'),
	});
	await expect(page.getByRole('alert')).toBeVisible();
	await expect.poll(() => pixel(page, 150, 150)).toEqual([255, 0, 0, 255]);
});

test('pointer handles resize and rotate as individual undoable edits', async ({ page }) => {
	await rectangle(page);
	await page.getByRole('button', { name: 'Select objects (V)', exact: true }).click();
	await drag(page, 150, 150, 150, 150);
	const handle = page.getByRole('button', { name: 'Resize selected object', exact: true });
	const corner = (await handle.boundingBox())!;
	await page.mouse.move(corner.x + corner.width / 2, corner.y + corner.height / 2);
	await page.mouse.down();
	await page.mouse.move(corner.x + corner.width / 2 + 35, corner.y + corner.height / 2 + 25, {
		steps: 8,
	});
	await page.mouse.up();
	await expect
		.poll(async () => Number(await page.getByLabel('Object width').inputValue()))
		.toBeGreaterThan(250);
	const rotate = (await page
		.getByRole('button', { name: 'Rotate selected object', exact: true })
		.boundingBox())!;
	const origin = (await page.locator('.selection-box').boundingBox())!;
	const cx = origin.x + origin.width / 2,
		cy = origin.y + origin.height / 2;
	const radius = cy - (rotate.y + rotate.height / 2);
	await page.mouse.move(rotate.x + rotate.width / 2, rotate.y + rotate.height / 2);
	await page.mouse.down();
	await page.mouse.move(cx + radius, cy, { steps: 12 });
	await page.mouse.up();
	await expect
		.poll(async () => Number(await page.getByLabel('Rotation (degrees)').inputValue()))
		.toBeGreaterThan(88);
	expect(Number(await page.getByLabel('Rotation (degrees)').inputValue())).toBeLessThan(92);
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect(page.getByLabel('Rotation (degrees)')).toHaveValue('0.0');
	await page
		.getByRole('button', { name: 'Rotate selected object', exact: true })
		.press('ArrowRight');
	await expect(page.getByLabel('Rotation (degrees)')).toHaveValue('1.0');
	await expect(page.getByLabel('Offset X')).toHaveValue('0');
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect(page.getByLabel('Object width')).toHaveValue('200');
});

test('arrowheads, dash gaps, opacity and smoothing settings are retained in exports and projects', async ({
	page,
}) => {
	await page.getByRole('button', { name: 'Arrow', exact: true }).click();
	await page.getByLabel('Stroke', { exact: true }).fill('#0000ff');
	await page.getByRole('slider', { name: /^Opacity/ }).fill('50');
	await page.getByLabel('Dashed strokes').check();
	await page.getByLabel('Smooth freehand strokes').uncheck();
	await drag(page, 100, 100, 300, 100);
	const project = JSON.parse((await projectBytes(page)).toString());
	expect(project.scene.objects[0].config).toMatchObject({
		tool: 'arrow',
		opacity: 0.5,
		dashed: true,
		smoothing: false,
	});
	await page.getByRole('button', { name: 'More export options', exact: true }).click();
	await page.getByLabel('Transparent background').check();
	const wait = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Download PNG', exact: true }).click();
	const bytes = await readFile((await (await wait).path())!);
	const headRegion = Array.from({ length: 24 * 12 }, (_, i) => ({
		x: 276 + (i % 24),
		y: 84 + Math.floor(i / 24),
	}));
	const result = await exportedPixels(page, bytes, 'image/png', [
		{ x: 110, y: 100 },
		{ x: 130, y: 100 },
		...headRegion,
	]);
	expect(result.pixels[0]).toEqual([0, 0, 255, 128]);
	expect(result.pixels[1][3]).toBe(0);
	expect(result.pixels.slice(2).some((pixel) => pixel[3] > 0)).toBe(true);
});

test('custom PNG and SVG exports preserve transparency and ordered eraser masks', async ({
	page,
}) => {
	await rectangle(page);
	await page.getByRole('button', { name: 'Eraser', exact: true }).click();
	await page.locator('#size').fill('40');
	await drag(page, 200, 130, 200, 210);
	for (const type of ['png', 'svg']) {
		await page.getByRole('button', { name: 'More export options', exact: true }).click();
		await page.getByLabel('Export format').selectOption(type);
		await page.getByLabel('Export width').fill('600');
		await page.getByLabel('Export width').press('Tab');
		await expect(page.getByLabel('Export height')).toHaveValue('400');
		await page.getByLabel('Transparent background').check();
		const wait = page.waitForEvent('download');
		await page
			.getByRole('button', { name: 'Download ' + type.toUpperCase(), exact: true })
			.click();
		const bytes = await readFile((await (await wait).path())!);
		const result = await exportedPixels(
			page,
			bytes,
			type === 'png' ? 'image/png' : 'image/svg+xml',
			[
				{ x: 10, y: 10 },
				{ x: 60, y: 60 },
				{ x: 100, y: 80 },
			],
		);
		expect(result.width).toBe(600);
		expect(result.height).toBe(400);
		expect(result.pixels[0][3]).toBe(0);
		expect(result.pixels[1]).toEqual([255, 0, 0, 255]);
		expect(result.pixels[2][3]).toBe(0);
		if (type === 'svg') {
			const svg = bytes.toString();
			expect(svg).toContain('<path');
			expect(svg).toContain('<mask');
		}
	}
});

test('images survive editable file import and browser recovery', async ({ page }) => {
	const buffer = await page.evaluate(() => {
		const canvas = document.createElement('canvas');
		canvas.width = 40;
		canvas.height = 40;
		const c = canvas.getContext('2d')!;
		c.fillStyle = '#00ff00';
		c.fillRect(0, 0, 40, 40);
		return canvas.toDataURL().split(',')[1];
	});
	await page.getByLabel('Import image file').setInputFiles({
		name: 'green.png',
		mimeType: 'image/png',
		buffer: Buffer.from(buffer, 'base64'),
	});
	await expect.poll(() => pixel(page, 20, 20)).toEqual([0, 255, 0, 255]);
	const bytes = await projectBytes(page);
	expect(JSON.parse(bytes.toString()).scene.objects[0].src).toContain('data:image/png');
	await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
	await page.reload();
	await expect.poll(() => pixel(page, 20, 20)).toEqual([0, 255, 0, 255]);
	await page.getByRole('button', { name: 'Projects', exact: true }).click();
	await page.getByRole('button', { name: 'New drawing', exact: true }).click();
	await page.getByRole('button', { name: 'Projects', exact: true }).click();
	await page
		.getByLabel('Open project file')
		.setInputFiles({ name: 'image.drawify', mimeType: 'application/json', buffer: bytes });
	await expect.poll(() => pixel(page, 20, 20)).toEqual([0, 255, 0, 255]);
});

test('hand pan, cursor centered zoom and fit do not change artwork', async ({ page }) => {
	await rectangle(page);
	await page.getByRole('button', { name: 'Reset', exact: true }).click();
	const workspace = page.getByLabel('Canvas workspace'),
		box = (await workspace.boundingBox())!;
	await page.getByRole('button', { name: 'Hand / pan (H or hold Space)', exact: true }).click();
	await page.mouse.move(box.x + 350, box.y + 250);
	await page.mouse.down();
	await page.mouse.move(box.x + 180, box.y + 150, { steps: 5 });
	await page.mouse.up();
	const scroll = await workspace.evaluate((element) => ({
		x: element.scrollLeft,
		y: element.scrollTop,
	}));
	expect(scroll.x).toBeGreaterThan(0);
	const before = await page.locator('canvas').boundingBox();
	await page.mouse.move(box.x + 300, box.y + 200);
	await page.keyboard.down('Control');
	await page.mouse.wheel(0, -150);
	await page.keyboard.up('Control');
	await expect
		.poll(async () => (await page.locator('canvas').boundingBox())!.width)
		.toBeGreaterThan(before!.width);
	await page.getByRole('button', { name: 'Fit to screen', exact: true }).click();
	await expect
		.poll(async () => (await page.locator('canvas').boundingBox())!.width)
		.toBeLessThan(box.width);
	await expect.poll(() => pixel(page, 150, 150)).toEqual([255, 0, 0, 255]);
	const project = JSON.parse((await projectBytes(page)).toString());
	expect(project.scene.objects).toHaveLength(1);
});

test('autosave waits for active strokes and quota failures preserve unsaved artwork', async ({
	page,
}) => {
	await page.getByLabel('Document name').fill('Long stroke');
	const box = (await page.locator('canvas').boundingBox())!;
	await page.mouse.move(box.x + 90, box.y + 90);
	await page.mouse.down();
	await page.mouse.move(box.x + 150, box.y + 100);
	// A stroke must stay active across the autosave debounce interval.
	await page.waitForTimeout(700);
	await page.mouse.move(box.x + 230, box.y + 100);
	await page.mouse.up();
	const p = JSON.parse((await projectBytes(page)).toString());
	expect(p.scene.objects).toHaveLength(1);
	expect(p.scene.objects[0].points.at(-1).x).toBeCloseTo(230 / 0.75, 0);
	await page.evaluate(() => {
		IDBObjectStore.prototype.put = function () {
			throw new DOMException('Storage is full', 'QuotaExceededError');
		};
	});
	await page.getByLabel('Document name').fill('Still here');
	await expect(page.getByRole('alert')).toContainText('Storage is full');
	const backup = JSON.parse((await projectBytes(page)).toString());
	expect(backup.name).toBe('Still here');
	expect(backup.scene.objects).toHaveLength(1);
	await page.getByRole('button', { name: 'Projects', exact: true }).click();
	await page.getByRole('button', { name: 'New drawing', exact: true }).click();
	await expect(page.getByLabel('Document name')).toHaveValue('Still here');
});

import { expect, Page, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const editorUrl = () =>
	new URL('/editor', String(test.info().project.use.baseURL ?? 'http://localhost:4000')).href;

async function ready(page: Page, url = '/editor') {
	await page.goto(url);
	await expect(page.getByRole('button', { name: 'Projects', exact: true })).toBeEnabled();
}
async function drag(page: Page, x: number, y: number, endX: number, endY: number) {
	const canvas = page.locator('canvas'),
		box = (await canvas.boundingBox())!,
		width = await canvas.evaluate((c: HTMLCanvasElement) => c.width),
		scale = box.width / width;
	await page.mouse.move(box.x + x * scale, box.y + y * scale);
	await page.mouse.down();
	await page.mouse.move(box.x + endX * scale, box.y + endY * scale, { steps: 8 });
	await page.mouse.up();
}
async function rectangle(page: Page, x = 100, y = 100, endX = 200, endY = 180) {
	await page.getByRole('button', { name: 'Rectangle', exact: true }).click();
	await page.getByLabel('Shape style', { exact: true }).selectOption('fill');
	await page.getByLabel('Fill', { exact: true }).fill('#ff0000');
	await drag(page, x, y, endX, endY);
}
async function project(page: Page) {
	const wait = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Save project', exact: true }).click();
	return JSON.parse((await readFile((await (await wait).path())!)).toString());
}
async function pixel(page: Page, x: number, y: number) {
	return page
		.locator('canvas')
		.evaluate(
			(c: HTMLCanvasElement, p) => [...c.getContext('2d')!.getImageData(p.x, p.y, 1, 1).data],
			{ x, y },
		);
}
async function saved(page: Page) {
	await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
}

test('selected colors, opacity, width and text edit existing objects with undo', async ({
	page,
}) => {
	await ready(page);
	await rectangle(page);
	await page.getByRole('button', { name: 'Select objects (V)', exact: true }).click();
	await drag(page, 150, 140, 150, 140);
	await page.getByLabel('Selected fill', { exact: true }).fill('#00ff00');
	await page.getByLabel('Selected fill', { exact: true }).dispatchEvent('change');
	await expect.poll(() => pixel(page, 150, 140)).toEqual([0, 255, 0, 255]);
	await page.getByLabel('Selected opacity', { exact: true }).fill('50');
	await page.getByLabel('Selected opacity', { exact: true }).dispatchEvent('change');
	await expect.poll(() => pixel(page, 150, 140)).toEqual([127, 255, 127, 255]);
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect.poll(() => pixel(page, 150, 140)).toEqual([0, 255, 0, 255]);
	await page.getByRole('button', { name: 'Text', exact: true }).click();
	await drag(page, 350, 200, 350, 200);
	await page.getByRole('textbox', { name: 'Canvas text', exact: true }).fill('Initial text');
	await page.getByRole('button', { name: 'Done', exact: true }).click();
	await page.getByRole('button', { name: 'Select objects (V)', exact: true }).click();
	await page.getByRole('button', { name: 'Edit text', exact: true }).click();
	await page.getByRole('textbox', { name: 'Canvas text', exact: true }).fill('Changed text');
	await page.getByRole('button', { name: 'Done', exact: true }).click();
	await page.getByLabel('Font size (px)', { exact: true }).fill('60');
	await page.getByLabel('Font size (px)', { exact: true }).press('Tab');
	const result = await project(page);
	expect(result.scene.objects[1].config).toMatchObject({ text: 'Changed text', fontSize: 60 });
	await page.screenshot({ path: 'test-results/selected-styles.png', fullPage: true });
});

test('marquee and shift selection group, move, resize, rotate and ungroup together', async ({
	page,
}) => {
	await ready(page);
	await rectangle(page, 100, 100, 180, 180);
	await rectangle(page, 260, 130, 340, 210);
	await page.getByRole('button', { name: 'Select objects (V)', exact: true }).click();
	await drag(page, 70, 70, 380, 240);
	await expect(page.getByText('2 selected objects', { exact: false })).toBeVisible();
	await page.getByRole('button', { name: 'Group', exact: true }).click();
	let result = await project(page);
	expect(result.scene.objects[0].groupId).toBeTruthy();
	expect(result.scene.objects[1].groupId).toBe(result.scene.objects[0].groupId);
	await page.getByRole('button', { name: 'Deselect', exact: true }).click();
	await drag(page, 120, 120, 160, 150);
	result = await project(page);
	expect(
		result.scene.objects.map((o: { transform: { x: number; y: number } }) => o.transform),
	).toEqual([
		expect.objectContaining({ x: 40, y: 30 }),
		expect.objectContaining({ x: 40, y: 30 }),
	]);
	await page.getByLabel('Selection width').fill('480');
	await page.getByLabel('Selection width').press('Tab');
	result = await project(page);
	expect(
		result.scene.objects.map((o: { transform: { scaleX: number } }) => o.transform.scaleX),
	).toEqual([2, 2]);
	await page
		.getByRole('button', { name: 'Rotate selected object', exact: true })
		.press('ArrowRight');
	result = await project(page);
	expect(
		result.scene.objects.map((o: { transform: { rotation: number } }) => o.transform.rotation),
	).toEqual([1, 1]);
	await page.getByRole('button', { name: 'Ungroup', exact: true }).click();
	await page.getByRole('button', { name: 'Deselect', exact: true }).click();
	await page.getByRole('button', { name: 'Select layer rectangle', exact: true }).first().click();
	await page
		.getByRole('button', { name: 'Select layer rectangle', exact: true })
		.last()
		.click({ modifiers: ['Shift'] });
	await expect(page.getByText('2 selected objects', { exact: false })).toBeVisible();
	await page.getByRole('button', { name: 'Duplicate', exact: true }).click();
	expect((await project(page)).scene.objects).toHaveLength(4);
});

test('alignment, distribution and grid snapping are undoable and grid stays out of exports', async ({
	page,
}) => {
	await ready(page);
	await rectangle(page, 100, 100, 160, 160);
	await rectangle(page, 240, 180, 300, 240);
	await rectangle(page, 500, 140, 560, 200);
	await page.getByRole('button', { name: 'Layers', exact: true }).click();
	await page.getByRole('button', { name: 'Select all', exact: true }).click();
	await page.getByRole('button', { name: 'Align top', exact: true }).click();
	let result = await project(page);
	expect(
		result.scene.objects.map(
			(o: { points: { y: number }[]; transform: { y: number } }) =>
				o.points[0].y + o.transform.y,
		),
	).toEqual([100, 100, 100]);
	await page.getByRole('button', { name: 'Distribute horizontally', exact: true }).click();
	result = await project(page);
	expect(result.scene.objects[1].points[0].x + result.scene.objects[1].transform.x).toBe(300);
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	result = await project(page);
	expect(result.scene.objects[1].transform.x).toBe(0);
	await page.getByRole('button', { name: 'Deselect', exact: true }).click();
	await page.getByLabel('Show grid', { exact: true }).check();
	await page.getByLabel('Snap to grid', { exact: true }).check();
	await page.getByLabel('Grid spacing (px)').fill('25');
	await page.getByLabel('Grid spacing (px)').press('Tab');
	await rectangle(page, 380, 300, 480, 400);
	result = await project(page);
	expect(result.scene.objects.at(-1).points).toEqual([
		{ x: 375, y: 300 },
		{ x: 475, y: 400 },
	]);
	await expect(page.locator('.canvas-grid')).toBeVisible();
	expect(await pixel(page, 25, 25)).toEqual([255, 255, 255, 255]);
	await saved(page);
	await page.reload();
	await expect(page.getByRole('button', { name: 'Projects', exact: true })).toBeEnabled();
	await expect(page.getByLabel('Show grid', { exact: true })).toBeChecked();
	await expect(page.getByLabel('Grid spacing (px)')).toHaveValue('25');
});

test('canvas crop, proportional scaling, undo and file recovery keep editable objects', async ({
	page,
}) => {
	await ready(page);
	await rectangle(page);
	await page.getByRole('button', { name: 'Canvas size', exact: true }).click();
	await page.getByLabel('Canvas width', { exact: true }).fill('600');
	await page.getByLabel('Canvas height', { exact: true }).fill('400');
	await page.getByRole('button', { name: 'Apply canvas size', exact: true }).click();
	await expect(page.locator('canvas')).toHaveAttribute('width', '600');
	await expect.poll(() => pixel(page, 150, 140)).toEqual([255, 0, 0, 255]);
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect(page.locator('canvas')).toHaveAttribute('width', '1200');
	await page.getByRole('button', { name: 'Canvas size', exact: true }).click();
	await page.getByLabel('Canvas width', { exact: true }).fill('600');
	await page.getByLabel('Canvas height', { exact: true }).fill('600');
	await page.getByLabel('Resize behavior').selectOption('scale');
	await page.getByRole('button', { name: 'Apply canvas size', exact: true }).click();
	await expect.poll(() => pixel(page, 75, 170)).toEqual([255, 0, 0, 255]);
	const result = await project(page);
	expect(result.scene.dimensions).toEqual({ width: 600, height: 600 });
	expect(result.scene.objects[0].transform.scaleX).toBe(0.5);
	await saved(page);
	await page.reload();
	await expect(page.locator('canvas')).toHaveAttribute('height', '600');
	await expect.poll(() => pixel(page, 75, 170)).toEqual([255, 0, 0, 255]);
});

for (const broadcast of [true, false]) {
	test(`cross-tab saves protect newer work ${broadcast ? 'with notifications' : 'using the atomic revision guard alone'}`, async ({
		browser,
	}) => {
		const context = await browser.newContext();
		if (!broadcast)
			await context.addInitScript(() =>
				Object.defineProperty(globalThis, 'BroadcastChannel', { value: undefined }),
			);
		try {
			const first = await context.newPage();
			first.on('dialog', (d) => d.accept());
			await ready(first, editorUrl());
			await first.getByLabel('Document name').fill('Shared project');
			await rectangle(first);
			await saved(first);
			const second = await context.newPage();
			second.on('dialog', (d) => d.accept());
			await ready(second, first.url());
			await saved(second);
			await first.getByLabel('Document name').fill('Newer saved title');
			await saved(first);
			if (broadcast)
				await expect(
					second.getByRole('alert', { name: 'Project save conflict' }),
				).toBeVisible();
			await second.getByLabel('Document name').fill('My separate edits');
			await expect(
				second.getByRole('alert', { name: 'Project save conflict' }),
			).toBeVisible();
			const preserved = await project(first);
			expect(preserved.name).toBe('Newer saved title');
			await second.getByRole('button', { name: 'Save as new project', exact: true }).click();
			await saved(second);
			await expect(second.getByLabel('Document name')).toHaveValue(
				'My separate edits (copy)',
			);
			expect((await project(second)).scene.objects).toHaveLength(1);
			await first.getByLabel('Document name').fill('Still original');
			await saved(first);
			await expect(second.getByRole('alert', { name: 'Project save conflict' })).toHaveCount(
				0,
			);
		} finally {
			await context.close();
		}
	});
}

test('conflicting tabs can explicitly discard local edits and reload the saved version', async ({
	browser,
}) => {
	const context = await browser.newContext();
	try {
		const first = await context.newPage();
		await ready(first, editorUrl());
		await first.getByLabel('Document name').fill('Original');
		await saved(first);
		const second = await context.newPage();
		await ready(second, first.url());
		await saved(second);
		await first.getByLabel('Document name').fill('Latest version');
		await saved(first);
		await expect(second.getByRole('alert', { name: 'Project save conflict' })).toBeVisible();
		await second
			.getByRole('button', { name: 'Discard my changes and reload', exact: true })
			.click();
		await expect(second.getByLabel('Document name')).toHaveValue('Latest version');
		await expect(second.getByRole('alert', { name: 'Project save conflict' })).toHaveCount(0);
		await second.getByLabel('Document name').fill('New edit after reload');
		await saved(second);
	} finally {
		await context.close();
	}
});

test('two fingers zoom and pan without placing text; one finger can still draw', async ({
	browser,
}) => {
	const context = await browser.newContext({
		viewport: { width: 1024, height: 900 },
		hasTouch: true,
		isMobile: true,
	});
	try {
		const page = await context.newPage();
		await ready(page, editorUrl());
		await page.getByRole('button', { name: 'Text', exact: true }).click();
		const session = await context.newCDPSession(page),
			viewport = page.getByLabel('Canvas workspace'),
			box = (await viewport.boundingBox())!,
			cx = box.x + 220,
			cy = box.y + 180;
		const touch = (id: number, x: number, y: number) => ({
			id,
			x,
			y,
			radiusX: 5,
			radiusY: 5,
			force: 1,
		});
		const width = (await page.locator('canvas').boundingBox())!.width;
		await session.send('Input.dispatchTouchEvent', {
			type: 'touchStart',
			touchPoints: [touch(1, cx - 35, cy)],
		});
		await session.send('Input.dispatchTouchEvent', {
			type: 'touchStart',
			touchPoints: [touch(1, cx - 35, cy), touch(2, cx + 35, cy)],
		});
		await session.send('Input.dispatchTouchEvent', {
			type: 'touchMove',
			touchPoints: [touch(1, cx - 75, cy), touch(2, cx + 75, cy)],
		});
		await expect
			.poll(async () => (await page.locator('canvas').boundingBox())!.width)
			.toBeGreaterThan(width * 1.8);
		const before = await viewport.evaluate((e) => e.scrollLeft);
		await session.send('Input.dispatchTouchEvent', {
			type: 'touchMove',
			touchPoints: [touch(1, cx - 125, cy), touch(2, cx + 25, cy)],
		});
		await expect
			.poll(() => viewport.evaluate((e) => e.scrollLeft))
			.toBeGreaterThan(before + 30);
		await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
		expect((await project(page)).scene.objects).toHaveLength(0);
		await session.send('Input.dispatchTouchEvent', {
			type: 'touchStart',
			touchPoints: [touch(1, cx, cy)],
		});
		await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
		await expect(page.getByRole('textbox', { name: 'Canvas text', exact: true })).toBeVisible();
		await page.getByRole('textbox', { name: 'Canvas text', exact: true }).fill('Touch text');
		await page.getByRole('button', { name: 'Done', exact: true }).click();
		expect((await project(page)).scene.objects).toHaveLength(1);
	} finally {
		await context.close();
	}
});

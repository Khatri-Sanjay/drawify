import { expect, Page, test } from '@playwright/test';

async function hoverCanvas(page: Page) {
	const canvas = (await page.locator('canvas').boundingBox())!,
		viewport = (await page.getByLabel('Canvas workspace').boundingBox())!;
	const point = {
		x: Math.max(canvas.x, viewport.x) + 100,
		y: Math.max(canvas.y, viewport.y) + 100,
	};
	await page.mouse.move(point.x, point.y);
	return point;
}
test('drawing cursor stays centered and visible on light and dark canvases with zoom-correct brush sizes', async ({
	page,
}) => {
	await page.goto('/editor');
	await expect(page.getByRole('button', { name: 'Projects', exact: true })).toBeEnabled();
	const cursor = page.locator('.drawing-cursor'),
		footprint = page.locator('.brush-footprint');
	let point = await hoverCanvas(page);
	await expect(cursor).toBeVisible();
	await expect(page.locator('canvas')).toHaveCSS('cursor', 'none');
	await expect(footprint).toHaveCSS('width', '6px');
	let bounds = (await cursor.boundingBox())!;
	expect(bounds.x + bounds.width / 2).toBeCloseTo(point.x, 1);
	expect(bounds.y + bounds.height / 2).toBeCloseTo(point.y, 1);
	await page.locator('#size').fill('80');
	point = await hoverCanvas(page);
	await expect(footprint).toHaveCSS('width', '60px');
	await page.screenshot({
		path: 'test-results/cursor-light.png',
		clip: { x: point.x - 55, y: point.y - 55, width: 110, height: 110 },
	});
	const pixel = () =>
		page
			.locator('canvas')
			.evaluate((canvas: HTMLCanvasElement) => [
				...canvas.getContext('2d')!.getImageData(140, 140, 1, 1).data,
			]);
	expect(await pixel()).toEqual([255, 255, 255, 255]);
	await page.getByLabel('Canvas background', { exact: true }).fill('#000000');
	await page.getByLabel('Canvas background', { exact: true }).dispatchEvent('change');
	point = await hoverCanvas(page);
	await expect(cursor).toBeVisible();
	await expect.poll(pixel).toEqual([0, 0, 0, 255]);
	await page.screenshot({
		path: 'test-results/cursor-dark.png',
		clip: { x: point.x - 55, y: point.y - 55, width: 110, height: 110 },
	});
	await page.getByRole('button', { name: 'Reset', exact: true }).click();
	point = await hoverCanvas(page);
	await expect(footprint).toHaveCSS('width', '80px');
	bounds = (await cursor.boundingBox())!;
	expect(bounds.x + bounds.width / 2).toBeCloseTo(point.x, 1);
	await page.getByRole('button', { name: 'Pencil (1 px)', exact: true }).click();
	await hoverCanvas(page);
	await expect(footprint).toHaveCSS('width', '1px');
	await page.getByRole('button', { name: 'Eraser', exact: true }).click();
	await hoverCanvas(page);
	await expect(footprint).toHaveClass(/eraser-footprint/);
	await expect(footprint).toHaveCSS('width', '80px');
});

test('tool cursor follows drawing and yields to text, selection, panning and toolbar controls', async ({
	page,
}) => {
	await page.goto('/editor');
	await expect(page.getByRole('button', { name: 'Projects', exact: true })).toBeEnabled();
	const cursor = page.locator('.drawing-cursor');
	const point = await hoverCanvas(page);
	await page.mouse.down();
	await page.mouse.move(point.x + 40, point.y + 20, { steps: 5 });
	await expect(cursor).toBeVisible();
	await page.mouse.up();
	await page.locator('canvas').focus();
	await page.keyboard.down('Space');
	await expect(cursor).toHaveCount(0);
	await expect(page.getByLabel('Canvas workspace')).toHaveCSS('cursor', 'grab');
	await page.keyboard.up('Space');
	await expect(cursor).toBeVisible();
	await page.getByRole('button', { name: 'Rectangle', exact: true }).click();
	await hoverCanvas(page);
	await expect(cursor).toHaveAttribute('data-tool', 'rectangle');
	await expect(page.locator('.brush-footprint')).toHaveCount(0);
	await page.getByRole('button', { name: 'Text', exact: true }).click();
	await hoverCanvas(page);
	await expect(cursor).toHaveAttribute('data-tool', 'text');
	await expect(cursor.locator('circle')).toHaveCount(0);
	await page.getByRole('button', { name: 'Color picker', exact: true }).click();
	await hoverCanvas(page);
	await expect(cursor).toBeVisible();
	await page.getByRole('button', { name: 'Select objects (V)', exact: true }).click();
	await hoverCanvas(page);
	await expect(cursor).toHaveCount(0);
	await expect(page.locator('canvas')).toHaveCSS('cursor', 'default');
	await page.getByRole('button', { name: 'Hand / pan (H or hold Space)', exact: true }).click();
	await hoverCanvas(page);
	await expect(cursor).toHaveCount(0);
	await expect(page.getByLabel('Canvas workspace')).toHaveCSS('cursor', 'grab');
	await page.mouse.down();
	await page.mouse.move(point.x - 20, point.y);
	await expect(page.getByLabel('Canvas workspace')).toHaveCSS('cursor', 'grabbing');
	await page.mouse.up();
	await page.getByRole('button', { name: 'Brush', exact: true }).click();
	await hoverCanvas(page);
	await expect(cursor).toBeVisible();
	await page.getByRole('button', { name: 'Export PNG', exact: true }).hover();
	await expect(cursor).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Export PNG', exact: true })).not.toHaveCSS(
		'cursor',
		'none',
	);
});

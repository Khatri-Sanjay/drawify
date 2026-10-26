import { expect, Page, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const editor = (page: Page) => page.getByRole('textbox', { name: 'Canvas text', exact: true });
const properties = (page: Page) =>
	page.getByRole('complementary', { name: 'Text properties', exact: true });
async function openText(page: Page, x = 120, y = 120) {
	await page.getByRole('button', { name: 'Text', exact: true }).click();
	await page.locator('canvas').click({ position: { x, y } });
	await expect(editor(page)).toBeVisible();
	await expect(editor(page)).toBeFocused();
	return properties(page);
}
async function projectBytes(page: Page) {
	const wait = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Save project', exact: true }).click();
	return readFile((await (await wait).path())!);
}
async function rasterStats(page: Page, bytes: Buffer, type: string) {
	return page.evaluate(
		async ({ data, type }) => {
			const image = new Image();
			image.src = `data:${type};base64,${data}`;
			await image.decode();
			const canvas = document.createElement('canvas');
			canvas.width = image.naturalWidth;
			canvas.height = image.naturalHeight;
			const c = canvas.getContext('2d')!;
			c.drawImage(image, 0, 0);
			const pixels = c.getImageData(0, 0, canvas.width, canvas.height).data;
			let minX = canvas.width,
				minY = canvas.height,
				maxX = 0,
				maxY = 0,
				count = 0;
			for (let y = 0; y < canvas.height; y++)
				for (let x = 0; x < canvas.width; x++) {
					const i = (y * canvas.width + x) * 4;
					if (pixels[i] < 240 || pixels[i + 1] < 240 || pixels[i + 2] < 240) {
						minX = Math.min(minX, x);
						minY = Math.min(minY, y);
						maxX = Math.max(maxX, x);
						maxY = Math.max(maxY, y);
						count++;
					}
				}
			return { minX, minY, maxX, maxY, count };
		},
		{ data: bytes.toString('base64'), type },
	);
}
test.beforeEach(async ({ page }) => {
	await page.goto('/editor');
	await expect(page.getByRole('button', { name: 'Projects', exact: true })).toBeEnabled();
});

test('quick formatting keeps the caret ready and typing near an edge does not move the insertion point', async ({
	page,
}) => {
	await openText(page, 700, 180);
	const input = editor(page);
	await input.fill('Start');
	const before = await input.evaluate((node) => node.offsetLeft);
	await input.press('End');
	await page.getByRole('button', { name: 'Quick bold', exact: true }).click();
	await expect(input).toBeFocused();
	await page.keyboard.type(
		' and keep typing a much longer sentence across the edge of the canvas',
	);
	await expect(input).toHaveValue(
		'Start and keep typing a much longer sentence across the edge of the canvas',
	);
	expect(await input.evaluate((node) => node.offsetLeft)).toBe(before);
	await page.getByLabel('Quick font size', { exact: true }).fill('36');
	await page.getByLabel('Quick font size', { exact: true }).press('Enter');
	await expect(input).toBeFocused();
	await expect(input).toHaveCSS('font-size', '36px');
	await page.getByRole('button', { name: 'Finish text', exact: true }).click();
	await expect(input).toHaveCount(0);
	const saved = JSON.parse((await projectBytes(page)).toString());
	expect(saved.scene.objects).toHaveLength(1);
	expect(saved.scene.objects[0].config).toMatchObject({ fontSize: 36, fontWeight: 'bold' });
});

test('long drafts scroll within the editor and transparent text remains readable while editing', async ({
	page,
}) => {
	const props = await openText(page);
	await editor(page).fill('An editable line\n'.repeat(50));
	await props.getByLabel('Text opacity', { exact: true }).fill('0');
	await expect(editor(page)).toHaveCSS('opacity', '1');
	expect((await editor(page).boundingBox())!.height).toBeLessThanOrEqual(365);
	expect(await editor(page).evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true);
	await page.getByRole('button', { name: 'Cancel editing text', exact: true }).click();
	expect(JSON.parse((await projectBytes(page)).toString()).scene.objects).toHaveLength(0);
});

test('types at the canvas position without a popup, starts black, and previews sidebar formatting live', async ({
	page,
}) => {
	await page.getByLabel('Stroke', { exact: true }).fill('#ff0000');
	const canvas = (await page.locator('canvas').boundingBox())!,
		props = await openText(page),
		input = editor(page);
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await expect(input).toHaveValue('');
	await expect(input).toHaveCSS('color', 'rgb(0, 0, 0)');
	await expect(props.getByLabel('Text color', { exact: true })).toHaveValue('#000000');
	const inputBox = (await input.boundingBox())!;
	expect(Math.abs(inputBox.x - canvas.x - 120)).toBeLessThan(2);
	expect(Math.abs(inputBox.y - canvas.y - 120)).toBeLessThan(15);
	const content = 'Hello, world!\n你好 🙂 café\nمرحبا بالعالم';
	await input.fill(content);
	await props.getByLabel('Font family', { exact: true }).selectOption('Georgia');
	await props.getByLabel('Font size (px)', { exact: true }).fill('42');
	await props.getByLabel('Font size (px)', { exact: true }).press('Tab');
	await props.getByRole('button', { name: 'Bold', exact: true }).click();
	await props.getByRole('button', { name: 'Italic', exact: true }).click();
	await props.getByRole('button', { name: 'Underline', exact: true }).click();
	await props.getByLabel('Line spacing', { exact: true }).fill('1.6');
	await props.getByLabel('Line spacing', { exact: true }).press('Tab');
	await props.getByLabel('Wrap width (px)', { exact: true }).fill('260');
	await props.getByLabel('Wrap width (px)', { exact: true }).press('Tab');
	await props.getByLabel('Text color', { exact: true }).fill('#222222');
	await expect(input).toHaveValue(content);
	await expect(input).toHaveCSS('font-size', '42px');
	await expect(input).toHaveCSS('font-weight', '700');
	await expect(input).toHaveCSS('font-style', 'italic');
	await expect(input).toHaveCSS('color', 'rgb(34, 34, 34)');
	await page.screenshot({ path: 'test-results/text-inline-desktop.png', fullPage: true });
	await props.getByRole('button', { name: 'Done', exact: true }).click();
	await expect(input).toHaveCount(0);
	const project = JSON.parse((await projectBytes(page)).toString());
	expect(project.scene.objects).toHaveLength(1);
	expect(project.scene.objects[0].config).toMatchObject({
		text: content,
		fontFamily: 'Georgia',
		fontSize: 42,
		fontWeight: 'bold',
		fontStyle: 'italic',
		underline: true,
		lineHeight: 1.6,
		textWidth: 260,
		stroke: '#222222',
		size: 8,
	});
	let wait = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Export PNG', exact: true }).click();
	const png = await readFile((await (await wait).path())!);
	await page.getByRole('button', { name: 'More export options', exact: true }).click();
	const options = page.getByRole('dialog', { name: 'Export your artwork' });
	await options.getByLabel('Export format').selectOption('svg');
	wait = page.waitForEvent('download');
	await options.getByRole('button', { name: 'Download SVG', exact: true }).click();
	const svg = await readFile((await (await wait).path())!);
	expect(svg.toString()).toContain('font-family="Georgia, serif"');
	expect(svg.toString()).toContain('direction="rtl"');
	const raster = await rasterStats(page, png, 'image/png'),
		vector = await rasterStats(page, svg, 'image/svg+xml');
	expect(raster.count).toBeGreaterThan(500);
	for (const key of ['minX', 'minY', 'maxX', 'maxY'] as const)
		expect(Math.abs(raster[key] - vector[key])).toBeLessThanOrEqual(2);
	expect(vector.count / raster.count).toBeGreaterThan(0.9);
	expect(vector.count / raster.count).toBeLessThan(1.1);
});

test('click-away commits once, Escape cancels, and selecting finished text exposes its color immediately', async ({
	page,
}) => {
	let props = await openText(page);
	await props.getByRole('button', { name: 'Done', exact: true }).click();
	expect(JSON.parse((await projectBytes(page)).toString()).scene.objects).toHaveLength(0);
	await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
	props = await openText(page);
	await editor(page).fill('First line\nSecond line');
	await editor(page).evaluate((node: HTMLTextAreaElement) => node.setSelectionRange(1, 5));
	await props.getByRole('button', { name: 'Bold', exact: true }).click();
	expect(
		await editor(page).evaluate((node: HTMLTextAreaElement) => [
			node.selectionStart,
			node.selectionEnd,
		]),
	).toEqual([1, 5]);
	// A click outside the editor and sidebar finishes the draft before selecting another tool.
	await page.getByRole('button', { name: 'Select objects (V)', exact: true }).click();
	await expect(editor(page)).toHaveCount(0);
	let project = JSON.parse((await projectBytes(page)).toString());
	expect(project.scene.objects).toHaveLength(1);
	const id = project.scene.objects[0].id;
	await properties(page).getByLabel('Text color', { exact: true }).fill('#ff0000');
	project = JSON.parse((await projectBytes(page)).toString());
	expect(project.scene.objects[0].config.stroke).toBe('#ff0000');
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect(properties(page).getByLabel('Text color', { exact: true })).toHaveValue('#000000');
	const box = (await page.locator('.selection-box').boundingBox())!;
	await page.mouse.dblclick(box.x + 15, box.y + 12);
	await expect(editor(page)).toHaveValue('First line\nSecond line');
	await editor(page).fill('Discard this');
	await page.keyboard.press('Escape');
	project = JSON.parse((await projectBytes(page)).toString());
	expect(project.scene.objects).toHaveLength(1);
	expect(project.scene.objects[0]).toMatchObject({
		id,
		config: { text: 'First line\nSecond line' },
	});
	await properties(page).getByRole('button', { name: 'Edit text', exact: true }).click();
	await editor(page).fill('Updated\nNew line\n🙂');
	await editor(page).press('Control+Enter');
	project = JSON.parse((await projectBytes(page)).toString());
	expect(project.scene.objects[0].config.text).toBe('Updated\nNew line\n🙂');
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	project = JSON.parse((await projectBytes(page)).toString());
	expect(project.scene.objects[0].config.text).toBe('First line\nSecond line');
});

test('inline editing follows zoom and rotated objects without duplicating or shifting them', async ({
	page,
}) => {
	const props = await openText(page);
	await editor(page).fill('Move and rotate');
	await props.getByRole('button', { name: 'Done', exact: true }).click();
	await page.getByRole('button', { name: 'Layers', exact: true }).click();
	await page.getByLabel('Rotation (degrees)', { exact: true }).fill('30');
	await page.getByLabel('Rotation (degrees)', { exact: true }).press('Tab');
	await page.getByRole('button', { name: 'Tool settings', exact: true }).click();
	await properties(page).getByRole('button', { name: 'Edit text', exact: true }).click();
	await expect(editor(page)).toBeVisible();
	expect(
		await editor(page).evaluate((node) => getComputedStyle(node.parentElement!).transform),
	).toContain('matrix(');
	await editor(page).fill('Rotated inline text');
	const workspace = page.getByLabel('Canvas workspace'),
		box = (await workspace.boundingBox())!;
	const before = (await editor(page).boundingBox())!.width;
	await page.mouse.move(box.x + 100, box.y + 100);
	await page.keyboard.down('Control');
	await page.mouse.wheel(0, -120);
	await page.keyboard.up('Control');
	await expect
		.poll(async () => (await editor(page).boundingBox())!.width)
		.toBeGreaterThan(before);
	await properties(page).getByRole('button', { name: 'Done', exact: true }).click();
	const project = JSON.parse((await projectBytes(page)).toString());
	expect(project.scene.objects).toHaveLength(1);
	expect(project.scene.objects[0]).toMatchObject({
		config: { text: 'Rotated inline text' },
		transform: { rotation: 30 },
	});
});

test('long inline text and its color survive recovery and editable file import', async ({
	page,
}) => {
	const content = 'A longer line with emoji 🙂 and 世界.\n'.repeat(25),
		props = await openText(page);
	await editor(page).fill(content);
	await props.getByLabel('Font family', { exact: true }).selectOption('Verdana');
	await props.getByLabel('Font size (px)', { exact: true }).fill('14');
	await props.getByLabel('Font size (px)', { exact: true }).press('Tab');
	await props.getByLabel('Text color', { exact: true }).fill('#123456');
	await props.getByRole('button', { name: 'Done', exact: true }).click();
	const bytes = await projectBytes(page);
	await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
	await page.reload();
	await expect(page.getByRole('button', { name: 'Projects', exact: true })).toBeEnabled();
	await page.getByRole('button', { name: 'Layers', exact: true }).click();
	await page.getByRole('button', { name: 'Select layer text', exact: true }).click();
	await expect(properties(page).getByLabel('Text color', { exact: true })).toHaveValue('#123456');
	await properties(page).getByRole('button', { name: 'Edit text', exact: true }).click();
	await expect(editor(page)).toHaveValue(content);
	await editor(page).press('Control+Enter');
	await page.getByRole('button', { name: 'Projects', exact: true }).click();
	await page.getByRole('button', { name: 'New drawing', exact: true }).click();
	await page.getByRole('button', { name: 'Projects', exact: true }).click();
	await page
		.getByLabel('Open project file')
		.setInputFiles({ name: 'text.drawify', mimeType: 'application/json', buffer: bytes });
	expect(JSON.parse((await projectBytes(page)).toString()).scene.objects[0].config).toMatchObject(
		{ text: content, fontFamily: 'Verdana', fontSize: 14, stroke: '#123456' },
	);
});

test('mobile text is edited on the canvas while its properties remain reachable', async ({
	page,
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	const props = await openText(page, 90, 90);
	await editor(page).fill('Mobile text\n你好 🙂');
	await props.getByLabel('Font size (px)', { exact: true }).fill('28');
	await props.getByLabel('Font size (px)', { exact: true }).press('Tab');
	await props.getByLabel('Text color', { exact: true }).fill('#800080');
	await expect(editor(page)).toHaveValue('Mobile text\n你好 🙂');
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await page.screenshot({ path: 'test-results/text-inline-mobile.png', fullPage: true });
	await props.getByRole('button', { name: 'Done', exact: true }).click();
	expect(JSON.parse((await projectBytes(page)).toString()).scene.objects[0].config).toMatchObject(
		{ text: 'Mobile text\n你好 🙂', fontSize: 28, stroke: '#800080' },
	);
});

test('older text files stay editable inline with their original typography', async ({ page }) => {
	let props = await openText(page);
	await editor(page).fill('Legacy label');
	await props.getByRole('button', { name: 'Done', exact: true }).click();
	const file = JSON.parse((await projectBytes(page)).toString());
	for (const config of [file.settings, file.scene.objects[0].config])
		for (const key of [
			'fontFamily',
			'fontSize',
			'fontWeight',
			'fontStyle',
			'underline',
			'textAlign',
			'lineHeight',
			'textWidth',
			'textDirection',
			'textColor',
			'textOpacity',
		])
			delete config[key];
	await page.getByRole('button', { name: 'Projects', exact: true }).click();
	await page.getByLabel('Open project file').setInputFiles({
		name: 'legacy.drawify',
		mimeType: 'application/json',
		buffer: Buffer.from(JSON.stringify(file)),
	});
	await page.getByRole('button', { name: 'Layers', exact: true }).click();
	await page.getByRole('button', { name: 'Select layer text', exact: true }).click();
	props = properties(page);
	await expect(props.getByLabel('Font size (px)', { exact: true })).toHaveValue('24');
	await expect(props.getByLabel('Line spacing', { exact: true })).toHaveValue('1.25');
	await props.getByRole('button', { name: 'Edit text', exact: true }).click();
	await editor(page).fill('Edited older text');
	await props.getByLabel('Font size (px)', { exact: true }).fill('24.5');
	await props.getByLabel('Font size (px)', { exact: true }).press('Tab');
	await props.getByRole('button', { name: 'Done', exact: true }).click();
	expect(JSON.parse((await projectBytes(page)).toString()).scene.objects[0].config).toMatchObject(
		{ text: 'Edited older text', fontSize: 24.5 },
	);
});

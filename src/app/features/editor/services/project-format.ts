import {
	DEFAULT_CONFIG,
	DrawingObject,
	DrawingProject,
	DrawingTool,
	Scene,
	ToolConfiguration,
	TextStyle,
	BrushConfiguration,
} from '../models/drawing';
import { brushSvg, validBrushSettings } from './brush-strokes';
import { FONT_STACKS, layoutText, validTextStyle } from './text-layout';
import { objectMatrix, objectPath } from './drawing-geometry';

const tools: DrawingTool[] = [
	'select',
	'hand',
	'pencil',
	'brush',
	'eraser',
	'line',
	'arrow',
	'rectangle',
	'ellipse',
	'circle',
	'text',
	'picker',
];
function record(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value))
		throw new Error('Invalid project structure.');
	return value as Record<string, unknown>;
}
function number(value: unknown, min: number, max: number): number {
	if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)
		throw new Error('Project contains an invalid number.');
	return value;
}
function text(value: unknown, max: number): string {
	if (typeof value !== 'string' || value.length > max)
		throw new Error('Project contains invalid text.');
	return value;
}
function color(value: unknown): string {
	if (typeof value !== 'string' || !/^#[\da-f]{6}$/i.test(value))
		throw new Error('Project contains an invalid color.');
	return value;
}
function bool(value: unknown): boolean {
	if (typeof value !== 'boolean') throw new Error('Project contains an invalid setting.');
	return value;
}
function configuration(value: unknown): ToolConfiguration {
	const v = record(value);
	if (
		!tools.includes(v['tool'] as DrawingTool) ||
		!['outline', 'fill', 'both'].includes(String(v['mode']))
	)
		throw new Error('Project contains an unknown tool.');
	return {
		...parseTextStyle(v),
		...parseBrush(v),
		...(v['textColor'] === undefined ? {} : { textColor: color(v['textColor']) }),
		...(v['textOpacity'] === undefined ? {} : { textOpacity: number(v['textOpacity'], 0, 1) }),
		tool: v['tool'] as DrawingTool,
		mode: v['mode'] as ToolConfiguration['mode'],
		stroke: color(v['stroke']),
		fill: color(v['fill']),
		size: number(v['size'], 1, 80),
		text: text(v['text'], 10000),
		opacity: number(v['opacity'], 0, 1),
		smoothing: bool(v['smoothing']),
		dashed: bool(v['dashed']),
	};
}
function parseBrush(v: Record<string, unknown>): Partial<BrushConfiguration> {
	const extras: Record<string, unknown> = {};
	for (const key of ['brushType', 'brushFlow', 'brushSpacing', 'brushAngle', 'brushSeed'])
		if (v[key] !== undefined) extras[key] = v[key];
	if (!validBrushSettings(extras as Partial<BrushConfiguration>))
		throw new Error('Project contains invalid brush settings.');
	return extras as Partial<BrushConfiguration>;
}
function parseTextStyle(v: Record<string, unknown>): Partial<TextStyle> {
	const extras: Record<string, unknown> = {};
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
	])
		if (v[key] !== undefined) extras[key] = v[key];
	if (
		!validTextStyle(extras as Partial<TextStyle>) ||
		(extras['underline'] !== undefined && typeof extras['underline'] !== 'boolean')
	)
		throw new Error('Project contains invalid text formatting.');
	return extras as Partial<TextStyle>;
}
export function parseProject(input: string): DrawingProject {
	if (input.length > 50 * 1024 * 1024) throw new Error('Project files must be under 50 MB.');
	const root = record(JSON.parse(input));
	if (root['format'] !== 'drawify' || root['version'] !== 1)
		throw new Error('Choose a supported .drawify project (version 1).');
	const scene = record(root['scene']),
		dimensions = record(scene['dimensions']);
	const width = number(dimensions['width'], 1, 8192),
		height = number(dimensions['height'], 1, 8192);
	if (!Number.isInteger(width) || !Number.isInteger(height) || width * height > 32_000_000)
		throw new Error('Project canvas is too large.');
	const list = scene['objects'];
	if (!Array.isArray(list) || list.length > 10000)
		throw new Error('Project contains too many objects.');
	let pointCount = 0;
	const ids = new Set<string>();
	const objects: DrawingObject[] = list.map((item) => {
		const o = record(item),
			t = record(o['transform']),
			id = text(o['id'], 100);
		if (!id || ids.has(id)) throw new Error('Project contains duplicate object IDs.');
		ids.add(id);
		const base = {
			...(o['opacity'] === undefined ? {} : { opacity: number(o['opacity'], 0, 1) }),
			...(o['groupId'] === undefined ? {} : { groupId: text(o['groupId'], 100) }),
			id,
			name: text(o['name'], 80),
			visible: bool(o['visible']),
			locked: bool(o['locked']),
			transform: {
				x: number(t['x'], -1_000_000, 1_000_000),
				y: number(t['y'], -1_000_000, 1_000_000),
				scaleX: number(t['scaleX'], 0.01, 100),
				scaleY: number(t['scaleY'], 0.01, 100),
				rotation: number(t['rotation'], -1_000_000, 1_000_000),
			},
		};
		if (o['kind'] === 'image') {
			const src = text(o['src'], 30 * 1024 * 1024);
			if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(src))
				throw new Error('Project images must be embedded PNG, JPEG, or WebP data.');
			return {
				...base,
				kind: 'image',
				src,
				width: number(o['width'], 0.01, 8192),
				height: number(o['height'], 0.01, 8192),
			};
		}
		if (o['kind'] !== 'draw' || !Array.isArray(o['points']) || !o['points'].length)
			throw new Error('Project contains an invalid drawing object.');
		const config = configuration(o['config']);
		if (['select', 'hand', 'picker'].includes(config.tool))
			throw new Error('Project contains an invalid drawing tool.');
		pointCount += o['points'].length;
		if (pointCount > 500_000) throw new Error('Project contains too many drawing points.');
		const points = o['points'].map((item: unknown) => {
			const p = record(item);
			return {
				x: number(p['x'], -1_000_000, 1_000_000),
				y: number(p['y'], -1_000_000, 1_000_000),
			};
		});
		return { ...base, kind: 'draw', config, points };
	});
	return {
		format: 'drawify',
		...(root['workspace'] === undefined
			? {}
			: { workspace: parseWorkspace(root['workspace']) }),
		version: 1,
		name: text(root['name'], 80),
		scene: { objects, dimensions: { width, height }, background: color(scene['background']) },
		settings: configuration(root['settings'] ?? DEFAULT_CONFIG),
	};
}

function parseWorkspace(input: unknown) {
	const w = record(input),
		gridSize = number(w['gridSize'], 2, 200);
	if (!Number.isInteger(gridSize)) throw new Error('Grid spacing must be a whole number.');
	return { showGrid: bool(w['showGrid']), snapToGrid: bool(w['snapToGrid']), gridSize };
}

const escapeXml = (value: string) =>
	value.replace(
		/[&<>"']/g,
		(c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!,
	);
export function sceneSvg(
	scene: Scene,
	width: number,
	height: number,
	transparent: boolean,
): string {
	let content = '',
		definitions = '';
	for (const [index, o] of scene.objects.entries()) {
		if (!o.visible) continue;
		const matrix = `matrix(${objectMatrix(o).join(' ')})`;
		if (o.kind === 'image') {
			content += `<image href="${escapeXml(o.src)}" width="${o.width}" height="${o.height}" opacity="${o.opacity ?? 1}" transform="${matrix}"/>`;
			continue;
		}
		const s = o.config,
			a = o.points[0],
			lineWidth = s.tool === 'pencil' ? 1 : s.size;
		const eraser = s.tool === 'eraser',
			line = ['brush', 'pencil', 'eraser', 'line', 'arrow'].includes(s.tool);
		const stroke = eraser ? 'black' : s.stroke,
			fill = eraser ? 'black' : s.fill;
		const attrs = `transform="${matrix}" opacity="${s.opacity}"`;
		let element: string;
		if (s.tool === 'brush') {
			element = `<g transform="${matrix}">${brushSvg(o)}</g>`;
		} else if (s.tool === 'text') {
			const layout = layoutText(s, a),
				style = layout.style;
			element =
				`<g transform="${matrix}">` +
				layout.lines
					.map((line) => {
						const anchor =
							style.textAlign === 'center'
								? 'middle'
								: style.textAlign === 'left'
									? line.direction === 'rtl'
										? 'end'
										: 'start'
									: line.direction === 'rtl'
										? 'start'
										: 'end';
						const label = `<text x="${line.x}" y="${line.y}" fill="${s.stroke}" opacity="${s.opacity}" font-family="${escapeXml(FONT_STACKS[style.fontFamily])}" font-size="${style.fontSize}" font-weight="${style.fontWeight}" font-style="${style.fontStyle}" text-anchor="${anchor}" direction="${line.direction}" xml:space="preserve">${escapeXml(line.text)}</text>`;
						return (
							label +
							(style.underline && line.width
								? `<line x1="${line.left}" y1="${line.y + style.fontSize * 0.12}" x2="${line.left + line.width}" y2="${line.y + style.fontSize * 0.12}" stroke="${s.stroke}" stroke-width="${Math.max(1, style.fontSize / 18)}" opacity="${s.opacity}"/>`
								: '')
						);
					})
					.join('') +
				'</g>';
		} else if (line && !['line', 'arrow'].includes(s.tool) && o.points.length === 1)
			element = `<circle cx="${a.x}" cy="${a.y}" r="${lineWidth / 2}" fill="${stroke}" ${attrs}/>`;
		else
			element = `<path d="${objectPath(o)}" fill="${line || s.mode === 'outline' ? 'none' : fill}" stroke="${line || s.mode !== 'fill' ? stroke : 'none'}" stroke-width="${lineWidth}" stroke-linecap="round" stroke-linejoin="round" ${s.dashed && !eraser ? `stroke-dasharray="${lineWidth * 3} ${lineWidth * 2}"` : ''} ${attrs}/>`;
		if (eraser) {
			definitions += `<mask id="erase-${index}" maskUnits="userSpaceOnUse" x="0" y="0" width="${scene.dimensions.width}" height="${scene.dimensions.height}" style="mask-type:luminance"><rect width="100%" height="100%" fill="white"/>${element}</mask>`;
			content = `<g mask="url(#erase-${index})">${content}</g>`;
		} else content += element;
	}
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${scene.dimensions.width} ${scene.dimensions.height}"><defs>${definitions}</defs>${transparent ? '' : `<rect width="100%" height="100%" fill="${scene.background}"/>`}${content}</svg>`;
}

export function downloadFile(blob: Blob, name: string, extension: string): void {
	const url = URL.createObjectURL(blob),
		link = document.createElement('a');
	link.href = url;
	link.download =
		(name
			.trim()
			.replace(/[^a-z0-9 _-]/gi, '')
			.slice(0, 80) || 'drawify') +
		'.' +
		extension;
	link.click();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

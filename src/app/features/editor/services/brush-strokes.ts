import {
	BRUSH_TYPES,
	BrushConfiguration,
	BrushType,
	DrawingObject,
	Point,
	ToolConfiguration,
} from '../models/drawing';
import { strokePath } from './stroke-path';

export interface BrushPreset {
	id: BrushType;
	name: string;
	description: string;
	group: 'Classic' | 'Texture' | 'Creative';
	size: number;
	spacing: number;
	angle: number;
	spacingControl: boolean;
	angleControl: boolean;
	tip: string;
}
export const BRUSH_PRESETS: readonly BrushPreset[] = [
	{
		id: 'normal',
		name: 'Normal',
		description: 'A clean, rounded everyday brush.',
		group: 'Classic',
		size: 8,
		spacing: 0.2,
		angle: -35,
		spacingControl: false,
		angleControl: false,
		tip: 'A reliable starting point for drawing and painting.',
	},
	{
		id: 'sketchy',
		name: 'Sketchy',
		description: 'Loose, overlapping pencil-like lines.',
		group: 'Texture',
		size: 12,
		spacing: 0.3,
		angle: -35,
		spacingControl: false,
		angleControl: false,
		tip: 'Try quick, loose marks for an expressive sketch.',
	},
	{
		id: 'square',
		name: 'Square',
		description: 'A crisp, square painting tip.',
		group: 'Classic',
		size: 20,
		spacing: 0.2,
		angle: 0,
		spacingControl: true,
		angleControl: true,
		tip: 'Turn the tip angle for diamond-shaped marks.',
	},
	{
		id: 'spray',
		name: 'Spray',
		description: 'Fine, scattered paint particles.',
		group: 'Texture',
		size: 40,
		spacing: 0.25,
		angle: 0,
		spacingControl: true,
		angleControl: false,
		tip: 'Drag to spray; click for a single burst. Flow controls particle density.',
	},
	{
		id: 'calligraphy',
		name: 'Calligraphy',
		description: 'An angled nib with thick and thin strokes.',
		group: 'Classic',
		size: 28,
		spacing: 0.12,
		angle: -35,
		spacingControl: true,
		angleControl: true,
		tip: 'The nib angle changes how wide each direction feels.',
	},
	{
		id: 'charcoal',
		name: 'Charcoal',
		description: 'Dry, grainy marks with broken edges.',
		group: 'Texture',
		size: 30,
		spacing: 0.2,
		angle: 0,
		spacingControl: true,
		angleControl: false,
		tip: 'Lower flow for a light, dusty sketch.',
	},
	{
		id: 'neon',
		name: 'Neon',
		description: 'A bright core surrounded by a soft glow.',
		group: 'Creative',
		size: 16,
		spacing: 0.2,
		angle: 0,
		spacingControl: false,
		angleControl: false,
		tip: 'Bright colors on a dark canvas show the glow best.',
	},
	{
		id: 'dotted',
		name: 'Dotted',
		description: 'Evenly spaced, round paint dots.',
		group: 'Creative',
		size: 12,
		spacing: 1.5,
		angle: 0,
		spacingControl: true,
		angleControl: false,
		tip: 'Increase spacing to separate the dots.',
	},
	{
		id: 'watercolor',
		name: 'Watercolor',
		description: 'Soft, translucent washes with layered pigment.',
		group: 'Texture',
		size: 48,
		spacing: 0.3,
		angle: 0,
		spacingControl: true,
		angleControl: false,
		tip: 'Overlap strokes to build up color, like a watercolor wash.',
	},
	{
		id: 'ink',
		name: 'Ink',
		description: 'A flowing stroke with tapered ends.',
		group: 'Classic',
		size: 18,
		spacing: 0.12,
		angle: 0,
		spacingControl: false,
		angleControl: false,
		tip: 'Long strokes taper naturally at the beginning and end.',
	},
	{
		id: 'marker',
		name: 'Marker',
		description: 'A broad, translucent flat-tip stroke.',
		group: 'Classic',
		size: 32,
		spacing: 0.2,
		angle: -20,
		spacingControl: false,
		angleControl: true,
		tip: 'Use it as a highlighter; overlapping strokes deepen the color.',
	},
	{
		id: 'emboss',
		name: 'Emboss',
		description: 'Raised strokes with a light edge and shaded base.',
		group: 'Creative',
		size: 24,
		spacing: 0.2,
		angle: 0,
		spacingControl: false,
		angleControl: false,
		tip: 'A medium-toned color makes the raised edge easier to see.',
	},
];
export function brushSettings(config: ToolConfiguration): BrushConfiguration {
	return {
		brushType: config.brushType ?? 'normal',
		brushFlow: config.brushFlow ?? 1,
		brushSpacing: config.brushSpacing ?? 0.2,
		brushAngle: config.brushAngle ?? -35,
		brushSeed: config.brushSeed ?? 1729,
	};
}
export function validBrushSettings(config: Partial<BrushConfiguration>): boolean {
	return (
		(config.brushType === undefined || BRUSH_TYPES.includes(config.brushType)) &&
		(config.brushFlow === undefined ||
			(Number.isFinite(config.brushFlow) &&
				config.brushFlow >= 0.05 &&
				config.brushFlow <= 1)) &&
		(config.brushSpacing === undefined ||
			(Number.isFinite(config.brushSpacing) &&
				config.brushSpacing >= 0.05 &&
				config.brushSpacing <= 3)) &&
		(config.brushAngle === undefined ||
			(Number.isFinite(config.brushAngle) &&
				config.brushAngle >= -90 &&
				config.brushAngle <= 90)) &&
		(config.brushSeed === undefined ||
			(Number.isInteger(config.brushSeed) &&
				config.brushSeed >= 0 &&
				config.brushSeed <= 0xffffffff))
	);
}
export function brushExtent(config: ToolConfiguration): number {
	const type = config.brushType ?? 'normal';
	return (
		config.size *
		{
			normal: 0.5,
			sketchy: 0.85,
			square: 0.75,
			spray: 0.65,
			calligraphy: 0.6,
			charcoal: 0.65,
			neon: 1.5,
			dotted: 0.5,
			watercolor: 0.85,
			ink: 0.8,
			marker: 0.8,
			emboss: 0.8,
		}[type]
	);
}
export interface BrushMark {
	d: string;
	color: string;
	opacity: number;
	fill: boolean;
	width: number;
	cap?: 'round' | 'butt' | 'square';
	dash?: number[];
}
const n = (value: number) => Math.round(value * 1000) / 1000;
function polygon(points: Point[]): string {
	return points.map((p, i) => `${i ? 'L' : 'M'}${n(p.x)} ${n(p.y)}`).join(' ') + 'Z';
}
function circle(x: number, y: number, r: number): string {
	r = Math.max(0.1, r);
	return `M${n(x + r)} ${n(y)}a${n(r)} ${n(r)} 0 1 0 ${n(-r * 2)} 0a${n(r)} ${n(r)} 0 1 0 ${n(r * 2)} 0Z`;
}
function ellipse(x: number, y: number, rx: number, ry: number, angle: number): string {
	const rad = (angle * Math.PI) / 180,
		dx = Math.cos(rad) * rx,
		dy = Math.sin(rad) * rx;
	return `M${n(x + dx)} ${n(y + dy)}a${n(rx)} ${n(ry)} ${angle} 1 0 ${n(-dx * 2)} ${n(-dy * 2)}a${n(rx)} ${n(ry)} ${angle} 1 0 ${n(dx * 2)} ${n(dy * 2)}Z`;
}
function tint(color: string, amount: number): string {
	const target = amount > 0 ? 255 : 0,
		a = Math.abs(amount);
	return (
		'#' +
		[1, 3, 5]
			.map((i) =>
				Math.round(parseInt(color.slice(i, i + 2), 16) * (1 - a) + target * a)
					.toString(16)
					.padStart(2, '0'),
			)
			.join('')
	);
}
function random(seed: number): () => number {
	let value = seed >>> 0;
	return () => {
		value += 0x6d2b79f5;
		let t = value;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
export function sampleStroke(
	points: Point[],
	spacing: number,
	limit = 1024,
	smooth = false,
): Point[] {
	if (!points.length) return [];
	const source =
		smooth && points.length > 2
			? points.map((p, i) =>
					i > 0 && i < points.length - 1
						? {
								x: (points[i - 1].x + 2 * p.x + points[i + 1].x) / 4,
								y: (points[i - 1].y + 2 * p.y + points[i + 1].y) / 4,
							}
						: p,
				)
			: points;
	const lengths = source.slice(1).map((p, i) => Math.hypot(p.x - source[i].x, p.y - source[i].y)),
		total = lengths.reduce((a, b) => a + b, 0);
	if (total === 0) return [{ ...source[0] }];
	const step = Math.max(0.25, spacing, total / (limit - 1)),
		result: Point[] = [{ ...source[0] }];
	let target = step,
		distance = 0;
	for (let i = 1; i < source.length; i++) {
		const a = source[i - 1],
			b = source[i],
			length = lengths[i - 1];
		while (length > 0 && target <= distance + length && result.length < limit) {
			const t = (target - distance) / length;
			result.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
			target += step;
		}
		distance += length;
	}
	const last = source.at(-1)!;
	if (
		result.length < limit &&
		Math.hypot(last.x - result.at(-1)!.x, last.y - result.at(-1)!.y) > 0.01
	)
		result.push({ ...last });
	return result;
}
function offset(points: Point[], x: number, y: number): Point[] {
	return points.map((p) => ({ x: p.x + x, y: p.y + y }));
}
function ribbon(points: Point[], width: (t: number) => number): string {
	const left: Point[] = [],
		right: Point[] = [];
	for (const [i, p] of points.entries()) {
		const before = points[Math.max(0, i - 1)],
			after = points[Math.min(points.length - 1, i + 1)],
			angle = Math.atan2(after.y - before.y, after.x - before.x) + Math.PI / 2,
			r = width(i / Math.max(1, points.length - 1)) / 2;
		left.push({ x: p.x + Math.cos(angle) * r, y: p.y + Math.sin(angle) * r });
		right.push({ x: p.x - Math.cos(angle) * r, y: p.y - Math.sin(angle) * r });
	}
	return polygon([...left, ...right.reverse()]);
}
export function brushMarks(points: Point[], config: ToolConfiguration): BrushMark[] {
	if (!points.length) return [];
	const {
			brushType: type,
			brushFlow: flow,
			brushSpacing: spacing,
			brushAngle: angle,
			brushSeed: seed,
		} = brushSettings(config),
		size = config.size,
		color = config.stroke,
		rng = random(seed ?? 1729),
		marks: BrushMark[] = [];
	const stroke = (
		path: string,
		width: number,
		opacity = 1,
		paint = color,
		cap: BrushMark['cap'] = 'round',
		dash?: number[],
	) =>
		marks.push({
			d: path,
			color: paint,
			opacity: opacity * flow,
			fill: false,
			width,
			cap,
			dash,
		});
	const fill = (path: string, opacity = 1, paint = color) =>
		marks.push({ d: path, color: paint, opacity: opacity * flow, fill: true, width: 0 });
	const path = strokePath(points, config.smoothing),
		first = points[0],
		dot = points.every((p) => p.x === first.x && p.y === first.y);
	const line = (
		width: number,
		opacity = 1,
		paint = color,
		x = 0,
		y = 0,
		cap: BrushMark['cap'] = 'round',
	) =>
		dot
			? fill(circle(first.x + x, first.y + y, width / 2), opacity, paint)
			: stroke(
					x || y ? strokePath(offset(points, x, y), config.smoothing) : path,
					width,
					opacity,
					paint,
					cap,
				);
	if (type === 'normal') {
		if (dot) fill(circle(first.x, first.y, size / 2));
		else
			stroke(path, size, 1, color, 'round', config.dashed ? [size * 3, size * 2] : undefined);
		return marks;
	}
	if (type === 'neon') {
		for (const [width, alpha] of [
			[2.8, 0.035],
			[2.4, 0.06],
			[2, 0.1],
			[1.6, 0.2],
			[1.1, 0.8],
			[0.32, 0.98],
		])
			line(size * width, alpha, width < 0.5 ? '#ffffff' : color);
		return marks;
	}
	if (type === 'emboss') {
		line(size, 0.85, tint(color, -0.55), size * 0.12, size * 0.12);
		line(size, 0.9, tint(color, 0.8), -size * 0.1, -size * 0.1);
		line(size * 0.72, 1);
		line(size * 0.12, 0.9, tint(color, 0.6), -size * 0.16, -size * 0.16);
		return marks;
	}
	if (type === 'sketchy') {
		for (let layer = 0; layer < 3; layer++) {
			const jitter = points.map((p) => ({
				x: p.x + (rng() - 0.5) * size * 0.75,
				y: p.y + (rng() - 0.5) * size * 0.75,
			}));
			if (dot) fill(circle(jitter[0].x, jitter[0].y, size * 0.13), 0.6);
			else
				stroke(
					strokePath(jitter, config.smoothing),
					Math.max(0.7, size * (layer === 0 ? 0.28 : 0.12)),
					layer === 0 ? 0.8 : 0.45,
				);
		}
		return marks;
	}
	if (type === 'marker') {
		if (dot) fill(ellipse(first.x, first.y, size * 0.55, size * 0.18, angle), 0.4);
		else {
			stroke(path, size, 0.32, color, 'butt');
			const rad = (angle * Math.PI) / 180;
			stroke(
				strokePath(
					offset(points, Math.cos(rad) * size * 0.22, Math.sin(rad) * size * 0.22),
					config.smoothing,
				),
				size * 0.16,
				0.12,
				color,
				'butt',
			);
		}
		return marks;
	}
	const cap = type === 'spray' || type === 'charcoal' ? 512 : type === 'watercolor' ? 256 : 1024;
	const sampled = sampleStroke(points, size * spacing, cap, config.smoothing);
	if (type === 'ink') {
		if (dot) fill(circle(first.x, first.y, size * 0.4));
		else fill(ribbon(sampled, (t) => size * (0.12 + Math.pow(Math.sin(Math.PI * t), 0.65))));
		return marks;
	}
	const buckets = Array.from({ length: 6 }, () => [] as string[]);
	for (const p of sampled) {
		if (type === 'square') {
			const rad = (angle * Math.PI) / 180,
				r = size / 2;
			fill(
				polygon(
					[
						[-r, -r],
						[r, -r],
						[r, r],
						[-r, r],
					].map(([x, y]) => ({
						x: p.x + x * Math.cos(rad) - y * Math.sin(rad),
						y: p.y + x * Math.sin(rad) + y * Math.cos(rad),
					})),
				),
			);
		}
		if (type === 'dotted') fill(circle(p.x, p.y, size / 2));
		if (type === 'calligraphy')
			fill(ellipse(p.x, p.y, size / 2, Math.max(0.6, size * 0.1), angle), 0.92);
		if (type === 'spray' || type === 'charcoal') {
			const count = Math.ceil(type === 'spray' ? 6 + 18 * flow : 6 + 12 * flow);
			for (let i = 0; i < count; i++) {
				const theta = rng() * Math.PI * 2,
					radius = Math.pow(rng(), type === 'spray' ? 0.8 : 0.55) * size * 0.5,
					x = p.x + Math.cos(theta) * radius,
					y = p.y + Math.sin(theta) * radius,
					r =
						type === 'spray'
							? Math.max(0.3, size * (0.008 + rng() * 0.014))
							: Math.max(0.35, size * (0.015 + rng() * 0.045));
				buckets[Math.floor(rng() * 6)].push(circle(x, y, r));
			}
		}
		if (type === 'watercolor') {
			const x = p.x + (rng() - 0.5) * size * 0.15,
				y = p.y + (rng() - 0.5) * size * 0.15,
				r = size * (0.42 + rng() * 0.12);
			fill(circle(x, y, size * 0.68), 0.025);
			fill(circle(x, y, r), 0.065);
			stroke(circle(x, y, r), Math.max(0.4, size * 0.035), 0.04);
			for (let i = 0; i < 3; i++)
				fill(
					circle(
						x + (rng() - 0.5) * size,
						y + (rng() - 0.5) * size,
						Math.max(0.25, size * 0.018),
					),
					0.08,
				);
		}
	}
	if (type === 'spray' || type === 'charcoal')
		for (const [i, bucket] of buckets.entries())
			if (bucket.length)
				fill(bucket.join(''), type === 'spray' ? 0.25 + i * 0.11 : 0.12 + i * 0.08);
	return marks;
}
const cache = new WeakMap<DrawingObject, { signature: string; marks: BrushMark[] }>();
const paths = new WeakMap<BrushMark, Path2D>();
export function objectBrushMarks(object: Extract<DrawingObject, { kind: 'draw' }>): BrushMark[] {
	const c = object.config,
		last = object.points.at(-1),
		signature = [
			c.brushType,
			c.brushFlow,
			c.brushSpacing,
			c.brushAngle,
			c.brushSeed,
			c.size,
			c.stroke,
			c.smoothing,
			c.dashed,
			object.points.length,
			last?.x,
			last?.y,
		].join('|');
	const previous = cache.get(object);
	if (previous?.signature === signature) return previous.marks;
	const marks = brushMarks(object.points, c);
	cache.set(object, { signature, marks });
	return marks;
}
export function paintBrush(
	context: CanvasRenderingContext2D,
	object: Extract<DrawingObject, { kind: 'draw' }>,
): void {
	for (const mark of objectBrushMarks(object)) {
		let path = paths.get(mark);
		if (!path) {
			path = new Path2D(mark.d);
			paths.set(mark, path);
		}
		context.globalAlpha = object.config.opacity * mark.opacity;
		context.setLineDash(mark.dash ?? []);
		context.lineCap = mark.cap ?? 'round';
		context.lineJoin = 'round';
		context.lineWidth = mark.width || 1;
		context.fillStyle = mark.color;
		context.strokeStyle = mark.color;
		if (mark.fill) context.fill(path);
		else context.stroke(path);
	}
}
export function brushSvg(object: Extract<DrawingObject, { kind: 'draw' }>): string {
	return objectBrushMarks(object)
		.map(
			(mark) =>
				`<path d="${mark.d}" fill="${mark.fill ? mark.color : 'none'}" stroke="${mark.fill ? 'none' : mark.color}" stroke-width="${mark.width}" stroke-linecap="${mark.cap ?? 'round'}" stroke-linejoin="round" opacity="${mark.opacity * object.config.opacity}"${mark.dash ? ` stroke-dasharray="${mark.dash.join(' ')}"` : ''}/>`,
		)
		.join('');
}

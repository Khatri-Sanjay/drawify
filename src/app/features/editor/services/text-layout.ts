import { Bounds, Point, TEXT_FONTS, TextStyle, ToolConfiguration } from '../models/drawing';

export const FONT_STACKS = {
	'sans-serif': 'Arial, Helvetica, sans-serif',
	serif: 'Georgia, "Times New Roman", serif',
	monospace: '"Courier New", monospace',
	Arial: 'Arial, Helvetica, sans-serif',
	Georgia: 'Georgia, serif',
	'Times New Roman': '"Times New Roman", Times, serif',
	'Courier New': '"Courier New", monospace',
	Verdana: 'Verdana, Geneva, sans-serif',
};
export function textStyle(config: ToolConfiguration): TextStyle {
	return {
		fontFamily: config.fontFamily ?? 'sans-serif',
		fontSize: config.fontSize ?? Math.max(12, config.size * 3),
		fontWeight: config.fontWeight ?? 'normal',
		fontStyle: config.fontStyle ?? 'normal',
		underline: config.underline ?? false,
		textAlign: config.textAlign ?? 'left',
		lineHeight: config.lineHeight ?? 1.25,
		textWidth: config.textWidth ?? 0,
		textDirection: config.textDirection ?? 'auto',
	};
}
export function validTextStyle(patch: Partial<TextStyle>): boolean {
	return (
		(patch.underline === undefined || typeof patch.underline === 'boolean') &&
		(patch.fontSize === undefined ||
			(Number.isFinite(patch.fontSize) && patch.fontSize >= 6 && patch.fontSize <= 512)) &&
		(patch.fontFamily === undefined || TEXT_FONTS.includes(patch.fontFamily)) &&
		(patch.fontWeight === undefined || ['normal', 'bold'].includes(patch.fontWeight)) &&
		(patch.fontStyle === undefined || ['normal', 'italic'].includes(patch.fontStyle)) &&
		(patch.textAlign === undefined || ['left', 'center', 'right'].includes(patch.textAlign)) &&
		(patch.textDirection === undefined ||
			['auto', 'ltr', 'rtl'].includes(patch.textDirection)) &&
		(patch.lineHeight === undefined ||
			(Number.isFinite(patch.lineHeight) &&
				patch.lineHeight >= 0.8 &&
				patch.lineHeight <= 3)) &&
		(patch.textWidth === undefined ||
			(Number.isFinite(patch.textWidth) &&
				(patch.textWidth === 0 || (patch.textWidth >= 40 && patch.textWidth <= 8192))))
	);
}
export function fontCss(style: TextStyle): string {
	return `${style.fontStyle} ${style.fontWeight} ${style.fontSize}px ${FONT_STACKS[style.fontFamily]}`;
}
export function lineDirection(text: string, direction: TextStyle['textDirection']): 'ltr' | 'rtl' {
	if (direction !== 'auto') return direction;
	const first = text.match(/\p{Letter}/u)?.[0] ?? '';
	return /[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufeff]/u.test(first) ? 'rtl' : 'ltr';
}
let measurement: CanvasRenderingContext2D | undefined;
const metricsCache = new Map<
	string,
	{ width: number; left: number; right: number; ascent: number; descent: number }
>();
export function initializeTextMeasurement(context: CanvasRenderingContext2D | null): void {
	measurement = context ?? undefined;
	metricsCache.clear();
}
function metrics(text: string, style: TextStyle) {
	const font = fontCss(style),
		direction = lineDirection(text, style.textDirection),
		key = font + '|' + direction + '|' + text;
	const cached = metricsCache.get(key);
	if (cached) return cached;
	let result;
	if (measurement) {
		measurement.font = font;
		measurement.textAlign = 'left';
		measurement.textBaseline = 'alphabetic';
		measurement.direction = direction;
		const m = measurement.measureText(text),
			reference = measurement.measureText('Mg');
		result = {
			width: m.width,
			left: m.actualBoundingBoxLeft || 0,
			right: m.actualBoundingBoxRight || m.width,
			ascent: Math.max(
				reference.actualBoundingBoxAscent || style.fontSize * 0.8,
				m.actualBoundingBoxAscent || 0,
			),
			descent: Math.max(
				reference.actualBoundingBoxDescent || style.fontSize * 0.2,
				m.actualBoundingBoxDescent || 0,
			),
		};
	} else {
		const width = Array.from(text).length * style.fontSize * 0.65;
		result = {
			width,
			left: 0,
			right: width,
			ascent: style.fontSize * 0.8,
			descent: style.fontSize * 0.2,
		};
	}
	if (metricsCache.size > 2000) metricsCache.clear();
	metricsCache.set(key, result);
	return result;
}
function wrap(text: string, style: TextStyle): string[] {
	const printable = Array.from(text)
		.filter((character) => character >= ' ' || '\r\n\t'.includes(character))
		.join('');
	const explicit = printable
		.replace(/\r\n?|\u2028|\u2029/g, '\n')
		.replace(/\t/g, '    ')
		.split('\n');
	if (!style.textWidth) return explicit;
	const lines: string[] = [];
	for (const line of explicit) {
		if (!line || metrics(line, style).width <= style.textWidth) {
			lines.push(line);
			continue;
		}
		const segments =
			typeof Intl.Segmenter === 'function'
				? [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(line)].map(
						(s) => s.segment,
					)
				: Array.from(line);
		let current = '';
		for (const segment of segments) {
			if (current && metrics(current + segment, style).width > style.textWidth) {
				const at = current.search(/\s+\S*$/u);
				if (at > 0) {
					lines.push(current.slice(0, at));
					current = current.slice(at).trimStart();
				} else {
					lines.push(current);
					current = '';
				}
				if (!current && /^\s+$/u.test(segment)) continue;
			}
			current += segment;
		}
		lines.push(current);
	}
	return lines;
}
export interface TextLine {
	text: string;
	x: number;
	y: number;
	width: number;
	left: number;
	direction: 'ltr' | 'rtl';
}

export function textLineBox(config: ToolConfiguration): { height: number; baseline: number } {
	const style = textStyle(config),
		height = style.fontSize * style.lineHeight;
	if (measurement) {
		measurement.font = fontCss(style);
		const metrics = measurement.measureText('Mg');
		const ascent = metrics.fontBoundingBoxAscent ?? style.fontSize * 0.8,
			descent = metrics.fontBoundingBoxDescent ?? style.fontSize * 0.2;
		return { height, baseline: (height - ascent - descent) / 2 + ascent };
	}
	return { height, baseline: (height - style.fontSize) / 2 + style.fontSize * 0.8 };
}
export function layoutText(
	config: ToolConfiguration,
	anchor: Point,
): { style: TextStyle; font: string; lines: TextLine[]; bounds: Bounds; ascent: number } {
	const style = textStyle(config),
		strings = wrap(config.text, style),
		lines: TextLine[] = [],
		extents: Bounds[] = [];
	const ascent = metrics(strings[0] ?? '', style).ascent;
	for (const [index, text] of strings.entries()) {
		const m = metrics(text, style),
			shift =
				style.textAlign === 'center'
					? m.width / 2
					: style.textAlign === 'right'
						? m.width
						: 0,
			y = anchor.y + index * style.fontSize * style.lineHeight;
		lines.push({
			text,
			x: anchor.x,
			y,
			width: m.width,
			left: anchor.x - shift,
			direction: lineDirection(text, style.textDirection),
		});
		extents.push({
			x: anchor.x - shift - m.left,
			y: y - m.ascent,
			width: Math.max(1, m.left + m.right),
			height: m.ascent + Math.max(m.descent, style.underline ? style.fontSize * 0.15 : 0),
		});
	}
	const x = Math.min(...extents.map((b) => b.x)),
		y = Math.min(...extents.map((b) => b.y));
	return {
		style,
		font: fontCss(style),
		lines,
		ascent,
		bounds: {
			x,
			y,
			width: Math.max(1, ...extents.map((b) => b.x + b.width - x)),
			height: Math.max(1, ...extents.map((b) => b.y + b.height - y)),
		},
	};
}
export function paintText(
	context: CanvasRenderingContext2D,
	config: ToolConfiguration,
	anchor: Point,
): void {
	const layout = layoutText(config, anchor),
		s = layout.style;
	context.font = layout.font;
	context.textAlign = s.textAlign;
	context.textBaseline = 'alphabetic';
	context.fillStyle = config.stroke;
	for (const line of layout.lines) {
		context.direction = line.direction;
		context.fillText(line.text, line.x, line.y);
		if (s.underline && line.width) {
			context.beginPath();
			context.setLineDash([]);
			context.strokeStyle = config.stroke;
			context.lineWidth = Math.max(1, s.fontSize / 18);
			context.moveTo(line.left, line.y + s.fontSize * 0.12);
			context.lineTo(line.left + line.width, line.y + s.fontSize * 0.12);
			context.stroke();
		}
	}
}

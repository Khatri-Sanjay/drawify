import { Bounds, DrawingObject, Point } from '../models/drawing';
import { layoutText } from './text-layout';
import { brushExtent } from './brush-strokes';
import { strokePath } from './stroke-path';
export { strokePath } from './stroke-path';

export function objectBounds(object: DrawingObject): Bounds {
	if (object.kind === 'image') return { x: 0, y: 0, width: object.width, height: object.height };
	const { points, config } = object;
	const first = points[0];
	if (!first) return { x: 0, y: 0, width: 1, height: 1 };
	if (config.tool === 'text') {
		return layoutText(config, first).bounds;
	}
	let x = first.x,
		y = first.y,
		maxX = x,
		maxY = y;
	for (const p of points) {
		x = Math.min(x, p.x);
		y = Math.min(y, p.y);
		maxX = Math.max(maxX, p.x);
		maxY = Math.max(maxY, p.y);
	}
	const width = Math.max(1, maxX - x);
	if (config.tool === 'brush' && config.brushType && config.brushType !== 'normal') {
		const padding = brushExtent(config);
		return {
			x: x - padding,
			y: y - padding,
			width: Math.max(1, maxX - x) + padding * 2,
			height: Math.max(1, maxY - y) + padding * 2,
		};
	}
	if (config.tool === 'circle') {
		const last = points.at(-1)!;
		return { x, y: last.y < first.y ? first.y - width : first.y, width, height: width };
	}
	return { x, y, width, height: Math.max(1, maxY - y) };
}

export function objectMatrix(
	object: DrawingObject,
): [number, number, number, number, number, number] {
	const b = objectBounds(object),
		t = object.transform;
	const cx = b.x + b.width / 2,
		cy = b.y + b.height / 2;
	const angle = (t.rotation * Math.PI) / 180,
		cos = Math.cos(angle),
		sin = Math.sin(angle);
	const a = cos * t.scaleX,
		d = cos * t.scaleY,
		skewY = sin * t.scaleX,
		skewX = -sin * t.scaleY;
	return [a, skewY, skewX, d, cx + t.x - a * cx - skewX * cy, cy + t.y - skewY * cx - d * cy];
}

export function localPoint(object: DrawingObject, point: Point): Point {
	const [a, b, c, d, e, f] = objectMatrix(object),
		determinant = a * d - b * c;
	return {
		x: (d * (point.x - e) - c * (point.y - f)) / determinant,
		y: (-b * (point.x - e) + a * (point.y - f)) / determinant,
	};
}

export function worldBounds(object: DrawingObject): Bounds {
	const b = objectBounds(object),
		[a, c, bx, d, e, f] = objectMatrix(object);
	const corners = [
		{ x: b.x, y: b.y },
		{ x: b.x + b.width, y: b.y },
		{ x: b.x, y: b.y + b.height },
		{ x: b.x + b.width, y: b.y + b.height },
	].map((p) => ({ x: a * p.x + bx * p.y + e, y: c * p.x + d * p.y + f }));
	return unionBounds(corners.map((p) => ({ ...p, width: 0, height: 0 })));
}
export function unionBounds(boxes: Bounds[]): Bounds {
	if (!boxes.length) return { x: 0, y: 0, width: 1, height: 1 };
	const x = Math.min(...boxes.map((b) => b.x)),
		y = Math.min(...boxes.map((b) => b.y));
	return {
		x,
		y,
		width: Math.max(1, Math.max(...boxes.map((b) => b.x + b.width)) - x),
		height: Math.max(1, Math.max(...boxes.map((b) => b.y + b.height)) - y),
	};
}
export function transformAround(
	object: DrawingObject,
	pivot: Point,
	scale: number,
	rotation: number,
	dx = 0,
	dy = 0,
): DrawingObject {
	const b = objectBounds(object),
		t = object.transform,
		cx = b.x + b.width / 2,
		cy = b.y + b.height / 2;
	const x = (cx + t.x - pivot.x) * scale,
		y = (cy + t.y - pivot.y) * scale,
		angle = (rotation * Math.PI) / 180;
	return {
		...object,
		transform: {
			x: pivot.x + x * Math.cos(angle) - y * Math.sin(angle) + dx - cx,
			y: pivot.y + x * Math.sin(angle) + y * Math.cos(angle) + dy - cy,
			scaleX: t.scaleX * scale,
			scaleY: t.scaleY * scale,
			rotation: t.rotation + rotation,
		},
	};
}

export function objectPath(object: Extract<DrawingObject, { kind: 'draw' }>): string {
	const { points, config: s } = object,
		a = points[0],
		b = points.at(-1)!;
	if (!a) return '';
	if (['brush', 'pencil', 'eraser'].includes(s.tool)) return strokePath(points, s.smoothing);
	if (s.tool === 'rectangle') return `M ${a.x} ${a.y} H ${b.x} V ${b.y} H ${a.x} Z`;
	if (s.tool === 'circle' || s.tool === 'ellipse') {
		const bounds = objectBounds(object),
			rx = bounds.width / 2,
			ry = bounds.height / 2;
		const cx = bounds.x + rx,
			cy = bounds.y + ry;
		return `M ${cx - rx} ${cy} a ${rx} ${ry} 0 1 0 ${rx * 2} 0 a ${rx} ${ry} 0 1 0 ${-rx * 2} 0`;
	}
	let path = `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
	if (s.tool === 'arrow') {
		const angle = Math.atan2(b.y - a.y, b.x - a.x),
			length = Math.max(14, s.size * 3);
		path += ` M ${b.x - length * Math.cos(angle - Math.PI / 6)} ${b.y - length * Math.sin(angle - Math.PI / 6)} L ${b.x} ${b.y} L ${b.x - length * Math.cos(angle + Math.PI / 6)} ${b.y - length * Math.sin(angle + Math.PI / 6)}`;
	}
	return path;
}

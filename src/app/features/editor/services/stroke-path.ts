import { Point } from '../models/drawing';

export function strokePath(points: Point[], smooth: boolean): string {
	if (!points.length) return '';
	let path = `M ${points[0].x} ${points[0].y}`;
	for (let i = 1; i < points.length; i++) {
		const p = points[i],
			next = points[i + 1];
		path +=
			smooth && next
				? ` Q ${p.x} ${p.y} ${(p.x + next.x) / 2} ${(p.y + next.y) / 2}`
				: ` L ${p.x} ${p.y}`;
	}
	return path;
}

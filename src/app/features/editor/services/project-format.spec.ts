import {
	DEFAULT_CONFIG,
	DrawingObject,
	DrawingProject,
	identityTransform,
} from '../models/drawing';
import { localPoint, objectMatrix, objectPath } from './drawing-geometry';
import { parseProject, sceneSvg } from './project-format';

function fixture(): DrawingProject {
	const object: DrawingObject = {
		id: 'shape-1',
		name: 'Rectangle',
		visible: true,
		locked: false,
		transform: identityTransform(),
		kind: 'draw',
		config: { ...DEFAULT_CONFIG, tool: 'rectangle', mode: 'both' },
		points: [
			{ x: 20, y: 30 },
			{ x: 120, y: 130 },
		],
	};
	return {
		format: 'drawify',
		version: 1,
		name: 'A project',
		scene: {
			dimensions: { width: 1200, height: 800 },
			background: '#ffffff',
			objects: [object],
		},
		settings: { ...DEFAULT_CONFIG },
	};
}
describe('Portable project format and vector export', () => {
	it('round-trips editable shapes and settings', () => {
		const project = fixture();
		expect(parseProject(JSON.stringify(project))).toEqual(project);
	});
	it('rejects unknown versions, non-finite geometry, duplicate IDs and external images', () => {
		const p = fixture();
		expect(() => parseProject(JSON.stringify({ ...p, version: 2 }))).toThrow('supported');
		p.scene.objects[0].transform.scaleX = 0;
		expect(() => parseProject(JSON.stringify(p))).toThrow('number');
		p.scene.objects[0].transform.scaleX = 1;
		p.scene.objects.push({ ...p.scene.objects[0] });
		expect(() => parseProject(JSON.stringify(p))).toThrow('duplicate');
		p.scene.objects = [
			{
				id: 'image',
				name: 'image',
				visible: true,
				locked: false,
				transform: identityTransform(),
				kind: 'image',
				src: 'https://example.com/image.png',
				width: 100,
				height: 100,
			},
		];
		expect(() => parseProject(JSON.stringify(p))).toThrow('embedded');
	});
	it('escapes text and keeps transformed shapes as vectors', () => {
		const p = fixture(),
			o = p.scene.objects[0];
		if (o.kind !== 'draw') throw new Error('fixture');
		o.config.tool = 'text';
		o.config.text = '<script>alert("hello")</script>';
		o.transform.rotation = 45;
		const svg = sceneSvg(p.scene, 2400, 1600, true);
		expect(svg).toContain('width="2400"');
		expect(svg).toContain('&lt;script&gt;');
		expect(svg).not.toContain('<script>');
		expect(svg).toContain('matrix(');
	});
	it('represents erasers as ordered masks, hides invisible layers and can omit backgrounds', () => {
		const p = fixture(),
			original = p.scene.objects[0];
		if (original.kind !== 'draw') throw new Error('fixture');
		p.scene.objects.push({
			...original,
			id: 'eraser',
			config: { ...original.config, tool: 'eraser', opacity: 0.5 },
		});
		const svg = sceneSvg(p.scene, 1200, 800, true);
		expect(svg).toContain('<mask id="erase-1"');
		expect(svg).toContain('mask="url(#erase-1)"');
		expect(svg).toContain('opacity="0.5"');
		expect(svg).not.toContain('fill="#ffffff"');
		original.visible = false;
		expect(sceneSvg(p.scene, 1200, 800, false)).not.toContain('fill="#b8afe9"');
	});
	it('inverts rotation and nonuniform scaling for object hit testing', () => {
		const object = fixture().scene.objects[0];
		object.transform = { x: 20, y: -10, scaleX: 2, scaleY: 0.5, rotation: 67 };
		const [a, b, c, d, e, f] = objectMatrix(object),
			p = { x: 46, y: 83 };
		const result = localPoint(object, { x: a * p.x + c * p.y + e, y: b * p.x + d * p.y + f });
		expect(result.x).toBeCloseTo(p.x);
		expect(result.y).toBeCloseTo(p.y);
	});
	it('smooths brush paths and adds arrowheads', () => {
		const o = fixture().scene.objects[0];
		if (o.kind !== 'draw') throw new Error('fixture');
		o.points.push({ x: 180, y: 140 });
		o.config.tool = 'brush';
		expect(objectPath(o)).toContain(' Q ');
		o.config.smoothing = false;
		expect(objectPath(o)).not.toContain(' Q ');
		o.config.tool = 'arrow';
		expect(objectPath(o).match(/ M /g)).toHaveLength(1);
	});
});

import { TestBed } from '@angular/core/testing';
import {
	BRUSH_TYPES,
	DEFAULT_CONFIG,
	DrawingObject,
	identityTransform,
	ToolConfiguration,
} from '../models/drawing';
import {
	BRUSH_PRESETS,
	brushMarks,
	brushSvg,
	sampleStroke,
	validBrushSettings,
} from './brush-strokes';
import { EditorState } from './editor-state';
import { DrawingEngine } from './drawing-engine';
import { parseProject, sceneSvg } from './project-format';

const points = [
	{ x: 100, y: 100 },
	{ x: 140, y: 120 },
	{ x: 200, y: 95 },
	{ x: 260, y: 135 },
];
function object(config: Partial<ToolConfiguration> = {}): Extract<DrawingObject, { kind: 'draw' }> {
	return {
		id: 'stroke',
		name: 'brush',
		visible: true,
		locked: false,
		transform: identityTransform(),
		kind: 'draw',
		points,
		config: { ...DEFAULT_CONFIG, brushType: 'spray', brushSeed: 12345, size: 24, ...config },
	};
}
describe('Brush styles and deterministic rendering', () => {
	it('defines every requested brush with a distinct, nonempty stroke', () => {
		expect(BRUSH_PRESETS.map((p) => p.id)).toEqual([...BRUSH_TYPES]);
		const signatures = new Set<string>();
		for (const brushType of BRUSH_TYPES) {
			const marks = brushMarks(points, {
				...DEFAULT_CONFIG,
				size: 24,
				brushType,
				brushSeed: 12345,
			});
			expect(marks.length).toBeGreaterThan(0);
			expect(
				marks.every(
					(m) =>
						m.d.length > 0 &&
						!/NaN|Infinity/.test(m.d) &&
						m.opacity > 0 &&
						m.opacity <= 1,
				),
			).toBe(true);
			signatures.add(JSON.stringify(marks));
		}
		expect(signatures.size).toBe(12);
	});
	it('keeps random textures stable through redraws and uses the stored seed', () => {
		for (const brushType of ['spray', 'charcoal', 'watercolor', 'sketchy'] as const) {
			const config = { ...DEFAULT_CONFIG, size: 24, brushType, brushSeed: 42 };
			expect(brushMarks(points, config)).toEqual(brushMarks(points, config));
			expect(brushMarks(points, config)).not.toEqual(
				brushMarks(points, { ...config, brushSeed: 43 }),
			);
		}
	});
	it('resamples by distance rather than pointer-event density and bounds sample counts', () => {
		const sparse = [
				{ x: 0, y: 0 },
				{ x: 100, y: 0 },
			],
			dense = Array.from({ length: 101 }, (_, x) => ({ x, y: 0 }));
		expect(sampleStroke(sparse, 10)).toEqual(sampleStroke(dense, 10));
		expect(
			sampleStroke(
				[
					{ x: 0, y: 0 },
					{ x: 1_000_000, y: 1_000_000 },
				],
				0.01,
				256,
			),
		).toHaveLength(256);
		expect(
			sampleStroke(
				[
					{ x: 1, y: 1 },
					{ x: 1, y: 1 },
				],
				10,
			),
		).toEqual([{ x: 1, y: 1 }]);
	});
	it('creates a visible mark for a click with every brush', () => {
		for (const brushType of BRUSH_TYPES)
			expect(
				brushMarks([{ x: 100, y: 100 }], { ...DEFAULT_CONFIG, brushType }),
			).not.toHaveLength(0);
	});
	it('applies spacing, nib angle and flow to relevant brushes', () => {
		const base = { ...DEFAULT_CONFIG, size: 24, brushType: 'dotted' as const };
		expect(brushMarks(points, { ...base, brushSpacing: 0.5 }).length).toBeGreaterThan(
			brushMarks(points, { ...base, brushSpacing: 2 }).length,
		);
		expect(
			brushMarks(points, { ...base, brushType: 'calligraphy', brushAngle: 30 }),
		).not.toEqual(brushMarks(points, { ...base, brushType: 'calligraphy', brushAngle: -30 }));
		expect(brushMarks(points, { ...base, brushFlow: 0.2 })[0].opacity).toBe(0.2);
	});
	it('retains settings and textures across portable project files and SVG export', () => {
		TestBed.configureTestingModule({ providers: [EditorState, DrawingEngine] });
		const engine = TestBed.inject(DrawingEngine);
		for (const brushType of BRUSH_TYPES)
			engine.commit({
				kind: 'draw',
				config: { ...DEFAULT_CONFIG, brushType, brushSeed: 12345 },
				points,
			});
		const parsed = parseProject(JSON.stringify(engine.project()));
		expect(parsed.scene.objects).toEqual(engine.objects());
		expect(sceneSvg(parsed.scene, 1200, 800, true)).toBe(
			sceneSvg(engine.project().scene, 1200, 800, true),
		);
		expect(brushSvg(object())).toContain('opacity=');
	});
	it('keeps textures when recoloring or duplicating and restores them with undo', () => {
		TestBed.configureTestingModule({ providers: [EditorState, DrawingEngine] });
		const engine = TestBed.inject(DrawingEngine),
			original = object();
		engine.commit({ kind: 'draw', config: original.config, points });
		engine.select(engine.objects()[0].id);
		const before = brushMarks(points, original.config);
		engine.updateSelectedStyle({ stroke: '#ff0000' });
		engine.undo();
		const restored = engine.selected()!;
		if (restored.kind !== 'draw') throw new Error('fixture');
		expect(brushMarks(restored.points, restored.config)).toEqual(before);
		engine.duplicate();
		const copy = engine.selected()!;
		if (copy.kind !== 'draw') throw new Error('fixture');
		expect(brushMarks(copy.points, copy.config)).toEqual(before);
	});
	it('accepts legacy normal brushes and rejects malformed brush settings', () => {
		TestBed.configureTestingModule({ providers: [EditorState, DrawingEngine] });
		const engine = TestBed.inject(DrawingEngine),
			legacy = { ...DEFAULT_CONFIG };
		delete legacy.brushType;
		delete legacy.brushFlow;
		delete legacy.brushSpacing;
		delete legacy.brushAngle;
		engine.commit({ kind: 'draw', config: legacy, points });
		expect(parseProject(JSON.stringify(engine.project())).scene.objects[0]).toMatchObject({
			config: { tool: 'brush' },
		});
		for (const value of [
			{ brushType: 'invalid' },
			{ brushFlow: -1 },
			{ brushSpacing: 0 },
			{ brushAngle: 200 },
			{ brushSeed: 1.5 },
		])
			expect(validBrushSettings(value as Partial<ToolConfiguration>)).toBe(false);
		const project = engine.project();
		if (project.scene.objects[0].kind === 'draw')
			project.scene.objects[0].config.brushSpacing = Infinity;
		expect(() => parseProject(JSON.stringify(project))).toThrow('brush settings');
	});
});

import { TestBed } from '@angular/core/testing';
import { DrawingEngine } from './drawing-engine';
import { EditorState } from './editor-state';
import { objectBounds, objectMatrix, worldBounds } from './drawing-geometry';
import { parseProject } from './project-format';

describe('Object editing, grouping and document operations', () => {
	let engine: DrawingEngine, state: EditorState;
	const rect = (x: number, y = 20, width = 80, height = 60) => {
		engine.commit({
			kind: 'draw',
			config: { ...state.config(), tool: 'rectangle', mode: 'fill' },
			points: [
				{ x, y },
				{ x: x + width, y: y + height },
			],
		});
		return engine.objects().at(-1)!;
	};
	beforeEach(() => {
		TestBed.configureTestingModule({ providers: [EditorState, DrawingEngine] });
		engine = TestBed.inject(DrawingEngine);
		state = TestBed.inject(EditorState);
	});
	it('moves, resizes, rotates and duplicates multiple objects as one undoable operation', () => {
		rect(10);
		rect(210);
		engine.selectAll();
		engine.nudge(30, 40);
		expect(engine.objects().map((o) => o.transform.x)).toEqual([30, 30]);
		engine.undo();
		expect(engine.objects().map((o) => o.transform.x)).toEqual([0, 0]);
		const before = engine.selectionBox()!;
		engine.resizeSelected(before.width * 2, before.height * 2);
		expect(engine.objects().map((o) => o.transform.scaleX)).toEqual([2, 2]);
		engine.rotateSelection(90);
		expect(engine.objects().map((o) => o.transform.rotation)).toEqual([90, 90]);
		engine.duplicate();
		expect(engine.objects()).toHaveLength(4);
		expect(engine.selection()).toHaveLength(2);
		engine.deleteSelected();
		expect(engine.objects()).toHaveLength(2);
		engine.undo();
		expect(engine.objects()).toHaveLength(4);
	});
	it('persists groups and keeps duplicates separate from the source group', () => {
		const a = rect(10),
			b = rect(210);
		engine.selectAll();
		engine.group();
		const group = engine.objects()[0].groupId;
		expect(group).toBeTruthy();
		expect(engine.objects()[1].groupId).toBe(group);
		engine.clearSelection();
		engine.select(a.id);
		expect(engine.selectedIds()).toEqual([a.id, b.id]);
		engine.duplicate();
		expect(engine.selection()[0].groupId).not.toBe(group);
		expect(engine.selection()[1].groupId).toBe(engine.selection()[0].groupId);
		expect(parseProject(JSON.stringify(engine.project())).scene.objects).toEqual(
			engine.objects(),
		);
		engine.ungroup();
		expect(engine.selection().every((o) => !o.groupId)).toBe(true);
		engine.undo();
		expect(engine.selection().every((o) => !!o.groupId)).toBe(true);
	});
	it('keeps groups intact while aligning and moving in the layer stack', () => {
		const a = rect(10, 20),
			b = rect(110, 50),
			c = rect(300, 200);
		engine.select(a.id);
		engine.select(b.id, true);
		engine.group();
		const before =
			worldBounds(engine.objects().find((o) => o.id === b.id)!).y -
			worldBounds(engine.objects().find((o) => o.id === a.id)!).y;
		engine.select(c.id, true);
		engine.align('top');
		const after =
			worldBounds(engine.objects().find((o) => o.id === b.id)!).y -
			worldBounds(engine.objects().find((o) => o.id === a.id)!).y;
		expect(after).toBeCloseTo(before);
		expect(worldBounds(engine.objects().find((o) => o.id === c.id)!).y).toBeCloseTo(20);
		engine.reorder(a.id, 1);
		expect(engine.objects().map((o) => o.id)).toEqual([c.id, a.id, b.id]);
		engine.undo();
		expect(engine.objects().map((o) => o.id)).toEqual([a.id, b.id, c.id]);
	});
	it('aligns rotated world bounds and distributes equal gaps', () => {
		const a = rect(10),
			b = rect(140),
			c = rect(410);
		engine.selectAll();
		engine.distribute('horizontal');
		expect(worldBounds(engine.objects()[1]).x).toBeCloseTo(210);
		engine.undo();
		expect(worldBounds(engine.objects()[1]).x).toBeCloseTo(140);
		engine.select(b.id);
		engine.transformSelected({ rotation: 45 });
		engine.select(a.id, true);
		engine.select(c.id, true);
		engine.align('left');
		expect(engine.objects().map((o) => worldBounds(o).x)).toEqual([10, 10, 10]);
	});
	it('does not transform or restyle selections containing a locked member', () => {
		const a = rect(10),
			b = rect(210);
		engine.selectAll();
		engine.group();
		engine.updateObject(b.id, { locked: true });
		engine.select(a.id);
		engine.nudge(40, 50);
		engine.updateSelectedStyle({ fill: '#ff0000' });
		engine.deleteSelected();
		engine.duplicate();
		expect(engine.objects()).toHaveLength(2);
		expect(engine.objects()[0].transform.x).toBe(0);
		const first = engine.objects()[0];
		if (first.kind === 'draw') expect(first.config.fill).not.toBe('#ff0000');
	});
	it('edits existing styles and text without changing drawing defaults or transformed anchors', () => {
		engine.commit({
			kind: 'draw',
			config: { ...state.config(), tool: 'text', text: 'Short' },
			points: [{ x: 100, y: 100 }],
		});
		engine.select(engine.objects()[0].id);
		engine.transformSelected({ rotation: 45, scaleX: 2 });
		const matrix = objectMatrix(engine.selected()!);
		engine.updateSelectedStyle({
			text: 'A longer label',
			size: 20,
			stroke: '#ff0000',
			opacity: 0.3,
		});
		const next = engine.selected()!;
		expect(objectMatrix(next)[4]).toBeCloseTo(matrix[4]);
		expect(objectMatrix(next)[5]).toBeCloseTo(matrix[5]);
		if (next.kind === 'draw')
			expect(next.config).toMatchObject({
				text: 'A longer label',
				size: 20,
				stroke: '#ff0000',
				opacity: 0.3,
			});
		expect(state.stroke()).toBe('#25283d');
		engine.undo();
		const previous = engine.selected()!;
		if (previous.kind === 'draw') expect(previous.config.text).toBe('Short');
	});
	it('crops or extends without deleting objects and undoes canvas dimensions', () => {
		rect(900);
		const before = engine.project().scene.objects;
		engine.resizeCanvas(600, 400, 'crop');
		expect(state.dimensions()).toEqual({ width: 600, height: 400 });
		expect(engine.objects()).toEqual(before);
		engine.undo();
		expect(state.dimensions()).toEqual({ width: 1200, height: 800 });
		expect(() => engine.resizeCanvas(8192, 8192, 'scale')).toThrow();
		expect(() => engine.resizeCanvas(1.5, 400, 'crop')).toThrow();
	});
	it('does not add history for unchanged style controls', () => {
		const object = rect(10);
		engine.select(object.id);
		engine.updateSelectedStyle({ fill: '#ff0000', opacity: 0.5 });
		const revision = engine.revision();
		engine.updateSelectedStyle({ opacity: 0.5 });
		expect(engine.revision()).toBe(revision);
		engine.undo();
		const restored = engine.selected()!;
		if (restored.kind === 'draw') expect(restored.config.opacity).toBe(1);
	});
	it('scales artwork proportionally and centers it on a different aspect ratio canvas', () => {
		rect(100, 100, 200, 100);
		engine.resizeCanvas(600, 600, 'scale');
		const o = engine.objects()[0],
			b = worldBounds(o);
		expect(o.transform.scaleX).toBe(0.5);
		expect(o.transform.scaleY).toBe(0.5);
		expect(b).toEqual({ x: 50, y: 150, width: 100, height: 50 });
		expect(objectBounds(o).width).toBe(200);
		engine.undo();
		expect(worldBounds(engine.objects()[0]).x).toBe(100);
	});
	it('round-trips optional grid settings while accepting previous project files', () => {
		state.showGrid.set(true);
		state.snapToGrid.set(true);
		state.gridSize.set(25);
		expect(engine.snapPoint({ x: 39, y: 68 })).toEqual({ x: 50, y: 75 });
		const file = engine.project();
		expect(parseProject(JSON.stringify(file)).workspace).toEqual(state.workspace());
		delete file.workspace;
		expect(parseProject(JSON.stringify(file)).workspace).toBeUndefined();
		const invalid = { ...file, workspace: { showGrid: true, snapToGrid: true, gridSize: 1 } };
		expect(() => parseProject(JSON.stringify(invalid))).toThrow();
	});
});

import { TestBed } from '@angular/core/testing';
import { EditorState } from './editor-state';
import { DrawingEngine } from './drawing-engine';
describe('Editor state and command history', () => {
	let state: EditorState;
	let engine: DrawingEngine;
	beforeEach(() => {
		TestBed.configureTestingModule({ providers: [EditorState, DrawingEngine] });
		state = TestBed.inject(EditorState);
		engine = TestBed.inject(DrawingEngine);
	});
	it('updates typed tool configuration reactively', () => {
		state.tool.set('rectangle');
		state.size.set(24);
		state.stroke.set('#ff0000');
		state.fill.set('#00ff00');
		expect(state.config()).toMatchObject({
			tool: 'rectangle',
			size: 24,
			stroke: '#ff0000',
			fill: '#00ff00',
		});
	});
	it('supports undo, redo and discards a redo branch on a new command', () => {
		engine.commit({ kind: 'clear' });
		expect(engine.canUndo()).toBe(true);
		engine.undo();
		expect(engine.canRedo()).toBe(true);
		engine.redo();
		expect(engine.canRedo()).toBe(false);
		engine.undo();
		engine.background('#123456');
		expect(engine.canRedo()).toBe(false);
		expect(state.dirty()).toBe(true);
	});
	it('can construct and maintain history without any canvas or browser initialization', () => {
		expect(engine.canUndo()).toBe(false);
		engine.background('#ffffff');
		engine.undo();
		expect(engine.canRedo()).toBe(true);
	});
	it('rejects export before canvas initialization', async () => {
		await expect(engine.exportPng()).rejects.toThrow('Canvas is not ready.');
	});
	it('keeps object transforms, deletion and duplication undoable', () => {
		engine.commit({
			kind: 'draw',
			config: state.config(),
			points: [
				{ x: 10, y: 10 },
				{ x: 100, y: 80 },
			],
		});
		const id = engine.objects()[0].id;
		engine.select(id);
		engine.transformSelected({ x: 50, rotation: 45 });
		engine.resizeSelected(180, 140);
		expect(engine.selected()?.transform).toMatchObject({
			x: 50,
			rotation: 45,
			scaleX: 2,
			scaleY: 2,
		});
		engine.duplicate();
		expect(engine.objects()).toHaveLength(2);
		expect(engine.selected()?.id).not.toBe(id);
		engine.deleteSelected();
		expect(engine.objects()).toHaveLength(1);
		engine.undo();
		expect(engine.objects()).toHaveLength(2);
		engine.undo();
		expect(engine.objects()).toHaveLength(1);
	});
	it('preserves layer order and flags through undo, redo and clear', () => {
		for (const tool of ['rectangle', 'ellipse'] as const)
			engine.commit({
				kind: 'draw',
				config: { ...state.config(), tool },
				points: [
					{ x: 10, y: 10 },
					{ x: 100, y: 80 },
				],
			});
		const first = engine.objects()[0].id;
		engine.reorder(first, 1);
		expect(engine.objects()[1].id).toBe(first);
		engine.updateObject(first, { visible: false, locked: true });
		engine.select(first);
		engine.deleteSelected();
		engine.duplicate();
		engine.transformSelected({ x: 100 });
		expect(engine.objects()).toHaveLength(2);
		expect(engine.selected()?.transform.x).toBe(0);
		engine.undo();
		expect(engine.selected()).toMatchObject({ visible: true, locked: false });
		engine.redo();
		engine.commit({ kind: 'clear' });
		engine.undo();
		expect(engine.objects()[1]).toMatchObject({ id: first, visible: false, locked: true });
	});
	it('loads independent editable documents and resets history', async () => {
		engine.background('#123456');
		state.opacity.set(0.4);
		state.name.set('Persistent art');
		engine.commit({
			kind: 'draw',
			config: state.config(),
			points: [
				{ x: 0, y: 0 },
				{ x: 90, y: 70 },
			],
		});
		const project = engine.project();
		engine.newProject();
		expect(engine.objects()).toHaveLength(0);
		await engine.load(project);
		expect(state.name()).toBe('Persistent art');
		expect(state.background()).toBe('#123456');
		expect(state.opacity()).toBe(0.4);
		expect(engine.objects()).toHaveLength(1);
		expect(engine.canUndo()).toBe(false);
		project.scene.objects.length = 0;
		expect(engine.objects()).toHaveLength(1);
	});
	it('cancels a transform without adding history and commits a drag as one undo step', () => {
		engine.commit({
			kind: 'draw',
			config: state.config(),
			points: [
				{ x: 0, y: 0 },
				{ x: 90, y: 70 },
			],
		});
		engine.select(engine.objects()[0].id);
		engine.startTransform('move', { x: 0, y: 0 });
		engine.move({ x: 30, y: 40 });
		engine.cancel();
		expect(engine.selected()?.transform.x).toBe(0);
		engine.startTransform('move', { x: 0, y: 0 });
		engine.move({ x: 30, y: 40 });
		engine.move({ x: 50, y: 60 });
		engine.end();
		expect(engine.selected()?.transform).toMatchObject({ x: 50, y: 60 });
		engine.undo();
		expect(engine.objects()).toHaveLength(1);
		expect(engine.selected()?.transform.x).toBe(0);
	});
});

import { TestBed } from '@angular/core/testing';
import { DEFAULT_CONFIG, ToolConfiguration, TEXT_FONTS } from '../models/drawing';
import { DrawingEngine } from './drawing-engine';
import { EditorState } from './editor-state';
import { initializeTextMeasurement, layoutText, textStyle, validTextStyle } from './text-layout';
import { parseProject, sceneSvg } from './project-format';
import { objectMatrix, worldBounds } from './drawing-geometry';

const config = (patch: Partial<ToolConfiguration> = {}): ToolConfiguration => ({
	...DEFAULT_CONFIG,
	tool: 'text',
	fontSize: 24,
	textWidth: 0,
	...patch,
});
describe('Text layout and editable insertion', () => {
	beforeEach(() => {
		initializeTextMeasurement(null);
		TestBed.configureTestingModule({ providers: [EditorState, DrawingEngine] });
	});
	it('preserves newlines, blank lines, indentation and Unicode', () => {
		const layout = layoutText(config({ text: 'Hello\r\n\n\t你好 🙂\nمرحبا' }), {
			x: 100,
			y: 80,
		});
		expect(layout.lines.map((l) => l.text)).toEqual(['Hello', '', '    你好 🙂', 'مرحبا']);
		expect(layout.lines[3].direction).toBe('rtl');
		expect(layout.lines[0].direction).toBe('ltr');
		expect(layout.lines[1].y - layout.lines[0].y).toBeCloseTo(24 * 1.3);
		expect(layout.bounds.height).toBeGreaterThan(100);
	});
	it('starts an empty black draft independently of brush color and discards canceled formatting', () => {
		const state = TestBed.inject(EditorState),
			engine = TestBed.inject(DrawingEngine);
		state.stroke.set('#ff0000');
		engine.requestText({ x: 100, y: 100 });
		expect(engine.textRequest()?.config).toMatchObject({ text: '', stroke: '#000000' });
		engine.updateTextDraft({ text: 'Draft', stroke: '#0000ff', fontSize: 48 });
		expect(engine.objects()).toHaveLength(0);
		expect(engine.canUndo()).toBe(false);
		engine.cancelText();
		expect(state.stroke()).toBe('#ff0000');
		expect(state.textColor()).toBe('#000000');
		expect(engine.objects()).toHaveLength(0);
	});
	it('commits typing and sidebar formatting as one edit while preserving brush defaults', () => {
		const state = TestBed.inject(EditorState),
			engine = TestBed.inject(DrawingEngine);
		state.stroke.set('#ff0000');
		engine.requestText({ x: 100, y: 100 });
		engine.updateTextDraft({ text: 'Inline words' });
		engine.updateTextDraft({ stroke: '#0000ff', fontFamily: 'Georgia', fontSize: 48 });
		engine.finishText();
		expect(engine.objects()[0]).toMatchObject({
			config: { text: 'Inline words', stroke: '#0000ff', fontSize: 48 },
		});
		expect(state.stroke()).toBe('#ff0000');
		expect(state.textColor()).toBe('#0000ff');
		engine.undo();
		expect(engine.objects()).toHaveLength(0);
		expect(engine.canUndo()).toBe(false);
		engine.redo();
		expect(engine.objects()).toHaveLength(1);
	});
	it('previews existing text without changing the saved object and Escape restores it', () => {
		const engine = TestBed.inject(DrawingEngine);
		engine.requestText({ x: 100, y: 100 });
		engine.updateTextDraft({ text: 'Original' });
		engine.finishText();
		const original = engine.objects()[0],
			revision = engine.revision();
		engine.requestText(undefined, original.id);
		engine.updateTextDraft({ text: 'Changed', stroke: '#ff0000' });
		expect(engine.textPreview()).toMatchObject({
			id: original.id,
			config: { text: 'Changed', stroke: '#ff0000' },
		});
		expect(engine.objects()[0]).toEqual(original);
		engine.cancelText();
		expect(engine.objects()[0]).toEqual(original);
		expect(engine.revision()).toBe(revision);
	});
	it('ignores empty new boxes and can undo clearing an existing text box', () => {
		const engine = TestBed.inject(DrawingEngine);
		engine.requestText({ x: 100, y: 100 });
		engine.finishText();
		expect(engine.canUndo()).toBe(false);
		engine.requestText({ x: 100, y: 100 });
		engine.updateTextDraft({ text: 'Erase these words' });
		engine.finishText();
		const id = engine.objects()[0].id;
		engine.requestText(undefined, id);
		engine.updateTextDraft({ text: '' });
		engine.finishText();
		expect(engine.objects()).toHaveLength(0);
		engine.undo();
		expect(engine.objects()[0].id).toBe(id);
	});
	it('wraps long words without splitting emoji grapheme clusters', () => {
		const emoji = '👩🏽‍💻',
			text = emoji.repeat(8),
			layout = layoutText(config({ text, fontSize: 10, textWidth: 50 }), { x: 0, y: 0 });
		expect(layout.lines.length).toBeGreaterThan(1);
		expect(layout.lines.map((l) => l.text).join('')).toBe(text);
		expect(layout.lines.every((l) => l.text.split(emoji).join('') === '')).toBe(true);
	});
	it('honors font size independently of brush size and supports every listed font', () => {
		for (const fontFamily of TEXT_FONTS) {
			const layout = layoutText(
				config({ fontFamily, fontSize: 48, size: 2, text: 'Hello' }),
				{ x: 0, y: 0 },
			);
			expect(layout.font).toContain('48px');
		}
		expect(textStyle(config({ fontSize: 36, size: 80 })).fontSize).toBe(36);
	});
	it('uses alignment in bounds and resolves automatic RTL direction', () => {
		const left = layoutText(config({ text: 'Hello', textAlign: 'left' }), { x: 100, y: 100 }),
			center = layoutText(config({ text: 'Hello', textAlign: 'center' }), { x: 100, y: 100 });
		expect(center.bounds.x).toBeCloseTo(left.bounds.x - left.bounds.width / 2);
		expect(
			layoutText(config({ text: 'مرحبا 123', textDirection: 'auto' }), { x: 0, y: 0 })
				.lines[0].direction,
		).toBe('rtl');
		expect(
			layoutText(config({ text: 'مرحبا', textDirection: 'ltr' }), { x: 0, y: 0 }).lines[0]
				.direction,
		).toBe('ltr');
	});
	it('keeps version-1 projects without font fields readable with their original size', () => {
		const state = TestBed.inject(EditorState),
			engine = TestBed.inject(DrawingEngine),
			legacy: ToolConfiguration = {
				tool: 'text',
				text: 'Older text',
				size: 10,
				stroke: '#000000',
				fill: '#ffffff',
				mode: 'fill',
				opacity: 1,
				smoothing: false,
				dashed: false,
			};
		engine.commit({ kind: 'draw', config: legacy, points: [{ x: 100, y: 100 }] });
		const project = engine.project();
		project.settings = legacy;
		const parsed = parseProject(JSON.stringify(project));
		expect(parsed.scene.objects[0]).toMatchObject({ config: { text: 'Older text', size: 10 } });
		expect(textStyle(legacy).fontSize).toBe(30);
		state.configure(legacy);
		expect(state.config().fontSize).toBe(30);
	});
	it('validates font choices, numeric limits and underline values', () => {
		expect(validTextStyle({ fontSize: 512, textWidth: 40, lineHeight: 0.8 })).toBe(true);
		for (const patch of [
			{ fontSize: 0 },
			{ fontSize: Infinity },
			{ textWidth: 20 },
			{ lineHeight: 5 },
			{ fontFamily: 'unknown' },
			{ underline: 'yes' },
		])
			expect(validTextStyle(patch as Partial<ToolConfiguration>)).toBe(false);
	});
	it('inserts and edits text as atomic undoable changes and cancellation adds no object', () => {
		const engine = TestBed.inject(DrawingEngine);
		engine.requestText({ x: 100, y: 100 });
		engine.cancelText();
		expect(engine.objects()).toHaveLength(0);
		expect(engine.canUndo()).toBe(false);
		engine.requestText({ x: 100, y: 100 });
		expect(() => engine.applyText(config({ text: '  \n' }))).toThrow('Enter some text');
		engine.applyText(config({ text: 'First\nSecond', fontFamily: 'Georgia', fontSize: 40 }));
		expect(engine.objects()).toHaveLength(1);
		const id = engine.objects()[0].id;
		engine.transformSelected({ rotation: 30, scaleX: 1.5 });
		const before = objectMatrix(engine.objects()[0]);
		engine.requestText(undefined, id);
		engine.applyText(config({ text: 'Changed\n你好 🙂', fontFamily: 'Verdana', fontSize: 64 }));
		const after = objectMatrix(engine.objects()[0]);
		expect(after[4]).toBeCloseTo(before[4]);
		expect(after[5]).toBeCloseTo(before[5]);
		expect(engine.objects()[0].id).toBe(id);
		engine.undo();
		const object = engine.objects()[0];
		if (object.kind === 'draw') expect(object.config.text).toBe('First\nSecond');
	});
	it('keeps newly inserted text visible when placed near a canvas edge', () => {
		const engine = TestBed.inject(DrawingEngine);
		engine.requestText({ x: 1190, y: 790 });
		engine.applyText(config({ text: 'Visible text', fontSize: 40 }));
		const b = worldBounds(engine.objects()[0]);
		expect(b.x + b.width).toBeLessThanOrEqual(1200);
		expect(b.y + b.height).toBeLessThanOrEqual(800);
	});
	it('exports wrapped text, font properties, underline and escaped content as SVG', () => {
		const engine = TestBed.inject(DrawingEngine);
		engine.requestText({ x: 100, y: 100 });
		engine.applyText(
			config({
				text: '<hello> & words\nمرحبا',
				fontFamily: 'Georgia',
				fontSize: 32,
				fontWeight: 'bold',
				fontStyle: 'italic',
				underline: true,
				textWidth: 160,
			}),
		);
		const svg = sceneSvg(engine.project().scene, 1200, 800, true);
		expect(svg).toContain('font-family="Georgia, serif"');
		expect(svg).toContain('font-size="32"');
		expect(svg).toContain('font-weight="bold"');
		expect(svg).toContain('font-style="italic"');
		expect(svg).toContain('direction="rtl"');
		expect(svg).toContain('<line');
		expect(svg).toContain('&lt;hello&gt;');
		expect(svg.match(/<text /g)!.length).toBeGreaterThan(2);
		expect(parseProject(JSON.stringify(engine.project())).scene.objects).toEqual(
			engine.objects(),
		);
	});
});

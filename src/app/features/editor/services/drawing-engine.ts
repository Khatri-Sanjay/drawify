import { computed, inject, Injectable, signal } from '@angular/core';
import {
	Bounds,
	DrawingObject,
	DrawingProject,
	HistoryEntry,
	identityTransform,
	Point,
	Scene,
	Transform,
	ToolConfiguration,
} from '../models/drawing';
import { EditorState } from './editor-state';
import {
	localPoint,
	objectBounds,
	objectMatrix,
	objectPath,
	worldBounds,
	unionBounds,
	transformAround,
} from './drawing-geometry';
import {
	initializeTextMeasurement,
	layoutText,
	paintText,
	validTextStyle,
	textStyle,
} from './text-layout';
import { brushExtent, paintBrush, validBrushSettings } from './brush-strokes';

@Injectable()
export class DrawingEngine {
	readonly state = inject(EditorState);
	private readonly scene = signal<Scene>({
		objects: [],
		background: '#ffffff',
		dimensions: { width: 1200, height: 800 },
	});
	readonly objects = computed(() => this.scene().objects);
	readonly selectedIds = signal<string[]>([]);
	readonly selectedId = computed(() => this.selectedIds()[0] ?? null);
	readonly selected = computed(() => this.objects().find((o) => o.id === this.selectedId()));
	readonly selection = computed(() =>
		this.objects().filter((o) => this.selectedIds().includes(o.id)),
	);
	readonly editableSelection = computed(
		() => this.selection().length > 0 && this.selection().every((o) => !o.locked && o.visible),
	);
	readonly selectionRotation = computed(() =>
		this.selection().length === 1 ? (this.selected()?.transform.rotation ?? 0) : 0,
	);
	readonly marquee = signal<Bounds | null>(null);
	private selectionGesture?: { start: Point; ids: string[]; additive: boolean };
	readonly revision = signal(0);
	readonly textRequest = signal<{
		point: Point;
		config: ToolConfiguration;
		id?: string;
		wasDirty?: boolean;
		revision?: number;
	} | null>(null);
	readonly textPreview = computed(() => {
		const request = this.textRequest();
		return request ? this.textObject(request.config, request) : undefined;
	});
	private readonly past = signal<Scene[]>([]);
	private readonly future = signal<Scene[]>([]);
	readonly canUndo = computed(() => this.past().length > 0);
	readonly canRedo = computed(() => this.future().length > 0);
	private canvas?: HTMLCanvasElement;
	private context?: CanvasRenderingContext2D;
	private current?: Extract<DrawingObject, { kind: 'draw' }>;
	private gesture?: {
		scene: Scene;
		object: DrawingObject;
		objects: DrawingObject[];
		box: Bounds;
		start: Point;
		mode: 'move' | 'resize' | 'rotate';
	};
	private images = new Map<string, HTMLImageElement>();
	private frame?: number;
	private disposed = false;
	private generation = 0;
	isDrawing(): boolean {
		return !!(this.current || this.gesture || this.selectionGesture || this.textRequest());
	}

	attach(canvas: HTMLCanvasElement): void {
		this.context = canvas.getContext('2d') ?? undefined;
		if (!this.context) {
			this.state.error.set('Your browser does not support Canvas 2D.');
			return;
		}
		this.canvas = canvas;
		initializeTextMeasurement(document.createElement('canvas').getContext('2d'));
		this.render();
	}
	detach(): void {
		if (this.frame !== undefined) cancelAnimationFrame(this.frame);
		this.frame = undefined;
		this.cancel();
		this.canvas = undefined;
		this.context = undefined;
	}
	private change(next: Scene, previous = this.scene()): void {
		const points = next.objects.reduce(
			(total, o) => total + (o.kind === 'draw' ? o.points.length : 0),
			0,
		);
		if (next.objects.length > 10000 || points > 500000) {
			this.scene.set(previous);
			this.state.error.set(
				'This project has reached its object or point limit. Start a new project to keep drawing.',
			);
			this.render();
			return;
		}
		if (JSON.stringify(next).length > 48 * 1024 * 1024) {
			this.scene.set(previous);
			this.state.error.set(
				'This project is too large. Start another project before adding more images or marks.',
			);
			this.render();
			return;
		}
		this.past.update((items) => [...items.slice(-99), previous]);
		this.future.set([]);
		this.scene.set(next);
		this.changed();
	}
	private changed(): void {
		this.state.background.set(this.scene().background);
		this.state.dimensions.set(this.scene().dimensions);
		this.state.dirty.set(true);
		this.revision.update((v) => v + 1);
		this.render();
	}
	private base(name: string) {
		return {
			id: crypto.randomUUID(),
			name,
			visible: true,
			locked: false,
			transform: identityTransform(),
		};
	}
	begin(point: Point, additive = false): void {
		if (!this.context) return;
		if (this.state.tool() === 'hand') return;
		if (this.state.tool() === 'select') {
			const hit = [...this.objects()]
				.reverse()
				.find((o) => o.visible && !o.locked && this.hit(o, point));
			if (hit) {
				if (additive) {
					this.select(hit.id, true);
					return;
				}
				if (!this.selectedIds().includes(hit.id)) this.select(hit.id);
				this.startTransform('move', point);
			} else {
				this.selectionGesture = { start: point, ids: [...this.selectedIds()], additive };
				if (!additive) this.selectedIds.set([]);
				this.marquee.set({ ...point, width: 0, height: 0 });
			}
			return;
		}
		this.selectedIds.set([]);
		if (this.state.tool() === 'picker') {
			const d = this.state.dimensions();
			const pixel = this.context.getImageData(
				Math.min(d.width - 1, Math.max(0, Math.floor(point.x))),
				Math.min(d.height - 1, Math.max(0, Math.floor(point.y))),
				1,
				1,
			).data;
			this.state.stroke.set(
				'#' + [...pixel.slice(0, 3)].map((v) => v.toString(16).padStart(2, '0')).join(''),
			);
			return;
		}
		if (this.state.tool() === 'text') {
			const existing = [...this.objects()]
				.reverse()
				.find(
					(o) =>
						o.visible &&
						o.kind === 'draw' &&
						o.config.tool === 'text' &&
						this.hit(o, point),
				);
			if (existing?.locked) {
				this.state.error.set('Unlock this text layer before editing it.');
				return;
			}
			this.requestText(point, existing?.id);
			return;
		}
		if (!['pencil', 'brush', 'eraser'].includes(this.state.tool()))
			point = this.snapPoint(point);
		this.current = {
			...this.base(this.state.tool()),
			kind: 'draw',
			config: { ...this.state.config() },
			points: [point],
		};
		if (this.current.config.tool === 'brush')
			this.current.config.brushSeed = crypto.getRandomValues(new Uint32Array(1))[0];
		this.scheduleRender();
	}
	move(point: Point): void {
		if (this.selectionGesture) {
			const a = this.selectionGesture.start;
			this.marquee.set({
				x: Math.min(a.x, point.x),
				y: Math.min(a.y, point.y),
				width: Math.abs(a.x - point.x),
				height: Math.abs(a.y - point.y),
			});
			return;
		}
		const gesture = this.gesture;
		if (gesture) {
			if (gesture.objects.length > 1) {
				const box = gesture.box,
					pivot = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
				let scale = 1,
					rotation = 0,
					dx = 0,
					dy = 0;
				if (gesture.mode === 'move') {
					const p = this.snapPoint({
						x: box.x + point.x - gesture.start.x,
						y: box.y + point.y - gesture.start.y,
					});
					dx = p.x - box.x;
					dy = p.y - box.y;
				}
				if (gesture.mode === 'resize')
					scale = this.limitScale(
						gesture.objects,
						Math.max(
							(point.x - pivot.x) / (box.width / 2),
							(point.y - pivot.y) / (box.height / 2),
						),
					);
				if (gesture.mode === 'rotate')
					rotation =
						((Math.atan2(point.y - pivot.y, point.x - pivot.x) -
							Math.atan2(gesture.start.y - pivot.y, gesture.start.x - pivot.x)) *
							180) /
						Math.PI;
				const changed = new Map(
					gesture.objects.map((o) => [
						o.id,
						transformAround(o, pivot, scale, rotation, dx, dy),
					]),
				);
				this.scene.set({
					...gesture.scene,
					objects: gesture.scene.objects.map((o) => changed.get(o.id) ?? o),
				});
				this.scheduleRender();
				return;
			}
			const t = { ...gesture.object.transform };
			const b = objectBounds(gesture.object);
			if (gesture.mode === 'move') {
				const world = worldBounds(gesture.object),
					p = this.snapPoint({
						x: world.x + point.x - gesture.start.x,
						y: world.y + point.y - gesture.start.y,
					});
				t.x += p.x - world.x;
				t.y += p.y - world.y;
			}
			if (gesture.mode === 'rotate') {
				const cx = b.x + b.width / 2 + t.x,
					cy = b.y + b.height / 2 + t.y;
				t.rotation +=
					((Math.atan2(point.y - cy, point.x - cx) -
						Math.atan2(gesture.start.y - cy, gesture.start.x - cx)) *
						180) /
					Math.PI;
			}
			if (gesture.mode === 'resize') {
				const local = localPoint(gesture.object, point);
				t.scaleX *= Math.max(
					0.05,
					Math.min(100, (local.x - b.x - b.width / 2) / (b.width / 2)),
				);
				t.scaleY *= Math.max(
					0.05,
					Math.min(100, (local.y - b.y - b.height / 2) / (b.height / 2)),
				);
				t.scaleX = Math.min(100, Math.max(0.01, t.scaleX));
				t.scaleY = Math.min(100, Math.max(0.01, t.scaleY));
			}
			this.scene.set({
				...gesture.scene,
				objects: gesture.scene.objects.map((o) =>
					o.id === gesture.object.id ? { ...o, transform: t } : o,
				),
			});
			this.scheduleRender();
			return;
		}
		if (!this.current) return;
		if (!['pencil', 'brush', 'eraser'].includes(this.current.config.tool))
			point = this.snapPoint(point);
		if (['pencil', 'brush', 'eraser'].includes(this.current.config.tool)) {
			const last = this.current.points.at(-1)!;
			if (
				Math.hypot(point.x - last.x, point.y - last.y) >= 0.5 &&
				this.current.points.length < 100_000
			)
				this.current.points.push(point);
		} else this.current.points[1] = point;
		this.scheduleRender();
	}
	end(): void {
		if (this.selectionGesture) {
			const box = this.marquee(),
				gesture = this.selectionGesture;
			const ids = box
				? this.objects()
						.filter((o) => {
							const b = worldBounds(o);
							return (
								o.visible &&
								!o.locked &&
								b.x >= box.x &&
								b.y >= box.y &&
								b.x + b.width <= box.x + box.width &&
								b.y + b.height <= box.y + box.height
							);
						})
						.map((o) => o.id)
				: [];
			this.selectedIds.set(
				this.expandGroups([...(gesture.additive ? gesture.ids : []), ...ids]),
			);
			this.selectionGesture = undefined;
			this.marquee.set(null);
		}
		if (this.gesture) {
			const gesture = this.gesture;
			this.gesture = undefined;
			if (
				JSON.stringify(this.selection().map((o) => o.transform)) !==
				JSON.stringify(gesture.objects.map((o) => o.transform))
			)
				this.change(this.scene(), gesture.scene);
		}
		if (this.current) {
			const object = this.current;
			this.current = undefined;
			this.change({ ...this.scene(), objects: [...this.objects(), object] });
		}
	}
	cancel(): void {
		if (this.selectionGesture) this.selectedIds.set(this.selectionGesture.ids);
		this.selectionGesture = undefined;
		this.marquee.set(null);
		this.current = undefined;
		if (this.gesture) this.scene.set(this.gesture.scene);
		this.gesture = undefined;
		this.render();
	}
	startTransform(mode: 'move' | 'resize' | 'rotate', point: Point): void {
		this.end();
		const object = this.selected(),
			box = this.selectionBox();
		if (object && box && this.editableSelection())
			this.gesture = {
				scene: this.scene(),
				object,
				objects: [...this.selection()],
				box,
				start: point,
				mode,
			};
	}
	private hit(object: DrawingObject, point: Point): boolean {
		const p = localPoint(object, point),
			b = objectBounds(object);
		if (object.kind === 'image' || object.config.tool === 'text')
			return p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height;
		if (
			['brush', 'pencil', 'eraser'].includes(object.config.tool) &&
			object.points.length === 1
		) {
			const first = object.points[0],
				radius =
					object.config.tool === 'pencil'
						? 0.5
						: object.config.tool === 'brush'
							? brushExtent(object.config)
							: object.config.size / 2;
			return Math.hypot(p.x - first.x, p.y - first.y) <= radius + 5 / this.state.zoom();
		}
		const c = this.context!;
		c.save();
		c.resetTransform();
		c.lineWidth = Math.max(
			object.config.tool === 'pencil'
				? 1
				: object.config.tool === 'brush'
					? brushExtent(object.config) * 2
					: object.config.size,
			10 / this.state.zoom(),
		);
		const path = new Path2D(objectPath(object));
		const result =
			c.isPointInStroke(path, p.x, p.y) ||
			(!['brush', 'pencil', 'eraser', 'line', 'arrow'].includes(object.config.tool) &&
				object.config.mode !== 'outline' &&
				c.isPointInPath(path, p.x, p.y));
		c.restore();
		return result;
	}
	commit(entry: HistoryEntry): void {
		this.cancel();
		if (entry.kind === 'clear') this.change({ ...this.scene(), objects: [] });
		else if (entry.kind === 'background')
			this.change({ ...this.scene(), background: entry.color });
		else
			this.change({
				...this.scene(),
				objects: [...this.objects(), { ...this.base(entry.config.tool), ...entry }],
			});
		this.selectedIds.set([]);
	}
	undo(): void {
		this.finishText();
		this.cancel();
		const previous = this.past().at(-1);
		if (!previous) return;
		this.future.update((items) => [...items, this.scene()]);
		this.past.update((items) => items.slice(0, -1));
		this.scene.set(previous);
		this.changed();
	}
	redo(): void {
		this.finishText();
		this.cancel();
		const next = this.future().at(-1);
		if (!next) return;
		this.past.update((items) => [...items, this.scene()]);
		this.future.update((items) => items.slice(0, -1));
		this.scene.set(next);
		this.changed();
	}
	background(color: string): void {
		this.commit({ kind: 'background', color });
	}
	select(id: string, additive = false): void {
		this.finishText();
		this.cancel();
		const ids = this.expandGroups([id]),
			current = this.selectedIds();
		this.selectedIds.set(
			additive
				? ids.every((item) => current.includes(item))
					? current.filter((item) => !ids.includes(item))
					: [...new Set([...current, ...ids])]
				: ids,
		);
		this.state.tool.set('select');
	}
	private expandGroups(ids: string[]): string[] {
		const groups = new Set(
			this.objects()
				.filter((o) => ids.includes(o.id) && o.groupId)
				.map((o) => o.groupId),
		);
		return this.objects()
			.filter((o) => ids.includes(o.id) || (o.groupId && groups.has(o.groupId)))
			.map((o) => o.id);
	}
	selectAll(): void {
		this.cancel();
		this.selectedIds.set(
			this.expandGroups(
				this.objects()
					.filter((o) => o.visible && !o.locked)
					.map((o) => o.id),
			),
		);
		this.state.tool.set('select');
	}
	clearSelection(): void {
		this.cancel();
		this.selectedIds.set([]);
	}
	isSelected(id: string): boolean {
		return this.selectedIds().includes(id);
	}
	snapPoint(point: Point): Point {
		const size = this.state.gridSize();
		return this.state.snapToGrid()
			? { x: Math.round(point.x / size) * size, y: Math.round(point.y / size) * size }
			: point;
	}
	private limitScale(objects: DrawingObject[], value: number): number {
		const min = Math.max(
			...objects.flatMap((o) => [0.01 / o.transform.scaleX, 0.01 / o.transform.scaleY]),
		);
		const max = Math.min(
			...objects.flatMap((o) => [100 / o.transform.scaleX, 100 / o.transform.scaleY]),
		);
		return Math.max(min, Math.min(max, value));
	}
	nudge(dx: number, dy: number): void {
		if (!this.editableSelection()) return;
		this.end();
		this.change({
			...this.scene(),
			objects: this.objects().map((o) =>
				this.isSelected(o.id)
					? {
							...o,
							transform: {
								...o.transform,
								x: o.transform.x + dx,
								y: o.transform.y + dy,
							},
						}
					: o,
			),
		});
	}
	rotateSelection(degrees: number): void {
		const box = this.selectionBox();
		if (!box || !this.editableSelection() || !Number.isFinite(degrees)) return;
		this.end();
		const pivot = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
		this.change({
			...this.scene(),
			objects: this.objects().map((o) =>
				this.isSelected(o.id) ? transformAround(o, pivot, 1, degrees) : o,
			),
		});
	}
	group(): void {
		if (this.selection().length < 2 || !this.editableSelection()) return;
		this.end();
		const groupId = crypto.randomUUID();
		const objects = this.objects(),
			top = objects.reduce((last, o, index) => (this.isSelected(o.id) ? index : last), -1);
		const remaining = objects.filter((o) => !this.isSelected(o.id)),
			index = objects.slice(0, top + 1).filter((o) => !this.isSelected(o.id)).length;
		remaining.splice(
			index,
			0,
			...objects.filter((o) => this.isSelected(o.id)).map((o) => ({ ...o, groupId })),
		);
		this.change({ ...this.scene(), objects: remaining });
	}
	ungroup(): void {
		if (!this.editableSelection()) return;
		this.end();
		this.change({
			...this.scene(),
			objects: this.objects().map((o) =>
				this.isSelected(o.id) ? { ...o, groupId: undefined } : o,
			),
		});
	}
	updateSelectedStyle(patch: Partial<Omit<ToolConfiguration, 'tool'>>): void {
		if (!this.editableSelection()) return;
		if (!validBrushSettings(patch)) return;
		if (!validTextStyle(patch)) return;
		if (
			patch.size !== undefined &&
			(!Number.isFinite(patch.size) || patch.size < 1 || patch.size > 80)
		)
			return;
		if (
			patch.opacity !== undefined &&
			(!Number.isFinite(patch.opacity) || patch.opacity < 0 || patch.opacity > 1)
		)
			return;
		if (patch.stroke !== undefined && !/^#[\da-f]{6}$/i.test(patch.stroke)) return;
		if (patch.fill !== undefined && !/^#[\da-f]{6}$/i.test(patch.fill)) return;
		if (patch.text !== undefined && patch.text.length > 10000) return;
		if (
			patch.text !== undefined &&
			!patch.text.trim() &&
			this.selection().some((o) => o.kind === 'draw' && o.config.tool === 'text')
		)
			return;
		this.end();
		const objects = this.objects().map((o) => {
			if (!this.isSelected(o.id)) return o;
			if (o.kind === 'image')
				return patch.opacity === undefined || patch.opacity === (o.opacity ?? 1)
					? o
					: { ...o, opacity: patch.opacity };
			if (
				Object.entries(patch).every(
					([key, value]) => o.config[key as keyof ToolConfiguration] === value,
				)
			)
				return o;
			const next = { ...o, config: { ...o.config, ...patch } },
				before = objectMatrix(o),
				after = objectMatrix(next);
			return {
				...next,
				transform: {
					...o.transform,
					x: o.transform.x + before[4] - after[4],
					y: o.transform.y + before[5] - after[5],
				},
			};
		});
		if (objects.some((o, index) => o !== this.objects()[index]))
			this.change({ ...this.scene(), objects });
	}
	requestText(point?: Point, id?: string): void {
		if (this.textRequest()?.id === id && id) return;
		this.finishText();
		this.end();
		const object = id ? this.objects().find((o) => o.id === id) : undefined;
		if (
			id &&
			(!object ||
				object.locked ||
				!object.visible ||
				object.kind !== 'draw' ||
				object.config.tool !== 'text')
		)
			return;
		this.textRequest.set({
			wasDirty: this.state.dirty(),
			revision: this.revision(),
			point:
				object?.kind === 'draw'
					? { ...object.points[0] }
					: this.snapPoint(
							point ?? {
								x: this.state.dimensions().width / 3,
								y: this.state.dimensions().height / 3,
							},
						),
			config: {
				...(object?.kind === 'draw' ? object.config : this.state.textConfig()),
				...(!object
					? {
							textWidth: Math.max(
								40,
								Math.min(
									this.state.textConfig().textWidth || 480,
									this.state.dimensions().width -
										(point?.x ?? this.state.dimensions().width / 3) -
										16,
								),
							),
						}
					: {}),
				tool: 'text',
			},
			...(id ? { id } : {}),
		});
		this.render();
	}
	updateTextDraft(patch: Partial<ToolConfiguration>): void {
		if (!validTextStyle(patch)) return;
		if (patch.text !== undefined && patch.text.length > 10000) return;
		if (patch.stroke !== undefined && !/^#[\da-f]{6}$/i.test(patch.stroke)) return;
		if (
			patch.opacity !== undefined &&
			(!Number.isFinite(patch.opacity) || patch.opacity < 0 || patch.opacity > 1)
		)
			return;
		this.textRequest.update((request) =>
			request ? { ...request, config: { ...request.config, ...patch, tool: 'text' } } : null,
		);
		if (this.textRequest()) this.state.dirty.set(true);
	}
	private textObject(
		config: ToolConfiguration,
		request: { point: Point; id?: string },
	): DrawingObject {
		const original = request.id ? this.objects().find((o) => o.id === request.id) : undefined;
		if (original?.kind === 'draw') {
			if (JSON.stringify(original.config) === JSON.stringify(config)) return original;
			const next = { ...original, config },
				before = objectMatrix(original),
				after = objectMatrix(next);
			return {
				...next,
				transform: {
					...next.transform,
					x: next.transform.x + before[4] - after[4],
					y: next.transform.y + before[5] - after[5],
				},
			};
		}
		const point = { ...request.point };
		point.y += layoutText(config, { x: 0, y: 0 }).ascent;
		// Keep the insertion point stable as the user types or changes the font.
		// Moving the entire paragraph to fit its new bounds makes the caret jump.
		return {
			id: 'text-preview',
			name: 'text',
			visible: true,
			locked: false,
			transform: identityTransform(),
			kind: 'draw',
			points: [point],
			config,
		};
	}
	finishText(): void {
		const request = this.textRequest();
		if (!request) return;
		if (!request.config.text.trim()) {
			if (request.id) {
				this.textRequest.set(null);
				this.change({
					...this.scene(),
					objects: this.objects().filter((o) => o.id !== request.id),
				});
				this.selectedIds.set([]);
			} else this.cancelText();
			return;
		}
		this.applyText(request.config);
	}
	editTextAt(point: Point): void {
		const object = [...this.objects()]
			.reverse()
			.find(
				(o) =>
					o.visible &&
					!o.locked &&
					o.kind === 'draw' &&
					o.config.tool === 'text' &&
					this.hit(o, point),
			);
		if (object) this.requestText(undefined, object.id);
	}
	applyText(config: ToolConfiguration): void {
		const request = this.textRequest();
		if (!request) return;
		if (!config.text.trim()) throw new Error('Enter some text before inserting it.');
		if (config.text.length > 10000) throw new Error('Text is limited to 10,000 characters.');
		if (!validTextStyle(config))
			throw new Error('Choose a valid font, size, line spacing, and wrap width.');
		config = { ...config, tool: 'text' };
		let object: DrawingObject = this.textObject(config, request);
		if (request.id) {
			const original = this.objects().find((o) => o.id === request.id);
			if (!original || original.kind !== 'draw' || original.locked)
				throw new Error('This text is no longer editable.');
			if (JSON.stringify(original) !== JSON.stringify(object))
				this.change({
					...this.scene(),
					objects: this.objects().map((o) => (o.id === original.id ? object : o)),
				});
		} else {
			object = { ...object, id: crypto.randomUUID() };
			this.change({ ...this.scene(), objects: [...this.objects(), object] });
			this.state.formatText(textStyle(config));
			this.state.text.set(config.text);
			this.state.textColor.set(config.stroke);
			this.state.textOpacity.set(config.opacity);
		}
		this.textRequest.set(null);
		this.selectedIds.set([object.id]);
		if (this.revision() === request.revision && request.wasDirty !== undefined)
			this.state.dirty.set(request.wasDirty);
		this.render();
	}
	cancelText(): void {
		const request = this.textRequest();
		if (request?.revision === this.revision() && request.wasDirty !== undefined)
			this.state.dirty.set(request.wasDirty);
		this.textRequest.set(null);
		this.render();
	}
	align(axis: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'): void {
		if (this.selection().length < 2 || !this.editableSelection()) return;
		this.end();
		const units = this.selectionUnits(),
			box = unionBounds(this.selection().map(worldBounds));
		if (units.length < 2) return;
		const boxes = new Map<string, Bounds>();
		for (const unit of units) {
			const bounds = unionBounds(unit.map(worldBounds));
			for (const o of unit) boxes.set(o.id, bounds);
		}
		this.change({
			...this.scene(),
			objects: this.objects().map((o) => {
				if (!this.isSelected(o.id)) return o;
				const b = boxes.get(o.id)!;
				const dx =
					axis === 'left'
						? box.x - b.x
						: axis === 'center'
							? box.x + box.width / 2 - b.x - b.width / 2
							: axis === 'right'
								? box.x + box.width - b.x - b.width
								: 0;
				const dy =
					axis === 'top'
						? box.y - b.y
						: axis === 'middle'
							? box.y + box.height / 2 - b.y - b.height / 2
							: axis === 'bottom'
								? box.y + box.height - b.y - b.height
								: 0;
				return {
					...o,
					transform: { ...o.transform, x: o.transform.x + dx, y: o.transform.y + dy },
				};
			}),
		});
	}
	distribute(axis: 'horizontal' | 'vertical'): void {
		if (this.selection().length < 3 || !this.editableSelection()) return;
		this.end();
		const horizontal = axis === 'horizontal',
			position = horizontal ? 'x' : 'y',
			dimension = horizontal ? 'width' : 'height';
		const sorted = this.selectionUnits().sort(
			(a, b) =>
				unionBounds(a.map(worldBounds))[position] -
				unionBounds(b.map(worldBounds))[position],
		);
		if (sorted.length < 3) return;
		const first = unionBounds(sorted[0].map(worldBounds)),
			last = unionBounds(sorted.at(-1)!.map(worldBounds));
		const gap =
			(last[position] +
				last[dimension] -
				first[position] -
				sorted.reduce(
					(sum, unit) => sum + unionBounds(unit.map(worldBounds))[dimension],
					0,
				)) /
			(sorted.length - 1);
		const deltas = new Map<string, number>();
		let offset = first[position];
		for (const unit of sorted) {
			const b = unionBounds(unit.map(worldBounds));
			for (const o of unit) deltas.set(o.id, offset - b[position]);
			offset += b[dimension] + gap;
		}
		this.change({
			...this.scene(),
			objects: this.objects().map((o) =>
				deltas.has(o.id)
					? {
							...o,
							transform: {
								...o.transform,
								[position]: o.transform[position] + deltas.get(o.id)!,
							},
						}
					: o,
			),
		});
	}
	private selectionUnits(): DrawingObject[][] {
		const groups = new Map<string, DrawingObject[]>();
		for (const o of this.selection()) {
			const id = o.groupId ? 'group:' + o.groupId : 'object:' + o.id;
			groups.set(id, [...(groups.get(id) ?? []), o]);
		}
		return [...groups.values()];
	}
	resizeCanvas(width: number, height: number, mode: 'crop' | 'scale'): void {
		if (
			!Number.isInteger(width) ||
			!Number.isInteger(height) ||
			width < 1 ||
			height < 1 ||
			width > 8192 ||
			height > 8192 ||
			width * height > 32000000
		)
			throw new Error('Choose whole dimensions from 1–8192 px, up to 32 megapixels.');
		this.end();
		const old = this.scene().dimensions,
			scale = Math.min(width / old.width, height / old.height);
		const objects =
			mode === 'scale'
				? this.objects().map((o) =>
						transformAround(
							o,
							{ x: 0, y: 0 },
							scale,
							0,
							(width - old.width * scale) / 2,
							(height - old.height * scale) / 2,
						),
					)
				: this.objects();
		if (
			objects.some(
				(o) =>
					o.transform.scaleX < 0.01 ||
					o.transform.scaleY < 0.01 ||
					o.transform.scaleX > 100 ||
					o.transform.scaleY > 100,
			)
		)
			throw new Error(
				'This resize exceeds an object scale limit. Choose dimensions closer to the current canvas.',
			);
		this.change({ ...this.scene(), objects, dimensions: { width, height } });
	}
	updateObject(
		id: string,
		patch: Partial<Pick<DrawingObject, 'name' | 'visible' | 'locked' | 'transform'>>,
	): void {
		this.end();
		this.change({
			...this.scene(),
			objects: this.objects().map((o) => (o.id === id ? { ...o, ...patch } : o)),
		});
	}
	transformSelected(patch: Partial<Transform>): void {
		if (this.selection().length !== 1) return;
		const o = this.selected();
		if (!o || o.locked) return;
		if (Object.values(patch).some((v) => !Number.isFinite(v))) return;
		for (const key of ['x', 'y', 'rotation'] as const)
			if (patch[key] !== undefined)
				patch[key] = Math.max(-1000000, Math.min(1000000, patch[key]!));
		this.updateObject(o.id, { transform: { ...o.transform, ...patch } });
	}
	resizeSelected(width: number, height: number): void {
		if (this.selection().length > 1) {
			const box = this.selectionBox();
			if (
				!box ||
				!this.editableSelection() ||
				!Number.isFinite(width) ||
				!Number.isFinite(height) ||
				width < 1 ||
				height < 1
			)
				return;
			const factor = this.limitScale(
				this.selection(),
				Math.abs(width - box.width) > 0.1 ? width / box.width : height / box.height,
			);
			const pivot = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
			this.end();
			this.change({
				...this.scene(),
				objects: this.objects().map((o) =>
					this.isSelected(o.id) ? transformAround(o, pivot, factor, 0) : o,
				),
			});
			return;
		}
		const o = this.selected();
		if (!o || width < 1 || height < 1 || width > 32000 || height > 32000) return;
		const b = objectBounds(o);
		this.transformSelected({
			scaleX: Math.max(0.01, Math.min(100, width / b.width)),
			scaleY: Math.max(0.01, Math.min(100, height / b.height)),
		});
	}
	duplicate(): void {
		if (!this.editableSelection()) return;
		this.end();
		const groups = new Map<string, string>();
		const copies = this.selection().map((o) => {
			if (o.groupId && !groups.has(o.groupId)) groups.set(o.groupId, crypto.randomUUID());
			return {
				...o,
				id: crypto.randomUUID(),
				name: `${o.name} copy`.slice(0, 80),
				groupId: o.groupId ? groups.get(o.groupId) : undefined,
				transform: { ...o.transform, x: o.transform.x + 20, y: o.transform.y + 20 },
			};
		});
		this.change({ ...this.scene(), objects: [...this.objects(), ...copies] });
		this.selectedIds.set(copies.map((o) => o.id));
	}
	deleteSelected(): void {
		if (!this.editableSelection()) return;
		this.end();
		this.change({
			...this.scene(),
			objects: this.objects().filter((item) => !this.isSelected(item.id)),
		});
		this.selectedIds.set([]);
	}
	reorder(id: string, delta: number): void {
		this.end();
		const objects = this.objects(),
			object = objects.find((o) => o.id === id);
		if (!object) return;
		const moving = objects.filter(
			(o) => o.id === id || (object.groupId && o.groupId === object.groupId),
		);
		if (moving.some((o) => o.locked)) return;
		const ids = new Set(moving.map((o) => o.id)),
			indices = objects.flatMap((o, i) => (ids.has(o.id) ? [i] : []));
		const neighbor = objects[delta > 0 ? Math.max(...indices) + 1 : Math.min(...indices) - 1];
		if (!neighbor) return;
		const rest = objects.filter((o) => !ids.has(o.id)),
			neighbors = rest.flatMap((o, i) =>
				o.id === neighbor.id || (neighbor.groupId && o.groupId === neighbor.groupId)
					? [i]
					: [],
			);
		const index = delta > 0 ? Math.max(...neighbors) + 1 : Math.min(...neighbors);
		rest.splice(index, 0, ...moving);
		this.change({ ...this.scene(), objects: rest });
	}
	selectionBox(): Bounds | undefined {
		if (this.selection().length > 1) return unionBounds(this.selection().map(worldBounds));
		const o = this.selected();
		if (!o || !o.visible) return undefined;
		const b = objectBounds(o),
			t = o.transform;
		return {
			x: b.x + b.width / 2 + t.x - (b.width * t.scaleX) / 2,
			y: b.y + b.height / 2 + t.y - (b.height * t.scaleY) / 2,
			width: b.width * t.scaleX,
			height: b.height * t.scaleY,
		};
	}
	private scheduleRender(): void {
		if (this.frame !== undefined) return;
		this.frame = requestAnimationFrame(() => {
			this.frame = undefined;
			this.render();
		});
	}
	render(): void {
		if (!this.canvas || !this.context) return;
		const { width, height } = this.scene().dimensions;
		if (this.canvas.width !== width) this.canvas.width = width;
		if (this.canvas.height !== height) this.canvas.height = height;
		this.paintScene(this.context, this.scene().background, true);
	}
	private paintScene(
		c: CanvasRenderingContext2D,
		background: string | null,
		editing = false,
	): void {
		c.clearRect(0, 0, this.scene().dimensions.width, this.scene().dimensions.height);
		for (const object of this.objects())
			if (!editing || object.id !== this.textRequest()?.id) this.paint(c, object);
		if (this.current) this.paint(c, this.current);
		if (background) {
			c.save();
			c.globalCompositeOperation = 'destination-over';
			c.fillStyle = background;
			c.fillRect(0, 0, this.scene().dimensions.width, this.scene().dimensions.height);
			c.restore();
		}
	}
	private paint(c: CanvasRenderingContext2D, o: DrawingObject): void {
		if (!o.visible) return;
		c.save();
		c.transform(...objectMatrix(o));
		if (o.kind === 'image') {
			c.globalAlpha = o.opacity ?? 1;
			const image = this.images.get(o.src);
			if (image?.complete && image.naturalWidth) c.drawImage(image, 0, 0, o.width, o.height);
			c.restore();
			return;
		}
		const s = o.config,
			a = o.points[0];
		c.globalAlpha = s.opacity;
		c.strokeStyle = s.stroke;
		c.fillStyle = s.fill;
		c.lineWidth = s.tool === 'pencil' ? 1 : s.size;
		c.lineCap = 'round';
		c.lineJoin = 'round';
		if (s.dashed && !['text', 'eraser'].includes(s.tool))
			c.setLineDash([c.lineWidth * 3, c.lineWidth * 2]);
		if (s.tool === 'eraser') c.globalCompositeOperation = 'destination-out';
		if (s.tool === 'brush') {
			paintBrush(c, o);
		} else if (s.tool === 'text') {
			paintText(c, s, a);
		} else if (['brush', 'pencil', 'eraser'].includes(s.tool) && o.points.length === 1) {
			c.beginPath();
			c.arc(a.x, a.y, c.lineWidth / 2, 0, Math.PI * 2);
			c.fillStyle = s.stroke;
			c.fill();
		} else {
			const path = new Path2D(objectPath(o));
			const line = ['brush', 'pencil', 'eraser', 'line', 'arrow'].includes(s.tool);
			if (!line && s.mode !== 'outline') c.fill(path);
			if (line || s.mode !== 'fill') c.stroke(path);
		}
		c.restore();
	}
	async importImage(file: File): Promise<void> {
		const generation = this.generation;
		try {
			if (
				!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
				file.size > 20 * 1024 * 1024
			)
				throw new Error('Choose a PNG, JPEG, or WebP image under 20 MB.');
			const bitmap = await createImageBitmap(file);
			const width = bitmap.width,
				height = bitmap.height;
			bitmap.close();
			if (width * height > 32_000_000)
				throw new Error('Image dimensions exceed 32 megapixels.');
			const src = await new Promise<string>((resolve, reject) => {
				const r = new FileReader();
				r.onload = () => resolve(String(r.result));
				r.onerror = () => reject(new Error('Could not read image.'));
				r.readAsDataURL(file);
			});
			await this.loadImage(src);
			if (this.disposed || this.generation !== generation) return;
			const d = this.state.dimensions(),
				scale = Math.min(d.width / width, d.height / height, 1);
			const object: DrawingObject = {
				...this.base(file.name.slice(0, 80)),
				kind: 'image',
				src,
				width: width * scale,
				height: height * scale,
			};
			this.change({ ...this.scene(), objects: [...this.objects(), object] });
			this.state.error.set('');
		} catch (error) {
			this.state.error.set(
				error instanceof Error ? error.message : 'This image could not be opened.',
			);
		}
	}
	private async loadImage(src: string): Promise<void> {
		if (this.images.get(src)?.naturalWidth) return;
		const image = new Image();
		image.src = src;
		await image.decode();
		if (image.naturalWidth * image.naturalHeight > 32_000_000)
			throw new Error('Image dimensions exceed 32 megapixels.');
		this.images.set(src, image);
	}
	project(): DrawingProject {
		return {
			format: 'drawify',
			version: 1,
			name: this.state.name(),
			scene: structuredClone(this.scene()),
			settings: { ...this.state.config() },
			workspace: { ...this.state.workspace() },
		};
	}
	async load(project: DrawingProject): Promise<void> {
		this.cancelText();
		const sources = [
			...new Set(project.scene.objects.filter((o) => o.kind === 'image').map((o) => o.src)),
		];
		for (const src of sources) await this.loadImage(src);
		if (this.disposed) return;
		this.generation++;
		for (const src of this.images.keys()) if (!sources.includes(src)) this.images.delete(src);
		this.cancel();
		this.past.set([]);
		this.future.set([]);
		this.selectedIds.set([]);
		this.scene.set(structuredClone(project.scene));
		this.state.name.set(project.name);
		this.state.configure(project.settings);
		this.state.showGrid.set(project.workspace?.showGrid ?? false);
		this.state.snapToGrid.set(project.workspace?.snapToGrid ?? false);
		this.state.gridSize.set(project.workspace?.gridSize ?? 20);
		this.changed();
		this.state.dirty.set(false);
	}
	newProject(): void {
		this.cancelText();
		this.generation++;
		this.cancel();
		this.past.set([]);
		this.future.set([]);
		this.selectedIds.set([]);
		this.images.clear();
		this.scene.set({
			objects: [],
			background: '#ffffff',
			dimensions: { width: 1200, height: 800 },
		});
		this.state.name.set('Untitled drawing');
		this.state.configure();
		this.state.showGrid.set(false);
		this.state.snapToGrid.set(false);
		this.state.gridSize.set(20);
		this.changed();
	}
	async exportPng(
		width = this.state.dimensions().width,
		height = this.state.dimensions().height,
		transparent = false,
	): Promise<Blob> {
		this.finishText();
		this.end();
		if (!this.canvas) throw new Error('Canvas is not ready.');
		if (
			!Number.isInteger(width) ||
			!Number.isInteger(height) ||
			width < 1 ||
			height < 1 ||
			width > 8192 ||
			height > 8192 ||
			width * height > 32_000_000
		)
			throw new Error('Export dimensions must be 1–8192 px and at most 32 megapixels.');
		const output = document.createElement('canvas');
		output.width = width;
		output.height = height;
		const c = output.getContext('2d');
		if (!c) throw new Error('Canvas is not ready.');
		c.scale(width / this.scene().dimensions.width, height / this.scene().dimensions.height);
		this.paintScene(c, transparent ? null : this.scene().background);
		return new Promise((resolve, reject) =>
			output.toBlob(
				(blob) => (blob ? resolve(blob) : reject(new Error('PNG export failed.'))),
				'image/png',
			),
		);
	}
	thumbnail(): string {
		if (!this.canvas) return '';
		const canvas = document.createElement('canvas');
		canvas.width = 240;
		canvas.height = 160;
		const c = canvas.getContext('2d');
		c?.drawImage(this.canvas, 0, 0, 240, 160);
		return canvas.toDataURL('image/png');
	}
	dispose(): void {
		this.disposed = true;
		this.detach();
		this.images.clear();
	}
}

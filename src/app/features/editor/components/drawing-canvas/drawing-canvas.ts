import {
	afterNextRender,
	Component,
	computed,
	ElementRef,
	inject,
	OnDestroy,
	signal,
	viewChild,
} from '@angular/core';
import { DrawingEngine } from '../../services/drawing-engine';
import { EditorState } from '../../services/editor-state';
import { Point } from '../../models/drawing';
import { InlineTextEditor } from '../inline-text-editor';
import { brushExtent } from '../../services/brush-strokes';

@Component({
	selector: 'app-drawing-canvas',
	imports: [InlineTextEditor],
	host: { class: 'block min-h-0 min-w-0 flex-1 overflow-hidden' },
	template: `<div
		#viewport
		class="workspace relative h-full min-h-[440px] overflow-auto overscroll-contain touch-none"
		[style.cursor]="
			panning()
				? 'grabbing'
				: spaceHeld() || state.tool() === 'hand'
					? 'grab'
					: state.tool() === 'select'
						? 'default'
						: 'crosshair'
		"
		aria-label="Canvas workspace"
	>
		<div
			class="relative min-h-full min-w-full"
			[style.width.px]="state.dimensions().width * state.zoom() + 96"
			[style.height.px]="state.dimensions().height * state.zoom() + 96"
		>
			<div
				class="absolute left-12 top-12"
				[style.width.px]="state.dimensions().width * state.zoom()"
				[style.height.px]="state.dimensions().height * state.zoom()"
			>
				<canvas
					#canvas
					aria-label="Drawing canvas. Select a tool and drag to draw. Use Select to move objects, or Hand to pan."
					[style.width.px]="state.dimensions().width * state.zoom()"
					[style.height.px]="state.dimensions().height * state.zoom()"
					class="block max-w-none bg-white shadow-xl touch-none"
					[style.cursor]="cursorVisible() ? 'none' : null"
					tabindex="0"
				></canvas>
				@if (state.showGrid()) {
					<div
						class="canvas-grid absolute inset-0 pointer-events-none"
						[style.backgroundSize]="
							state.gridSize() * state.zoom() +
							'px ' +
							state.gridSize() * state.zoom() +
							'px'
						"
					></div>
				}
				@if (engine.marquee(); as area) {
					<div
						class="selection-box bg-violet-200/20"
						[style.left.px]="area.x * state.zoom()"
						[style.top.px]="area.y * state.zoom()"
						[style.width.px]="area.width * state.zoom()"
						[style.height.px]="area.height * state.zoom()"
					></div>
				}
				@if (!engine.textRequest()) {
					@if (box(); as bounds) {
						<div
							class="selection-box"
							[style.left.px]="bounds.x * state.zoom()"
							[style.top.px]="bounds.y * state.zoom()"
							[style.width.px]="bounds.width * state.zoom()"
							[style.height.px]="bounds.height * state.zoom()"
							[style.transform]="'rotate(' + engine.selectionRotation() + 'deg)'"
						>
							@if (engine.editableSelection()) {
								<button
									class="selection-handle resize-handle"
									aria-label="Resize selected object"
									title="Drag to resize; use width and height in Layers for precise sizing"
									(pointerdown)="startHandle($event, 'resize')"
									(keydown.arrowup)="resizeBy($event, -1)"
									(keydown.arrowdown)="resizeBy($event, 1)"
								></button>
								<button
									class="selection-handle rotate-handle"
									aria-label="Rotate selected object"
									title="Drag to rotate; use arrow keys for one degree"
									(pointerdown)="startHandle($event, 'rotate')"
									(keydown.arrowleft)="rotateBy($event, -1)"
									(keydown.arrowright)="rotateBy($event, 1)"
								>
									↻
								</button>
							}
						</div>
					}
				}
				<app-inline-text-editor />
			</div>
		</div>
		@if (cursorVisible()) {
			<div
				class="drawing-cursor"
				aria-hidden="true"
				[attr.data-tool]="state.tool()"
				[style.left.px]="pointer()!.x"
				[style.top.px]="pointer()!.y"
			>
				@if (isBrushCursor()) {
					<span
						class="brush-footprint"
						[class.eraser-footprint]="state.tool() === 'eraser'"
						[style.width.px]="cursorDiameter()"
						[style.height.px]="cursorDiameter()"
					></span>
				}
				<svg class="cursor-reticle" width="32" height="32" viewBox="0 0 32 32">
					<path
						[attr.d]="reticlePath()"
						fill="none"
						stroke="white"
						stroke-width="4"
						stroke-linecap="round"
					/>
					<path
						[attr.d]="reticlePath()"
						fill="none"
						stroke="#171923"
						stroke-width="1.5"
						stroke-linecap="round"
					/>
					@if (state.tool() !== 'text') {
						<circle
							cx="16"
							cy="16"
							r="2"
							fill="white"
							stroke="#171923"
							stroke-width="1.25"
						/>
					}
				</svg>
			</div>
		}
	</div>`,
	styles: `
		.drawing-cursor {
			position: fixed;
			z-index: 30;
			pointer-events: none;
			width: 32px;
			height: 32px;
			transform: translate(-50%, -50%);
		}
		.cursor-reticle {
			position: absolute;
			left: 0;
			top: 0;
			width: 32px;
			height: 32px;
			max-width: none;
			overflow: visible;
		}
		.brush-footprint {
			position: absolute;
			left: 50%;
			top: 50%;
			transform: translate(-50%, -50%);
			outline: 1px solid #171923;
			border-radius: 50%;
			box-sizing: border-box;
			box-shadow:
				0 0 0 1.5px white,
				inset 0 0 0 1px white;
		}
		.eraser-footprint {
			outline-style: dashed;
		}
		.canvas-grid {
			background-image:
				linear-gradient(to right, #7254c926 1px, transparent 1px),
				linear-gradient(to bottom, #7254c926 1px, transparent 1px);
		}
		.selection-box {
			position: absolute;
			border: 1.5px solid #7254c9;
			pointer-events: none;
			transform-origin: center;
			min-width: 2px;
			min-height: 2px;
		}
		.selection-handle {
			position: absolute;
			pointer-events: auto;
			width: 18px;
			height: 18px;
			border: 2px solid #7254c9;
			background: white;
			border-radius: 4px;
			touch-action: none;
		}
		.resize-handle {
			right: -9px;
			bottom: -9px;
			cursor: nwse-resize;
		}
		.rotate-handle {
			left: calc(50% - 10px);
			top: -32px;
			width: 22px;
			height: 22px;
			border-radius: 50%;
			font-size: 14px;
			line-height: 16px;
			cursor: grab;
		}
	`,
})
export class DrawingCanvas implements OnDestroy {
	readonly state = inject(EditorState);
	readonly engine = inject(DrawingEngine);
	private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
	private readonly viewport = viewChild.required<ElementRef<HTMLDivElement>>('viewport');
	readonly box = computed(() => this.engine.selectionBox());
	readonly pointer = signal<Point | null>(null);
	readonly panning = signal(false);
	readonly spaceHeld = signal(false);
	readonly cursorVisible = computed(
		() =>
			!!this.pointer() &&
			!this.panning() &&
			!this.spaceHeld() &&
			!this.engine.textRequest() &&
			!['select', 'hand'].includes(this.state.tool()),
	);
	readonly isBrushCursor = computed(() =>
		['brush', 'pencil', 'eraser'].includes(this.state.tool()),
	);
	readonly cursorDiameter = computed(() =>
		Math.max(
			1,
			(this.state.tool() === 'pencil'
				? 1
				: this.state.tool() === 'brush'
					? brushExtent(this.state.config()) * 2
					: this.state.size()) * this.state.zoom(),
		),
	);
	readonly reticlePath = computed(() =>
		this.state.tool() === 'text'
			? 'M10 5h12M16 5v22M10 27h12'
			: 'M16 3v7M16 22v7M3 16h7M22 16h7',
	);
	private abort?: AbortController;
	private active?: number;
	private handle?: { id: number; target: HTMLElement };
	private pan?: { id: number; x: number; y: number; left: number; top: number };
	private zoomFrame?: number;
	private touches = new Map<number, Point>();
	private touchNavigation = false;
	private pendingTouch?: { id: number; point: Point; additive: boolean };
	private pinch?: { distance: number; zoom: number; anchor: Point };
	constructor() {
		afterNextRender(() => {
			const canvas = this.canvas().nativeElement,
				viewport = this.viewport().nativeElement;
			this.engine.attach(canvas);
			this.abort = new AbortController();
			const options = { signal: this.abort.signal };
			canvas.addEventListener(
				'dblclick',
				(event) => {
					if (['select', 'text'].includes(this.state.tool())) {
						event.preventDefault();
						const r = canvas.getBoundingClientRect();
						this.engine.editTextAt({
							x: (event.clientX - r.left) / this.state.zoom(),
							y: (event.clientY - r.top) / this.state.zoom(),
						});
					}
				},
				options,
			);
			canvas.addEventListener('pointerenter', (event) => this.updateCursor(event), options);
			canvas.addEventListener('pointerleave', () => this.pointer.set(null), options);
			window.addEventListener('resize', () => this.pointer.set(null), options);
			document.addEventListener('visibilitychange', () => this.pointer.set(null), options);
			document.addEventListener(
				'scroll',
				() => {
					const p = this.pointer();
					if (p) this.updateCursor({ clientX: p.x, clientY: p.y, pointerType: 'mouse' });
				},
				{ ...options, capture: true },
			);
			viewport.addEventListener(
				'pointerdown',
				(event) => {
					this.updateCursor(event);
					if (event.pointerType === 'touch') {
						this.touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
						if (this.touches.size >= 2) {
							event.preventDefault();
							event.stopPropagation();
							this.engine.cancel();
							this.active = undefined;
							this.handle = undefined;
							this.pan = undefined;
							this.panning.set(false);
							this.pendingTouch = undefined;
							this.touchNavigation = true;
							const [a, b] = [...this.touches.values()],
								r = viewport.getBoundingClientRect(),
								center = {
									x: (a.x + b.x) / 2 - r.left,
									y: (a.y + b.y) / 2 - r.top,
								};
							this.pinch = {
								distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
								zoom: this.state.zoom(),
								anchor: {
									x: (viewport.scrollLeft + center.x - 48) / this.state.zoom(),
									y: (viewport.scrollTop + center.y - 48) / this.state.zoom(),
								},
							};
							viewport.setPointerCapture(event.pointerId);
							return;
						}
						if (this.touchNavigation) {
							event.preventDefault();
							event.stopPropagation();
							return;
						}
					}
					if (this.pan || this.active !== undefined || this.handle) return;
					if (
						event.button === 1 ||
						((this.state.tool() === 'hand' || this.spaceHeld()) && event.button === 0)
					) {
						event.preventDefault();
						event.stopPropagation();
						this.pan = {
							id: event.pointerId,
							x: event.clientX,
							y: event.clientY,
							left: viewport.scrollLeft,
							top: viewport.scrollTop,
						};
						this.panning.set(true);
						viewport.setPointerCapture(event.pointerId);
					}
				},
				{ ...options, capture: true },
			);
			canvas.addEventListener(
				'pointerdown',
				(event) => {
					if (this.active !== undefined || event.button !== 0) return;
					event.preventDefault();
					canvas.focus({ preventScroll: true });
					this.active = event.pointerId;
					canvas.setPointerCapture(event.pointerId);
					if (event.pointerType === 'touch')
						this.pendingTouch = {
							id: event.pointerId,
							point: this.point(event),
							additive: event.shiftKey,
						};
					else this.engine.begin(this.point(event), event.shiftKey);
				},
				options,
			);
			window.addEventListener(
				'pointermove',
				(event) => {
					this.updateCursor(event);
					if (this.touches.has(event.pointerId))
						this.touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
					if (this.touchNavigation) {
						if (this.pinch && this.touches.size >= 2) {
							const [a, b] = [...this.touches.values()],
								r = viewport.getBoundingClientRect();
							const zoom = Math.min(
									4,
									Math.max(
										0.1,
										(this.pinch.zoom * Math.hypot(a.x - b.x, a.y - b.y)) /
											this.pinch.distance,
									),
								),
								anchor = this.pinch.anchor;
							this.state.zoom.set(zoom);
							if (this.zoomFrame !== undefined) cancelAnimationFrame(this.zoomFrame);
							this.zoomFrame = requestAnimationFrame(() => {
								viewport.scrollLeft =
									anchor.x * zoom + 48 - ((a.x + b.x) / 2 - r.left);
								viewport.scrollTop =
									anchor.y * zoom + 48 - ((a.y + b.y) / 2 - r.top);
								this.zoomFrame = undefined;
							});
						}
						return;
					}
					if (this.pan?.id === event.pointerId) {
						viewport.scrollLeft = this.pan.left - (event.clientX - this.pan.x);
						viewport.scrollTop = this.pan.top - (event.clientY - this.pan.y);
						return;
					}
					if (this.pendingTouch?.id === event.pointerId) {
						const p = this.point(event);
						if (
							Math.hypot(
								p.x - this.pendingTouch.point.x,
								p.y - this.pendingTouch.point.y,
							) < 2
						)
							return;
						this.engine.begin(this.pendingTouch.point, this.pendingTouch.additive);
						this.pendingTouch = undefined;
					}
					if (this.active === event.pointerId || this.handle?.id === event.pointerId)
						this.engine.move(this.point(event));
				},
				options,
			);
			window.addEventListener(
				'pointerup',
				(event) => {
					this.touches.delete(event.pointerId);
					if (this.touchNavigation) {
						this.pinch = undefined;
						if (!this.touches.size) this.touchNavigation = false;
						return;
					}
					if (this.pendingTouch?.id === event.pointerId) {
						this.engine.begin(this.pendingTouch.point, this.pendingTouch.additive);
						this.pendingTouch = undefined;
					}
					if (this.pan?.id === event.pointerId) {
						this.pan = undefined;
						this.panning.set(false);
						if (viewport.hasPointerCapture(event.pointerId))
							viewport.releasePointerCapture(event.pointerId);
						return;
					}
					if (this.active === event.pointerId || this.handle?.id === event.pointerId) {
						this.engine.move(this.point(event));
						this.engine.end();
						this.active = undefined;
						const target = this.handle?.target ?? canvas;
						this.handle = undefined;
						if (target.hasPointerCapture(event.pointerId))
							target.releasePointerCapture(event.pointerId);
					}
				},
				options,
			);
			window.addEventListener('pointercancel', () => this.cancelGesture(), options);
			viewport.addEventListener(
				'lostpointercapture',
				() => {
					if (!this.touchNavigation) this.cancelGesture();
				},
				options,
			);
			window.addEventListener(
				'blur',
				() => {
					this.spaceHeld.set(false);
					this.pointer.set(null);
					this.cancelGesture();
				},
				options,
			);
			window.addEventListener(
				'keydown',
				(event) => {
					if (
						event.target instanceof HTMLElement &&
						event.target.closest(
							'input,textarea,select,button,[contenteditable],dialog[open]',
						)
					)
						return;
					if (event.code === 'Space') {
						event.preventDefault();
						this.spaceHeld.set(true);
					}
					if (event.key === 'Escape') this.cancelGesture();
				},
				options,
			);
			window.addEventListener(
				'keyup',
				(event) => {
					if (event.code === 'Space') this.spaceHeld.set(false);
				},
				options,
			);
			viewport.addEventListener(
				'wheel',
				(event) => {
					if (event.ctrlKey || event.metaKey) {
						event.preventDefault();
						this.zoomAt(
							this.state.zoom() * Math.exp(-event.deltaY * 0.002),
							event.clientX,
							event.clientY,
						);
					}
				},
				{ ...options, passive: false },
			);
		});
	}
	private updateCursor(event: { clientX: number; clientY: number; pointerType: string }): void {
		if (event.pointerType === 'touch') {
			this.pointer.set(null);
			return;
		}
		const canvas = this.canvas().nativeElement,
			r = canvas.getBoundingClientRect(),
			v = this.viewport().nativeElement.getBoundingClientRect();
		const x = event.clientX,
			y = event.clientY;
		this.pointer.set(
			x >= r.left &&
				x < r.right &&
				y >= r.top &&
				y < r.bottom &&
				x >= v.left &&
				x < v.right &&
				y >= v.top &&
				y < v.bottom &&
				document.elementFromPoint(x, y) === canvas
				? { x, y }
				: null,
		);
	}
	private point(event: PointerEvent): Point {
		const canvas = this.canvas().nativeElement,
			r = canvas.getBoundingClientRect();
		return {
			x: (event.clientX - r.left) / this.state.zoom(),
			y: (event.clientY - r.top) / this.state.zoom(),
		};
	}
	startHandle(event: PointerEvent, mode: 'resize' | 'rotate'): void {
		if (event.button !== 0) return;
		event.preventDefault();
		event.stopPropagation();
		const target = event.currentTarget as HTMLElement;
		this.handle = { id: event.pointerId, target };
		target.setPointerCapture(event.pointerId);
		this.engine.startTransform(mode, this.point(event));
	}
	private cancelGesture(): void {
		this.panning.set(false);
		this.touches.clear();
		this.touchNavigation = false;
		this.pendingTouch = undefined;
		this.pinch = undefined;
		this.engine.cancel();
		this.active = undefined;
		this.handle = undefined;
		this.pan = undefined;
	}
	zoomBy(delta: number): void {
		this.zoomAt(this.state.zoom() + delta);
	}
	reset(): void {
		this.zoomAt(1);
	}
	fit(): void {
		const v = this.viewport().nativeElement,
			d = this.state.dimensions();
		this.zoomAt(Math.min((v.clientWidth - 96) / d.width, (v.clientHeight - 96) / d.height));
		v.scrollTo(0, 0);
	}
	zoomAt(value: number, clientX?: number, clientY?: number): void {
		const v = this.viewport().nativeElement,
			r = v.getBoundingClientRect(),
			old = this.state.zoom(),
			next = Math.min(4, Math.max(0.1, value));
		const x = clientX === undefined ? v.clientWidth / 2 : clientX - r.left,
			y = clientY === undefined ? v.clientHeight / 2 : clientY - r.top;
		const docX = (v.scrollLeft + x - 48) / old,
			docY = (v.scrollTop + y - 48) / old;
		this.state.zoom.set(next);
		if (this.zoomFrame !== undefined) cancelAnimationFrame(this.zoomFrame);
		this.zoomFrame = requestAnimationFrame(() => {
			v.scrollLeft = docX * next + 48 - x;
			v.scrollTop = docY * next + 48 - y;
			this.zoomFrame = undefined;
		});
	}
	resizeBy(event: Event, delta: number): void {
		event.preventDefault();
		event.stopPropagation();
		const b = this.box();
		if (b) this.engine.resizeSelected(b.width + delta, b.height + delta);
	}
	rotateBy(event: Event, delta: number): void {
		event.preventDefault();
		event.stopPropagation();
		this.engine.rotateSelection(delta);
	}
	ngOnDestroy(): void {
		this.abort?.abort();
		if (this.zoomFrame !== undefined) cancelAnimationFrame(this.zoomFrame);
		this.engine.detach();
	}
}

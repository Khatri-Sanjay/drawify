import {
	afterNextRender,
	effect,
	computed,
	untracked,
	signal,
	Component,
	ElementRef,
	inject,
	OnDestroy,
	viewChild,
} from '@angular/core';
import { EditorState } from '../../services/editor-state';
import { DrawingEngine } from '../../services/drawing-engine';
import { DrawingCanvas } from '../../components/drawing-canvas/drawing-canvas';
import { EditorToolbar } from '../../components/editor-toolbar';
import { ToolProperties } from '../../components/tool-properties';
import { EditorHeader } from '../../components/editor-header';
import { LayersPanel } from '../../components/layers-panel';
import { ProjectGallery } from '../../components/project-gallery';
import { ExportDialog } from '../../components/export-dialog';
import { ProjectSession } from '../../services/project-session';
import { downloadFile } from '../../services/project-format';
import { CanvasSizeDialog } from '../../components/canvas-size-dialog';
import { TextProperties } from '../../components/text-properties';
@Component({
	selector: 'app-editor',
	imports: [
		DrawingCanvas,
		EditorToolbar,
		ToolProperties,
		EditorHeader,
		LayersPanel,
		ProjectGallery,
		ExportDialog,
		CanvasSizeDialog,
		TextProperties,
	],
	providers: [EditorState, DrawingEngine, ProjectSession],
	template: `
		<div class="flex min-h-dvh flex-col bg-white md:h-dvh">
			<app-editor-header
				(exportRequested)="export()"
				(galleryRequested)="gallery.show()"
				(exportOptionsRequested)="exportOptions.show()"
			/>
			@if (session.conflict()) {
				<section
					role="alert"
					aria-label="Project save conflict"
					class="flex flex-wrap items-center gap-3 border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-950"
				>
					<p class="min-w-48 flex-1">
						This project changed in another tab. Autosave is paused; your edits are
						still here.
					</p>
					<button
						class="button-primary"
						[disabled]="session.busy()"
						(click)="session.saveCopy()"
					>
						Save as new project
					</button>
					<button
						class="button-secondary"
						[disabled]="session.busy()"
						(click)="session.reloadSaved()"
					>
						Discard my changes and reload
					</button>
				</section>
			}
			<div class="flex min-h-0 flex-1 flex-col md:flex-row">
				<div class="overflow-x-auto border-b border-slate-200 md:border-r md:border-b-0">
					<app-editor-toolbar />
				</div>
				<main class="flex min-w-0 flex-1 flex-col">
					<div
						class="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3"
					>
						<div class="flex items-center gap-2">
							<span class="h-2 w-2 rounded-full bg-violet-500"></span>
							<h1 class="text-sm font-medium">Your creative space</h1>
						</div>
						<div class="flex gap-3">
							<button class="text-xs text-violet-600" (click)="canvasSize.show()">
								Canvas size</button
							><button
								class="text-xs text-slate-500 hover:text-red-600"
								(click)="confirm.showModal()"
							>
								Clear canvas
							</button>
						</div>
					</div>
					@if (state.error()) {
						<div
							role="alert"
							class="flex justify-between bg-red-50 px-5 py-3 text-sm text-red-700"
						>
							{{ state.error()
							}}<button aria-label="Dismiss error" (click)="state.error.set('')">
								&times;
							</button>
						</div>
					}
					<div class="relative flex min-h-0 flex-1">
						<app-drawing-canvas #drawingCanvas />
						@if (!session.ready() || session.busy()) {
							<div
								role="status"
								class="absolute inset-0 z-10 flex items-center justify-center bg-white/80 text-sm"
							>
								{{ session.busy() ? 'Opening project…' : 'Recovering local work…' }}
							</div>
						}
					</div>
					<footer
						class="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-3 text-xs text-slate-500"
					>
						<span
							>{{ state.dimensions().width }} &times;
							{{ state.dimensions().height }} px
							<span class="mx-3 text-slate-300">|</span
							><span class="capitalize">{{ state.tool() }}</span></span
						>
						<div class="flex items-center gap-3">
							<button
								class="zoom-button"
								aria-label="Zoom out"
								(click)="drawingCanvas.zoomBy(-0.25)"
							>
								-</button
							><span class="w-10 text-center"
								>{{ (state.zoom() * 100).toFixed(0) }}%</span
							><button
								class="zoom-button"
								aria-label="Zoom in"
								(click)="drawingCanvas.zoomBy(0.25)"
							>
								+</button
							><button class="hover:text-violet-600" (click)="drawingCanvas.reset()">
								Reset
							</button>
							<button class="hover:text-violet-600" (click)="drawingCanvas.fit()">
								Fit to screen
							</button>
						</div>
					</footer>
				</main>
				<div
					class="w-full shrink-0 border-t border-slate-200 md:w-72 md:overflow-auto md:border-t-0 md:border-l"
					data-text-controls
				>
					<div
						class="sticky top-0 z-10 flex gap-2 border-b border-slate-200 bg-white p-3"
						aria-label="Inspector panels"
					>
						<button
							class="button-secondary flex-1"
							[attr.aria-pressed]="inspector() === 'tools'"
							(click)="inspector.set('tools')"
						>
							Tool settings
						</button>
						<button
							class="button-secondary flex-1"
							[attr.aria-pressed]="inspector() === 'layers'"
							(click)="inspector.set('layers')"
						>
							Layers
						</button>
					</div>
					@if (inspector() === 'tools') {
						@if (textContext()) {
							<app-text-properties />
						} @else {
							<app-tool-properties />
						}
					} @else {
						<app-layers-panel />
					}
				</div>
			</div>
		</div>
		<!-- Native dialog supports Escape; this click handler only dismisses the pointer backdrop. -->
		<!-- eslint-disable-next-line @angular-eslint/template/click-events-have-key-events, @angular-eslint/template/interactive-supports-focus -->
		<dialog
			#confirm
			class="modal"
			aria-labelledby="clear-title"
			(click)="closeBackdrop($event, confirm)"
		>
			<form method="dialog">
				<h2 id="clear-title" class="text-xl font-semibold">A fresh start?</h2>
				<p class="my-4 text-sm leading-6 text-slate-500">
					This clears your artwork. You can undo it if you change your mind.
				</p>
				<div class="flex justify-end gap-3">
					<button class="button-secondary" value="cancel">Keep drawing</button
					><button
						class="button-primary"
						value="clear"
						(click)="engine.commit({ kind: 'clear' })"
					>
						Clear canvas
					</button>
				</div>
			</form>
		</dialog>
		<app-project-gallery #gallery />
		<app-export-dialog #exportOptions />
		<app-canvas-size-dialog #canvasSize (resized)="drawingCanvas.fit()" />
	`,
})
export class Editor implements OnDestroy {
	readonly state = inject(EditorState);
	readonly engine = inject(DrawingEngine);
	readonly session = inject(ProjectSession);
	readonly inspector = signal<'tools' | 'layers'>('tools');
	readonly textContext = computed(() => {
		const selected = this.engine.selected();
		return (
			!!this.engine.textRequest() ||
			this.state.tool() === 'text' ||
			(this.engine.selection().length === 1 &&
				selected?.kind === 'draw' &&
				selected.config.tool === 'text')
		);
	});
	private readonly confirm = viewChild.required<ElementRef<HTMLDialogElement>>('confirm');
	private abort?: AbortController;
	constructor() {
		effect(() => {
			const tool = this.state.tool();
			if (this.engine.textRequest() && !['text', 'select'].includes(tool))
				untracked(() => this.engine.finishText());
			this.inspector.set(this.textContext() || tool !== 'select' ? 'tools' : 'layers');
		});
		afterNextRender(() => {
			void this.session.start();
			this.abort = new AbortController();
			document.addEventListener(
				'pointerdown',
				(event) => {
					if (
						this.engine.textRequest() &&
						event.target instanceof Element &&
						!event.target.closest('.inline-text-editor,[data-text-controls]')
					)
						this.engine.finishText();
				},
				{ capture: true, signal: this.abort.signal },
			);
			window.addEventListener(
				'keydown',
				(event) => {
					if (
						event.target instanceof HTMLElement &&
						(event.target.closest('input, textarea, select, [contenteditable]') ||
							document.querySelector('dialog[open]'))
					)
						return;
					const key = event.key.toLowerCase();
					if (event.altKey) return;
					if (!(event.ctrlKey || event.metaKey)) {
						if (key === 'v') this.state.tool.set('select');
						if (key === 'h') this.state.tool.set('hand');
						if (key === 'escape') this.engine.clearSelection();
						const selected = this.engine.selected();
						if (
							selected &&
							[
								'ArrowLeft',
								'ArrowRight',
								'ArrowUp',
								'ArrowDown',
								'Delete',
								'Backspace',
							].includes(event.key)
						) {
							event.preventDefault();
							if (key === 'delete' || key === 'backspace')
								this.engine.deleteSelected();
							else {
								const step = event.shiftKey ? 10 : 1;
								this.engine.nudge(
									event.key === 'ArrowRight'
										? step
										: event.key === 'ArrowLeft'
											? -step
											: 0,
									event.key === 'ArrowDown'
										? step
										: event.key === 'ArrowUp'
											? -step
											: 0,
								);
							}
						}
						return;
					}
					if (key === 'd') {
						event.preventDefault();
						this.engine.duplicate();
					}
					if (key === 'a') {
						event.preventDefault();
						this.engine.selectAll();
					}
					if (key === 'g') {
						event.preventDefault();
						if (event.shiftKey) this.engine.ungroup();
						else this.engine.group();
					}
					if (key === 'z') {
						event.preventDefault();
						if (event.shiftKey) {
							this.engine.redo();
						} else {
							this.engine.undo();
						}
					}
					if (key === 'y') {
						event.preventDefault();
						this.engine.redo();
					}
					if (key === 's') {
						event.preventDefault();
						this.session.download();
					}
				},
				{ signal: this.abort.signal },
			);
			window.addEventListener(
				'pagehide',
				() => {
					void this.session.save().catch(() => undefined);
				},
				{ signal: this.abort.signal },
			);
			document.addEventListener(
				'visibilitychange',
				() => {
					if (document.visibilityState === 'hidden')
						void this.session.save().catch(() => undefined);
				},
				{ signal: this.abort.signal },
			);
			window.addEventListener(
				'beforeunload',
				(event) => {
					if (this.state.dirty()) event.preventDefault();
				},
				{ signal: this.abort.signal },
			);
		});
	}
	closeBackdrop(event: MouseEvent, dialog: HTMLDialogElement): void {
		if (event.target === dialog) dialog.close();
	}
	async export(): Promise<void> {
		try {
			const blob = await this.engine.exportPng();
			downloadFile(blob, this.state.name(), 'png');
		} catch (error) {
			this.state.error.set(
				error instanceof Error ? error.message : 'Could not export drawing.',
			);
		}
	}
	ngOnDestroy(): void {
		this.abort?.abort();
		this.engine.dispose();
	}
}

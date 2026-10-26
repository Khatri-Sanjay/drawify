import { Component, computed, effect, ElementRef, inject, viewChild } from '@angular/core';
import { DrawingEngine } from '../services/drawing-engine';
import { EditorState } from '../services/editor-state';
import { ProjectSession } from '../services/project-session';
import { FONT_STACKS, layoutText, textLineBox, textStyle } from '../services/text-layout';
import { objectMatrix } from '../services/drawing-geometry';
import { ToolConfiguration } from '../models/drawing';

@Component({
	selector: 'app-inline-text-editor',
	template: `
		@if (engine.textRequest(); as request) {
			@if (geometry(); as box) {
				<div
					class="text-quick-controls"
					data-text-controls
					aria-label="Quick text controls"
					[style.left.px]="box.toolbarX"
					[style.top.px]="box.toolbarY"
				>
					<button
						type="button"
						aria-label="Quick bold"
						title="Bold (Ctrl/Command B)"
						[attr.aria-pressed]="style().fontWeight === 'bold'"
						(click)="
							format({
								fontWeight: style().fontWeight === 'bold' ? 'normal' : 'bold',
							})
						"
					>
						<b>B</b>
					</button>
					<button
						type="button"
						aria-label="Quick italic"
						title="Italic (Ctrl/Command I)"
						[attr.aria-pressed]="style().fontStyle === 'italic'"
						(click)="
							format({
								fontStyle: style().fontStyle === 'italic' ? 'normal' : 'italic',
							})
						"
					>
						<i>I</i>
					</button>
					<button
						type="button"
						aria-label="Quick underline"
						title="Underline (Ctrl/Command U)"
						[attr.aria-pressed]="style().underline"
						(click)="format({ underline: !style().underline })"
					>
						<u>U</u>
					</button>
					<input
						#quickSize
						type="number"
						min="6"
						max="512"
						aria-label="Quick font size"
						[value]="style().fontSize"
						(change)="size(quickSize)"
					/>
					<input
						#quickColor
						type="color"
						aria-label="Quick text color"
						title="Text color"
						[value]="request.config.stroke"
						(input)="engine.updateTextDraft({ stroke: quickColor.value })"
					/>
					<button
						type="button"
						class="finish"
						aria-label="Finish text"
						(click)="finish()"
					>
						Done
					</button>
					<button
						type="button"
						aria-label="Cancel editing text"
						title="Cancel (Escape)"
						(click)="cancel()"
					>
						×
					</button>
				</div>
				<div class="inline-text-editor" [style.transform]="box.matrix">
					<textarea
						#content
						class="canvas-text-input"
						aria-label="Canvas text"
						placeholder="Type here…"
						maxlength="10000"
						spellcheck="true"
						[attr.wrap]="style().textWidth ? 'soft' : 'off'"
						[attr.dir]="style().textDirection"
						[value]="request.config.text"
						[style.left.px]="box.x"
						[style.top.px]="box.y"
						[style.width.px]="box.width"
						[style.height.px]="box.height"
						[style.fontFamily]="stacks[style().fontFamily]"
						[style.fontSize.px]="style().fontSize"
						[style.fontWeight]="style().fontWeight"
						[style.fontStyle]="style().fontStyle"
						[style.textDecoration]="style().underline ? 'underline' : 'none'"
						[style.textAlign]="style().textAlign"
						[style.lineHeight]="style().lineHeight"
						[style.whiteSpace]="style().textWidth ? 'pre-wrap' : 'pre'"
						[style.color]="request.config.stroke"
						[style.caretColor]="'#7254c9'"
						(input)="engine.updateTextDraft({ text: content.value })"
						(keydown)="shortcut($event)"
					></textarea>
				</div>
			}
		}
	`,
	styles: `
		.text-quick-controls {
			position: absolute;
			z-index: 25;
			display: flex;
			align-items: center;
			gap: 3px;
			padding: 5px;
			border: 1px solid #ddd6fe;
			border-radius: 12px;
			background: white;
			box-shadow: 0 5px 18px rgb(30 20 60 / 0.14);
			font:
				13px Arial,
				sans-serif;
			color: #334155;
			touch-action: auto;
		}
		.text-quick-controls button {
			min-width: 30px;
			height: 32px;
			border-radius: 6px;
			cursor: pointer;
		}
		.text-quick-controls button:hover,
		.text-quick-controls [aria-pressed='true'] {
			background: #ede9fe;
			color: #6d28d9;
		}
		.text-quick-controls input[type='number'] {
			width: 50px;
			height: 32px;
			border: 1px solid #e2e8f0;
			border-radius: 6px;
			padding: 3px;
		}
		.text-quick-controls input[type='color'] {
			width: 28px;
			height: 30px;
			cursor: pointer;
		}
		.text-quick-controls .finish {
			background: #7254c9;
			color: white;
			padding: 0 8px;
		}
		.text-quick-controls :focus-visible {
			outline: 2px solid #7254c9;
			outline-offset: 2px;
		}
		.inline-text-editor {
			position: absolute;
			left: 0;
			top: 0;
			width: 0;
			height: 0;
			transform-origin: 0 0;
			z-index: 20;
			pointer-events: none;
		}
		.canvas-text-input {
			position: absolute;
			display: block;
			pointer-events: auto;
			box-sizing: content-box;
			min-width: 0;
			margin: 0;
			padding: 0;
			border: 0;
			border-radius: 0;
			outline: 1px dashed #7254c9;
			outline-offset: 3px;
			box-shadow: 0 0 0 4px rgb(255 255 255 / 0.8);
			background: transparent;
			resize: none;
			overflow: auto;
			overflow-wrap: anywhere;
			tab-size: 4;
			cursor: text;
			touch-action: auto;
		}
		.canvas-text-input:focus-visible {
			outline: 1px dashed #7254c9;
			outline-offset: 3px;
		}
		.canvas-text-input::placeholder {
			color: #64748b;
			opacity: 0.8;
		}
		.canvas-text-input::selection {
			background: rgb(167 139 250 / 0.35);
		}
	`,
})
export class InlineTextEditor {
	readonly engine = inject(DrawingEngine);
	readonly state = inject(EditorState);
	private readonly session = inject(ProjectSession);
	readonly stacks = FONT_STACKS;
	readonly style = computed(() =>
		textStyle(this.engine.textRequest()?.config ?? this.state.textConfig()),
	);
	private readonly content = viewChild<ElementRef<HTMLTextAreaElement>>('content');
	readonly geometry = computed(() => {
		const object = this.engine.textPreview();
		if (!object || object.kind !== 'draw') return undefined;
		const layout = layoutText(object.config, object.points[0]),
			line = textLineBox(object.config),
			width = Math.max(
				96,
				layout.style.textWidth || Math.max(...layout.lines.map((l) => l.width)) + 4,
			);
		const x =
				object.points[0].x -
				(layout.style.textAlign === 'center'
					? width / 2
					: layout.style.textAlign === 'right'
						? width
						: 0),
			zoom = this.state.zoom();
		const matrix = objectMatrix(object),
			y = object.points[0].y - line.baseline;
		const left = (matrix[0] * x + matrix[2] * y + matrix[4]) * zoom;
		const top = (matrix[1] * x + matrix[3] * y + matrix[5]) * zoom;
		return {
			x,
			y,
			width,
			height: Math.min(
				360 / zoom,
				Math.max(line.height, layout.lines.length * line.height) + 4,
			),
			toolbarX: Math.max(0, Math.min(left, this.state.dimensions().width * zoom - 290)),
			toolbarY: Math.max(-44, top - 52),
			matrix: `matrix(${objectMatrix(object)
				.map((v) => v * zoom)
				.join(',')})`,
		};
	});
	constructor() {
		effect(() => {
			const content = this.content()?.nativeElement;
			if (content) queueMicrotask(() => content.focus({ preventScroll: true }));
		});
	}
	format(patch: Partial<ToolConfiguration>): void {
		this.engine.updateTextDraft(patch);
		this.content()?.nativeElement.focus({ preventScroll: true });
	}
	size(input: HTMLInputElement): void {
		if (input.validity.valid && Number.isFinite(input.valueAsNumber))
			this.format({ fontSize: input.valueAsNumber });
		else input.value = String(this.style().fontSize);
	}
	finish(): void {
		this.engine.finishText();
		this.focusCanvas();
	}
	cancel(): void {
		this.engine.cancelText();
		this.focusCanvas();
	}
	private focusCanvas(): void {
		document
			.querySelector<HTMLCanvasElement>('app-drawing-canvas canvas')
			?.focus({ preventScroll: true });
	}
	shortcut(event: KeyboardEvent): void {
		if (event.isComposing) return;
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			this.engine.cancelText();
			this.focusCanvas();
			return;
		}
		if (event.ctrlKey || event.metaKey) {
			const key = event.key.toLowerCase();
			if (key === 'enter') {
				event.preventDefault();
				event.stopPropagation();
				this.engine.finishText();
				this.focusCanvas();
			}
			if (key === 's') {
				event.preventDefault();
				event.stopPropagation();
				this.engine.finishText();
				this.session.download();
			}
			if (['b', 'i', 'u'].includes(key)) {
				event.preventDefault();
				event.stopPropagation();
				const style = this.style();
				this.engine.updateTextDraft(
					key === 'b'
						? { fontWeight: style.fontWeight === 'bold' ? 'normal' : 'bold' }
						: key === 'i'
							? { fontStyle: style.fontStyle === 'italic' ? 'normal' : 'italic' }
							: { underline: !style.underline },
				);
			}
		}
	}
}

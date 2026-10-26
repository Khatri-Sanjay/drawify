import { Component, computed, effect, ElementRef, inject, viewChild } from '@angular/core';
import { DrawingEngine } from '../services/drawing-engine';
import { EditorState } from '../services/editor-state';
import { ProjectSession } from '../services/project-session';
import { FONT_STACKS, layoutText, textLineBox, textStyle } from '../services/text-layout';
import { objectMatrix } from '../services/drawing-geometry';

@Component({
	selector: 'app-inline-text-editor',
	template: `
		@if (engine.textRequest(); as request) {
			@if (geometry(); as box) {
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
						[style.caretColor]="request.config.stroke"
						[style.opacity]="request.config.opacity"
						(input)="engine.updateTextDraft({ text: content.value })"
						(keydown)="shortcut($event)"
					></textarea>
				</div>
			}
		}
	`,
	styles: `
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
			overflow: hidden;
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
		return {
			x,
			y: object.points[0].y - line.baseline,
			width,
			height: Math.max(line.height, layout.lines.length * line.height) + 4,
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

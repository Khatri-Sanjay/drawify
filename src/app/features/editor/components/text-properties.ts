import { Component, computed, inject } from '@angular/core';
import { ToolConfiguration } from '../models/drawing';
import { DrawingEngine } from '../services/drawing-engine';
import { EditorState } from '../services/editor-state';
import { TextFormatting } from './text-formatting';

@Component({
	selector: 'app-text-properties',
	imports: [TextFormatting],
	template: ` <aside class="space-y-5 p-5" aria-label="Text properties" data-text-controls>
		<div>
			<p class="eyebrow">WORDS ON YOUR CANVAS</p>
			<h2 class="mt-2 text-xl font-semibold">Text settings</h2>
			<p class="mt-2 text-xs leading-5 text-slate-500">
				{{
					engine.textRequest()
						? 'Type directly in the outlined box on the canvas. Changes here update it immediately.'
						: selectedText()
							? 'Select a color or font to change this text. Double-click it to edit the words.'
							: 'Click the canvas to start typing. New text starts black; choose any color below.'
				}}
			</p>
		</div>
		@if (engine.textRequest()) {
			<div class="flex gap-2">
				<button class="button-primary flex-1" (click)="engine.finishText()">Done</button
				><button class="button-secondary flex-1" (click)="engine.cancelText()">
					Cancel text
				</button>
			</div>
			<p class="text-xs text-slate-500">
				Click away or Ctrl/Command + Enter to finish. Escape cancels. Enter adds a new line.
			</p>
		} @else if (selectedText(); as text) {
			<button
				class="button-secondary w-full"
				[disabled]="text.locked"
				(click)="engine.requestText(undefined, text.id)"
			>
				Edit text
			</button>
		} @else {
			<button class="button-primary w-full" (click)="engine.requestText()">Add text</button>
		}
		<fieldset class="space-y-4" [disabled]="!engine.textRequest() && !!selectedText()?.locked">
			<section class="space-y-3">
				<label class="block text-sm font-medium"
					>Text color<input
						#color
						class="color-input"
						type="color"
						aria-label="Text color"
						[value]="config().stroke"
						(input)="patch({ stroke: color.value })"
				/></label>
				<div class="grid grid-cols-6 gap-2">
					@for (color of colors; track color) {
						<button
							type="button"
							class="h-7 rounded-full border border-black/20"
							[style.background]="color"
							[attr.aria-label]="'Set text color to ' + color"
							[attr.aria-pressed]="config().stroke === color"
							(click)="patch({ stroke: color })"
						></button>
					}
				</div>
				<p class="font-mono text-xs text-slate-500">{{ config().stroke }}</p>
			</section>
			<app-text-formatting [config]="config()" (patch)="patch($event)" />
			<label class="block text-xs"
				>Text opacity {{ (config().opacity * 100).toFixed(0) }}%<input
					#opacity
					class="mt-2 w-full accent-violet-600"
					aria-label="Text opacity"
					type="range"
					min="0"
					max="100"
					[value]="config().opacity * 100"
					(input)="patch({ opacity: +opacity.value / 100 })"
			/></label>
		</fieldset>
		<p class="rounded-xl bg-violet-50 p-3 text-xs leading-5 text-violet-700">
			Text stays editable after you finish. Use Select to move or resize it; all changes
			support undo.
		</p>
	</aside>`,
})
export class TextProperties {
	readonly engine = inject(DrawingEngine);
	readonly state = inject(EditorState);
	readonly selectedText = computed(() => {
		const object = this.engine.selected();
		return this.engine.selection().length === 1 &&
			object?.kind === 'draw' &&
			object.config.tool === 'text'
			? object
			: undefined;
	});
	readonly config = computed(
		() =>
			this.engine.textRequest()?.config ??
			this.selectedText()?.config ??
			this.state.textConfig(),
	);
	readonly colors = [
		'#000000',
		'#ffffff',
		'#64748b',
		'#ef4444',
		'#f97316',
		'#eab308',
		'#22c55e',
		'#14b8a6',
		'#0ea5e9',
		'#6366f1',
		'#8b5cf6',
		'#ec4899',
	];
	patch(patch: Partial<ToolConfiguration>): void {
		if (this.engine.textRequest()) this.engine.updateTextDraft(patch);
		else if (this.selectedText()) this.engine.updateSelectedStyle(patch);
		else {
			this.state.formatText(patch);
			if (patch.stroke !== undefined) this.state.textColor.set(patch.stroke);
			if (patch.opacity !== undefined) this.state.textOpacity.set(patch.opacity);
		}
	}
}

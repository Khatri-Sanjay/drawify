import { Component, computed, inject } from '@angular/core';
import { DEFAULT_CONFIG, ToolConfiguration } from '../models/drawing';
import { DrawingEngine } from '../services/drawing-engine';
import { TextFormatting } from './text-formatting';
import { BRUSH_PRESETS } from '../services/brush-strokes';
import { BrushType } from '../models/drawing';

@Component({
	selector: 'app-selected-styles',
	imports: [TextFormatting],
	template: ` <section
		class="mt-5 space-y-3 border-t border-slate-200 pt-4"
		aria-label="Selected object styles"
	>
		<h3 class="section-label">Edit selected styles</h3>
		<p class="text-xs leading-5 text-slate-500">
			Changes apply to the selection. Controls show the first object's values; other objects
			may differ.
		</p>
		<fieldset [disabled]="!engine.editableSelection()" class="space-y-3">
			<label class="block text-xs"
				>Selected opacity {{ (config().opacity * 100).toFixed(0) }}%<input
					#opacity
					class="mt-2 w-full accent-violet-600"
					aria-label="Selected opacity"
					type="range"
					min="0"
					max="100"
					[value]="config().opacity * 100"
					(change)="engine.updateSelectedStyle({ opacity: +opacity.value / 100 })"
			/></label>
			@if (drawings().length) {
				@if (brushConfig(); as brush) {
					<section
						class="space-y-3 rounded-xl bg-violet-50 p-3"
						aria-label="Selected brush settings"
					>
						<label class="block text-xs"
							>Selected brush style<select
								#tip
								aria-label="Selected brush style"
								class="field mt-1"
								[value]="brush.brushType ?? 'normal'"
								(change)="changeBrush(tip.value)"
							>
								@for (preset of presets; track preset.id) {
									<option [value]="preset.id">{{ preset.name }}</option>
								}
							</select></label
						><label class="block text-xs"
							>Selected brush flow<input
								#flow
								aria-label="Selected brush flow"
								class="mt-2 w-full accent-violet-600"
								type="range"
								min="5"
								max="100"
								[value]="(brush.brushFlow ?? 1) * 100"
								(change)="
									engine.updateSelectedStyle({ brushFlow: +flow.value / 100 })
								"
						/></label>
					</section>
				}
				<div class="grid grid-cols-2 gap-3">
					<label class="text-xs"
						>Selected stroke<input
							#stroke
							class="color-input"
							type="color"
							[value]="config().stroke"
							(change)="
								engine.updateSelectedStyle({ stroke: stroke.value })
							" /></label
					><label class="text-xs"
						>Selected fill<input
							#fill
							class="color-input"
							type="color"
							[value]="config().fill"
							(change)="engine.updateSelectedStyle({ fill: fill.value })"
					/></label>
				</div>
				@if (!allText()) {
					<label class="block text-xs"
						>Selected stroke width<input
							#size
							class="field mt-1"
							type="number"
							min="1"
							max="80"
							[value]="config().size"
							(change)="engine.updateSelectedStyle({ size: +size.value })"
					/></label>
					<label class="block text-xs"
						>Selected shape style<select
							#mode
							class="field mt-1"
							[value]="config().mode"
							(change)="setMode(mode.value)"
						>
							<option value="outline">Outline</option>
							<option value="fill">Filled</option>
							<option value="both">Fill & outline</option>
						</select></label
					>
					<label class="flex gap-2 text-xs"
						><input
							#dash
							type="checkbox"
							[checked]="config().dashed"
							(change)="engine.updateSelectedStyle({ dashed: dash.checked })"
						/>Selected dashed strokes</label
					>
					<label class="flex gap-2 text-xs"
						><input
							#smooth
							type="checkbox"
							[checked]="config().smoothing"
							(change)="engine.updateSelectedStyle({ smoothing: smooth.checked })"
						/>Selected smooth strokes</label
					>
				}
				@if (textConfig(); as textConfig) {
					<app-text-formatting
						prefix="Selected "
						[config]="textConfig"
						(patch)="engine.updateSelectedStyle($event)"
					/>
				}
				@if (
					drawings().length === 1 &&
					engine.selection().length === 1 &&
					config().tool === 'text'
				) {
					<label class="block text-xs"
						>Selected text<textarea
							#text
							aria-label="Selected text"
							class="field mt-1"
							maxlength="10000"
							rows="5"
							dir="auto"
							[value]="config().text"
							(change)="engine.updateSelectedStyle({ text: text.value })"
						></textarea>
					</label>
					<button
						type="button"
						class="button-secondary w-full"
						(click)="engine.requestText(undefined, engine.selectedId()!)"
					>
						Edit text
					</button>
				}
			}
		</fieldset>
	</section>`,
})
export class SelectedStyles {
	readonly engine = inject(DrawingEngine);
	readonly presets = BRUSH_PRESETS;
	readonly drawings = computed(() => this.engine.selection().filter((o) => o.kind === 'draw'));
	readonly brushConfig = computed(() =>
		this.drawings().length && this.drawings().every((o) => o.config.tool === 'brush')
			? this.drawings()[0].config
			: undefined,
	);
	readonly allText = computed(
		() => this.drawings().length > 0 && this.drawings().every((o) => o.config.tool === 'text'),
	);
	readonly textConfig = computed(
		() => this.drawings().find((o) => o.config.tool === 'text')?.config,
	);
	readonly config = computed(() => {
		const o = this.engine.selection()[0];
		return o?.kind === 'draw' ? o.config : { ...DEFAULT_CONFIG, opacity: o?.opacity ?? 1 };
	});
	setMode(value: string): void {
		if (value === 'outline' || value === 'fill' || value === 'both')
			this.engine.updateSelectedStyle({ mode: value as ToolConfiguration['mode'] });
	}
	changeBrush(value: string): void {
		const preset = BRUSH_PRESETS.find((p) => p.id === value);
		if (preset)
			this.engine.updateSelectedStyle({
				brushType: value as BrushType,
				brushSpacing: preset.spacing,
				brushAngle: preset.angle,
			});
	}
}

import { Component, inject } from '@angular/core';
import { EditorState } from '../services/editor-state';
import { DrawingEngine } from '../services/drawing-engine';
import { GridSettings } from './grid-settings';
import { BrushPicker } from './brush-picker';
@Component({
	selector: 'app-tool-properties',
	imports: [GridSettings, BrushPicker],
	template: ` <aside class="space-y-7 p-5" aria-label="Tool properties">
		<div>
			<p class="eyebrow">MAKE IT YOURS</p>
			<h2 class="mt-2 text-xl font-semibold capitalize">{{ state.tool() }} settings</h2>
		</div>
		@if (state.tool() === 'brush') {
			<app-brush-picker />
		}
		<section class="space-y-3">
			<h3 class="section-label">
				{{ state.tool() === 'brush' ? 'Brush color' : 'Stroke & fill' }}
			</h3>
			<div class="flex gap-4">
				<label class="flex-1 text-sm"
					>{{ state.tool() === 'brush' ? 'Color' : 'Stroke'
					}}<input
						#stroke
						aria-label="Stroke"
						class="color-input"
						type="color"
						[value]="state.stroke()"
						(input)="state.stroke.set(stroke.value)"
				/></label>
				@if (state.tool() !== 'brush') {
					<label class="flex-1 text-sm"
						>Fill<input
							#fill
							class="color-input"
							type="color"
							[value]="state.fill()"
							(input)="state.fill.set(fill.value)"
					/></label>
				}
			</div>
			<div class="grid grid-cols-6 gap-2">
				@for (color of colors; track color) {
					<button
						class="h-7 rounded-full border border-black/10"
						[style.background]="color"
						[attr.aria-label]="'Set stroke to ' + color"
						[attr.aria-pressed]="state.stroke() === color"
						(click)="state.stroke.set(color)"
					></button>
				}
			</div>
			<p class="font-mono text-xs text-slate-500">{{ state.stroke() }}</p>
		</section>
		@if (state.tool() !== 'text') {
			<section class="space-y-3">
				<label for="size" class="section-label flex justify-between"
					>Brush size <span>{{ state.size() }} px</span></label
				><input
					#size
					id="size"
					class="w-full accent-violet-600"
					type="range"
					min="1"
					max="80"
					[value]="state.size()"
					(input)="state.size.set(+size.value)"
				/>
				<div class="flex h-16 items-center justify-center rounded-xl bg-slate-50">
					<span
						class="rounded-full"
						[style.background]="state.stroke()"
						[style.width.px]="state.size()"
						[style.height.px]="state.size()"
					></span>
				</div>
			</section>
			@if (state.tool() !== 'brush') {
				<section class="space-y-3">
					<label for="mode" class="section-label">Shape style</label
					><select
						id="mode"
						class="field"
						[value]="state.mode()"
						(change)="setMode($event)"
					>
						<option value="outline">Outline</option>
						<option value="fill">Filled</option>
						<option value="both">Fill & outline</option>
					</select>
				</section>
			}
		}
		<section class="space-y-3">
			<label for="opacity" class="section-label flex justify-between"
				>Opacity <span>{{ (state.opacity() * 100).toFixed(0) }}%</span></label
			>
			<input
				#opacity
				id="opacity"
				class="w-full accent-violet-600"
				type="range"
				min="1"
				max="100"
				[value]="state.opacity() * 100"
				(input)="state.opacity.set(+opacity.value / 100)"
			/>
			<label class="flex items-center gap-2 text-sm"
				><input
					#smooth
					type="checkbox"
					[checked]="state.smoothing()"
					(change)="state.smoothing.set(smooth.checked)"
				/>
				Smooth freehand strokes</label
			>
			@if (state.tool() !== 'brush' || state.brush().brushType === 'normal') {
				<label class="flex items-center gap-2 text-sm"
					><input
						#dashed
						type="checkbox"
						[checked]="state.dashed()"
						(change)="state.dashed.set(dashed.checked)"
					/>
					Dashed strokes</label
				>
			}
			<p class="text-xs text-slate-500">
				Settings apply to new marks. Use Select to edit existing objects.
			</p>
		</section>
		<section class="border-t border-slate-100 pt-5">
			<app-grid-settings />
			<label class="section-label"
				>Canvas background<input
					#background
					class="color-input mt-3"
					type="color"
					[value]="state.background()"
					(change)="engine.background(background.value)"
			/></label>
			<p class="mt-3 text-xs text-slate-500">
				{{ state.dimensions().width }} &times; {{ state.dimensions().height }} px &middot;
				PNG / SVG export
			</p>
		</section>
		<p class="rounded-xl bg-violet-50 p-3 text-xs leading-5 text-violet-700">
			A little space for your big ideas.<br />Pick a tool and make your mark.
		</p>
	</aside>`,
})
export class ToolProperties {
	readonly state = inject(EditorState);
	readonly engine = inject(DrawingEngine);
	readonly colors = [
		'#25283d',
		'#64748b',
		'#ffffff',
		'#f87171',
		'#fb923c',
		'#facc15',
		'#4ade80',
		'#2dd4bf',
		'#38bdf8',
		'#818cf8',
		'#a78bfa',
		'#f472b6',
	];
	setMode(event: Event): void {
		const value = (event.target as HTMLSelectElement).value;
		if (value === 'outline' || value === 'fill' || value === 'both') this.state.mode.set(value);
	}
}

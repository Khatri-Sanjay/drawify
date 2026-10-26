import { Component, computed, ElementRef, inject, signal, viewChild } from '@angular/core';
import { DEFAULT_CONFIG, BrushType } from '../models/drawing';
import { EditorState } from '../services/editor-state';
import { BRUSH_PRESETS } from '../services/brush-strokes';
import { BrushPreview } from './brush-preview';

@Component({
	selector: 'app-brush-picker',
	imports: [BrushPreview],
	template: ` <section class="brush-studio space-y-3" aria-label="Brush studio">
		<button
			#browse
			type="button"
			class="library-toggle"
			[attr.aria-expanded]="expanded()"
			[attr.aria-label]="'Choose brush style, current: ' + active().name"
			aria-controls="brush-library"
			(click)="expanded.set(!expanded())"
		>
			<span
				><span class="block text-xs font-semibold text-slate-800"
					>{{ active().name }} brush</span
				><span class="mt-1 block text-[11px] text-slate-500"
					>Choose from 12 brush styles</span
				></span
			><span class="text-lg text-violet-600" aria-hidden="true">{{
				expanded() ? '−' : '+'
			}}</span>
		</button>
		@if (expanded()) {
			<div id="brush-library" class="rounded-xl border border-slate-200 bg-slate-50 p-2">
				<div class="mb-2 flex flex-wrap gap-1" aria-label="Brush categories">
					@for (group of groups; track group) {
						<button
							type="button"
							class="category-chip"
							[class.chosen]="category() === group"
							[attr.aria-pressed]="category() === group"
							(click)="category.set(group)"
						>
							{{ group }}
						</button>
					}
				</div>
				<div class="brush-grid" role="group" aria-label="Brush styles">
					@for (item of filtered(); track item.preset.id) {
						<button
							type="button"
							class="brush-card"
							[class.chosen]="active().id === item.preset.id"
							[attr.aria-label]="'Use ' + item.preset.name + ' brush'"
							[attr.aria-pressed]="active().id === item.preset.id"
							[title]="item.preset.description"
							(click)="choose(item.preset.id)"
						>
							<app-brush-preview
								[config]="item.config"
								[height]="36"
								[label]="item.preset.name + ' stroke sample'"
							/>
							<span
								class="mt-1 flex items-center justify-between gap-1 text-[11px] font-medium"
								><span>{{ item.preset.name }}</span
								><span class="text-violet-600" aria-hidden="true">{{
									active().id === item.preset.id ? '✓' : ''
								}}</span></span
							>
						</button>
					}
				</div>
			</div>
		}
		<div class="preview-well" [class.dark-preview]="active().id === 'neon'">
			<app-brush-preview
				[config]="state.config()"
				[height]="72"
				[label]="active().name + ' live stroke preview'"
			/>
			<span class="preview-label">LIVE PREVIEW</span>
		</div>
		<p class="text-xs leading-5 text-slate-500" aria-live="polite">
			<strong class="font-medium text-slate-700">{{ active().name }}.</strong>
			{{ active().description }}
		</p>
		<label class="block text-xs font-medium text-slate-600"
			>{{ active().id === 'spray' ? 'Spray density' : 'Brush flow' }}
			<span class="float-right font-normal"
				>{{ (state.brush().brushFlow * 100).toFixed(0) }}%</span
			><input
				#flow
				class="mt-2 w-full accent-violet-600"
				type="range"
				min="5"
				max="100"
				aria-label="Brush flow"
				[value]="state.brush().brushFlow * 100"
				(input)="state.configureBrush({ brushFlow: +flow.value / 100 })"
		/></label>
		@if (active().spacingControl) {
			<label class="block text-xs font-medium text-slate-600"
				>Tip spacing
				<span class="float-right font-normal"
					>{{ (state.brush().brushSpacing * 100).toFixed(0) }}%</span
				><input
					#spacing
					class="mt-2 w-full accent-violet-600"
					aria-label="Tip spacing"
					type="range"
					min="5"
					max="300"
					step="5"
					[value]="state.brush().brushSpacing * 100"
					(input)="state.configureBrush({ brushSpacing: +spacing.value / 100 })"
			/></label>
		}
		@if (active().angleControl) {
			<label class="block text-xs font-medium text-slate-600"
				>Tip angle
				<span class="float-right font-normal">{{ state.brush().brushAngle }}°</span
				><input
					#angle
					class="mt-2 w-full accent-violet-600"
					aria-label="Tip angle"
					type="range"
					min="-90"
					max="90"
					[value]="state.brush().brushAngle"
					(input)="state.configureBrush({ brushAngle: +angle.value })"
			/></label>
		}
		<div class="flex items-start gap-2 rounded-lg bg-violet-50 p-3">
			<p class="flex-1 text-[11px] leading-5 text-violet-700">{{ active().tip }}</p>
			<button
				type="button"
				class="shrink-0 text-[11px] font-medium text-violet-700 underline underline-offset-2"
				(click)="state.chooseBrush(active().id)"
			>
				Reset brush
			</button>
		</div>
	</section>`,
	styles: `
		.library-toggle {
			display: flex;
			width: 100%;
			align-items: center;
			justify-content: space-between;
			gap: 12px;
			border: 1px solid #ddd6fe;
			border-radius: 12px;
			background: #faf9ff;
			padding: 12px;
			text-align: left;
		}
		.brush-grid {
			display: grid;
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: 6px;
			max-height: 260px;
			overflow-y: auto;
			padding: 3px;
			scrollbar-width: thin;
		}
		.brush-card {
			min-width: 0;
			border: 1px solid #e2e8f0;
			border-radius: 10px;
			background: white;
			padding: 8px;
			color: #475569;
			text-align: left;
			transition:
				background 0.15s,
				border-color 0.15s;
		}
		.brush-card:hover {
			border-color: #b5a4e2;
			background: #faf8ff;
		}
		.brush-card.chosen {
			border-color: #7254c9;
			background: #f0ebff;
			box-shadow: 0 0 0 1px #7254c9;
		}
		.category-chip {
			border: 1px solid transparent;
			border-radius: 999px;
			padding: 4px 7px;
			color: #64748b;
			font-size: 10px;
		}
		.category-chip.chosen {
			border-color: #ddd6fe;
			background: white;
			color: #5d40ad;
		}
		.preview-well {
			position: relative;
			overflow: hidden;
			border: 1px solid #e2e8f0;
			border-radius: 12px;
			background: linear-gradient(135deg, #fff, #f5f3ff);
			padding: 6px 8px 20px;
		}
		.dark-preview {
			border-color: #312b46;
			background: #171421;
		}
		.preview-label {
			position: absolute;
			bottom: 6px;
			left: 10px;
			font-size: 8px;
			letter-spacing: 0.14em;
			color: #94a3b8;
		}
	`,
})
export class BrushPicker {
	readonly state = inject(EditorState);
	readonly expanded = signal(true);
	readonly category = signal('All');
	readonly groups = ['All', 'Classic', 'Texture', 'Creative'];
	private readonly browse = viewChild<ElementRef<HTMLButtonElement>>('browse');
	readonly cards = BRUSH_PRESETS.map((preset) => ({
		preset,
		config: {
			...DEFAULT_CONFIG,
			brushType: preset.id,
			brushSpacing: preset.spacing,
			brushAngle: preset.angle,
			size: 14,
			stroke: '#7254c9',
			brushSeed: 42,
		},
	}));
	readonly filtered = computed(() =>
		this.cards.filter(
			(item) => this.category() === 'All' || item.preset.group === this.category(),
		),
	);
	readonly active = computed(
		() => BRUSH_PRESETS.find((p) => p.id === this.state.brush().brushType) ?? BRUSH_PRESETS[0],
	);
	choose(type: BrushType): void {
		this.state.chooseBrush(type);
		this.expanded.set(false);
		queueMicrotask(() => this.browse()?.nativeElement.focus({ preventScroll: true }));
	}
}

import { Component, computed, inject } from '@angular/core';
import { DrawingEngine } from '../services/drawing-engine';
import { objectBounds } from '../services/drawing-geometry';
import { SelectedStyles } from './selected-styles';
import { GridSettings } from './grid-settings';

@Component({
	selector: 'app-layers-panel',
	imports: [SelectedStyles, GridSettings],
	template: ` <aside class="border-t border-slate-200 p-5" aria-label="Layers">
		<div class="mb-3 flex items-center justify-between">
			<h2 class="font-semibold">Layers</h2>
			<span class="text-xs text-slate-500">{{ engine.objects().length }} objects</span>
		</div>
		<app-grid-settings />
		<div class="mb-3 flex flex-wrap gap-2">
			<button class="layer-action" (click)="engine.selectAll()">Select all</button
			><button class="layer-action" (click)="engine.clearSelection()">Deselect</button>
		</div>
		<p class="mb-3 text-xs text-slate-500">
			Shift-click marks or layers, use the checkboxes, or drag an empty area to select several
			objects.
		</p>
		<p class="mb-3 text-xs leading-5 text-slate-500">
			Top layers paint last. Erasers remove marks beneath them.
		</p>
		<ul class="max-h-72 space-y-2 overflow-y-auto">
			@for (object of layers(); track object.id) {
				<li
					class="rounded-xl border p-2"
					[class.border-violet-400]="engine.isSelected(object.id)"
					[class.bg-violet-50]="engine.isSelected(object.id)"
				>
					<button
						class="w-full truncate text-left text-sm font-medium"
						[attr.aria-label]="'Select layer ' + object.name"
						[attr.aria-pressed]="engine.isSelected(object.id)"
						(click)="engine.select(object.id, $event.shiftKey)"
					>
						{{ object.name }}
					</button>
					<label class="mt-1 flex items-center gap-2 text-xs text-slate-500"
						><input
							type="checkbox"
							[attr.aria-label]="'Add layer ' + object.name + ' to selection'"
							[checked]="engine.isSelected(object.id)"
							(change)="engine.select(object.id, true)"
						/>{{ object.groupId ? 'Grouped object' : 'Include in selection' }}</label
					>
					<div class="mt-2 flex flex-wrap gap-1">
						<button
							class="layer-action"
							[attr.aria-label]="(object.visible ? 'Hide ' : 'Show ') + object.name"
							[attr.aria-pressed]="object.visible"
							(click)="engine.updateObject(object.id, { visible: !object.visible })"
						>
							{{ object.visible ? 'Hide' : 'Show' }}
						</button>
						<button
							class="layer-action"
							[attr.aria-label]="(object.locked ? 'Unlock ' : 'Lock ') + object.name"
							[attr.aria-pressed]="object.locked"
							(click)="engine.updateObject(object.id, { locked: !object.locked })"
						>
							{{ object.locked ? 'Unlock' : 'Lock' }}
						</button>
						<button
							class="layer-action"
							[disabled]="object.locked || $first"
							[attr.aria-label]="'Raise ' + object.name"
							(click)="engine.reorder(object.id, 1)"
						>
							↑
						</button>
						<button
							class="layer-action"
							[disabled]="object.locked || $last"
							[attr.aria-label]="'Lower ' + object.name"
							(click)="engine.reorder(object.id, -1)"
						>
							↓
						</button>
					</div>
				</li>
			} @empty {
				<li
					class="rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-500"
				>
					Your marks will appear here.
				</li>
			}
		</ul>
		@if (engine.selected(); as selected) {
			<section class="mt-5 space-y-3" aria-label="Selected object">
				<h3 class="section-label">
					{{
						engine.selection().length === 1
							? 'Selected object'
							: engine.selection().length + ' selected objects'
					}}
					{{ !engine.editableSelection() ? '· locked or hidden' : '' }}
				</h3>
				@if (engine.selection().length === 1) {
					<label class="block text-xs"
						>Layer name<input
							#name
							class="field mt-1"
							maxlength="80"
							[value]="selected.name"
							[disabled]="selected.locked"
							(change)="engine.updateObject(selected.id, { name: name.value })"
					/></label>
					<fieldset [disabled]="selected.locked" class="grid grid-cols-2 gap-2">
						<label class="text-xs"
							>Offset X<input
								#x
								class="field mt-1"
								type="number"
								min="-100000"
								max="100000"
								[value]="selected.transform.x"
								(change)="engine.transformSelected({ x: +x.value })"
						/></label>
						<label class="text-xs"
							>Offset Y<input
								#y
								class="field mt-1"
								type="number"
								min="-100000"
								max="100000"
								[value]="selected.transform.y"
								(change)="engine.transformSelected({ y: +y.value })"
						/></label>
						<label class="text-xs"
							>Object width<input
								#width
								class="field mt-1"
								type="number"
								min="1"
								max="32000"
								[value]="selectedWidth()"
								(change)="engine.resizeSelected(+width.value, selectedHeight())"
						/></label>
						<label class="text-xs"
							>Object height<input
								#height
								class="field mt-1"
								type="number"
								min="1"
								max="32000"
								[value]="selectedHeight()"
								(change)="engine.resizeSelected(selectedWidth(), +height.value)"
						/></label>
						<label class="col-span-2 text-xs"
							>Rotation (degrees)<input
								#angle
								class="field mt-1"
								type="number"
								[value]="selected.transform.rotation.toFixed(1)"
								(change)="engine.transformSelected({ rotation: +angle.value })"
						/></label>
					</fieldset>
				} @else {
					<fieldset
						[disabled]="!engine.editableSelection()"
						class="grid grid-cols-2 gap-2"
					>
						<label class="text-xs"
							>Selection width<input
								#sw
								class="field mt-1"
								type="number"
								min="1"
								[value]="selectedWidth()"
								(change)="
									engine.resizeSelected(+sw.value, selectedHeight())
								" /></label
						><label class="text-xs"
							>Selection height<input
								#sh
								class="field mt-1"
								type="number"
								min="1"
								[value]="selectedHeight()"
								(change)="engine.resizeSelected(selectedWidth(), +sh.value)"
						/></label>
					</fieldset>
					<p class="text-xs text-slate-500">Multiple objects resize proportionally.</p>
				}
				<div class="flex gap-2">
					<button
						class="layer-action flex-1"
						[disabled]="engine.selection().length < 2 || !engine.editableSelection()"
						(click)="engine.group()"
					>
						Group</button
					><button
						class="layer-action flex-1"
						[disabled]="!hasGroup() || !engine.editableSelection()"
						(click)="engine.ungroup()"
					>
						Ungroup
					</button>
				</div>
				<fieldset
					[disabled]="engine.selection().length < 2 || !engine.editableSelection()"
					class="space-y-2"
				>
					<legend class="section-label mb-2">Align selection</legend>
					<div class="grid grid-cols-3 gap-1">
						@for (item of alignments; track item.id) {
							<button
								class="layer-action"
								[attr.aria-label]="'Align ' + item.label"
								(click)="engine.align(item.id)"
							>
								{{ item.label }}
							</button>
						}
					</div>
					<button
						class="layer-action w-full"
						[disabled]="engine.selection().length < 3"
						(click)="engine.distribute('horizontal')"
					>
						Distribute horizontally</button
					><button
						class="layer-action w-full"
						[disabled]="engine.selection().length < 3"
						(click)="engine.distribute('vertical')"
					>
						Distribute vertically
					</button>
				</fieldset>
				<div class="flex gap-2">
					<button
						class="button-secondary flex-1"
						[disabled]="!engine.editableSelection()"
						(click)="engine.duplicate()"
					>
						Duplicate</button
					><button
						class="button-secondary flex-1"
						[disabled]="!engine.editableSelection()"
						(click)="engine.deleteSelected()"
					>
						Delete
					</button>
				</div>
				<app-selected-styles />
				<p class="text-xs leading-5 text-slate-500">
					Drag to move. Use the corner to resize and the top handle to rotate. Arrow keys
					nudge; Shift moves 10 px.
				</p>
			</section>
		}
	</aside>`,
})
export class LayersPanel {
	readonly engine = inject(DrawingEngine);
	readonly layers = computed(() => [...this.engine.objects()].reverse());
	readonly hasGroup = computed(() => this.engine.selection().some((o) => !!o.groupId));
	readonly alignments = [
		{ id: 'left', label: 'left' },
		{ id: 'center', label: 'center' },
		{ id: 'right', label: 'right' },
		{ id: 'top', label: 'top' },
		{ id: 'middle', label: 'middle' },
		{ id: 'bottom', label: 'bottom' },
	] as const;
	readonly selectedWidth = computed(() => {
		const o = this.engine.selected();
		return this.engine.selection().length > 1
			? Math.round(this.engine.selectionBox()?.width ?? 0)
			: o
				? Math.round(objectBounds(o).width * o.transform.scaleX)
				: 0;
	});
	readonly selectedHeight = computed(() => {
		const o = this.engine.selected();
		return this.engine.selection().length > 1
			? Math.round(this.engine.selectionBox()?.height ?? 0)
			: o
				? Math.round(objectBounds(o).height * o.transform.scaleY)
				: 0;
	});
}

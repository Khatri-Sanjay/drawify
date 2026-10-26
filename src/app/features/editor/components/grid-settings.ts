import { Component, inject } from '@angular/core';
import { EditorState } from '../services/editor-state';

@Component({
	selector: 'app-grid-settings',
	template: ` <fieldset class="mb-4 space-y-2 rounded-xl bg-slate-50 p-3">
		<legend class="section-label px-1">Grid & snapping</legend>
		<div class="flex flex-wrap gap-3">
			<label class="flex items-center gap-2 text-xs"
				><input
					#show
					type="checkbox"
					[checked]="state.showGrid()"
					(change)="state.showGrid.set(show.checked)"
				/>Show grid</label
			><label class="flex items-center gap-2 text-xs"
				><input
					#snap
					type="checkbox"
					[checked]="state.snapToGrid()"
					(change)="state.snapToGrid.set(snap.checked)"
				/>Snap to grid</label
			>
		</div>
		<label class="block text-xs"
			>Grid spacing (px)<input
				#size
				class="field mt-1"
				type="number"
				min="2"
				max="200"
				step="1"
				[value]="state.gridSize()"
				(change)="spacing(+size.value)"
		/></label>
		<p class="text-xs leading-5 text-slate-500">
			Snaps shape endpoints and object moves. Freehand strokes stay smooth. Grid lines are
			excluded from exports.
		</p>
	</fieldset>`,
})
export class GridSettings {
	readonly state = inject(EditorState);
	spacing(value: number): void {
		if (Number.isInteger(value) && value >= 2 && value <= 200) this.state.gridSize.set(value);
	}
}

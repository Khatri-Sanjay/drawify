import { Component, ElementRef, inject, output, signal, viewChild } from '@angular/core';
import { DrawingEngine } from '../services/drawing-engine';

@Component({
	selector: 'app-canvas-size-dialog',
	template: ` <dialog #dialog class="modal" aria-labelledby="canvas-size-title">
		<div class="flex items-center justify-between">
			<h2 id="canvas-size-title" class="text-xl font-semibold">Resize canvas</h2>
			<button class="icon-button" aria-label="Close canvas size" (click)="dialog.close()">
				✕
			</button>
		</div>
		<form class="mt-5 space-y-4" (submit)="apply($event)">
			<div class="grid grid-cols-2 gap-3">
				<label class="text-sm"
					>Canvas width<input
						#w
						class="field mt-2"
						type="number"
						min="1"
						max="8192"
						required
						[value]="width()"
						(input)="width.set(+w.value)" /></label
				><label class="text-sm"
					>Canvas height<input
						#h
						class="field mt-2"
						type="number"
						min="1"
						max="8192"
						required
						[value]="height()"
						(input)="height.set(+h.value)"
				/></label>
			</div>
			<label class="block text-sm"
				>Resize behavior<select
					#behavior
					class="field mt-2"
					[value]="mode()"
					(change)="setMode(behavior.value)"
				>
					<option value="crop">Crop / extend canvas</option>
					<option value="scale">Scale artwork to fit</option>
				</select></label
			>
			<p class="text-sm leading-6 text-slate-500">
				{{
					mode() === 'crop'
						? 'Keep objects in place, anchored at the top left. Artwork outside the new canvas is hidden and returns if you extend it again.'
						: 'Scale all artwork proportionally and center it inside the new canvas. Objects keep their proportions.'
				}}
			</p>
			<p class="text-xs text-slate-500">
				Up to 8192 px per side and 32 megapixels. Canvas resizing is undoable.
			</p>
			@if (error()) {
				<p role="alert" class="text-sm text-red-600">{{ error() }}</p>
			}
			<button class="button-primary w-full" type="submit">Apply canvas size</button>
		</form>
	</dialog>`,
})
export class CanvasSizeDialog {
	readonly engine = inject(DrawingEngine);
	readonly resized = output();
	private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
	readonly width = signal(1200);
	readonly height = signal(800);
	readonly mode = signal<'crop' | 'scale'>('crop');
	readonly error = signal('');
	show(): void {
		const d = this.engine.state.dimensions();
		this.width.set(d.width);
		this.height.set(d.height);
		this.error.set('');
		this.dialog().nativeElement.showModal();
	}
	setMode(value: string): void {
		if (value === 'crop' || value === 'scale') this.mode.set(value);
	}
	apply(event: Event): void {
		event.preventDefault();
		try {
			this.engine.resizeCanvas(this.width(), this.height(), this.mode());
			this.dialog().nativeElement.close();
			this.resized.emit();
		} catch (error) {
			this.error.set(error instanceof Error ? error.message : 'Could not resize canvas.');
		}
	}
}

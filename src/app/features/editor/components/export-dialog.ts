import { Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { DrawingEngine } from '../services/drawing-engine';
import { downloadFile, sceneSvg } from '../services/project-format';

@Component({
	selector: 'app-export-dialog',
	template: ` <dialog #dialog class="modal" aria-labelledby="export-title">
		<div class="flex items-center justify-between">
			<h2 id="export-title" class="text-xl font-semibold">Export your artwork</h2>
			<button class="icon-button" aria-label="Close export options" (click)="dialog.close()">
				✕
			</button>
		</div>
		<div class="mt-5 space-y-4">
			<label class="block text-sm"
				>Export format<select
					#format
					class="field mt-2"
					[value]="type()"
					(change)="setType(format.value)"
				>
					<option value="png">PNG image</option>
					<option value="svg">SVG vector</option>
				</select></label
			>
			<div class="grid grid-cols-2 gap-3">
				<label class="text-sm"
					>Export width<input
						#w
						class="field mt-2"
						type="number"
						min="1"
						max="8192"
						[value]="width()"
						(change)="setWidth(+w.value)" /></label
				><label class="text-sm"
					>Export height<input
						#h
						class="field mt-2"
						type="number"
						min="1"
						max="8192"
						[value]="height()"
						(change)="setHeight(+h.value)"
				/></label>
			</div>
			<label class="flex items-center gap-2 text-sm"
				><input
					#ratio
					type="checkbox"
					[checked]="linked()"
					(change)="linked.set(ratio.checked)"
				/>
				Keep original aspect ratio</label
			>
			<label class="flex items-center gap-2 text-sm"
				><input
					#alpha
					type="checkbox"
					[checked]="transparent()"
					(change)="transparent.set(alpha.checked)"
				/>
				Transparent background</label
			>
			<p class="text-xs leading-5 text-slate-500">
				SVG keeps strokes, shapes, and text editable; imported images remain embedded. For
				an exact editable Drawify backup, use Save project.
			</p>
			@if (error()) {
				<p role="alert" class="text-sm text-red-600">{{ error() }}</p>
			}
			<button class="button-primary w-full" [disabled]="busy()" (click)="download()">
				{{ busy() ? 'Exporting…' : 'Download ' + type().toUpperCase() }}
			</button>
		</div>
	</dialog>`,
})
export class ExportDialog {
	readonly engine = inject(DrawingEngine);
	private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
	readonly type = signal<'png' | 'svg'>('png');
	readonly width = signal(1200);
	readonly height = signal(800);
	readonly transparent = signal(false);
	readonly linked = signal(true);
	readonly busy = signal(false);
	readonly error = signal('');
	show(): void {
		const d = this.engine.state.dimensions();
		this.width.set(d.width);
		this.height.set(d.height);
		this.error.set('');
		this.dialog().nativeElement.showModal();
	}
	setType(value: string): void {
		if (value === 'png' || value === 'svg') this.type.set(value);
	}
	setWidth(value: number): void {
		this.width.set(value);
		if (this.linked()) {
			const d = this.engine.state.dimensions();
			this.height.set(Math.round((value * d.height) / d.width));
		}
	}
	setHeight(value: number): void {
		this.height.set(value);
		if (this.linked()) {
			const d = this.engine.state.dimensions();
			this.width.set(Math.round((value * d.width) / d.height));
		}
	}
	async download(): Promise<void> {
		this.busy.set(true);
		this.error.set('');
		try {
			const w = this.width(),
				h = this.height();
			if (
				!Number.isInteger(w) ||
				!Number.isInteger(h) ||
				w < 1 ||
				h < 1 ||
				w > 8192 ||
				h > 8192 ||
				w * h > 32_000_000
			)
				throw new Error('Choose dimensions from 1–8192 px, up to 32 megapixels.');
			this.engine.end();
			const blob =
				this.type() === 'png'
					? await this.engine.exportPng(w, h, this.transparent())
					: new Blob([sceneSvg(this.engine.project().scene, w, h, this.transparent())], {
							type: 'image/svg+xml',
						});
			downloadFile(blob, this.engine.state.name(), this.type());
			this.dialog().nativeElement.close();
		} catch (error) {
			this.error.set(error instanceof Error ? error.message : 'Could not export artwork.');
		} finally {
			this.busy.set(false);
		}
	}
}

import { Component, inject, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
	LucideBrush,
	LucideDownload,
	LucideImagePlus,
	LucideUndo2,
	LucideRedo2,
} from '@lucide/angular';
import { EditorState } from '../services/editor-state';
import { DrawingEngine } from '../services/drawing-engine';
import { ProjectSession } from '../services/project-session';
@Component({
	selector: 'app-editor-header',
	imports: [RouterLink, LucideBrush, LucideDownload, LucideImagePlus, LucideUndo2, LucideRedo2],
	template: ` <header
		class="flex flex-wrap items-center gap-4 border-b border-slate-200 bg-white px-5 py-4"
	>
		<a routerLink="/" class="flex items-center gap-2 text-xl font-bold tracking-tight"
			><span class="rounded-xl bg-violet-600 p-2 text-white"><svg lucideBrush></svg></span
			>drawify<span class="text-violet-500">.</span></a
		>
		<span class="mx-2 hidden h-7 border-l border-slate-200 sm:block"></span>
		<div class="min-w-36 flex-1">
			<input
				#name
				aria-label="Document name"
				class="w-full max-w-60 rounded bg-transparent text-sm font-medium"
				maxlength="80"
				[value]="state.name()"
				(input)="state.name.set(name.value); state.dirty.set(true)"
			/>
			<p class="mt-0.5 truncate text-xs text-slate-400">
				{{
					engine.textRequest() ? 'Editing text · click Done to save' : state.saveStatus()
				}}
			</p>
		</div>
		<div
			class="flex w-full max-w-full flex-wrap items-center justify-start gap-2 sm:w-auto sm:justify-end"
		>
			<button
				class="button-secondary"
				[disabled]="!session.ready() || session.busy()"
				(click)="galleryRequested.emit()"
			>
				Projects
			</button>
			<button
				class="button-secondary"
				[disabled]="!session.ready() || session.busy()"
				(click)="session.download()"
			>
				Save project
			</button>
			<div class="flex gap-1">
				<button
					class="icon-button"
					title="Undo (Ctrl/Command Z)"
					aria-label="Undo"
					[disabled]="!engine.canUndo()"
					(click)="engine.undo()"
				>
					<svg lucideUndo2></svg></button
				><button
					class="icon-button"
					title="Redo (Ctrl/Command Shift Z)"
					aria-label="Redo"
					[disabled]="!engine.canRedo()"
					(click)="engine.redo()"
				>
					<svg lucideRedo2></svg>
				</button>
			</div>
			<input
				#file
				type="file"
				accept="image/png,image/jpeg,image/webp"
				class="hidden"
				aria-label="Import image file"
				(change)="importFile($event)"
			/>
			<button
				class="button-secondary"
				aria-label="Import image"
				[disabled]="!session.ready() || session.busy()"
				(click)="file.click()"
			>
				<svg lucideImagePlus></svg><span class="hidden sm:inline">Import image</span>
			</button>
			<button class="button-primary" (click)="exportRequested.emit()">
				<svg lucideDownload></svg>Export PNG
			</button>
			<button
				class="button-secondary"
				(click)="exportOptionsRequested.emit()"
				aria-label="More export options"
			>
				Export options
			</button>
		</div>
	</header>`,
})
export class EditorHeader {
	readonly state = inject(EditorState);
	readonly engine = inject(DrawingEngine);
	readonly session = inject(ProjectSession);
	readonly exportRequested = output();
	readonly exportOptionsRequested = output();
	readonly galleryRequested = output();
	importFile(event: Event): void {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (file) void this.engine.importImage(file);
		input.value = '';
	}
}

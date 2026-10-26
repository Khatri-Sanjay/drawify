import { Component, ElementRef, inject, viewChild, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ProjectSession } from '../services/project-session';

@Component({
	selector: 'app-project-gallery',
	imports: [DatePipe],
	template: `<dialog #dialog class="modal gallery-modal" aria-labelledby="projects-title">
		<div class="flex items-start justify-between gap-4">
			<div>
				<p class="eyebrow">YOUR CREATIVE LIBRARY</p>
				<h2 id="projects-title" class="mt-2 text-2xl font-semibold">Your projects</h2>
			</div>
			<button class="icon-button" aria-label="Close projects" (click)="dialog.close()">
				✕
			</button>
		</div>
		<p class="mt-3 text-sm leading-6 text-slate-500">
			Saved automatically in this browser. Download .drawify files to back up your editable
			work or move it to another device.
		</p>
		<div class="my-5 flex flex-wrap gap-2">
			<button class="button-primary" [disabled]="session.busy()" (click)="create()">
				New drawing</button
			><button class="button-secondary" [disabled]="session.busy()" (click)="file.click()">
				Open .drawify</button
			><button class="button-secondary" (click)="session.download()">
				Download current project
			</button>
		</div>
		<input
			#file
			class="hidden"
			type="file"
			accept=".drawify,application/json"
			aria-label="Open project file"
			(change)="importFile($event)"
		/>
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
			@for (saved of session.projects(); track saved.id) {
				<article class="overflow-hidden rounded-xl border border-slate-200">
					<button
						class="block w-full text-left"
						[disabled]="session.busy()"
						[attr.aria-label]="'Open project ' + saved.project.name"
						(click)="open(saved.id)"
					>
						@if (saved.thumbnail) {
							<img
								[src]="saved.thumbnail"
								[alt]="saved.project.name + ' preview'"
								width="240"
								height="160"
								class="h-36 w-full bg-slate-100 object-contain"
							/>
						}
						<div class="p-3">
							<h3 class="truncate font-semibold">
								{{ saved.project.name || 'Untitled drawing' }}
							</h3>
							<p class="mt-1 text-xs text-slate-500">
								{{ saved.updatedAt | date: 'medium' }}
							</p>
							<p class="mt-1 text-xs text-violet-600">
								{{
									session.isCurrent(saved.id)
										? 'Current project'
										: saved.project.scene.objects.length + ' objects'
								}}
							</p>
						</div>
					</button>
					@if (!session.isCurrent(saved.id)) {
						<div class="border-t border-slate-100 p-2">
							@if (deleting() === saved.id) {
								<p class="text-xs">Delete this local project permanently?</p>
								<div class="mt-2 flex gap-2">
									<button class="layer-action" (click)="remove(saved.id)">
										Confirm delete</button
									><button class="layer-action" (click)="deleting.set(null)">
										Cancel
									</button>
								</div>
							} @else {
								<button
									class="layer-action"
									[attr.aria-label]="'Delete project ' + saved.project.name"
									(click)="deleting.set(saved.id)"
								>
									Delete
								</button>
							}
						</div>
					}
				</article>
			} @empty {
				<p class="text-sm text-slate-500">Draw something to start your collection.</p>
			}
		</div>
	</dialog>`,
})
export class ProjectGallery {
	readonly session = inject(ProjectSession);
	readonly deleting = signal<string | null>(null);
	private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
	async show(): Promise<void> {
		this.deleting.set(null);
		this.dialog().nativeElement.showModal();
		try {
			await this.session.save();
			await this.session.refresh();
		} catch {
			/* Error is displayed by the editor. */
		}
	}
	async create(): Promise<void> {
		await this.session.newProject();
		this.dialog().nativeElement.close();
	}
	async open(id: string): Promise<void> {
		await this.session.open(id);
		this.dialog().nativeElement.close();
	}
	async remove(id: string): Promise<void> {
		await this.session.delete(id);
		this.deleting.set(null);
	}
	async importFile(event: Event): Promise<void> {
		const input = event.target as HTMLInputElement,
			file = input.files?.[0];
		input.value = '';
		if (file) {
			await this.session.import(file);
			this.dialog().nativeElement.close();
		}
	}
}

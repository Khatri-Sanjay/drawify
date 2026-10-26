import { effect, inject, Injectable, OnDestroy, signal, untracked } from '@angular/core';
import { SavedProject } from '../models/drawing';
import { DrawingEngine } from './drawing-engine';
import { EditorState } from './editor-state';
import { downloadFile, parseProject } from './project-format';
import { ProjectConflictError, ProjectStore } from './project-store';

@Injectable()
export class ProjectSession implements OnDestroy {
	readonly engine = inject(DrawingEngine);
	readonly state = inject(EditorState);
	private readonly store = inject(ProjectStore);
	readonly ready = signal(false);
	readonly busy = signal(false);
	readonly conflict = signal(false);
	readonly projects = signal<SavedProject[]>([]);
	private id = '';
	private timer?: ReturnType<typeof setTimeout>;
	private queue: Promise<void> = Promise.resolve();
	private destroyed = false;
	private revisions = new Map<string, number>();
	private fingerprints = new Map<string, string>();
	private channel?: BroadcastChannel;
	constructor() {
		effect(() => {
			const ready = this.ready();
			this.engine.revision();
			this.state.name();
			this.state.config();
			this.state.workspace();
			this.engine.textRequest();
			if (ready) untracked(() => this.schedule());
		});
	}
	async start(): Promise<void> {
		try {
			if (typeof BroadcastChannel !== 'undefined') {
				this.channel = new BroadcastChannel('drawify-project-changes');
				this.channel.onmessage = (
					event: MessageEvent<{ id?: string; revision?: number | null }>,
				) => {
					if (
						event.data?.id === this.id &&
						(event.data.revision === null ||
							(typeof event.data.revision === 'number' &&
								event.data.revision > (this.revisions.get(this.id) ?? 0)))
					)
						this.markConflict();
				};
			}
			this.id = crypto.randomUUID();
			const id = await this.store.active(),
				saved = id ? await this.store.get(id) : undefined;
			if (saved) {
				await this.engine.load(parseProject(JSON.stringify(saved.project)));
				this.id = saved.id;
				this.revisions.set(saved.id, saved.revision ?? 0);
				this.fingerprints.set(saved.id, JSON.stringify(this.engine.project()));
				this.state.saveStatus.set('Recovered · saved locally');
			} else this.state.saveStatus.set('Ready · autosave enabled');
			await this.refresh();
		} catch (error) {
			this.failure(error);
		} finally {
			if (!this.destroyed) this.ready.set(true);
		}
	}
	private schedule(): void {
		if (this.destroyed || this.busy()) return;
		if (this.conflict()) {
			this.state.dirty.set(true);
			return;
		}
		clearTimeout(this.timer);
		this.state.dirty.set(true);
		this.state.saveStatus.set('Unsaved changes…');
		this.timer = setTimeout(() => void this.save(false).catch(() => undefined), 400);
	}
	save(finishGesture = true): Promise<void> {
		clearTimeout(this.timer);
		if (this.conflict()) return Promise.reject(new ProjectConflictError());
		if (!finishGesture && this.engine.isDrawing()) {
			this.timer = setTimeout(() => void this.save(false).catch(() => undefined), 400);
			return Promise.resolve();
		}
		if (finishGesture) {
			this.engine.finishText();
			this.engine.end();
		}
		const project = this.engine.project(),
			id = this.id,
			serialized = JSON.stringify(project),
			thumbnail = this.engine.thumbnail();
		this.state.saveStatus.set('Saving…');
		const work = this.queue.then(async () => {
			try {
				if (this.conflict() && id === this.id) throw new ProjectConflictError();
				if (this.fingerprints.get(id) !== serialized) {
					const revision = await this.store.save(
						{ id, project, thumbnail, updatedAt: Date.now() },
						this.revisions.get(id) ?? 0,
					);
					this.revisions.set(id, revision);
					this.fingerprints.set(id, serialized);
				}
				if (
					!this.destroyed &&
					!this.engine.textRequest() &&
					id === this.id &&
					JSON.stringify(this.engine.project()) === serialized
				) {
					this.state.dirty.set(false);
					this.state.saveStatus.set('Saved locally');
				}
			} catch (error) {
				if (!this.destroyed) this.failure(error);
				throw error;
			}
		});
		this.queue = work.catch(() => undefined);
		return work;
	}
	async refresh(): Promise<void> {
		this.projects.set(await this.store.list());
	}
	private failure(error: unknown): void {
		if (error instanceof ProjectConflictError) {
			this.markConflict();
			return;
		}
		this.state.dirty.set(true);
		this.state.saveStatus.set('Local save unavailable');
		this.state.error.set(
			error instanceof Error
				? error.message
				: 'Could not save locally. Download a .drawify backup.',
		);
	}
	private markConflict(): void {
		clearTimeout(this.timer);
		this.conflict.set(true);
		this.state.dirty.set(true);
		this.state.saveStatus.set('Changed in another tab · autosave paused');
	}
	async saveCopy(): Promise<void> {
		if (this.busy()) return;
		this.busy.set(true);
		clearTimeout(this.timer);
		try {
			await this.queue;
			this.id = crypto.randomUUID();
			this.conflict.set(false);
			this.state.name.set((this.state.name().slice(0, 65) || 'Untitled drawing') + ' (copy)');
			await this.save();
			await this.refresh();
			this.state.error.set('');
		} catch (error) {
			this.failure(error);
		} finally {
			this.busy.set(false);
		}
	}
	async reloadSaved(): Promise<void> {
		if (this.busy()) return;
		this.busy.set(true);
		clearTimeout(this.timer);
		try {
			await this.queue;
			const record = await this.store.get(this.id);
			if (!record)
				throw new Error(
					'This project was deleted in another tab. Save your work as a separate copy.',
				);
			await this.engine.load(parseProject(JSON.stringify(record.project)));
			this.revisions.set(this.id, record.revision ?? 0);
			this.fingerprints.set(this.id, JSON.stringify(this.engine.project()));
			this.conflict.set(false);
			this.state.dirty.set(false);
			this.state.saveStatus.set('Saved locally');
			this.state.error.set('');
		} catch (error) {
			this.failure(error);
		} finally {
			this.busy.set(false);
		}
	}
	private async switchProject(action: () => Promise<void>): Promise<void> {
		if (this.busy() || !this.ready()) return;
		this.busy.set(true);
		try {
			await this.save();
			await action();
			await this.save();
			await this.refresh();
			this.state.error.set('');
		} catch (error) {
			this.failure(error);
		} finally {
			this.busy.set(false);
		}
	}
	async newProject(): Promise<void> {
		await this.switchProject(async () => {
			this.engine.newProject();
			this.id = crypto.randomUUID();
		});
	}
	async open(id: string): Promise<void> {
		await this.switchProject(async () => {
			const record = await this.store.get(id);
			if (!record) throw new Error('This project no longer exists.');
			await this.engine.load(parseProject(JSON.stringify(record.project)));
			this.id = id;
			this.revisions.set(id, record.revision ?? 0);
			this.fingerprints.set(id, JSON.stringify(this.engine.project()));
		});
	}
	async import(file: File): Promise<void> {
		try {
			if (file.size > 50 * 1024 * 1024) throw new Error('Project files must be under 50 MB.');
			const project = parseProject(await file.text());
			await this.switchProject(async () => {
				await this.engine.load(project);
				this.id = crypto.randomUUID();
			});
		} catch (error) {
			this.state.error.set(
				error instanceof Error ? error.message : 'Could not open this project.',
			);
		}
	}
	async delete(id: string): Promise<void> {
		if (id === this.id) {
			this.state.error.set('Open another project before deleting this one.');
			return;
		}
		try {
			await this.store.delete(
				id,
				this.projects().find((item) => item.id === id)?.revision ?? 0,
			);
			await this.refresh();
		} catch (error) {
			this.failure(error);
		}
	}
	isCurrent(id: string): boolean {
		return id === this.id;
	}
	download(): void {
		this.engine.finishText();
		this.engine.end();
		downloadFile(
			new Blob([JSON.stringify(this.engine.project())], { type: 'application/json' }),
			this.state.name(),
			'drawify',
		);
	}
	ngOnDestroy(): void {
		this.channel?.close();
		this.destroyed = true;
		clearTimeout(this.timer);
		if (this.ready() && this.state.dirty()) void this.save().catch(() => undefined);
	}
}

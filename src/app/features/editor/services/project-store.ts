import { Injectable, OnDestroy } from '@angular/core';
import { SavedProject } from '../models/drawing';

export class ProjectConflictError extends Error {
	constructor() {
		super(
			'This project changed in another tab. Your edits are still here. Save a separate copy or reload the saved version.',
		);
	}
}

@Injectable({ providedIn: 'root' })
export class ProjectStore implements OnDestroy {
	private database?: Promise<IDBDatabase>;
	private channel?: BroadcastChannel;
	private open(): Promise<IDBDatabase> {
		if (!this.channel && typeof BroadcastChannel !== 'undefined')
			this.channel = new BroadcastChannel('drawify-project-changes');
		return (this.database ??= new Promise((resolve, reject) => {
			if (typeof indexedDB === 'undefined') {
				reject(
					new Error(
						'Local storage is unavailable. Download a .drawify backup to keep your work.',
					),
				);
				return;
			}
			const request = indexedDB.open('drawify-projects', 1);
			request.onupgradeneeded = () => {
				request.result.createObjectStore('projects', { keyPath: 'id' });
				request.result.createObjectStore('preferences');
			};
			request.onsuccess = () => resolve(request.result);
			request.onerror = () =>
				reject(request.error ?? new Error('Could not open local project storage.'));
			request.onblocked = () =>
				reject(new Error('Close other Drawify tabs and reload to enable local saving.'));
		}));
	}
	private async read<T>(store: string, key?: IDBValidKey): Promise<T> {
		const db = await this.open();
		return new Promise((resolve, reject) => {
			const tx = db.transaction(store, 'readonly'),
				objectStore = tx.objectStore(store);
			const request = key === undefined ? objectStore.getAll() : objectStore.get(key);
			request.onsuccess = () => resolve(request.result as T);
			request.onerror = () => reject(request.error);
		});
	}
	list(): Promise<SavedProject[]> {
		return this.read<SavedProject[]>('projects').then((items) =>
			items.sort((a, b) => b.updatedAt - a.updatedAt),
		);
	}
	get(id: string): Promise<SavedProject | undefined> {
		return this.read('projects', id);
	}
	active(): Promise<string | undefined> {
		return this.read('preferences', 'active');
	}
	async save(project: SavedProject, expectedRevision = 0): Promise<number> {
		const db = await this.open();
		const revision = await new Promise<number>((resolve, reject) => {
			const tx = db.transaction(['projects', 'preferences'], 'readwrite');
			let failure: Error | undefined;
			const request = tx.objectStore('projects').get(project.id);
			request.onsuccess = () => {
				const current = request.result as SavedProject | undefined;
				if (
					(current?.revision ?? 0) !== expectedRevision ||
					(!current && expectedRevision !== 0)
				) {
					failure = new ProjectConflictError();
					tx.abort();
					return;
				}
				try {
					tx.objectStore('projects').put({ ...project, revision: expectedRevision + 1 });
					tx.objectStore('preferences').put(project.id, 'active');
				} catch (error) {
					failure = error instanceof Error ? error : new Error('Local save failed.');
					tx.abort();
				}
			};
			tx.oncomplete = () => resolve(expectedRevision + 1);
			tx.onabort = () =>
				reject(failure ?? tx.error ?? new Error('Local save failed. Storage may be full.'));
			tx.onerror = () => reject(tx.error ?? new Error('Local save failed.'));
		});
		this.channel?.postMessage({ id: project.id, revision });
		return revision;
	}
	async delete(id: string, expectedRevision = 0): Promise<void> {
		const db = await this.open();
		await new Promise<void>((resolve, reject) => {
			const tx = db.transaction('projects', 'readwrite');
			let failure: Error | undefined;
			const request = tx.objectStore('projects').get(id);
			request.onsuccess = () => {
				if ((request.result?.revision ?? 0) !== expectedRevision) {
					failure = new ProjectConflictError();
					tx.abort();
					return;
				}
				tx.objectStore('projects').delete(id);
			};
			tx.oncomplete = () => resolve();
			tx.onabort = () =>
				reject(failure ?? tx.error ?? new Error('Could not delete this project.'));
		});
		this.channel?.postMessage({ id, revision: null });
	}
	ngOnDestroy(): void {
		this.channel?.close();
		void this.database?.then((db) => db.close()).catch(() => undefined);
	}
}

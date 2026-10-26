import { Component, inject } from '@angular/core';
import {
	LucideBrush,
	LucidePencil,
	LucideEraser,
	LucideMinus,
	LucideSquare,
	LucideCircle,
	LucideType,
	LucidePipette,
	LucideMousePointer2,
	LucideHand,
	LucideMoveUpRight,
} from '@lucide/angular';
import { DrawingTool } from '../models/drawing';
import { EditorState } from '../services/editor-state';
@Component({
	selector: 'app-editor-toolbar',
	imports: [
		LucideBrush,
		LucidePencil,
		LucideEraser,
		LucideMinus,
		LucideSquare,
		LucideCircle,
		LucideType,
		LucidePipette,
		LucideMousePointer2,
		LucideHand,
		LucideMoveUpRight,
	],
	template: ` <nav aria-label="Drawing tools" class="flex gap-2 p-3 md:flex-col">
		@for (tool of tools; track tool.id) {
			<button
				class="tool-button"
				[class.active]="state.tool() === tool.id"
				[attr.aria-pressed]="state.tool() === tool.id"
				[attr.aria-label]="tool.label"
				[title]="tool.label"
				(click)="state.tool.set(tool.id)"
			>
				@switch (tool.id) {
					@case ('select') {
						<svg lucideMousePointer2></svg>
					}
					@case ('hand') {
						<svg lucideHand></svg>
					}
					@case ('arrow') {
						<svg lucideMoveUpRight></svg>
					}
					@case ('brush') {
						<svg lucideBrush></svg>
					}
					@case ('pencil') {
						<svg lucidePencil></svg>
					}
					@case ('eraser') {
						<svg lucideEraser></svg>
					}
					@case ('line') {
						<svg lucideMinus></svg>
					}
					@case ('rectangle') {
						<svg lucideSquare></svg>
					}
					@case ('text') {
						<svg lucideType></svg>
					}
					@case ('picker') {
						<svg lucidePipette></svg>
					}
					@default {
						<svg
							lucideCircle
							[style.transform]="tool.id === 'ellipse' ? 'scaleX(1.3)' : ''"
						></svg>
					}
				}
			</button>
		}
	</nav>`,
})
export class EditorToolbar {
	readonly state = inject(EditorState);
	readonly tools: { id: DrawingTool; label: string }[] = [
		{ id: 'select', label: 'Select objects (V)' },
		{ id: 'hand', label: 'Hand / pan (H or hold Space)' },
		{ id: 'brush', label: 'Brush' },
		{ id: 'pencil', label: 'Pencil (1 px)' },
		{ id: 'eraser', label: 'Eraser' },
		{ id: 'line', label: 'Line' },
		{ id: 'arrow', label: 'Arrow' },
		{ id: 'rectangle', label: 'Rectangle' },
		{ id: 'circle', label: 'Circle' },
		{ id: 'ellipse', label: 'Ellipse' },
		{ id: 'text', label: 'Text' },
		{ id: 'picker', label: 'Color picker' },
	];
}

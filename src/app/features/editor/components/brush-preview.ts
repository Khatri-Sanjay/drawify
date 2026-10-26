import { Component, computed, input } from '@angular/core';
import { ToolConfiguration } from '../models/drawing';
import { brushExtent, brushMarks } from '../services/brush-strokes';

@Component({
	selector: 'app-brush-preview',
	host: { '[style.height.px]': 'height()' },
	template: ` <svg [attr.viewBox]="preview().viewBox" role="img" [attr.aria-label]="label()">
		@for (mark of preview().marks; track $index) {
			<path
				[attr.d]="mark.d"
				[attr.fill]="mark.fill ? mark.color : 'none'"
				[attr.stroke]="mark.fill ? 'none' : mark.color"
				[attr.stroke-width]="mark.width"
				[attr.stroke-linecap]="mark.cap ?? 'round'"
				stroke-linejoin="round"
				[attr.stroke-dasharray]="mark.dash?.join(' ') ?? null"
				[attr.opacity]="mark.opacity * config().opacity"
			/>
		}
	</svg>`,
	styles: `
		:host {
			display: block;
			pointer-events: none;
		}
		svg {
			display: block;
			width: 100%;
			height: 100%;
		}
	`,
})
export class BrushPreview {
	readonly config = input.required<ToolConfiguration>();
	readonly height = input(44);
	readonly label = input('Brush stroke preview');
	readonly preview = computed(() => {
		const config = this.config(),
			padding = brushExtent(config) + 6,
			points = Array.from({ length: 33 }, (_, i) => ({
				x: padding + i * 4,
				y: padding + 20 + Math.sin((i / 32) * Math.PI * 2) * 11,
			}));
		return {
			viewBox: `0 0 ${128 + padding * 2} ${40 + padding * 2}`,
			marks: brushMarks(points, { ...config, brushSeed: 42 }),
		};
	});
}

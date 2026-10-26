import { computed, Injectable, signal } from '@angular/core';
import {
	DEFAULT_CONFIG,
	DrawingTool,
	ToolConfiguration,
	TextStyle,
	BrushConfiguration,
	BrushType,
} from '../models/drawing';
import { textStyle, validTextStyle } from './text-layout';
import { BRUSH_PRESETS, brushSettings, validBrushSettings } from './brush-strokes';
@Injectable()
export class EditorState {
	readonly tool = signal<DrawingTool>('brush');
	readonly stroke = signal('#25283d');
	readonly fill = signal('#b8afe9');
	readonly size = signal(8);
	readonly mode = signal<ToolConfiguration['mode']>('outline');
	readonly text = signal('');
	readonly textColor = signal('#000000');
	readonly textOpacity = signal(1);
	readonly name = signal('Untitled drawing');
	readonly zoom = signal(0.75);
	readonly dirty = signal(false);
	readonly background = signal('#ffffff');
	readonly dimensions = signal({ width: 1200, height: 800 });
	readonly error = signal('');
	readonly opacity = signal(1);
	readonly smoothing = signal(true);
	readonly dashed = signal(false);
	readonly brush = signal<BrushConfiguration>({
		...brushSettings(DEFAULT_CONFIG),
		brushSeed: undefined,
	});
	readonly textFormatting = signal<TextStyle>(textStyle(DEFAULT_CONFIG));
	readonly showGrid = signal(false);
	readonly snapToGrid = signal(false);
	readonly gridSize = signal(20);
	readonly workspace = computed(() => ({
		showGrid: this.showGrid(),
		snapToGrid: this.snapToGrid(),
		gridSize: this.gridSize(),
	}));
	readonly saveStatus = signal('Loading local projects…');
	readonly config = computed<ToolConfiguration>(() => ({
		...this.brush(),
		textColor: this.textColor(),
		textOpacity: this.textOpacity(),
		...this.textFormatting(),
		tool: this.tool(),
		stroke: this.stroke(),
		fill: this.fill(),
		size: this.size(),
		mode: this.mode(),
		text: this.text(),
		opacity: this.opacity(),
		smoothing: this.smoothing(),
		dashed: this.dashed(),
	}));
	configure(config: ToolConfiguration = DEFAULT_CONFIG): void {
		this.brush.set({ ...brushSettings(config), brushSeed: undefined });
		this.textColor.set(
			config.textColor ?? (config.tool === 'text' ? config.stroke : '#000000'),
		);
		this.textOpacity.set(config.textOpacity ?? (config.tool === 'text' ? config.opacity : 1));
		this.textFormatting.set(textStyle(config));
		this.tool.set(config.tool);
		this.stroke.set(config.stroke);
		this.fill.set(config.fill);
		this.size.set(config.size);
		this.mode.set(config.mode);
		this.text.set(config.text);
		this.opacity.set(config.opacity);
		this.smoothing.set(config.smoothing);
		this.dashed.set(config.dashed);
	}
	formatText(patch: Partial<TextStyle>): void {
		if (validTextStyle(patch)) this.textFormatting.update((style) => ({ ...style, ...patch }));
	}
	configureBrush(patch: Partial<BrushConfiguration>): void {
		if (validBrushSettings(patch))
			this.brush.update((brush) => ({ ...brush, ...patch, brushSeed: undefined }));
	}
	chooseBrush(type: BrushType): void {
		const preset = BRUSH_PRESETS.find((p) => p.id === type);
		if (!preset) return;
		this.brush.set({
			brushType: type,
			brushFlow: 1,
			brushSpacing: preset.spacing,
			brushAngle: preset.angle,
		});
		this.size.set(preset.size);
		this.tool.set('brush');
	}
	readonly textConfig = computed<ToolConfiguration>(() => ({
		...this.config(),
		tool: 'text',
		stroke: this.textColor(),
		opacity: this.textOpacity(),
		text: '',
	}));
}

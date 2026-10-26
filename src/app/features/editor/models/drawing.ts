export type DrawingTool =
	| 'select'
	| 'hand'
	| 'pencil'
	| 'brush'
	| 'eraser'
	| 'line'
	| 'arrow'
	| 'rectangle'
	| 'ellipse'
	| 'circle'
	| 'text'
	| 'picker';
export interface Point {
	x: number;
	y: number;
}
export interface CanvasDimensions {
	width: number;
	height: number;
}
export const BRUSH_TYPES = [
	'normal',
	'sketchy',
	'square',
	'spray',
	'calligraphy',
	'charcoal',
	'neon',
	'dotted',
	'watercolor',
	'ink',
	'marker',
	'emboss',
] as const;
export type BrushType = (typeof BRUSH_TYPES)[number];
export interface BrushConfiguration {
	brushType: BrushType;
	brushFlow: number;
	brushSpacing: number;
	brushAngle: number;
	brushSeed?: number;
}
export const TEXT_FONTS = [
	'sans-serif',
	'serif',
	'monospace',
	'Arial',
	'Georgia',
	'Times New Roman',
	'Courier New',
	'Verdana',
] as const;
export type TextFont = (typeof TEXT_FONTS)[number];
export interface TextStyle {
	fontFamily: TextFont;
	fontSize: number;
	fontWeight: 'normal' | 'bold';
	fontStyle: 'normal' | 'italic';
	underline: boolean;
	textAlign: 'left' | 'center' | 'right';
	lineHeight: number;
	textWidth: number;
	textDirection: 'auto' | 'ltr' | 'rtl';
}
export interface ToolConfiguration extends Partial<TextStyle>, Partial<BrushConfiguration> {
	textColor?: string;
	textOpacity?: number;
	tool: DrawingTool;
	stroke: string;
	fill: string;
	size: number;
	mode: 'outline' | 'fill' | 'both';
	text: string;
	opacity: number;
	smoothing: boolean;
	dashed: boolean;
}
export interface Transform {
	x: number;
	y: number;
	scaleX: number;
	scaleY: number;
	rotation: number;
}
export interface Bounds {
	x: number;
	y: number;
	width: number;
	height: number;
}
interface ObjectBase {
	opacity?: number;
	groupId?: string;
	id: string;
	name: string;
	visible: boolean;
	locked: boolean;
	transform: Transform;
}
export type DrawingObject = ObjectBase &
	(
		| { kind: 'draw'; config: ToolConfiguration; points: Point[] }
		| { kind: 'image'; src: string; width: number; height: number }
	);
export interface Scene {
	objects: DrawingObject[];
	background: string;
	dimensions: CanvasDimensions;
}
export interface DrawingProject {
	workspace?: WorkspaceSettings;
	format: 'drawify';
	version: 1;
	name: string;
	scene: Scene;
	settings: ToolConfiguration;
}
export interface SavedProject {
	revision?: number;
	id: string;
	project: DrawingProject;
	thumbnail: string;
	updatedAt: number;
}
export interface WorkspaceSettings {
	showGrid: boolean;
	snapToGrid: boolean;
	gridSize: number;
}
export const DEFAULT_CONFIG: ToolConfiguration = {
	brushType: 'normal',
	brushFlow: 1,
	brushSpacing: 0.2,
	brushAngle: -35,
	tool: 'brush',
	stroke: '#25283d',
	fill: '#b8afe9',
	size: 8,
	mode: 'outline',
	text: '',
	textColor: '#000000',
	textOpacity: 1,
	fontFamily: 'sans-serif',
	fontSize: 32,
	fontWeight: 'normal',
	fontStyle: 'normal',
	underline: false,
	textAlign: 'left',
	lineHeight: 1.3,
	textWidth: 400,
	textDirection: 'auto',
	opacity: 1,
	smoothing: true,
	dashed: false,
};
export const identityTransform = (): Transform => ({
	x: 0,
	y: 0,
	scaleX: 1,
	scaleY: 1,
	rotation: 0,
});
export type HistoryEntry =
	| { kind: 'draw'; config: ToolConfiguration; points: Point[] }
	| { kind: 'clear' }
	| { kind: 'background'; color: string };

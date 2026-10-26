import { Component, computed, input, output } from '@angular/core';
import { TEXT_FONTS, TextStyle, ToolConfiguration } from '../models/drawing';
import { FONT_STACKS, textStyle, validTextStyle } from '../services/text-layout';

@Component({
	selector: 'app-text-formatting',
	template: ` <div class="space-y-3" aria-label="Text formatting">
		<label class="block text-xs"
			>{{ prefix() }}Font family<select
				#font
				[attr.aria-label]="prefix() + 'Font family'"
				class="field mt-1"
				[value]="style().fontFamily"
				(change)="family(font.value)"
			>
				@for (font of fonts; track font) {
					<option [value]="font" [style.font-family]="stacks[font]">{{ font }}</option>
				}
			</select></label
		>
		<div class="grid grid-cols-2 gap-3">
			<label class="text-xs"
				>{{ prefix() }}Font size (px)<input
					#size
					[attr.aria-label]="prefix() + 'Font size (px)'"
					class="field mt-1"
					type="number"
					min="6"
					max="512"
					step="any"
					required
					[value]="style().fontSize"
					(change)="number('fontSize', size)" /></label
			><label class="text-xs"
				>{{ prefix() }}Line spacing<input
					#height
					[attr.aria-label]="prefix() + 'Line spacing'"
					class="field mt-1"
					type="number"
					min="0.8"
					max="3"
					step="any"
					required
					[value]="style().lineHeight"
					(change)="number('lineHeight', height)"
			/></label>
		</div>
		<div class="flex gap-2">
			<button
				type="button"
				class="button-secondary flex-1 font-bold"
				[attr.aria-label]="prefix() + 'Bold'"
				[attr.aria-pressed]="style().fontWeight === 'bold'"
				[class.bg-violet-100]="style().fontWeight === 'bold'"
				(click)="
					patch.emit({ fontWeight: style().fontWeight === 'bold' ? 'normal' : 'bold' })
				"
			>
				B
			</button>
			<button
				type="button"
				class="button-secondary flex-1 italic"
				[attr.aria-label]="prefix() + 'Italic'"
				[attr.aria-pressed]="style().fontStyle === 'italic'"
				[class.bg-violet-100]="style().fontStyle === 'italic'"
				(click)="
					patch.emit({ fontStyle: style().fontStyle === 'italic' ? 'normal' : 'italic' })
				"
			>
				I
			</button>
			<button
				type="button"
				class="button-secondary flex-1 underline"
				[attr.aria-label]="prefix() + 'Underline'"
				[attr.aria-pressed]="style().underline"
				[class.bg-violet-100]="style().underline"
				(click)="patch.emit({ underline: !style().underline })"
			>
				U
			</button>
		</div>
		<div class="grid grid-cols-2 gap-3">
			<label class="text-xs"
				>{{ prefix() }}Text alignment<select
					#align
					[attr.aria-label]="prefix() + 'Text alignment'"
					class="field mt-1"
					[value]="style().textAlign"
					(change)="alignment(align.value)"
				>
					<option value="left">Left</option>
					<option value="center">Center</option>
					<option value="right">Right</option>
				</select></label
			><label class="text-xs"
				>{{ prefix() }}Text direction<select
					#direction
					[attr.aria-label]="prefix() + 'Text direction'"
					class="field mt-1"
					[value]="style().textDirection"
					(change)="directionChange(direction.value)"
				>
					<option value="auto">Auto</option>
					<option value="ltr">Left to right</option>
					<option value="rtl">Right to left</option>
				</select></label
			>
		</div>
		<label class="block text-xs"
			>{{ prefix() }}Wrap width (px)<input
				#width
				[attr.aria-label]="prefix() + 'Wrap width (px)'"
				class="field mt-1"
				type="number"
				min="0"
				max="8192"
				step="any"
				required
				[value]="style().textWidth"
				(change)="number('textWidth', width)"
			/><span class="mt-1 block text-slate-500"
				>0 keeps lines unwrapped; otherwise use 40–8192 px.</span
			></label
		>
	</div>`,
})
export class TextFormatting {
	readonly config = input.required<ToolConfiguration>();
	readonly prefix = input('');
	readonly patch = output<Partial<TextStyle>>();
	readonly style = computed(() => textStyle(this.config()));
	readonly fonts = TEXT_FONTS;
	readonly stacks = FONT_STACKS;
	family(value: string): void {
		if (TEXT_FONTS.includes(value as TextStyle['fontFamily']))
			this.patch.emit({ fontFamily: value as TextStyle['fontFamily'] });
	}
	alignment(value: string): void {
		if (value === 'left' || value === 'center' || value === 'right')
			this.patch.emit({ textAlign: value });
	}
	directionChange(value: string): void {
		if (value === 'auto' || value === 'ltr' || value === 'rtl')
			this.patch.emit({ textDirection: value });
	}
	number(key: 'fontSize' | 'lineHeight' | 'textWidth', input: HTMLInputElement): void {
		const value = input.valueAsNumber,
			patch = { [key]: value };
		if (validTextStyle(patch)) this.patch.emit(patch);
		else input.value = String(this.style()[key]);
	}
}

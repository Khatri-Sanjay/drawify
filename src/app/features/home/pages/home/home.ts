import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideBrush, LucideArrowUpRight } from '@lucide/angular';
@Component({
	selector: 'app-home',
	imports: [RouterLink, LucideBrush, LucideArrowUpRight],
	template: ` <div class="min-h-dvh bg-[#faf9f6] text-slate-800">
		<header class="mx-auto flex max-w-7xl items-center justify-between px-6 py-7">
			<a routerLink="/" class="flex items-center gap-2 text-2xl font-bold tracking-tight"
				><span class="rounded-xl bg-violet-600 p-2 text-white"><svg lucideBrush></svg></span
				>drawify<span class="text-violet-600">.</span></a
			><a routerLink="/editor" class="button-secondary"
				>Open the editor <svg lucideArrowUpRight></svg
			></a>
		</header>
		<main class="mx-auto max-w-7xl px-6 pb-16 pt-14 md:pt-24">
			<div class="grid items-center gap-16 lg:grid-cols-2">
				<section>
					<p class="eyebrow mb-6">A CANVAS. A LITTLE CURIOSITY. YOU.</p>
					<h1
						class="text-6xl leading-[1.07] font-semibold tracking-[-0.055em] md:text-8xl"
					>
						Big ideas.<br />Blank canvas.<br /><span class="text-violet-600"
							>Endless play.</span
						>
					</h1>
					<p class="mt-7 max-w-md text-lg leading-8 text-slate-500">
						Sketch a thought, paint a mood, or follow a happy accident. Your next
						creation starts with a single stroke.
					</p>
					<a routerLink="/editor" class="button-primary mt-8 inline-flex px-6 py-4"
						>Start creating <svg lucideArrowUpRight></svg
					></a>
					<p class="mt-4 text-xs text-slate-400">
						Free to use. No sign-up. Just you and your imagination.
					</p>
				</section>
				<div
					class="relative rounded-3xl border border-white bg-[#eeebf6] p-7 shadow-sm md:p-10"
					aria-label="Abstract illustration of colorful shapes"
				>
					<div class="flex items-center gap-1.5 pb-5">
						<span class="h-2 w-2 rounded-full bg-violet-300"></span
						><span class="h-2 w-2 rounded-full bg-violet-200"></span
						><span class="h-2 w-2 rounded-full bg-violet-100"></span
						><span class="ml-auto text-xs text-violet-400"
							>a little imagination.png</span
						>
					</div>
					<svg
						viewBox="0 0 500 420"
						class="h-auto w-full rounded-xl bg-[#fffefb] shadow-lg"
						role="img"
						aria-label="Playful abstract landscape with a purple arch, orange sun and green hills"
					>
						<circle cx="370" cy="105" r="48" fill="#f9b46b" />
						<path d="M80 330V185a90 90 0 0 1 180 0v145" fill="#b7a5e4" />
						<path d="M125 330V190a45 45 0 0 1 90 0v140" fill="#fffefb" />
						<path d="M0 350Q115 240 240 340T500 300V420H0" fill="#98b8a0" />
						<path d="M0 395Q175 300 330 375T500 350V420H0" fill="#dae4be" />
						<path
							d="m300 230 28-35 30 40 35-65 35 60"
							fill="none"
							stroke="#e59d86"
							stroke-width="9"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
						<path
							d="m60 65 20-15m-5 35 20-3"
							stroke="#b7a5e4"
							stroke-width="5"
							stroke-linecap="round"
						/></svg
					><span
						class="absolute -bottom-5 right-10 rotate-[-5deg] rounded-xl bg-white px-5 py-3 text-sm text-violet-600 shadow-md"
						>Made for your imagination</span
					>
				</div>
			</div>
			<div class="mt-24 grid gap-5 border-t border-slate-200 pt-8 md:grid-cols-3">
				@for (item of features; track item.title) {
					<section class="rounded-2xl bg-white/70 p-6">
						<p class="mb-3 text-sm text-violet-500">{{ item.number }}</p>
						<h2 class="font-semibold">{{ item.title }}</h2>
						<p class="mt-2 text-sm leading-6 text-slate-500">{{ item.description }}</p>
					</section>
				}
			</div>
		</main>
		<footer class="mx-auto flex max-w-7xl justify-between px-6 py-6 text-xs text-slate-400">
			<span>Drawify &middot; A space to make something.</span
			><span>Made for the joy of creating.</span>
		</footer>
	</div>`,
})
export class Home {
	readonly features = [
		{
			number: '01 / EXPLORE',
			title: 'Tools that feel familiar',
			description:
				'Brushes, shapes, text, and a palette of possibilities. Everything you need to find your flow.',
		},
		{
			number: '02 / EXPERIMENT',
			title: 'Every stroke is a possibility',
			description:
				'Try something new. Undo, redo, and keep exploring. There is always room for another idea.',
		},
		{
			number: '03 / KEEP IT',
			title: 'Your art, ready to go',
			description:
				'Keep your projects with local autosave, reopen editable drawings, and export PNG or SVG artwork.',
		},
	];
}

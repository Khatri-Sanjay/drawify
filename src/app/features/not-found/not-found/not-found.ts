import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
@Component({
	selector: 'app-not-found',
	imports: [RouterLink],
	template: `<main class="grid min-h-dvh place-content-center gap-5 bg-slate-50 p-8 text-center">
		<p class="eyebrow">404</p>
		<h1 class="text-4xl font-semibold">Outside the canvas.</h1>
		<p class="text-slate-500">This page could not be found.</p>
		<a routerLink="/" class="button-primary justify-center">Back to Drawify</a>
	</main>`,
})
export class NotFound {}

import { Routes } from '@angular/router';
export const routes: Routes = [
	{
		path: '',
		title: 'Drawify - A space to create',
		loadComponent: () => import('./features/home/pages/home/home').then((m) => m.Home),
	},
	{
		path: 'editor',
		title: 'Editor - Drawify',
		loadComponent: () => import('./features/editor/pages/editor/editor').then((m) => m.Editor),
	},
	{
		path: '**',
		title: 'Page not found - Drawify',
		loadComponent: () =>
			import('./features/not-found/not-found/not-found').then((m) => m.NotFound),
	},
];

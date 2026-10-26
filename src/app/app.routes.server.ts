import { RenderMode, ServerRoute } from '@angular/ssr';
export const serverRoutes: ServerRoute[] = [
	{ path: '', renderMode: RenderMode.Prerender },
	{ path: 'editor', renderMode: RenderMode.Server },
	{ path: '**', renderMode: RenderMode.Server, status: 404 },
];

# Drawify

A responsive Angular drawing studio with editable objects, local project autosave, a prerendered landing page, and a server-rendered editor shell. Projects stay in this browser's IndexedDB; nothing is uploaded. Download `.drawify` files for editable backups or export PNG/SVG artwork.

## Versions and setup

Inspected existing CLI-generated project: Angular 22.2.3, TypeScript 6.0, Tailwind CSS 4, Node 24. The installed lockfile is authoritative. Strict TypeScript and Angular template checking are enabled. The original SSR bootstrap, application builder, and hydration configuration are preserved.

```sh
# For a new project only (do not nest another app inside this repository):
npx @angular/cli@latest new drawify --ssr --style=scss
cd drawify
npm install --save-dev tailwindcss @tailwindcss/postcss postcss
npm install @lucide/angular
npm install --save-dev @playwright/test

# This existing repository:
nvm install
nvm use
npm ci
npx ng version
npm ls @angular/core tailwindcss @tailwindcss/postcss @lucide/angular
npm start
```

Open http://localhost:4200. On Windows where PowerShell blocks npm.ps1, use `npm.cmd` and `npx.cmd`. No execution policy change is required.

The `.nvmrc` pins Node 24.19.0. With nvm-windows, run `nvm install 24.19.0` and `nvm use 24.19.0` explicitly. Use npm 11.17.0 (`npm install --global npm@11.17.0` if needed). The package engines and `.npmrc` reject unsupported Node/npm versions; `npm ci` installs the committed lockfile without updating dependencies.

### Code quality

- `npm run format` formats project files with Prettier; `npm run format:check` verifies formatting.
- `npm run lint` checks TypeScript, Angular templates (including inline templates), and JavaScript tooling with ESLint; `npm run lint:fix` applies available fixes. `npx ng lint` is also configured.
- `npm run check` runs formatting checks, linting, unit tests, and the production build.

Generated output, dependency caches, and test reports are excluded from formatting and linting. Prettier owns formatting, with `eslint-config-prettier` preventing conflicting lint rules. VS Code recommends the Angular, ESLint, and Prettier extensions and enables formatting and ESLint fixes on save. Other editors can use the same Prettier config and `.editorconfig`.

Tooling references: [Angular ESLint](https://github.com/angular-eslint/angular-eslint), [Prettier installation](https://prettier.io/docs/install).

`lucide-angular` 1.0 declares peers only through Angular 21. This app uses the current standalone `@lucide/angular` package, whose declared Angular peers are >=17, without forced peer overrides.

Tailwind v4 uses `.postcssrc.json`:

```json
{ "plugins": { "@tailwindcss/postcss": {} } }
```

`src/styles.css` begins with `@import 'tailwindcss';` and defines tokens with `@theme`. There is no Tailwind v3 configuration or `@tailwind` directives. The existing CSS entry is deliberately retained: Tailwind v4 is processed by PostCSS independently of Sass. SCSS can be added for component-specific needs; this implementation needs no Sass dependency. Shared button/panel styles use Tailwind `@apply`; responsive layout uses template utilities.

References: [Tailwind Angular installation](https://tailwindcss.com/docs/installation/framework-guides/angular), [Angular hybrid rendering](https://angular.dev/guide/ssr), [Lucide Angular](https://lucide.dev/guide/packages/angular).

## Features

- Inline text editing includes a floating toolbar for bold, italic, underline, size, color, Done, and Cancel. Formatting buttons return focus to the existing caret so typing can continue immediately. New text wraps to the available canvas width and keeps its insertion point as it grows; long drafts scroll inside the editor. Text remains fully visible while editing, with the chosen opacity applied on completion.
- Brush studio includes Normal, Sketchy, Square, Spray, Calligraphy, Charcoal, Neon, Dotted, Watercolor, Ink, Marker, and Emboss. Choose a visual preset from the categorized library, then adjust color, size, flow, and the available spacing or nib-angle controls with a live stroke preview. Presets keep your color and opacity and supply a suitable starting size. Select an existing brush stroke to change its style, flow, color, or size with undo support.
- Textured strokes store a random seed per stroke, so undo/redo, autosave, and editable project files preserve the exact texture. Canvas and SVG use the same brush primitives; each complete stroke remains one editable object and one undo step.
- Pencil (fixed 1 px), adjustable brush and eraser, line, rectangle, circle, ellipse, text, and canvas color picker.
- Outline, fill, and combined shape modes, independent stroke/fill colors, swatches, size preview, and adjustable canvas background.
- Pointer capture supports mouse, pen, and touch; cancellation safely discards previews.
- Undo/redo includes shapes, text, imported images, clear, and background changes. New commands discard the redo branch.
- Clear uses an accessible native confirmation dialog. Escape cancels; undo restores cleared work.
- Quick PNG export uses the full document resolution regardless of zoom. Export options add transparent backgrounds, custom dimensions, aspect-ratio linking, and vector SVG with embedded imported images and ordered eraser masks.
- PNG/JPEG/WebP import, limited to 20 MB and 32 megapixels after decoding, fits the image into the canvas without enlarging it. Invalid files report useful errors.
- Document naming, unsaved indicator, browser unload prompt, zoom from 25% to 200%, active tool state, labeled buttons, keyboard focus, and tablet/mobile layouts.
- Ctrl/Command Z: undo; Ctrl/Command Shift Z or Ctrl/Command Y: redo; Ctrl/Command S: download an editable project; Ctrl/Command D: duplicate selection. V selects objects; H or held Space pans. Arrow keys nudge selected objects (Shift: 10 px); Delete/Backspace deletes. Shortcuts respect editable fields and open dialogs.
- Select objects by clicking visible, unlocked marks or by choosing a layer. Move with dragging, resize with the corner handle, rotate with the upper handle, or enter precise offsets, dimensions, and angles in Layers. Duplicate and delete are undoable.
- The Layers inspector supports names, visibility, locking, and raising/lowering objects. Locked objects cannot be transformed or deleted until unlocked.
- Opacity, optional freehand smoothing, dashed strokes, and an arrow tool apply to new marks.
- Hand panning, Ctrl/Command + wheel zoom around the pointer, reset, and fit-to-screen change only the viewport.
- IndexedDB autosave runs 400 ms after edits, waits for active drawing gestures, and restores the last project after a reload. The header shows save status; storage failures preserve the current artwork and display an error.
- Projects opens a local gallery with thumbnails, names, timestamps, new/open actions, editable file import, and confirmed deletion of inactive projects. Save project downloads a versioned `.drawify` file including objects, embedded images, background, dimensions, and tool settings.
- Layers also edits existing stroke/fill colors, opacity, stroke width, shape style, dashes, smoothing, and text. Image opacity is editable. These edits support undo/redo and do not change the defaults for new marks.
- Shift-click or layer checkboxes add/remove objects from a selection. Drag an empty area with Select for marquee selection; Ctrl/Command A selects all editable objects. Multiple objects move, resize proportionally, rotate, duplicate, or delete together. Ctrl/Command G groups the selection; Ctrl/Command Shift G ungroups it. Group IDs persist in project files, and grouping preserves member order. Groups stay together during alignment and layer reordering.
- Align selection to left/center/right/top/middle/bottom edges or distribute at least three objects/groups with equal horizontal/vertical gaps. Grid settings offer an optional overlay, 2–200 px spacing, and snapping for shape endpoints and object moves. Grid lines are never exported. Grid settings persist in the project; earlier version-1 files still open with default settings.
- Canvas size changes logical dimensions with crop/extend or proportional artwork scaling. Crop/extend keeps objects at their existing coordinates and hides overflow without deleting it. Scaling fits all artwork proportionally and centers it on the new canvas. Both operations support undo/redo and persist in editable projects.
- Two fingers pan and pinch to zoom. Adding the second finger cancels an unfinished mark; a single finger still draws or places text, and the Hand tool supports single-finger panning.
- Cross-tab saving uses a revision check inside the same IndexedDB transaction as the write. A stale tab cannot overwrite a newer project, even without BroadcastChannel notifications. On a conflict, autosave pauses and preserves local edits; choose **Save as new project** to keep a separate copy, or explicitly **Discard my changes and reload**. Unchanged documents do not generate unnecessary revisions.
- Choose Text and click the canvas to type directly at that position, or use **Add text** in the right sidebar. New text is blank and starts black independently of the brush color. The sidebar shows text color and swatches, eight system font families, independent 6–512 px sizes, bold/italic/underline, alignment, line spacing, wrapping, opacity, and automatic or explicit direction. Changes update the on-canvas text box immediately and preserve the caret/selection. Click away, choose **Done**, or press Ctrl/Command + Enter to apply the entire edit as one undo step; Escape/Cancel restores the previous text. Enter adds a newline; Ctrl/Command B/I/U toggles text styles. Selecting existing text automatically exposes its color/font controls; double-click it or choose **Edit text** to change its words in place, including rotated or resized text. Text supports 10,000 characters and Unicode/emoji. Active drafts are marked unsaved, and save/download/export actions finish the text first. Earlier project files retain their original typography. Canvas rendering, bounds/hit testing, and SVG export share the same measured multiline layout. Fonts use system fallbacks; no font downloads are required. The color picker samples the canvas into the stroke color.

## Structure

```text
public/                         favicon and public assets
src/
  app/
    app.ts, app.html            router shell
    app.config.ts              router + hydration
    app.config.server.ts       server providers
    app.routes.ts              lazy home, editor, not-found
    app.routes.server.ts       prerender /; SSR /editor; SSR 404
    features/
      home/pages/home/home.ts
      editor/
        pages/editor/editor.ts orchestration, export, shortcuts, confirmation
        components/
          editor-header.ts     name, import/export, undo/redo
          editor-toolbar.ts    typed tool selection and Lucide icons
          tool-properties.ts   colors, size, fill, text, background
          drawing-canvas/drawing-canvas.ts
        models/drawing.ts      tools, points, document, configuration, commands
        services/
          editor-state.ts      signal-based UI/document configuration
          drawing-engine.ts    canvas rendering, command replay, import/export
          drawing-engine.spec.ts
      not-found/not-found/not-found.ts
  styles.css                   Tailwind v4 + shared visual tokens
  main.ts, main.server.ts      CLI bootstrap
  server.ts                    Angular Node SSR request handler
scripts/vercel-output.mjs       Vercel Build Output API adapter
e2e/editor.spec.ts              production-browser pixel and routing tests
playwright.config.ts
vercel.json
```

Empty guards, pipes, and abstraction-only folders are intentionally omitted. Components use standalone imports and signal inputs/outputs where communication is needed. Services are scoped to the editor instance, so a visit starts a fresh document. No form library is needed for these individual native controls.

## Drawing architecture and tradeoffs

The UI never paints directly. `DrawingCanvas` attaches the engine in `afterNextRender`, registers pointer listeners outside Angular, translates CSS coordinates into document coordinates, and aborts listeners on destruction. No canvas or browser globals run during server initialization. Browser-only imports, downloads, dialogs and keyboard handling execute only after interaction or browser rendering.

`DrawingEngine` owns an object scene and up to 100 undoable scene changes. Objects have stable IDs, visibility/lock flags, and translation/scale/rotation transforms. Strokes keep points and their tool configuration, shapes keep endpoints, and images keep embedded data URLs with a decoded image cache. Scene history shares unchanged objects rather than duplicating pixel buffers. Erasing uses `destination-out`; backgrounds are composited behind artwork, so changing the background also changes erased areas. Canvas replay provides deterministic previews and undo/redo. Animation-frame scheduling merges pointer moves. Zoom changes display dimensions only.

New documents use a 1200 x 800 logical canvas. Editable project files can carry other canvas sizes. `ProjectSession` serializes autosaves and saves the current document before switching projects, preventing a failed save from silently replacing unsaved work. `ProjectStore` keeps versioned documents and thumbnails in IndexedDB. `project-format.ts` validates imported data and generates SVG using escaped text, embedded images, and masks for erasers. Undo history resets when reopening a saved project; object editability is preserved.

Local browser storage is device/origin-specific and may be cleared by the browser or user. Keep `.drawify` backups for important work. Projects have limits of 10,000 objects and 500,000 points; portable files must be under 50 MB. Imported raster images are limited to 20 MB and 32 megapixels. Exports accept dimensions up to 8192 px per side and 32 megapixels total. External image URLs and SVG image imports are rejected. Large scenes still increase replay and storage cost. Canvas drawing remains a visual operation; surrounding controls and precise object transforms are keyboard accessible.

## Verification

```sh
npm run build
npm run test:unit
npx playwright install chromium
npm run test:e2e
npm run serve:ssr:drawify
```

Production output is `dist/drawify/browser` plus `dist/drawify/server/server.mjs`. The Playwright suite starts the built production server on port 4000. It checks SSR/404 responses, drawing pixels, tools, history, image import, project recovery and file round trips, gallery operations, selection/layers, navigation, custom PNG/SVG pixels and transparency, long gestures, storage failure handling, and mobile controls. Unit tests cover scene history, transforms, locking, project validation, geometry, vector serialization, server-safe construction, and the router shell. Real browser tests exercise Canvas and IndexedDB rather than relying on incomplete jsdom mocks.

SSR host validation explicitly permits localhost/127.0.0.1 and Vercel deployment/project/branch URLs. For a custom domain, set `NG_ALLOWED_HOSTS` to comma-separated allowed hostnames (without protocol or port), including every preview/custom domain you need. This Angular runtime variable overrides the constructor host list. `PORT` optionally changes the local server port (default 4000).

## Vercel + GitHub

The Vercel Angular preset's source currently supplies a static SPA fallback. This repository instead uses the supported [Build Output API](https://vercel.com/docs/build-output-api) and [Node function primitive](https://vercel.com/docs/build-output-api/primitives). `vercel.json` selects a custom build and no framework preset. This configuration is necessary to preserve runtime SSR rather than serve `/editor` as a static SPA.

```sh
npm run build:vercel
npm run test:deployment
```

The packager emits `.vercel/output/static` with the prerendered landing/assets, `.vercel/output/functions/render.func` with the bundled Angular Node handler and manifests, and a version-3 routing config. Filesystem routes serve assets first; all other routes go to the SSR function. No SPA rewrite is used. The function runtime is Node 24.

1. Commit this repository and lockfile to GitHub, then push to your chosen repository.
2. In Vercel, Add New Project, then import that GitHub repository; choose the directory containing package.json as the root.
3. Use Node 24, Framework Preset **Other**, Install Command `npm ci`, and Build Command `npm run build:vercel` (provided by vercel.json). Leave Output Directory unset; the Build Output API controls it.
4. No application secrets or API keys are required. Vercel system URL variables populate the SSR host allowlist. Ensure Vercel's system environment variables are available. For custom domains set `NG_ALLOWED_HOSTS` as described above, then redeploy.
5. Deploy a preview and inspect the build output for a Node SSR function. Open `/`, navigate directly to `/editor`, refresh `/editor`, draw and export, and check that an unknown route returns 404.
6. Set `BASE_URL` to the preview URL and run `npm run test:e2e` to exercise that deployment (disable deployment protection or supply access separately for the tests). For PowerShell: `$env:BASE_URL = 'https://your-preview.vercel.app'`. The tests change only local browser drawings.
7. Connect the production branch in Vercel's Git settings; pushes create preview/production deployments according to the selected branch.

Deployment has not been published from this workspace. Local production SSR and generated deployment artifacts can be verified without Vercel credentials; a live deployment smoke test requires your Vercel project and URL.

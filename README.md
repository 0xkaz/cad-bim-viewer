# CAD/BIM Web Viewer

> ⚠️ **Experimental / demo project.** This is a proof-of-concept built to explore browser-based CAD/BIM viewing. It is not production-hardened — APIs, data schema, and behavior may change without notice, and it is not intended for use with confidential or business-critical drawings. Use at your own risk.

A browser-based file console for CAD/BIM drawings on Cloudflare. **IFC and DXF are viewed directly in the browser**; DWG and JWW are supported through upload, sharing, and (optional) conversion workflows — they are not rendered directly. Built with Vite, React, TypeScript, Hono, Cloudflare Workers, D1, and R2.

## Screenshots

| DXF viewer | IFC 3D viewer |
|:---:|:---:|
| ![DXF 2D viewer](https://cad-bim-viewer.0xkaz.com/screenshots/dxf-viewer.png) | ![IFC 3D viewer](https://cad-bim-viewer.0xkaz.com/screenshots/ifc-viewer.png) |

> Screenshots use sample drawings; no real file names or personal data are shown.

## Features

- Google OAuth sign-in
- Drag-and-drop file upload to Cloudflare R2
- File metadata stored in Cloudflare D1
- My dashboard with file list
- **IFC 3D viewer** using That Open Components + web-ifc
- **DXF 2D viewer** with layer toggles and fit view
- **Conversion pipeline** (job orchestration, quota, R2 caching) for IFC → DXF/DWG, DXF/DWG → IFC (geometry-only), and DWG → DXF. The Worker-side pipeline and a Docker converter (`converter/`) are implemented, but **conversion is not enabled in the hosted demo** — it requires a running converter service wired via `CONVERTER_URL`.
- **JWW conversion** is **not implemented yet** — the endpoint is a stub that returns `501` and would require an external JWW engine (`JWW_CONVERTER_URL`).
- **Conversion quota**: 5 conversions/month for normal users
- Element selection and property panel
- Fragments conversion and R2 caching for faster re-viewing
- Public/private visibility toggle
- Shareable public links
- Admin console for the configured admin account

## Tech Stack

- **Frontend:** Vite, React, TypeScript, Tailwind CSS, react-router-dom, TanStack Table
- **Backend:** Hono, Zod, Jose (JWT)
- **Platform:** Cloudflare Workers, D1, R2, Pages
- **Testing:** Vitest with `@cloudflare/vitest-pool-workers`

## Project Structure

```
.
├── src/                 # React SPA
├── worker/src/          # Cloudflare Worker API
├── converter/           # Optional Docker conversion worker
├── migrations/          # D1 migrations
├── tests/worker/        # Worker tests
├── wrangler.toml        # Wrangler configuration
└── package.json
```

## Getting Started

1. Copy environment files:

   ```bash
   cp .env.example .env
   cp .dev.vars.example .dev.vars
   ```

2. Fill in `.env` and `.dev.vars`:

   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `WORKER_JWT_SECRET`
   - `CONVERTER_URL` (optional, e.g. `http://localhost:8080`)
   - `JWW_CONVERTER_URL` (optional external JWW conversion endpoint)

   `.dev.vars` is used by Wrangler for local Worker development.

3. Install dependencies:

   ```bash
   pnpm install
   ```

4. Apply D1 migrations locally:

   ```bash
   pnpm db:migrate:local
   ```

5. Start dev servers:

   ```bash
   pnpm dev
   ```

   The Vite dev server runs on `http://localhost:5173` and proxies `/api` to the local Worker on `http://localhost:8787`.

## Scripts

| Command           | Description                          |
| ----------------- | ------------------------------------ |
| `pnpm dev`        | Start web + worker dev servers       |
| `pnpm typecheck`  | Run TypeScript checks                |
| `pnpm lint`       | Run Biome linter/formatter check     |
| `pnpm lint:fix`   | Auto-fix Biome issues                |
| `pnpm test`       | Run Vitest worker tests              |
| `pnpm build`      | Build frontend and worker            |
| `pnpm deploy:worker` | Deploy worker to Cloudflare       |
| `pnpm deploy:pages`  | Deploy frontend to Cloudflare Pages |

## Deployment

1. Create D1 database and R2 bucket in Cloudflare dashboard.
2. Run `pnpm db:migrate:prod` to apply migrations.
3. Set secrets:

   ```bash
   wrangler secret put GOOGLE_CLIENT_ID
   wrangler secret put GOOGLE_CLIENT_SECRET
   wrangler secret put WORKER_JWT_SECRET
   ```

4. Deploy:

   ```bash
   pnpm build
   pnpm deploy:worker
   pnpm deploy:pages
   ```

## Roadmap

- ✅ IFC / DXF viewers (with Japanese text support), sharing — Cloudflare-only
- ✅ Conversion pipeline + container (`converter/`), verified locally; disabled by default
- 🚧 Enable conversion by hosting `converter/` (Cloud Run / Cloudflare Containers) + `CONVERTER_URL`
- 🚧 JWW conversion (currently a `501` stub; needs an external JWW engine)

## License

Licensed under the [Apache License 2.0](./LICENSE).

Bundled third-party fonts are licensed separately: **Roboto** (Apache-2.0) and
**Noto Sans JP** (a cp932 subset, SIL Open Font License 1.1) — see
[THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).

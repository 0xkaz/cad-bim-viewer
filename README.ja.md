# CAD/BIM Web ビュワー

> ⚠️ **実験的なデモプロジェクトです。** ブラウザ上での CAD/BIM 表示を検証するための概念実証（PoC）であり、本番運用を想定した作り込みはしていません。API・データスキーマ・挙動は予告なく変わる可能性があり、機密図面や業務クリティカルな用途には利用しないでください。ご利用は自己責任でお願いします。

CAD/BIM 図面を Cloudflare 上で扱うファイルコンソールです。**IFC・DXF はブラウザで直接表示**でき、DWG・JWW はアップロード／共有と（任意の）変換ワークフローで対応します（直接描画はしません）。Vite、React、TypeScript、Hono、Cloudflare Workers、D1、R2 で構築しています。

## スクリーンショット

| DXF ビューア | IFC 3D ビューア |
|:---:|:---:|
| ![DXF 2D ビューア](https://cad-bim-viewer.0xkaz.com/screenshots/dxf-viewer.png) | ![IFC 3D ビューア](https://cad-bim-viewer.0xkaz.com/screenshots/ifc-viewer.png) |

> スクリーンショットはサンプル図面です。実ファイル名や個人情報は含まれていません。

## 機能

- Google OAuth ログイン
- ドラッグ＆ドロップでファイルを Cloudflare R2 にアップロード
- ファイルメタデータを Cloudflare D1 に保存
- マイダッシュボードでのファイル一覧
- **That Open Components + web-ifc を使った IFC 3D ビューア**
- **dxf-viewer を使った DXF 2D ビューア**（レイヤー切り替え・フィットビュー対応）
- **変換パイプライン**（ジョブ管理・クオータ・R2 キャッシュ）: IFC → DXF/DWG、DXF/DWG → IFC（幾何学的）、DWG → DXF。Worker 側パイプラインと Docker 変換エンジン（`converter/`）は実装済みですが、**ホスティング中のデモでは変換は無効**です。稼働中の変換サービスを `CONVERTER_URL` に設定して初めて動作します。
- **JWW 変換は未実装**です。エンドポイントは `501` を返すスタブで、外部 JWW エンジン（`JWW_CONVERTER_URL`）が別途必要です。
- **変換クオータ**: 一般ユーザーは月5回まで
- 要素選択とプロパティパネル
- Fragments 変換と R2 キャッシュによる再閲覧高速化
- 公開 / 非公開の切り替え
- 第三者向け共有 URL の発行
- 管理者アカウント用の管理画面

## 技術スタック

- **フロントエンド:** Vite、React、TypeScript、Tailwind CSS、react-router-dom、TanStack Table
- **バックエンド:** Hono、Zod、Jose（JWT）
- **プラットフォーム:** Cloudflare Workers、D1、R2、Pages
- **テスト:** Vitest + `@cloudflare/vitest-pool-workers`

## ディレクトリ構成

```
.
├── src/                 # React SPA
├── worker/src/          # Cloudflare Worker API
├── converter/           # オプションの Docker 変換ワーカー
├── migrations/          # D1 マイグレーション
├── tests/worker/        # Worker テスト
├── wrangler.toml        # Wrangler 設定
└── package.json
```

## ローカル開発

1. 環境変数ファイルをコピー:

   ```bash
   cp .env.example .env
   cp .dev.vars.example .dev.vars
   ```

2. `.env` と `.dev.vars` に以下を設定:

   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `WORKER_JWT_SECRET`
   - `CONVERTER_URL`（任意、例: `http://localhost:8080`）
   - `JWW_CONVERTER_URL`（任意の外部 JWW 変換エンドポイント）

   `.dev.vars` はローカル Worker 開発時に Wrangler が読み込みます。

3. 依存をインストール:

   ```bash
   pnpm install
   ```

4. D1 マイグレーションをローカルに適用:

   ```bash
   pnpm db:migrate:local
   ```

5. 開発サーバー起動:

   ```bash
   pnpm dev
   ```

   Vite 開発サーバーが `http://localhost:5173`、Worker が `http://localhost:8787` で起動します。`/api` は Vite からローカル Worker にプロキシされます。

## スクリプト

| コマンド              | 内容                              |
| --------------------- | --------------------------------- |
| `pnpm dev`            | Web + Worker 開発サーバー起動     |
| `pnpm typecheck`      | TypeScript 型チェック             |
| `pnpm lint`           | Biome による lint / format チェック |
| `pnpm lint:fix`       | Biome による自動修正              |
| `pnpm test`           | Vitest Worker テスト              |
| `pnpm build`          | フロントエンド + Worker ビルド    |
| `pnpm deploy:worker`  | Worker を Cloudflare にデプロイ   |
| `pnpm deploy:pages`   | フロントエンドを Cloudflare Pages にデプロイ |

## デプロイ

1. Cloudflare ダッシュボードで D1 データベースと R2 バケットを作成
2. `pnpm db:migrate:prod` で本番にマイグレーション適用
3. シークレットを設定:

   ```bash
   wrangler secret put GOOGLE_CLIENT_ID
   wrangler secret put GOOGLE_CLIENT_SECRET
   wrangler secret put WORKER_JWT_SECRET
   ```

4. ビルド・デプロイ:

   ```bash
   pnpm build
   pnpm deploy:worker
   pnpm deploy:pages
   ```

## ロードマップ

- ✅ IFC / DXF ビュワー（日本語対応）、共有 — Cloudflare のみ
- ✅ 変換パイプライン + コンテナ（`converter/`）、ローカル検証済み・既定で無効
- 🚧 `converter/` をホスティング（Cloud Run / Cloudflare Containers）+ `CONVERTER_URL` で変換を有効化
- 🚧 JWW 変換（現状は `501` スタブ。外部 JWW エンジンが必要）

## ライセンス

[Apache License 2.0](./LICENSE) の下で提供されます。

同梱の第三者フォントは別ライセンスです：**Roboto**（Apache-2.0）と **Noto Sans JP**（cp932 サブセット・SIL Open Font License 1.1）。詳細は [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) を参照してください。

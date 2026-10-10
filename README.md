# Moldforge

An original retro game studio by Lalo Adrian Morales. Describe a world in the six-step editor, generate game code and sprite artwork with OpenAI, and keep the result as a playable cartridge.

The existing React/TypeScript editor is paired with **one PHP API file**, `server/api.php`. No Composer dependencies, OpenAI SDK, external game engine, emulator or Node server is needed in production. Each finished game is a **single standalone HTML file** with its JavaScript and artwork embedded.

## Run locally

Requirements: Node 22.12+; PHP 8.2+ with **cURL** and **PDO SQLite**. The existing npm dependencies are enough. Run `npm audit` before installing or updating packages.

```sh
npm ci
# If this is a fresh clone, copy .env.example to .env.
npm run dev
```

The launcher starts a private PHP API and Vite together at the printed local URL (normally `http://127.0.0.1:5173`). Both stop with Ctrl+C. Vite alone does not run PHP.

### API keys

Put your own key in the ignored `.env`, in `OPENAI_API_KEY`. Never prefix a secret with `VITE_`; Vite variables are compiled into public JavaScript. `.env.example` contains only a blank key and model defaults. `.env`, `.env.*` (except the example), generated games and deployment archives are excluded from Git.

Local development can use the `.env` key. Public installations default to **bring your own key** (`ALLOW_SERVER_KEY=false`). A visitor enters a key in **Connect OpenAI**. It remains in that tab’s memory, is sent only in a request header to this PHP app, then used to call OpenAI. The app never writes it to browser storage, cookies, the database, templates, HTML downloads or logs. Refreshing forgets it. Use HTTPS on a public host. Your web server must not log request headers containing credentials.

`ALLOW_SERVER_KEY=true` deliberately lets visitors spend the server key’s API credit; leave it false for a public community arcade. Model IDs are configurable with `OPENAI_CODE_MODEL` and `OPENAI_IMAGE_MODEL` (defaults: `gpt-5.4-mini`, `gpt-image-2`). API credit and model access belong to the OpenAI account. A ChatGPT subscription is separate from API billing.

### Try it without an API key

1. Click **Load the example game**.
2. Go to **Review & Generate**.
3. Click **Try the playable starter instead**.

This makes a real two-stage Charge Quest platformer with pixel artwork, enemies, pickups, jump, boost, lives and a win/lose loop. The starter is explicitly labeled; it uses a fixed platformer engine with your title, stage names and basic physics/lives. It does not interpret arbitrary level notes or generate AI content. Full custom molds and mechanics use OpenAI.

## Generate and play

1. Name the game and describe its premise.
2. Pick a mold, define heroes/enemies and their abilities, add stages, and set physics and win/lose conditions.
3. In Review, choose whether to generate original artwork, then **Generate game**.
4. The server saves a private draft before requesting any content. OpenAI writes a complete Canvas game. A separate image request creates a 3×2 sprite atlas (hero, enemy, collectible, terrain, background, boss), exposed to the generated code through the player API.
5. The finished cartridge opens in the isolated player and remains in **My cartridges**. Play it, heart it, download the standalone HTML, remix its template, or explicitly **Publish to arcade**.

Code and art are separate recoverable stages. An image failure preserves the game code. Resume from the gallery, or **Finish without art** to use the code’s drawn fallbacks. There are no hidden paid retries. Keep the tab open during generation; after an interrupted request, a lock can remain for up to four minutes. Completed stages are reused on resume. A timeout occurring after OpenAI accepted a request can still incur a charge; retrying that incomplete stage is a new request.

### Player and saves

- Keyboard and touch controls. The game’s generated instructions describe its mechanics.
- Host controls: **P/Escape** pause, **R** restart; sound is off until enabled.
- Checkpoints save in this browser every three seconds when supported by the generated game. Standalone downloads attempt to save through their own browser storage.
- Games execute in an iframe with scripts enabled, no same-origin access and a Content Security Policy that blocks network access, external scripts, forms and embeds. Credentials never enter a cartridge. Generated JavaScript is never executed on the PHP server.
- Generated code may still contain gameplay or runtime mistakes. The player reports runtime errors; remix and regenerate if needed. It is not an automatic gameplay certification system.

## Gallery ownership

Private games are associated with a random, HttpOnly, SameSite cookie. Only that browser can view, resume, publish, unpublish or delete them. Public games and their templates are readable by other visitors; only the creator can change them. Hearts and checkpoints are browser-local. There are **no user accounts or cross-device login** yet. Clearing the owner cookie loses private-library access: download cartridges you want to keep permanently.

Templates autosave locally. Games persist in SQLite outside the web document root, surviving app and PHP restarts. Back up `.moldforge/` using a SQLite-consistent backup; do not delete it during deployments. The gallery loads 30 entries at a time, with search over loaded entries and **Load more** for older games. Limits: 20 characters, 10 levels, 100 stored cartridges per browser, 30 new cartridges per browser per day.

## Bluehost / PHP deployment

```sh
npm run check
npm run build
```

Upload **the contents of `dist/`** (including `.htaccess`) to your domain’s document root, normally `public_html/`. This contains built frontend assets and `api.php`; Node is only needed to build. The frontend also supports installation in a subdirectory.

The API finds `.env` and creates `.moldforge/games.sqlite` **one directory above the server’s document root**, including when the app is installed in a subdirectory. Example:

```text
/home/your-user/
  .env                      # optional: models / local owner key, not public
  .moldforge/games.sqlite    # writable by PHP, not public
  public_html/
    api.php
    index.html
    .htaccess
    assets/
```

Enable PHP 8.2+, cURL and PDO SQLite in hosting settings. PHP must be able to write the private storage directory. Keep the public URL on HTTPS. If your host requires explicit private paths, configure `MOLDFORGE_ENV_FILE` and `MOLDFORGE_DATA_DIR` as **server environment variables**, pointing outside the document root. Do not upload `.env` or game storage into a public folder. Default public BYOK generation needs no server key.

Generation requests can take a few minutes. PHP’s request limit is set to 230 seconds and the OpenAI timeout is 200 seconds. Your host/proxy also needs to allow long PHP requests; some shared hosting limits cannot be overridden. Code and artwork are separate requests to reduce this pressure. `npm run preview` runs the built frontend with the local PHP API; a static-only host cannot generate or save games.

## Validation and code map

```sh
npm run check       # TypeScript + model, PHP integration and actual starter gameplay tests
npm run lint
npm run build       # dist/ including PHP and Apache protections
npm run preview     # preview production frontend with PHP
```

The integration tests launch an isolated PHP server and a **local fixture of OpenAI**, exercise both real HTTP request contracts, image-failure recovery, idempotent creation, private/public access, download sandboxing, invalid input, quota errors, and persistence after restart. They execute the actual starter JavaScript to verify movement, progression, win/lose and restart. No test makes a paid API call or uses your `.env` key. Live AI output quality and hosted deployment require separate verification with a real key/host.

- `server/api.php`: key loading, validation, SQLite, OpenAI calls, game packaging and starter engine.
- `scripts/dev.mjs`: starts PHP and Vite together.
- `scripts/package.mjs`: adds the PHP API and `.htaccess` to the production build.
- `src/App.tsx`: studio navigation and generation orchestration.
- `src/components/{Gallery,Player,Settings}.tsx`: cartridge shelf, isolated player, private key entry.
- `src/api/generate.ts`: real API calls; errors are never replaced with mock success.
- `src/model/`: editable template, molds, wizard state and browser persistence.

API references: [Responses / Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [Image generation](https://developers.openai.com/api/reference/resources/images/methods/generate).

## Scope

These are original **Nintendo-era-inspired browser games**, not NES/SNES ROMs or Nintendo hardware builds. 3D molds request a Canvas-rendered projected or raycast interpretation. The mold catalog is hand-authored; actual REA mold extraction remains future work. No Nintendo assets or ROMs are included, and the project is not affiliated with Nintendo.

MIT license.

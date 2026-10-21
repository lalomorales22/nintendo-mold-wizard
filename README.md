# Game-Maker

An original retro game studio by Lalo Adrian Morales. Describe a game in a paragraph and press **Generate & play**, or shape it in the six-step editor. Choose OpenAI or Anthropic Claude for planning and code, with OpenAI for transparent sprite artwork; the finished game opens automatically and stays in your gallery.

The existing React/TypeScript editor is paired with **one PHP API file**, `server/api.php`. No Composer dependencies, provider SDK, external game engine, emulator or Node server is needed in production. Each finished game is a **single standalone HTML file** with its JavaScript and artwork embedded.

## Run locally

Requirements: Node 22.12+; PHP 8.2+ with **cURL**, **PDO SQLite** and **GD** (PNG validation/background cleanup). The existing npm dependencies are enough. Run `npm audit` before installing or updating packages.

```sh
npm ci
# If this is a fresh clone, copy .env.example to .env.
npm run dev
```

The launcher starts a private PHP API and Vite together at the printed local URL (normally `http://127.0.0.1:5173`). Both stop with Ctrl+C. Vite alone does not run PHP.

### API keys

Put keys in the ignored `.env`, or enter them in **API settings** in the app:

```dotenv
OPENAI_API_KEY=
OPENAI_CODE_MODEL=gpt-6-sol
OPENAI_IMAGE_MODEL=gpt-image-1.5
ANTHROPIC_API_KEY=
ANTHROPIC_CODE_MODEL=claude-sonnet-5-5
ANTHROPIC_WORKSPACE_ID=
```

Use **Check connection & load models** to verify access without buying a generation. Pick a code provider and model in Create or Review; the editable model field also accepts a specific model ID. A model catalog listing confirms visibility, not compatibility with every generation feature. Unsupported models return an error; the app does not silently switch models. Claude requests use the native Messages API and structured JSON output. Defaults are configurable in `.env`; new cartridges pin their selected code provider/model, including during resume and repair. Older cartridges without a pinned model use the configured OpenAI default.

**Anthropic workspace and credits:** Normal keys scoped to one workspace can leave the workspace field blank. Multi-workspace keys require `anthropic-workspace-id: wrkspc_…`, supplied by `ANTHROPIC_WORKSPACE_ID` or the optional field. An organization header is not needed. Use a key from the organization holding your API credits; the app cannot read or verify your credit balance. The connection check displays organization/workspace IDs when Anthropic returns them. A visitor key never inherits the server key's workspace. See [Anthropic authentication](https://platform.claude.com/docs/en/manage-claude/authentication) and [structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs).

Never prefix a secret with `VITE_`; Vite variables are compiled into public JavaScript. `.env.example` contains only blank keys and model defaults. `.env`, `.env.*` (except the example), generated games and deployment archives are excluded from Git.

Local development can use `.env` keys. Public installations default to **bring your own key** (`ALLOW_SERVER_KEY=false`). Entered keys remain in that tab's memory, go in headers to this PHP app, and are forwarded only to their respective provider. The app never writes keys to browser storage, cookies, the database, templates, HTML downloads or logs. Refreshing forgets entered keys. Use HTTPS on a public host. Your web server must not log request headers containing credentials.

`ALLOW_SERVER_KEY=true` deliberately lets visitors spend the server's API credit for either configured provider; leave it false for a public community arcade. OpenAI generates artwork even when Claude writes the game. Turn artwork off to build with only an Anthropic key. API credit/model access and consumer ChatGPT/Claude subscriptions are separate.

### Battle Arena

Open **Battle Arena**, enter one challenge, choose each contender's model and press **Start a new battle**. OpenAI and Claude independently plan and build the same idea, sequentially. Each receives the same challenge and makes its own cartridge. Optional artwork creates a separate OpenAI sprite sheet for each game. This spends both providers' API credits; it is not an automatic judge or a claim of comparable costs.

Matches and cartridges persist on your private shelf. One failed round does not discard the other. **Resume unfinished rounds** reuses saved code and completed opponents; it does not automatically repair failed runtime checks. Use the explicit **Repair & test** button for that. After both finish, play each and choose OpenAI, Claude or a tie; your verdict is saved with the match. Deleting a contender in Gallery clears the verdict. Model changes in the setup apply only to new matches. History and ownership use the same browser cookie as the gallery (no cross-device accounts). The arena stores up to 100 matches; both contenders count toward normal cartridge limits.

### Try it without an API key

1. Click **Load the example game**.
2. Go to **Review & Generate**.
3. Click **Try the playable starter instead**.

This makes a real two-stage Charge Quest platformer with pixel artwork, enemies, pickups, jump, boost, lives and a win/lose loop. The starter is explicitly labeled; it uses a fixed platformer engine with your title, stage names and basic physics/lives. It does not interpret arbitrary level notes or generate AI content. Full custom molds and mechanics use your selected AI provider.

## Generate and play

Use **Create** or **New game** to choose **Start new game** or **Continue this draft**. Starting fresh clears the editor; saved gallery cartridges stay available. Download a draft's template JSON before replacing it if you want to keep that unfinished design.

**Quick build:** On Create or the first Welcome screen, enter a paragraph and press **Generate & play**. It plans the characters, abilities, stages and rules, saves a new cartridge, generates and checks code, creates optional artwork, checks again, then opens the game. Your existing editor draft is not replaced. Planning uses one text request; code and artwork are separate requests. Errors after saving leave a resumable cartridge on your shelf. ROM Lab offers the same button with the current tile reference.

**Manual builder:**

1. Name the game and describe its premise.
2. Pick a mold, define heroes/enemies and their abilities, add stages, and set physics and win/lose conditions.
3. In Review, choose whether to generate original artwork, then **Generate game**.
4. The server saves a private draft before requesting any content. Your selected provider writes a complete Canvas game. A separate image request creates a transparent animated sprite sheet, exposed through the player’s shared animation helpers.
5. The finished cartridge opens in the isolated player and remains in **My cartridges**. Play it, heart it, download the standalone HTML, remix its template, or explicitly **Publish to arcade**.

Code, runtime checks and art are separate recoverable stages. Before buying art, and again with the atlas loaded, an opaque-origin sandbox checks JavaScript startup, all four required functions (`update`, `render`, `save`, `load`), simulated control input, canvas drawing and finite coordinates, checkpoint round-trip, malformed saves and restart. Failed checks retain the cartridge in `testing` and prevent Play, download or publication. The owner may explicitly choose **Repair & test · uses API**; this requests corrected code and preserves the previous payload/art in the private `game_revisions` table. No automatic paid repair requests run. Passing is a runtime smoke check, not proof of genre fidelity, game balance or every level being beatable. The browser reports acceptance for the exact payload/art hash; this is an owner workflow check, not a security certification. An image failure preserves the game code. Resume from the gallery, or **Finish without art** to use the code’s drawn fallbacks. The generation display names the current step and shows elapsed time. Provider requests return complete steps, so the app does not claim a live completion percentage. There are no hidden paid retries. Keep the tab open during generation; after an interrupted request, a lock can remain for up to four minutes. Completed stages are reused on resume. A timeout occurring after a provider accepted a request can still incur a charge; retrying that incomplete stage is a new request.

Editing a draft clears its previous generation result so **Play** cannot open an older design. **Generate again** creates a separate cartridge; **Resume saved cartridge** continues an existing one. Missing keys and request failures appear beside the generation controls, and missing-key attempts open API settings. Existing drafts are preserved when upgrading, but old generation links without a matching template are cleared; those games remain in the gallery.

### Sprite sheets and backgrounds

New code uses a versioned **1024×1024 transparent PNG**, generated at medium quality with `background: transparent`. PHP checks PNG decoding, exact dimensions, real alpha and nonempty artwork. An opaque or invalid result fails only the art stage; code is retained, with no automatic paid retry. `gpt-image-1.5` is the default sprite model because it supports transparent PNG output ([official prompting guide](https://developers.openai.com/cookbook/examples/multimodal/image-gen-1.5-prompting_guide)). GPT Image 2 transparency is a preview feature and can reject `background: transparent`; existing installations should set `OPENAI_IMAGE_MODEL=gpt-image-1.5` in their private `.env`. This does not change the code/planning model. HTTP 400 errors identify allowlisted parameter names and error codes without exposing upstream messages or credentials. There is no automatic model switch or paid retry.

The sheet has **8×8 cells, 128 pixels each**. Hero occupies the top-left 4×4 block, enemy the top-right block and boss the bottom-left block. Each block has down/left/right/up rows; each row has idle and three walk poses. The bottom-right block begins with collectible, terrain and decoration; remaining cells are empty. PHP measures the visible silhouettes instead of trusting the generated grid, checks the 51-frame layout, then packs whole sprites into padded cells. Each character keeps one scale across all poses and a common foot baseline. Missing, overlapping, edge-clipped or ambiguous layouts fail the art stage; both code and the original image are retained privately. Packing uses existing PHP GD, makes no extra API requests, and does not invent missing poses.

The host crops the fitted cells with fixed anchors. `api.actor(ctx, 'hero', x, y, w, h, {direction: 'left', moving: true})` runs an 8fps walk cycle on the game clock, pauses with the game and returns to idle when movement stops. Optional `time` or `frame` selects a pose explicitly. Generated code supplies the actual movement and facing; `api.sprite` retains the six logical asset indices for props and compatibility. World backgrounds are drawn separately.

**Gallery → View sprites** previews directions and animation, downloads the full PNG, or cuts out the selected frame at its original resolution with transparency intact. AI layout/pose consistency still needs visual review; image validation cannot prove that every pose or character is correctly drawn.

Old cartridges keep their six-cell layout, including during code repairs. In their sprite viewer, **Remove solid sprite backgrounds** performs free PHP cleanup of border-connected, nearly uniform colors in hero/enemy/collectible/boss cells. It preserves disconnected interior colors, terrain and scenery, saves the original payload/art as a private revision, unpublishes the changed cartridge, and requires a new runtime check before play. It does not recover animations or remove complex scenery. Generate a new game to get the directional sheets.

### Player and saves

- Keyboard and touch controls. The game’s generated instructions describe its mechanics.
- Host controls: **P/Escape** pause, **R** restart; sound is off until enabled.
- Checkpoints save in this browser every three seconds when supported by the generated game. Standalone downloads attempt to save through their own browser storage.
- Games execute in an iframe with scripts enabled, no same-origin access and a Content Security Policy that blocks network access, external scripts, forms and embeds. Credentials never enter a cartridge. Generated JavaScript is never executed on the PHP server.
- Global error reporting attributes failures to named cartridge/player scripts. Injected browser-extension errors remain in the browser console and do not become cartridge failures; the sandbox still denies same-origin/storage access. Errors caught directly during initialization, gameplay, testing and restart remain reportable.
- Generated code may still contain gameplay or runtime mistakes outside the exercised paths. The player preserves the first error and offers **Repair & test** to the owner. Previously saved cartridges can still be played without migration; new and repaired generations must pass the runtime check.

## Simple AI game plans

Use **Create → Create AI game plan**, or **ROM Lab → Tile editor → AI game plan**. Describe the desired game, then review the proposed hero, ability, enemy, stages, win/lose rules and visual direction. The formula is **identity + player actions + spaces + obstacles + rewards + rules + visual language**. Choose **Use this plan in the builder** to fill all six steps, adjust any detail, and Generate. Replacing an existing draft requires the same explicit confirmation as a remix.

ROM-assisted plans send only the current 64-tile preview page (256×64 PNG), format/offset label and description to your selected provider. The original ROM stays local. Observed graphics and proposed mechanics are separated; tile graphics alone do not recover gameplay or level maps, and workshop colors are only a preview palette. Changing the idea, ROM or decoded page invalidates a pending result. The selected image is retained in the accepted template, supplied as visual input to code generation, and embedded in the game for `api.tile(ctx,index,x,y,w,h)` (16×4 tiles). The AI's visual brief also informs generated artwork. This enables tile reuse but does not guarantee the AI will identify or assemble every original sprite correctly. Publishing or downloading the new cartridge includes that selected tile page.

Plans use the configured code model (`gpt-6-sol` by default), strict structured output and server validation. Planning and game generation are separate paid requests; neither silently falls back to a pretend AI result. This creates browser games, not recompiled NES/SNES binaries.

## ROM Lab: edit your own NES / SNES cartridges

The studio now uses a classic console theme: gray housing, charcoal panels, red controls, cartridge shelves and original controller artwork. Open **ROM Lab** in the sidebar or from **Create** to import a cartridge you built.

- Import `.nes`, `.snes`, `.sfc` or `.smc` files up to 8 MiB plus a 512-byte copier header. File contents are validated, not just the extension.
- **Cartridge map:** iNES / NES 2.0 PRG, CHR, trainer, mapper and submapper information; inferred SNES LoROM, HiROM and ExHiROM headers. Additional NES data and SNES copier headers are preserved.
- **Tile editor:** decode and paint NES CHR graphics or uncompressed SNES 2/4/8bpp planar tiles at an explicit file offset. Colors are a preview palette; editing pixels changes palette indices, not the game's palette. CHR RAM games have no automatically editable CHR ROM section. SNES tiles need an offset from your source/map file; arbitrary bytes may be code or compressed data.
- **Hex editor:** browse file offsets, select a byte, enter a hexadecimal value, and apply the change. The last 200 edits can be undone/redone during that open editing session. Reopening a project resets undo history but retains its original ROM.
- **SNES metadata:** edit the 21-character ASCII cartridge title. Explicit checksum repair supports ordinary LoROM/HiROM/ExHiROM layouts whose declared size matches a power-of-two ROM or two power-of-two regions. It includes the standard mirrored tail and excludes the copier header. Unusual sizes and special-chip mappings leave repair disabled.
- **Export:** download the untouched original, an edited ROM of the same size, or an IPS patch against that original. IPS needs the exact original file, including any copier header. Checksums are only changed when you click **Repair checksum** or edit those bytes yourself.

ROMs are read locally and saved with their originals in **IndexedDB in this browser**. The complete ROM is never uploaded to PHP, either AI provider or the community gallery. Optional AI planning sends a decoded tile-page image as described above. The ROM shelf is separate from generated HTML games; changing ROM projects leaves the current game-builder draft intact. Download backups before clearing browser data. If browser storage fails or is full, the app reports that the changes are not saved and still allows an edited ROM download.

This is a cartridge inspector and binary/tile editor. It does **not** decompile a complete source project, automatically discover level layouts, decompress game-specific graphics, recover game logic for the AI wizard, or emulate NES/SNES games in the browser. Test edited ROMs in your existing emulator or hardware workflow. Interleaved SNES images and unusual/headerless homebrew layouts need a dedicated importer; `.snes` alone cannot identify the internal layout.

Format references: [iNES](https://www.nesdev.org/wiki/INES), [NES 2.0](https://www.nesdev.org/wiki/NES_2.0), [NES pattern tables](https://www.nesdev.org/wiki/PPU_pattern_tables), [SNES cartridge headers and checksums](https://snes.nesdev.org/wiki/ROM_header), [SNES tile formats](https://snes.nesdev.org/wiki/Tiles), and [IPS format](https://sneslab.net/wiki/IPS_file_format). All format code is local; no emulator, ROM parser, or other dependency was downloaded or added for this feature.

## Gallery ownership

Private games are associated with a random, HttpOnly, SameSite cookie. Only that browser can view, resume, publish, unpublish or delete them. Public games and their templates are readable by other visitors; only the creator can change them. Hearts and checkpoints are browser-local. There are **no user accounts or cross-device login** yet. Clearing the owner cookie loses private-library access: download cartridges you want to keep permanently.

Game-Maker retains the legacy `.moldforge/` storage directory, browser storage keys, owner cookie and `MOLDFORGE_*` environment variables so existing installations keep their games, ROM projects, saves and settings. These internal identifiers are intentionally unchanged.

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

Generation requests can take a few minutes. PHP’s request limit is set to 230 seconds and each provider timeout is 200 seconds. Your host/proxy also needs to allow long PHP requests; some shared hosting limits cannot be overridden. Code and artwork are separate requests to reduce this pressure. `npm run preview` runs the built frontend with the local PHP API; a static-only host cannot generate or save games.

## Validation and code map

```sh
npm run check       # TypeScript + model, PHP integration and actual starter gameplay tests
npm run lint
npm run build       # dist/ including PHP and Apache protections
npm run preview     # preview production frontend with PHP
```

The integration tests launch an isolated PHP server and **local fixtures of OpenAI and Anthropic**, exercise their native HTTP request contracts, image-failure recovery, idempotent creation, private/public access, download sandboxing, invalid input, quota errors, and persistence after restart. They execute the actual starter JavaScript to verify movement, progression, win/lose and restart. ROM tests use synthetic cartridge fixtures to validate layout detection, malformed inputs, tile decoding/painting, title edits, mirrored checksums, and independent IPS application (including long records and the reserved EOF offset). Browser checks cover import, paint, undo/redo, reload persistence, and independently verified NES/SNES downloads. These checks do not establish that an arbitrary edited ROM will boot. No test makes a paid API call or uses your `.env` key. Live AI output quality and hosted deployment require separate verification with a real key/host.

- `server/api.php`: key loading, validation, SQLite, OpenAI/Anthropic calls, game packaging and starter engine.
- `scripts/dev.mjs`: starts PHP and Vite together.
- `scripts/package.mjs`: adds the PHP API and `.htaccess` to the production build.
- `src/App.tsx`: studio navigation and generation orchestration.
- `src/components/Arena.tsx` and `src/model/arena.ts`: saved model battles and independent round recovery.
- `src/components/{Create,Gallery,Player,Settings}.tsx`: new-game chooser, cartridge shelf, isolated player, private key entry.
- `src/model/generation.ts`: generation attempts, explicit resume, progress and template-bound results.
- `src/api/generate.ts`: real API calls; errors are never replaced with mock success.
- `src/model/`: editable template, molds, wizard state and browser persistence.
- `src/components/RomLab.tsx` and `src/rom/`: local ROM shelf, cartridge analysis, tile/hex editing and export.

API references: [Responses / Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [Image generation](https://developers.openai.com/api/reference/resources/images/methods/generate).

## Scope

AI-generated games are original **Nintendo-era-inspired browser games**, not NES/SNES ROMs or Nintendo hardware builds. ROM Lab separately edits user-supplied cartridge files. 3D molds request a Canvas-rendered projected or raycast interpretation. The mold catalog is hand-authored; actual REA mold extraction remains future work. No Nintendo assets or ROMs are included, and the project is not affiliated with Nintendo.

MIT license.

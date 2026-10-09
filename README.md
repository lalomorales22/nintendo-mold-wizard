# Moldforge

**Pick a classic mold. Fill in the sheets. Generate the game.**

Moldforge is a guided wizard that turns the common structural "molds" of Nintendo-era games into a typed game
template, then hands that template to an AI generator to build the whole game. It sits on top of
[REA (Reverse Engineer Anything)](https://github.com/morluto/rea), which is the analysis layer that will
eventually discover those molds.

```
REA (analysis)  ──►  Mold catalog  ──►  Moldforge wizard  ──►  GameTemplate JSON  ──►  AI generator  ──►  playable game
   (TODO)            src/model/molds.ts     this app             src/model/types.ts       (stubbed)           (TODO)
```

## The idea

Across the whole library, most games reuse a small number of shapes:

| Mold | Camera | Level shape | Core verbs |
|---|---|---|---|
| Top-Down Adventure | scrolling | dungeon | move 8-way, attack, use item |
| Side-View Action | follow | rooms | run, jump, attack, dash |
| First-Person | first-person | open zone | look, aim, fire, scan |
| Isometric | fixed | rooms | move on grid, select, build |
| Rail Shooter | on-rails | track | steer, aim, fire, barrel-roll |
| Fighting / Arena | arena | arena | light/heavy attack, block, special |
| 2D Platformer | scrolling | scrolling stage | run, jump, stomp, power-up |
| 3D Adventure | orbit | open zone | run, jump, climb, glide |

Underneath every mold sit the same three sheets: a **character sheet**, a **level sheet**, and **shared
parameters**. Moldforge walks you through them step by step, and the result is a single JSON template
that an AI pipeline can turn into a game.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
```

Other scripts:

```bash
npm run check      # typecheck + unit tests
npm run typecheck  # tsc -b
npm test           # vitest
npm run build      # production build to dist/
npm run preview    # serve dist/ (mock generator endpoint included)
```

On the welcome screen, click **Load the example game** to fill everything in and click straight through.

## The wizard

1. **Welcome**: game title and one-line pitch.
2. **Perspective**: pick one of 8 molds. Picking a mold sets camera, physics and art/audio defaults and re-keys every character's stats (a rail shooter uses shield/firepower/agility/bombs; a platformer uses lives/speed/jump/power).
3. **Characters**: add as many as you want, each with a role (hero / npc / enemy / boss), stat sliders, abilities with input hints, and sprite/model/reference placeholders (a prompt, path or URL).
4. **Levels**: add and reorder levels, with layout notes, enemies placed from your cast, collectibles, exits, and music/mood tags.
5. **Parameters**: difficulty, camera, physics feel (gravity, friction, acceleration, jump), art style, audio palette, lives, and win/lose conditions.
6. **Review & Generate**: a validation checklist, a full summary, **Download template JSON**, and **Generate game**, which starts a generation job and shows its status, log, and output manifest.

State is saved to `localStorage` (`moldforge.wizard.v1`) on every change, so a refresh never loses work.
Steps are gated: you can't move forward until the current step is valid, and you can jump back to any step you've already reached.

## Code map

```
src/model/types.ts      Data model: PerspectiveMold, CharacterSheet, LevelSheet, SharedParameters, GameTemplate, GenerationJob
src/model/molds.ts      Seed catalog of the 8 perspective molds
src/model/template.ts   Factories, applyPerspective(), validateTemplate(), example template
src/model/wizard.ts     Typed wizard state machine: STEPS, guards (blockReason), reducer, progress
src/model/storage.ts    localStorage persistence with version check
src/model/mockJob.ts    Deterministic mock generation job (pure function of elapsed time)
src/api/generate.ts     Client: POST /api/generate, GET /api/jobs/:id, with in-browser fallback
server/mockGeneratorPlugin.ts   Vite dev/preview middleware that serves the mock endpoints
src/steps/*.tsx         One component per wizard step
src/model/model.test.ts Unit tests for the model, state machine, storage, and mock job
```

## Built vs. TODO

**Built and working**
- The full 6-step wizard UI (React 19 + TypeScript + Tailwind v4, Vite).
- A typed data model for molds, characters, levels, parameters, and generation jobs.
- The wizard state machine with step guards, progress, and unlocked-step navigation.
- localStorage persistence, template JSON export, and an example template.
- A mock generation endpoint and job polling. It calls **no** external or paid AI services.
- Unit tests (`npm run check`).

**TODO**
- **Mold extraction from REA.** Replace the hand-written `molds.ts` with molds inferred by REA analysis passes (camera behavior, level structure, entity tables, physics constants), using only legally obtained material that you have the rights to analyze. The plan is to emit the same `PerspectiveMold` shape so the wizard doesn't change.
- **Real game codegen.** Swap `server/mockGeneratorPlugin.ts` for a real generator that turns `GameTemplate` into a playable web build (e.g. a Phaser or three.js runtime per mold), with asset generation driven from the character asset refs. Prefer local or open-source models.
- Template import (upload JSON), a level grid/tile editor, sprite previews, and per-mold extra fields (e.g. fighting-game move lists, rail paths).
- An end-to-end UI test (e.g. Playwright).

## Legal note

Moldforge models genre **structure** (perspectives, camera, level shape, stat schemas). It ships no ROMs,
no copyrighted game assets, and no trademarked characters. Generated games should use original art, audio and names.
"Nintendo" is a trademark of Nintendo Co., Ltd. This project is not affiliated with or endorsed by Nintendo.

## License

MIT

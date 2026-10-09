import { Field, Segmented, Slider, StepHeader, TagInput } from '../components/ui'
import { ART_STYLES, AUDIO_PALETTES, DIFFICULTIES, type CameraMode } from '../model/types'
import type { StepProps } from './types'

const CAMERAS: readonly CameraMode[] = ['fixed', 'scrolling', 'follow', 'orbit', 'first-person', 'on-rails', 'arena']

export function Parameters({ state, dispatch }: StepProps) {
  const p = state.template.parameters
  const set = (patch: Partial<typeof p>) => dispatch({ type: 'setParameters', patch })
  return (
    <div>
      <StepHeader kicker="Step 5 · Shared parameters" title="Tune the feel">
        Defaults came from your mold. These apply to the whole game.
      </StepHeader>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card grid gap-4">
          <div><span className="label">Difficulty</span><Segmented options={DIFFICULTIES} value={p.difficulty} onChange={(difficulty) => set({ difficulty })} /></div>
          <div><span className="label">Camera</span><Segmented options={CAMERAS} value={p.camera} onChange={(camera) => set({ camera })} /></div>
          <div><span className="label">Art style</span><Segmented options={ART_STYLES} value={p.artStyle} onChange={(artStyle) => set({ artStyle })} /></div>
          <div><span className="label">Audio palette</span><Segmented options={AUDIO_PALETTES} value={p.audioPalette} onChange={(audioPalette) => set({ audioPalette })} /></div>
          <Field label="Lives">
            <input type="number" min={1} max={99} className="input w-24" value={p.lives} onChange={(e) => set({ lives: Math.max(1, Math.min(99, Number(e.target.value) || 1)) })} />
          </Field>
        </section>
        <section className="card grid gap-4">
          <span className="label -mb-2">Physics feel</span>
          <Slider label="Gravity" left="floaty" right="heavy" value={p.physics.gravity} onChange={(gravity) => set({ physics: { ...p.physics, gravity } })} />
          <Slider label="Friction" left="icy" right="grippy" value={p.physics.friction} onChange={(friction) => set({ physics: { ...p.physics, friction } })} />
          <Slider label="Acceleration" left="sluggish" right="twitchy" value={p.physics.acceleration} onChange={(acceleration) => set({ physics: { ...p.physics, acceleration } })} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="accent-[#e60012]" checked={p.physics.jumpEnabled} onChange={(e) => set({ physics: { ...p.physics, jumpEnabled: e.target.checked } })} />
            Jumping enabled
          </label>
          <Field label="Win conditions"><TagInput value={p.winConditions} onChange={(winConditions) => set({ winConditions })} /></Field>
          <Field label="Lose conditions"><TagInput value={p.loseConditions} onChange={(loseConditions) => set({ loseConditions })} /></Field>
        </section>
      </div>
    </div>
  )
}

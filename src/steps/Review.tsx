import { getGame } from '../api/generate'
import { matchingJob, templateKey } from '../model/wizard'
import { useStudio } from '../studio'
import { StepHeader } from '../components/ui'
import { getMold } from '../model/molds'
import { validateTemplate } from '../model/template'
import type { StepProps } from './types'

export function Review({ state }: StepProps) {
  const t = state.template
  const job = matchingJob(state)
  const issues = validateTemplate(t)
  const mold = getMold(t.perspective)
  const studio = useStudio()
  const running = studio.busy
  const generate = () => studio.generate()

  const download = () => {
    const blob = new Blob([JSON.stringify(t, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${(t.gameTitle || 'template').replace(/\W+/g, '-').toLowerCase()}.moldforge.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const name = (id: string) => t.characters.find((c) => c.id === id)?.name || 'Unnamed'

  return (
    <div>
      <StepHeader kicker="Step 6 · Review" title={t.gameTitle || 'Untitled game'}>{t.pitch}</StepHeader>

      {issues.length > 0 && (
        <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">
          <b>Before generating:</b>
          <ul className="ml-5 list-disc">{issues.map((i) => <li key={i.field}>{i.message}</li>)}</ul>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="card">
          <h3 className="label">Mold</h3>
          <p className="font-bold text-white">{mold?.name ?? '—'}</p>
          <p className="text-xs text-zinc-500">{mold?.dimensions} · {t.parameters.camera} camera · {mold?.levelShape}</p>
          <h3 className="label mt-4">Parameters</h3>
          <ul className="space-y-0.5 text-sm text-zinc-300">
            <li>Difficulty: {t.parameters.difficulty}</li>
            <li>Art: {t.parameters.artStyle} · Audio: {t.parameters.audioPalette}</li>
            <li>Lives: {t.parameters.lives} · Jump: {t.parameters.physics.jumpEnabled ? 'on' : 'off'}</li>
            <li>Gravity {t.parameters.physics.gravity} · Friction {t.parameters.physics.friction} · Accel {t.parameters.physics.acceleration}</li>
            <li>Win: {t.parameters.winConditions.join('; ') || '—'}</li>
            <li>Lose: {t.parameters.loseConditions.join('; ') || '—'}</li>
          </ul>
        </section>
        <section className="card">
          <h3 className="label">Cast ({t.characters.length})</h3>
          <ul className="space-y-2 text-sm">
            {t.characters.map((c) => (
              <li key={c.id}>
                <span className="font-semibold text-white">{c.name || 'Unnamed'}</span> <span className="text-xs uppercase text-zinc-500">{c.role}</span>
                <div className="text-xs text-zinc-500">{Object.entries(c.stats).map(([k, v]) => `${k} ${v}`).join(' · ')}</div>
                {c.abilities.length > 0 && <div className="text-xs text-zinc-400">{c.abilities.map((a) => a.name).filter(Boolean).join(', ')}</div>}
              </li>
            ))}
          </ul>
        </section>
        <section className="card">
          <h3 className="label">Levels ({t.levels.length})</h3>
          <ol className="space-y-2 text-sm">
            {t.levels.map((l, i) => (
              <li key={l.id}>
                <span className="font-mono text-xs text-cart-red">{String(i + 1).padStart(2, '0')}</span> <span className="font-semibold text-white">{l.name || 'Unnamed'}</span>
                {l.enemyIds.length > 0 && <div className="text-xs text-zinc-500">Enemies: {l.enemyIds.map(name).join(', ')}</div>}
                {l.musicMoodTags.length > 0 && <div className="text-xs text-zinc-500">Mood: {l.musicMoodTags.join(', ')}</div>}
              </li>
            ))}
          </ol>
        </section>
      </div>

      <section className="card mt-4">
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn-primary text-base" disabled={issues.length > 0 || running} onClick={generate}>
            {running ? 'Generating…' : job?.status === 'done' ? 'Generate again' : '▶ Generate game'}
          </button>
          <button type="button" className="btn-ghost" onClick={download}>Download template JSON</button>
          <label className="flex items-center gap-2 text-sm text-zinc-300"><input id="with-art" type="checkbox" checked={studio.withArt} onChange={e => studio.setWithArt(e.target.checked)} /> Generate original sprite artwork</label>
        </div>

        {!studio.apiKey.trim() && !studio.config?.serverKeyAvailable && <div className="generation-key-notice"><p><b>Connect OpenAI to generate this game.</b> No API key is configured yet. Enter your own key in settings, or add OPENAI_API_KEY to your local .env file.</p><button className="btn-ghost" onClick={() => studio.setSettingsOpen(true)}>Enter API key</button></div>}
        {studio.error && <div className="error-banner mt-4" role="alert">{studio.error}</div>}
        {running && <p className="generation-notice mt-4" role="status">{studio.generationMessage || 'Starting generation…'}</p>}
        {!job && !running && <p className="mt-4 text-sm text-zinc-300">This draft has no playable cartridge yet. Generate it to create a new game; your earlier games are in the gallery.</p>}
        <p className="mt-4 text-xs leading-relaxed text-zinc-400">OpenAI writes a complete browser game from these sheets. Artwork adds a separate image request. Your cartridge saves privately to your gallery. Keep this tab open while generating; interrupted drafts can be resumed.</p>
        {t.perspective === 'platformer-2d' && <button className="mt-4 text-sm text-emerald-300 hover:underline" disabled={running || issues.length > 0} onClick={() => studio.generate(true)}>Try the playable starter instead · no API key needed →</button>}
        {job && (
          <div className="mt-4">
            <div className="flex justify-between text-xs text-zinc-400"><span className="font-mono">{job.id} · {job.status}</span><span>{job.progress}%</span></div>
            <div className="mt-1 h-2 overflow-hidden rounded bg-zinc-800"><div className="h-full bg-cart-red transition-all" style={{ width: `${job.progress}%` }} /></div>
            <pre className="mt-3 max-h-48 overflow-auto rounded bg-black/40 p-3 text-xs text-zinc-300">{job.log.join('\n')}</pre>
            {job.result && (
              <div className="mt-3 text-sm">
                <p className="text-zinc-300">{job.result.note}</p>
                <div className="mt-3 flex gap-2"><button className="btn-primary" onClick={async () => { try { const saved = await getGame(job.id); if (templateKey(saved.template) !== templateKey(t)) throw new Error('This cartridge belongs to an earlier template. Generate this draft to play your new game.'); studio.play(saved.game) } catch (e) { studio.setError((e as Error).message) } }}>▶ Play {job.result.title}</button><button className="btn-ghost" onClick={studio.showGallery}>Open gallery</button></div>
                <ul className="mt-1 font-mono text-xs text-zinc-400">{job.result.files.map((f) => <li key={f}>{f}</li>)}</ul>
              </div>
            )}
          </div>
        )}
        {job && job.status !== 'done' && !running && <button className="btn-ghost mt-4" disabled={running} onClick={() => studio.generate(false, job.id)}>Resume saved cartridge</button>}
      </section>
    </div>
  )
}

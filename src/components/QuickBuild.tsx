import type { TileReference } from '../model/plan'
import { ModelPicker } from './ModelPicker'
import { useStudio } from '../studio'

export function QuickBuild({ prompt, reference, disabled }: { prompt: string; reference?: TileReference; disabled?: boolean }) {
  const studio = useStudio()
  return <div className="quick-build">
    <ModelPicker />
    <label className="quick-art"><input type="checkbox" checked={studio.withArt} disabled={studio.busy} onChange={e => studio.setWithArt(e.target.checked)} /> Include transparent animated sprites</label>
    <button type="button" className="btn-primary launch-button" disabled={disabled || studio.busy || prompt.length > 3000} onClick={() => void studio.quickGenerate(prompt, reference)}><span aria-hidden="true">▶</span> {studio.busy ? 'Building your game…' : 'Generate & play'}</button>
    {prompt.length > 3000 && <p role="alert">Shorten the idea to 3,000 characters, including its title.</p>}
    <p>AI plans, builds, tests and saves to your gallery, then opens the game. Uses your selected code provider; sprite artwork uses OpenAI. Your editor draft stays here.</p>
  </div>
}

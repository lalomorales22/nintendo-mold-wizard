import { useEffect, useState } from 'react'
import { PHASE_LABELS, type GenerationStage } from '../model/generation'

const duration = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`
export function GenerationStatus({ message, stages }: { message: string; stages: GenerationStage[] }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  return <section className="generation-notice">
    <div className="generation-heading"><span className="eyebrow">CARTRIDGE IN PRODUCTION</span><span className="font-mono text-xs">Total {duration(Math.max(0, now - (stages[0]?.startedAt ?? now)))}</span></div>
    <p role="status" aria-live="polite">{message}</p>
    <ol className="generation-stages">{stages.map((stage, i) => <li key={`${stage.phase}-${i}`} className={stage.finishedAt ? 'complete' : 'current'} aria-current={!stage.finishedAt ? 'step' : undefined}><span className="stage-light" aria-hidden="true">{stage.finishedAt ? '✓' : '●'}</span><span>{PHASE_LABELS[stage.phase]}</span><time>{duration(Math.max(0, (stage.finishedAt ?? now) - stage.startedAt))}</time></li>)}</ol>
    <p className="generation-explainer">Live stage timing, not a percentage estimate. Code and artwork can each take several minutes. Keep this tab open; saved stages can be resumed from the gallery.</p>
  </section>
}

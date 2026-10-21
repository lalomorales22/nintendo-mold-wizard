import { useEffect, useState } from 'react'

export function GenerationStatus({ message }: { message: string }) {
  const [started] = useState(() => Date.now())
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000)
    return () => window.clearInterval(timer)
  }, [started])
  return <div className="generation-notice" role="status" aria-live="polite">
    <div className="flex flex-wrap items-center justify-between gap-3"><span>✦ {message}</span><span className="font-mono text-xs" aria-live="off">Elapsed {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}</span></div>
    <p className="mt-2 text-xs opacity-80">Each step can take several minutes. Updates appear when code, checks or artwork finish. Keep this tab open.</p>
  </div>
}

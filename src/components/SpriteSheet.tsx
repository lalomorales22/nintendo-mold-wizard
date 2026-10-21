import { useEffect, useRef, useState } from 'react'
import { apiUrl, getConfig, mutate } from '../api/generate'
import type { Cartridge } from '../model/types'
import { useStudio } from '../studio'

export function SpriteSheet({ game, close }: { game: Cartridge; close: () => void }) {
  const studio = useStudio()
  const dialog = useRef<HTMLDialogElement>(null), canvas = useRef<HTMLCanvasElement>(null)
  const [role, setRole] = useState('hero'), [direction, setDirection] = useState('down'), [walking, setWalking] = useState(true)
  const [frame, setFrame] = useState(0), [error, setError] = useState(''), [rendered, setRendered] = useState(''), [cleaning, setCleaning] = useState(false)
  const renderKey = `${game.id}:${role}:${direction}:${walking}:${frame}`
  const loaded = rendered === renderKey
  const manifest = game.assets
  const animated = manifest?.version === 'animated-v1'
  useEffect(() => { const element=dialog.current; element?.showModal(); return () => element?.close() }, [])
  useEffect(() => {
    let stopped=false, timer=0, drew=false
    const image=new Image()
    image.onload=()=> {
      if(stopped)return
      setError('')
      const render=(now:number)=> {
        const ctx=canvas.current?.getContext('2d'); if(!ctx||stopped)return
        const columns=manifest?.columns ?? 3, rows=manifest?.rows ?? 2
        let [col,row]=animated ? manifest!.actors[role] : (manifest?.slots ?? [[0,0],[1,0],[2,0],[0,1],[1,1],[2,1]])[{hero:0,enemy:1,boss:5}[role] ?? 0]
        if(animated){row+=manifest!.directions.indexOf(direction);col+=walking?[1,2,3,2][Math.floor(now/125)%4]:frame}
        const width=image.naturalWidth/columns,height=image.naturalHeight/rows
        // Export stays at the source frame resolution and keeps the alpha channel.
        if(canvas.current!.width!==width||canvas.current!.height!==height){canvas.current!.width=width;canvas.current!.height=height}
        ctx.clearRect(0,0,width,height);ctx.imageSmoothingEnabled=false
        ctx.drawImage(image,col*width,row*height,width,height,0,0,width,height)
        if(!drew){drew=true;setRendered(renderKey)}
        timer=requestAnimationFrame(render)
      }
      timer=requestAnimationFrame(render)
    }
    image.onerror=()=>{if(!stopped)setError('The sprite image could not be loaded.')}
    image.src=apiUrl('art',game.id)
    return ()=>{stopped=true;cancelAnimationFrame(timer)}
  },[game.id,manifest,role,direction,walking,frame,animated,renderKey])
  const downloadFrame=()=>canvas.current?.toBlob(blob=>{
    if(!blob)return
    const url=URL.createObjectURL(blob),link=document.createElement('a')
    link.href=url;link.download=`${game.id}-${role}-${direction}-${walking?'walk':frame}.png`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
  },'image/png')
  const clean=async()=>{
    setCleaning(true);setError('')
    try {const config=await getConfig();await mutate('clean-art',{id:game.id},config.csrf);close();await studio.generate(false,game.id)}
    catch(e){setError((e as Error).message)}finally{setCleaning(false)}
  }
  return <dialog className="sprite-dialog" ref={dialog} onCancel={e => { e.preventDefault(); if (!cleaning) close() }} aria-labelledby="sprite-title">
    <header><div><p className="eyebrow">SPRITE WORKSHOP</p><h2 id="sprite-title">{game.title}</h2></div><button className="btn-ghost" onClick={close} disabled={cleaning}>Close</button></header>
    <p className="sprite-description">{animated ? 'Four directions · idle + three walk poses · transparent PNG. The checkerboard is only a preview background.' : 'Original six-image sheet. New games use directional animation sheets. Solid sprite backdrops can be cleaned below; scenery tiles are kept.'}</p>
    <div className="sprite-workbench"><div><div className="sprite-preview"><canvas ref={canvas} aria-label={`${role} facing ${direction} animation preview`} /></div>
      <label className="label">Character<select aria-label="Character" className="input" value={role} onChange={e=>setRole(e.target.value)}>{['hero','enemy','boss'].map(r=><option key={r}>{r}</option>)}</select></label>
      {animated && <><label className="label">Direction<select aria-label="Direction" className="input" value={direction} onChange={e=>setDirection(e.target.value)}>{manifest!.directions.map(d=><option key={d}>{d}</option>)}</select></label><label className="quick-art"><input type="checkbox" checked={walking} onChange={e=>setWalking(e.target.checked)} /> Animate walking</label><label className="label">Pose<select aria-label="Pose" className="input" disabled={walking} value={frame} onChange={e=>setFrame(Number(e.target.value))}>{['Idle','Walk 1','Walk 2','Walk 3'].map((p,i)=><option key={p} value={i}>{p}</option>)}</select></label></>}
      <button className="btn-ghost" disabled={!loaded} onClick={downloadFrame}>↓ Download this frame</button>
    </div><div><div className="sprite-atlas"><img src={apiUrl('art',game.id)} alt="Complete original sprite sheet" /><div className="sprite-grid" style={{backgroundSize:`${100/(manifest?.columns??3)}% ${100/(manifest?.rows??2)}%`}} /></div><p className="sprite-description">{animated ? 'Top left: hero. Top right: enemy. Bottom left: boss. Each character block has down, left, right and up rows. Bottom right: collectible, terrain and decoration.' : 'Top: hero, enemy, collectible. Bottom: terrain, background, boss.'}</p><a className="btn-ghost" href={apiUrl('art',game.id)} download={`${game.id}-sprites.png`}>↓ Download PNG sheet</a></div></div>
    {!animated && game.owned && <div className="sprite-clean"><button className="btn-primary" disabled={cleaning||studio.busy} onClick={()=>void clean()}>{cleaning?'Cleaning backgrounds…':'Remove solid sprite backgrounds'}</button><p>Free local cleanup for flat backdrops. Keeps the previous artwork as a server revision, then tests and opens the game. Detailed scenery cannot be separated automatically.</p></div>}
    {error && <p className="error-banner" role="alert">{error}</p>}
  </dialog>
}

// Original 5×7 pixel lettering, drawn locally so the logo needs no font service.
const glyphs: Record<string, string[]> = {
  G: ['01110','10001','10000','10111','10001','10001','01110'],
  A: ['01110','10001','10001','11111','10001','10001','10001'],
  M: ['10001','11011','10101','10101','10001','10001','10001'],
  E: ['11111','10000','10000','11110','10000','10000','11111'],
  K: ['10001','10010','10100','11000','10100','10010','10001'],
  R: ['11110','10001','10001','11110','10100','10010','10001'],
  '-': ['00000','00000','00000','01110','00000','00000','00000'],
}
export function Brand() {
  return <><svg className="brand-cartridge" viewBox="0 0 40 46" aria-hidden="true"><path d="M4 1h32v5h3v34H25v5H15v-5H1V6h3Z" fill="#303536" stroke="currentColor" strokeWidth="2" /><path d="M8 5h24v23H8Z" fill="currentColor" /><path d="M17 9h6v5h5v6h-5v5h-6v-5h-5v-6h5Z" fill="#fff0d0" /><path d="M7 33h26M7 36h26" stroke="#d5c9af" strokeWidth="2" /></svg><span className="brand-lettering"><svg viewBox="0 0 59 9" role="img" aria-label="Game-Maker" shapeRendering="crispEdges">{[...'GAME-MAKER'].flatMap((letter, x) => glyphs[letter].flatMap((row, y) => [...row].flatMap((pixel, col) => pixel === '1' ? <rect key={`${x}-${y}-${col}`} x={x * 6 + col} y={y + 1} width="1" height="1" fill="currentColor" /> : [])))}</svg><small>HOMEBREW GAME SYSTEM</small></span></>
}

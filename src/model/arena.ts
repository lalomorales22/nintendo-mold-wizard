import { runGeneration, runPromptGeneration, type GenerationEvents, type GenerationService } from './generation'
import type { GamePlan, TileReference } from './plan'
import type { AiOptions, ArenaMatch, CodeProvider } from './types'

export type PlanService = GenerationService & { planGame: (prompt: string, reference: TileReference | undefined, csrf: string, key: string, options?: AiOptions) => Promise<GamePlan> }
/** Independent rounds: one failure must never discard or rerun a completed opponent. */
export async function runArena(match: ArenaMatch, apiKey: string, credentials: AiOptions, service: PlanService,
  events: (provider: CodeProvider) => GenerationEvents): Promise<Partial<Record<CodeProvider,string>>> {
  const failures: Partial<Record<CodeProvider,string>>={}
  for(const provider of ['openai','anthropic'] as const) {
    const game=match.games.find(g=>g.provider===provider)
    if(game?.state==='ready'){events(provider).onMessage('Saved · ready to play');continue}
    const options={...credentials,provider,model:match.settings[provider],arenaId:match.id}
    try {
      if(game){
        const saved=await service.getGame(game.id)
        await runGeneration({template:saved.template,apiKey,withArt:match.settings.withArt,resumeId:game.id,options},service,events(provider))
      }else await runPromptGeneration({prompt:match.prompt,apiKey,withArt:match.settings.withArt,options},service,events(provider))
    }catch(error){failures[provider]=(error as Error).message;events(provider).onMessage((error as Error).message)}
  }
  return failures
}

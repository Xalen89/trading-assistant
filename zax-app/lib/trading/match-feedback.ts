import type {Match,Pattern} from './model';
export async function persistMatchFeedback(match:Match,accepted:boolean,at:number,load:(id:string)=>Promise<Pattern>,save:(pattern:Pattern,expectedVersion:number)=>Promise<Pattern>){
  if(!match.patternId)throw new Error('This match has no uploaded reference to confirm.');
  const source=await load(match.patternId);
  if(source.id!==match.patternId||source.status!=='ready')throw new Error('A current reviewed source is required before match confirmation.');
  const evaluated=match.reference?.version;
  if(evaluated===undefined||source.version!==evaluated)throw new Error('The reference changed or lacks an immutable snapshot. Re-analyze its current version before confirming.');
  const next:Pattern={...source,version:source.version+1,feedback:[...source.feedback,{label:accepted?'confirmed match':'rejected match',note:`${match.market} ${match.timeframe} match ${match.id} reference v${evaluated}`,at}]};
  const saved=await save(next,source.version);
  return {pattern:saved,status:accepted?'confirmed' as const:'rejected' as const};
}

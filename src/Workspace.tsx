import {useEffect,useRef,useState} from 'react';
import {Folder,Target,FileDiff,X} from 'lucide-react';
import {rpc} from './api';
import {FilesPanel} from './FilesPanel';
import {GitPanel} from './GitPanel';

export function Workspace({cwd,threadId,onClose,onError,onOpenWorkspace}:{cwd:string,threadId:string|null,onClose:()=>void,onError:(s:string)=>void,onOpenWorkspace:(path:string)=>void}){
  const [tab,setTab]=useState('files'),[width,setWidth]=useState(430);const drag=useRef<{x:number,width:number}|null>(null);
  return <aside className="workspace" style={{width}}><div className="workspace-resizer" role="separator" aria-label="Resize workspace" aria-orientation="vertical" tabIndex={0} onPointerDown={e=>{drag.current={x:e.clientX,width};e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={e=>{if(drag.current)setWidth(Math.max(320,Math.min(window.innerWidth*.7,drag.current.width+drag.current.x-e.clientX)));}} onPointerUp={()=>{drag.current=null;}} onKeyDown={e=>{if(e.key==='ArrowLeft')setWidth(w=>Math.min(window.innerWidth*.7,w+20));if(e.key==='ArrowRight')setWidth(w=>Math.max(320,w-20));}}/><div className="workspace-tabs">{['files','changes','goal'].map(t=><button key={t} className={tab===t?'active':''} onClick={()=>setTab(t)}>{t==='files'?<Folder size={14}/>:t==='changes'?<FileDiff size={14}/>:<Target size={14}/>}<span>{t}</span></button>)}<button className="icon" aria-label="Close workspace" onClick={onClose}><X size={14}/></button></div>{tab==='files'?<FilesPanel cwd={cwd} onError={onError}/>:tab==='changes'?<GitPanel key={cwd} cwd={cwd} threadId={threadId} onError={onError} onOpenWorkspace={onOpenWorkspace}/>:<Goal threadId={threadId} onError={onError}/>}</aside>;
}
function Goal({threadId,onError}:{threadId:string|null,onError:(s:string)=>void}){
  const [goal,setGoal]=useState<any>(null),[objective,setObjective]=useState(''),[budget,setBudget]=useState(''),[busy,setBusy]=useState(false);
  async function load(){if(!threadId)return;try{const r=await rpc('thread/goal/get',{threadId});setGoal(r.goal);setObjective(r.goal?.objective??'');setBudget(r.goal?.tokenBudget?.toString()??'');}catch(e:any){onError(e.message);}}
  useEffect(()=>{void load();},[threadId]);
  async function save(status='active'){if(!threadId)return;setBusy(true);try{await rpc('thread/resume',{threadId,excludeTurns:true});await rpc('thread/goal/set',{threadId,origin:'user',objective,status,...budget?{tokenBudget:Number(budget)}:{}});await load();}catch(e:any){onError(e.message);}finally{setBusy(false);}}
  if(!threadId)return <p className="pad muted">Open a conversation to manage its goal.</p>;
  return <div className="goal pad"><span className="eyebrow">LONG-RUNNING WORK</span><h3>A goal for this chat</h3><p className="muted">Set an objective and optional token budget. Codex stores the goal with this thread.</p><label>Objective<textarea value={objective} onChange={e=>setObjective(e.target.value)} placeholder="What should Codex accomplish?"/></label><label>Token budget<input type="number" min="1" placeholder="No limit" value={budget} onChange={e=>setBudget(e.target.value)}/></label>{goal&&<div className="goal-state"><span className="chip">{goal.status}</span><small>{goal.tokensUsed?.toLocaleString()} tokens used · {Math.round(goal.timeUsedSeconds??0)}s</small></div>}<button className="primary" disabled={busy||!objective.trim()} onClick={()=>save()}>Save goal</button>{goal&&<button disabled={busy} onClick={()=>save(goal.status==='paused'?'active':'paused')}>{goal.status==='paused'?'Resume goal':'Pause goal'}</button>}</div>;
}

import {useEffect,useState} from 'react';
import {Search,RefreshCw,CheckCircle2,AlertCircle,ArrowUpRight,Puzzle,BookOpen,Plug,Clock,Settings,Radio,Code2} from 'lucide-react';
import {api,rpc,pretty} from './api';
import {Markdown} from './Message';
import {DesktopPreferences} from './DesktopPreferences';
import {VectorMark} from './Brand';

export function Library({page,cwd,status,onError}:{page:string,cwd:string,status:any,onError:(s:string)=>void}){
  const [data,setData]=useState<any>(null),[busy,setBusy]=useState(false),[query,setQuery]=useState(''),[error,setError]=useState('');
  async function load(){setBusy(true);setError('');try{
    let r;
    if(page==='skills')r=await rpc('skills/list',{cwds:[cwd],forceReload:true});
    else if(page==='plugins')r=await rpc('plugin/installed',{cwds:[cwd]});
    else if(page==='connections')r=await rpc('mcpServerStatus/list',{});
    else if(page==='automations')r=await api('automations');
    else if(page==='settings'){const results=await Promise.allSettled([rpc('config/read',{includeLayers:false}),rpc('account/read',{refreshToken:false}),rpc('account/rateLimits/read',{})]);r={config:results[0].status==='fulfilled'?results[0].value:null,account:results[1].status==='fulfilled'?results[1].value:null,rateLimits:results[2].status==='fulfilled'?results[2].value:null};}
    else r=status;
    setData(r);
  }catch(e:any){setError(e.message);}finally{setBusy(false);}}
  useEffect(()=>{setQuery('');setData(null);void load();},[page,cwd,status?.ready]);
  const titles:any={skills:['Skills','Instructions that make Codex work your way.'],plugins:['Plugins','Capabilities installed in your shared Codex home.'],connections:['Connections','Your configured MCP servers and available tools.'],automations:['Automations','Schedules saved by the desktop host.'],settings:['Settings','Your account and shared Codex configuration.'],sync:['Host & sync','What is shared, what is verified, and what still needs work.'],protocol:['Developer console','Access methods exposed by your installed Codex backend.']};
  const icons:any={skills:BookOpen,plugins:Puzzle,connections:Plug,automations:Clock,settings:Settings,sync:Radio,protocol:Code2};const Icon=icons[page]??Settings;
  let items:any[]=[];
  if(page==='skills')items=(data?.data??[]).flatMap((d:any)=>d.skills??[]);
  if(page==='connections')items=data?.data??[];
  if(page==='plugins')items=data?.marketplaces?.flatMap((m:any)=>m.plugins??[])??data?.plugins??data?.data??[];
  if(page==='automations')items=data?.data??[];
  const visible=items.filter(i=>pretty(i).toLowerCase().includes(query.toLowerCase()));
  return <main className="library"><div className="library-inner"><div className="library-kicker"><Icon size={17}/><span>YOUR WORKSPACE</span></div><div className="library-title"><h1>{titles[page]?.[0]}</h1><button className="icon" aria-label="Refresh" disabled={busy} onClick={load}><RefreshCw className={busy?'spin':''} size={17}/></button></div><p className="library-subtitle">{titles[page]?.[1]}</p>
    {error&&<div className="notice danger"><AlertCircle size={16}/>{error}</div>}
    {page==='sync'?<Sync status={status}/>:page==='protocol'?<Protocol methods={status?.methods??[]} onError={onError}/>:page==='settings'?<SettingsPage data={data} onSave={load} onError={onError}/>:<>
      {page==='automations'&&<div className="notice"><AlertCircle size={16}/><span>These are the host’s saved schedules. vector.dev does not run the desktop scheduler. Automations may stop when you close the host.</span></div>}
      {page==='plugins'&&<div className="notice"><Plug size={16}/><span>Local plugins and MCP tools are available through Codex. Hosted app tools and embedded app interfaces require services provided by the desktop host.</span></div>}
      <label className="library-search"><Search size={16}/><input aria-label={'Search '+page} placeholder={'Search '+page} value={query} onChange={e=>setQuery(e.target.value)}/><kbd>⌘ K</kbd></label>
      {busy&&!data?<div className="skeleton">Loading from Codex…</div>:<div className="resource-grid">{visible.map((item:any,i:number)=><Resource key={item.id??item.name??i} item={item} page={page} onError={onError} onChange={load}/>)}</div>}
      {!busy&&!error&&!visible.length&&<div className="empty-resource">No {page} found in this backend.{data&&<details><summary>Backend response</summary><pre>{pretty(data)}</pre></details>}</div>}
    </>}
    <div className="library-footer"><span className="live-dot"/>Connected to your local Codex installation<span>vector.dev · 0.2.0</span></div></div></main>;
}
function Resource({item:i,page,onError,onChange}:{item:any,page:string,onError:(s:string)=>void,onChange:()=>void}){
  const [expanded,setExpanded]=useState(false),[content,setContent]=useState('');
  const name=i.displayName??i.name??i.id??i.path??'Resource';
  async function inspect(){setExpanded(!expanded);if(!expanded&&page==='skills'&&i.path){try{const r=await rpc('fs/readFile',{path:i.path});const bytes=Uint8Array.from(atob(r.dataBase64),c=>c.charCodeAt(0));setContent(new TextDecoder().decode(bytes));}catch(e:any){onError(e.message);}}}
  async function login(){try{const r=await rpc('mcpServer/oauth/login',{name:i.name});if(r.authorizationUrl)window.open(r.authorizationUrl,'_blank','noopener');onChange();}catch(e:any){onError(e.message);}}
  return <article className={'resource '+(expanded?'expanded':'')}><button className="resource-top" onClick={inspect}><span className="resource-icon">{page==='skills'?<BookOpen size={19}/>:page==='plugins'?<Puzzle size={19}/>:page==='connections'?<Plug size={19}/>:<Clock size={19}/>}</span><span className="resource-main"><strong>{name}</strong><span>{i.description??(i.tools?`${Object.keys(i.tools).length} tools available`:i.path??i.id)}</span></span><ArrowUpRight size={15}/></button>{(i.enabled!==undefined||i.authStatus)&&<div className="resource-meta"><span className={'chip '+(i.enabled===false?'':'green')}>{i.enabled===false?'Disabled':i.authStatus??'Enabled'}</span>{page==='connections'&&i.authStatus==='notLoggedIn'&&<button onClick={login}>Connect account</button>}</div>}{expanded&&<div className="resource-detail">{content?<Markdown text={content}/>:<pre>{i.toml??pretty(i)}</pre>}</div>}</article>;
}
function SettingsPage({data,onSave,onError}:{data:any,onSave:()=>void,onError:(s:string)=>void}){
  const c=data?.config?.config??{};const account=data?.account?.account;
  async function set(keyPath:string,value:unknown){try{await rpc('config/value/write',{keyPath,value,mergeStrategy:'replace'});onSave();}catch(e:any){onError(e.message);}}
  return <div className="settings-list"><section><h3>Account</h3><div className="setting-row"><div><strong>{account?.email??'Loading account…'}</strong><p>{account?.planType??account?.type??'Codex authentication'}</p></div><span className="chip green">Shared sign-in</span></div><p className="muted">Uses the existing Codex sign-in. Authentication tokens stay in Codex.</p></section><section><h3>Agent defaults</h3><label className="setting-row"><div><strong>Model</strong><p>Default model in the shared configuration</p></div><input aria-label="Default model" key={c.model} defaultValue={c.model??''} onBlur={e=>{if(e.target.value&&e.target.value!==c.model)void set('model',e.target.value);}}/></label><label className="setting-row"><div><strong>Reasoning effort</strong><p>Depth of reasoning for new conversations</p></div><select value={c.model_reasoning_effort??'high'} onChange={e=>set('model_reasoning_effort',e.target.value)}>{['low','medium','high','xhigh','max','ultra'].map(v=><option key={v}>{v}</option>)}</select></label></section><section><h3>Usage</h3><pre>{data?.rateLimits?pretty(data.rateLimits):'Usage is unavailable for this account.'}</pre></section><DesktopPreferences onError={onError}/><section><h3>Desktop services</h3><p className="muted">Browser and computer control, voice, cloud chats, Spaces, and the host automation scheduler have separate integrations. Full replacement coverage is tracked in Host & sync.</p></section></div>;
}
function Sync({status}:{status:any}){
  const rows=[
    ['Local chat identity & history','Shared','Original thread IDs and Codex persistence; no transcript import.'],
    ['Host project names & membership','Read from host','Legacy project state is projected every 5 seconds.'],
    ['Host pins, unread markers & order','Read from host','Reads local sidebar state; exact rendering still needs comparison.'],
    ['Rename, archive & restore','Implemented','Uses native app-server mutations.'],
    ['Chat, streaming, approvals & steering','Implemented','Run by an independent local Codex process.'],
    ['Files, terminal, Git changes & review','Implemented','Editor drafts, save previews, backups, branch/worktree and GitHub controls.'],
    ['Conversation recovery & drafts','Implemented','Private local draft storage, restored tabs, stream reconnection and backend restart.'],
    ['Desktop notifications','Implemented','Optional background alerts; conversation titles hidden by default.'],
    ['Local skills, plugins & MCP servers','Implemented','Uses the existing configuration; availability varies by service.'],
    ['Moving projects, pins & read state back to host','Blocked','This host has not migrated sidebar writes to the backend.'],
    ['Simultaneous control of host turns','Not supported','A thread owned by another running process may reject resume.'],
    ['Cloud & remote chats, Spaces & hosted app tools','Missing','Separate desktop or cloud services are required.'],
    ['Voice, native browser & computer control','Missing','No replacement for the host’s native services is implemented.'],
    ['Automations while the host is closed','Missing','Saved schedules can be inspected; a scheduler is still needed.'],
    ['Access from a phone or another device','Missing','This build listens on this Mac only.'],
  ];
  return <><div className="sync-overview"><div className="sync-logo"><VectorMark/></div><div><strong>{status?.ready?'Your local Codex backend is connected':'Connecting to Codex'}</strong><p>Replacement in development · full desktop parity is incomplete</p></div><span className={'chip '+(status?.ready?'green':'')}>{status?.ready?'Online':'Starting'}</span></div><div className="notice"><AlertCircle size={16}/><span>Keep the host installed. vector.dev cannot yet replace every desktop feature or guarantee exact two-way sidebar sync.</span></div><div className="parity-table">{rows.map(([name,state,detail])=><div className="parity-row" key={name}><div>{['Shared','Read from host','Implemented'].includes(state)?<CheckCircle2 size={16}/>:<AlertCircle size={16}/>}<strong>{name}</strong><p>{detail}</p></div><span className={'chip '+(['Shared','Read from host'].includes(state)?'green':'')}>{state}</span></div>)}</div><details className="backend-info"><summary>Backend details</summary><pre>{pretty({binary:status?.binary,home:status?.home,version:status?.info?.userAgent,methods:status?.methods?.length})}</pre></details></>;
}
function Protocol({methods,onError}:{methods:string[],onError:(s:string)=>void}){
  const [method,setMethod]=useState('thread/list'),[params,setParams]=useState('{}'),[result,setResult]=useState(''),[busy,setBusy]=useState(false);
  async function run(){try{const p=JSON.parse(params);if(!/\/(list|read|get)$|^getConversationSummary$|^getAuthStatus$/.test(method)&&!confirm(`Run ${method} with these parameters? This can change real Codex state.`))return;setBusy(true);setResult(pretty(await rpc(method,p)));}catch(e:any){onError(e.message);setResult(e.message);}finally{setBusy(false);}}
  return <div className="protocol"><div className="notice"><Code2 size={16}/><span>Advanced controls for the installed protocol. These calls operate on your real files and conversations.</span></div><label>Method<select value={method} onChange={e=>setMethod(e.target.value)}>{methods.map(m=><option key={m}>{m}</option>)}</select></label><label>Parameters (JSON)<textarea value={params} onChange={e=>setParams(e.target.value)} spellCheck={false}/></label><button className="primary" disabled={busy} onClick={run}>{busy?'Running…':'Run method'}</button>{result&&<pre>{result}</pre>}</div>;
}

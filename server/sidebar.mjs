import {readFile} from 'node:fs/promises';
import {join,sep} from 'node:path';
import {createHash} from 'node:crypto';

export function projectSidebar(threads,state={},nativeProjects=[]){
  const atom=state['electron-persisted-atom-state']??{};
  const legacy=Object.values(state['local-projects']??{});
  const mappings=Object.values(state['app-server-project-id-by-legacy-project-id-by-host']??{}).reduce((a,v)=>({...a,...v}),{});
  const order=(atom['unified-sidebar-project-order-v1']??state['project-order']??[]).map(id=>id.replace(/^codex:project:/,''));
  const nativeById=new Map(nativeProjects.map(p=>[p.id,p]));
  const projects=legacy.map(p=>({...p,nativeId:mappings[p.id]??null,source:'host',roots:p.rootPaths??[],...{native:nativeById.get(mappings[p.id])}}));
  for(const p of nativeProjects)if(!projects.some(x=>x.nativeId===p.id))projects.push({...p,nativeId:p.id,source:'backend',roots:(p.roots??[]).map(r=>r.path)});
  projects.sort((a,b)=>{const ai=order.indexOf(a.id),bi=order.indexOf(b.id);return(ai<0?1e6:ai)-(bi<0?1e6:bi)||(b.createdAt??0)-(a.createdAt??0);});
  const byId=new Map(projects.flatMap(p=>[[p.id,p],[p.nativeId,p]]));
  const projectless=new Set(state['projectless-thread-ids']??[]);
  const pins=new Set(state['pinned-thread-ids']??[]);
  const readState=state['electron-thread-read-state-v1']??{};
  const unread=new Set(Object.values(readState.unreadByIdentity??{}).flatMap(v=>Object.entries(v).filter(([k])=>k.startsWith('local')).flatMap(([,ids])=>ids)));
  const migration=Object.values(state['app-server-projects-migration-by-host']??{});
  const nativeMembership=migration.length>0&&migration.every(m=>m.threadAssignmentsReadMigrated===true);
  const groups=new Map(projects.map(p=>[p.id,[]]));const ungrouped=[];
  for(const t of threads){
    const a=state['thread-project-assignments']?.[t.id];
    let p=null;
    if(nativeMembership)p=byId.get(t.projectId);
    else if(a?.projectKind==='local')p=byId.get(a.projectId);
    else if(!projectless.has(t.id)){
      p=byId.get(t.projectId);
      if(!p)p=projects.flatMap(p=>p.roots.filter(r=>t.cwd===r||t.cwd?.startsWith(r+sep)).map(r=>({p,length:r.length}))).sort((a,b)=>b.length-a.length||(a.p.createdAt??0)-(b.p.createdAt??0))[0]?.p;
    }
    const row={...t,turns:undefined,preview:t.preview?.slice(0,400),pinned:pins.has(t.id),unread:unread.has(t.id),sidebarProjectId:p?.id??null};
    (p?groups.get(p.id):ungrouped).push(row);
  }
  const sort=(a,b)=>(b.recencyAt??b.updatedAt)-(a.recencyAt??a.updatedAt)||a.id.localeCompare(b.id);
  const mappedProjects=projects.map(({native,...p})=>{
    const ids=state['sidebar-project-thread-orders']?.[p.id]?.threadIds??[];
    const threads=groups.get(p.id).sort((a,b)=>{const ai=ids.indexOf(a.id),bi=ids.indexOf(b.id);if(ai>=0||bi>=0)return(ai<0?1e6:ai)-(bi<0?1e6:bi);return sort(a,b);});
    return {...p,threads,hostExpanded:atom[`sidebar-project-expanded-v1-codex:${p.id}`]!==false};
  });
  const all=[...mappedProjects.flatMap(p=>p.threads),...ungrouped];
  return {projects:mappedProjects,ungrouped:ungrouped.sort(sort),pinned:all.filter(t=>t.pinned),counts:{threads:threads.length,projects:projects.length},sync:{nativeMembership,mode:'shared-local-history',hostSidebar:'read-only',remoteAndCloudChats:false,intervalMs:5000}};
}
export async function readSidebar(rpc,home,{archived=false}={}){
  const [threads,state,projects]=await Promise.all([
    rpc.list('thread/list',{archived,sortKey:'updated_at',sourceKinds:['cli','vscode','appServer','unknown'],useStateDbOnly:false}),
    readFile(join(home,'.codex-global-state.json'),'utf8').then(JSON.parse).catch(e=>{if(e.code==='ENOENT')return {};throw e;}),
    rpc.list('project/list',{}).catch(()=>[])
  ]);
  const sidebar=projectSidebar(threads,state,projects);
  sidebar.revision=createHash('sha256').update(JSON.stringify(sidebar)).digest('hex').slice(0,20);
  return {...sidebar,checkedAt:Date.now(),archived};
}

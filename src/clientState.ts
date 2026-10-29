import {useEffect,useRef,useState} from 'react';
import {api} from './api';
type Draft={text:string,attachments:any[],revision:string|null};
export function useClientState(onError:(s:string)=>void){
  const [initial,setInitial]=useState<any>(null),[saveState,setSaveState]=useState('loading');
  const revisions=useRef<Record<string,string|null>>({}),desired=useRef(new Map<string,{text:string,attachments:any[],serial:number}>()),writing=useRef(new Map<string,Promise<void>>()),blocked=useRef(new Set<string>()),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),serial=useRef(0);
  useEffect(()=>{api('client-state').then(s=>{for(const [key,d]of Object.entries(s.drafts) as [string,Draft][])revisions.current[key]=d.revision;setInitial(s);setSaveState('saved');}).catch(e=>{setSaveState('error');onError(e.message);});},[]);
  function persistDraft(key:string,text:string,attachments:any[]){desired.current.set(key,{text,attachments,serial:++serial.current});if(!blocked.current.has(key))setSaveState('saving');clearTimeout(timer.current);timer.current=setTimeout(()=>{for(const k of desired.current.keys())void flush(k).catch(()=>{});},300);}
  async function flush(key:string):Promise<void>{
    if(blocked.current.has(key))throw new Error('Resolve the draft conflict before sending this conversation.');
    const existing=writing.current.get(key);if(existing)return existing;
    const operation=(async()=>{while(desired.current.has(key)){
      const d=desired.current.get(key)!;
      try{const r=await api('client-state',{draft:{key,text:d.text,attachments:d.attachments,expectedRevision:revisions.current[key]??null}});revisions.current[key]=r.drafts[key].revision;if(desired.current.get(key)?.serial===d.serial)desired.current.delete(key);}
      catch(e:any){blocked.current.add(key);setSaveState('conflict');onError(e.message);throw e;}
    }})().finally(()=>{writing.current.delete(key);if(!desired.current.size&&!blocked.current.size)setSaveState('saved');});
    writing.current.set(key,operation);return operation;
  }
  async function saveNow(key:string,text:string,attachments:any[]){persistDraft(key,text,attachments);await flush(key);}
  async function reloadDraft(key:string){const s=await api('client-state');const d=s.drafts[key]??{text:'',attachments:[],revision:null};revisions.current[key]=d.revision;desired.current.delete(key);blocked.current.delete(key);setSaveState('saved');return d;}
  useEffect(()=>{const warn=(e:BeforeUnloadEvent)=>{if(desired.current.size||writing.current.size){e.preventDefault();e.returnValue='';}};const flushAll=()=>{for(const key of desired.current.keys())void flush(key).catch(()=>{});};window.addEventListener('beforeunload',warn);window.addEventListener('blur',flushAll);return()=>{window.removeEventListener('beforeunload',warn);window.removeEventListener('blur',flushAll);flushAll();clearTimeout(timer.current);};},[]);
  return{initial,saveState,persistDraft,saveNow,reloadDraft,saveSession:(session:any)=>api('client-state',{session})};
}

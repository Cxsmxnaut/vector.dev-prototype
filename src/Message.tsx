import {useMemo} from 'react';
import {marked} from 'marked';
import DOMPurify from 'dompurify';
import {ChevronRight,Terminal,FileDiff,Wrench,Globe,Brain,Copy,Check,Image as ImageIcon} from 'lucide-react';
import {useState} from 'react';
import {pretty} from './api';
import {VectorMark} from './Brand';
import type {Item} from './events';

export function Markdown({text}:{text:string}){
  const html=useMemo(()=>DOMPurify.sanitize(marked.parse(text??'',{async:false}) as string,{ADD_ATTR:['target'],FORBID_TAGS:['style','form','input','iframe','video','audio'],FORBID_ATTR:['style']}),[text]);
  return <div className="markdown" onClick={e=>{const a=(e.target as HTMLElement).closest('a');if(a){const u=a.getAttribute('href')??'';if(!/^(https?:|mailto:|\/)/.test(u))e.preventDefault();else{a.target='_blank';a.rel='noopener noreferrer';}}}} dangerouslySetInnerHTML={{__html:html}}/>;
}
function CopyButton({text}:{text:string}){const [done,setDone]=useState(false);return <button className="icon copy" aria-label="Copy message" onClick={()=>{navigator.clipboard.writeText(text).then(()=>{setDone(true);setTimeout(()=>setDone(false),1500);});}}>{done?<Check size={14}/>:<Copy size={14}/>}</button>;}
function Media({path}:{path:string}){return <a href={'/api/asset?path='+encodeURIComponent(path)} target="_blank" rel="noreferrer"><img className="generated-image" src={'/api/asset?path='+encodeURIComponent(path)} alt="Generated or attached image"/></a>;}
export function Message({item}:{item:Item}){
  if(item.type==='userMessage')return <article className="message user"><div className="avatar">You</div><div className="message-body">{(item.content??[]).map((c:any,i:number)=>c.type==='text'?<div className="user-text" key={i}>{c.text}</div>:c.type==='localImage'?<Media path={c.path} key={i}/>:c.type==='image'?<span className="chip" key={i}><ImageIcon size={13}/>Image attachment</span>:<pre key={i}>{pretty(c)}</pre>)}</div></article>;
  if(item.type==='agentMessage')return <article className={'message assistant '+(item.phase==='commentary'?'commentary':'')}><div className="avatar mark"><VectorMark/></div><div className="message-body"><Markdown text={item.text??''}/><CopyButton text={item.text??''}/></div></article>;
  if(item.type==='reasoning')return <details className="tool reasoning"><summary><Brain size={14}/><span>Reasoning</span><ChevronRight size={13}/></summary><Markdown text={[...(item.summary??[]),...(item.content??[])].join('\n\n')}/></details>;
  if(item.type==='plan')return <div className="plan"><span className="eyebrow">PLAN</span><Markdown text={item.text??''}/></div>;
  if(item.type==='imageView'||item.type==='imageGeneration')return <div className="image-item">{item.path||item.savedImagePath?<Media path={item.path??item.savedImagePath}/>:<pre>{pretty(item)}</pre>}</div>;
  const icons:any={commandExecution:Terminal,fileChange:FileDiff,webSearch:Globe};const Icon=icons[item.type]??Wrench;
  const label=item.type==='commandExecution'?item.command:item.type==='fileChange'?`${item.changes?.length??0} file changes`:item.type==='mcpToolCall'?`${item.server} / ${item.tool}`:item.tool??item.type.replace(/([A-Z])/g,' $1');
  return <details className={'tool '+(item.status==='inProgress'?'running':'')}><summary><Icon size={14}/><span className="truncate">{label}</span>{item.status&&<small>{item.status}</small>}<ChevronRight size={13}/></summary>{item.type==='commandExecution'?<pre>{item.aggregatedOutput??'Waiting for output…'}</pre>:item.type==='fileChange'?item.changes?.map((c:any,i:number)=><div key={i}><div className="file-name">{c.path}</div><pre className="diff">{c.diff??pretty(c)}</pre></div>):<pre>{pretty(item)}</pre>}</details>;
}

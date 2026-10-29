import {useEffect,useRef,useState} from 'react';
import {Terminal as XTerm} from '@xterm/xterm';
import {FitAddon} from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import {Play,Square,RotateCcw} from 'lucide-react';
import {rpc,encode} from './api';

export function TerminalPanel({cwd,onError}:{cwd:string,onError:(s:string)=>void}){
  const element=useRef<HTMLDivElement>(null),term=useRef<XTerm|null>(null),processId=useRef<string|null>(null),fit=useRef<FitAddon|null>(null);
  const [running,setRunning]=useState(false);
  useEffect(()=>{
    const t=new XTerm({fontFamily:'SFMono-Regular, Menlo, monospace',fontSize:12,theme:{background:'#101212',foreground:'#d6ddd9',cursor:'#a3c9b2'},cursorBlink:true,scrollback:5000,convertEol:true});
    const f=new FitAddon();t.loadAddon(f);term.current=t;fit.current=f;t.open(element.current!);f.fit();t.writeln('\x1b[90mStart a shell to work in this folder.\x1b[0m');
    const input=t.onData(data=>{if(processId.current)rpc('process/writeStdin',{processHandle:processId.current,deltaBase64:encode(data)}).catch(e=>onError(e.message));});
    const resize=t.onResize(size=>{if(processId.current)rpc('process/resizePty',{processHandle:processId.current,size:{rows:size.rows,cols:size.cols}}).catch(()=>{});});
    const observer=new ResizeObserver(()=>{try{f.fit();}catch{}});observer.observe(element.current!);
    const listener=(event:Event)=>{const m=(event as CustomEvent).detail;if(m.params?.processHandle!==processId.current)return;if(m.method==='process/outputDelta')t.write(Uint8Array.from(atob(m.params.deltaBase64),c=>c.charCodeAt(0)));if(m.method==='process/exited'){processId.current=null;setRunning(false);t.writeln('\r\n\x1b[90mShell exited.\x1b[0m');}};
    window.addEventListener('codex-event',listener);
    return()=>{window.removeEventListener('codex-event',listener);observer.disconnect();input.dispose();resize.dispose();t.dispose();if(processId.current)rpc('process/kill',{processHandle:processId.current}).catch(()=>{});};
  },[]);
  async function start(){
    const id=crypto.randomUUID();processId.current=id;setRunning(true);term.current?.clear();term.current?.focus();
    try{await rpc('process/spawn',{command:['/bin/zsh','-l'],cwd,processHandle:id,tty:true,timeoutMs:null,size:{cols:term.current?.cols??100,rows:term.current?.rows??20}});}
    catch(e:any){onError(e.message);term.current?.writeln('\r\n'+e.message);if(processId.current===id){processId.current=null;setRunning(false);}}
  }
  return <div className="terminal-panel"><div className="panel-bar"><span className="eyebrow">HOST TERMINAL</span><span className="truncate muted">{cwd}</span><div className="spacer"/>{running?<button className="icon" aria-label="Stop shell" onClick={()=>rpc('process/kill',{processHandle:processId.current}).catch(e=>onError(e.message))}><Square size={13}/></button>:<button className="text-button" onClick={start}><Play size={12}/>Start shell</button>}<button className="icon" aria-label="Clear terminal" onClick={()=>term.current?.clear()}><RotateCcw size={13}/></button></div><div className="terminal-surface" ref={element}/></div>;
}

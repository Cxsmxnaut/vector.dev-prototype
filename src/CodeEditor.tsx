import CodeMirror from '@uiw/react-codemirror';
import {javascript} from '@codemirror/lang-javascript';
import {json} from '@codemirror/lang-json';
import {python} from '@codemirror/lang-python';
import {html} from '@codemirror/lang-html';
import {css} from '@codemirror/lang-css';
import {markdown} from '@codemirror/lang-markdown';
import {EditorView} from '@codemirror/view';
import {useMemo} from 'react';
const theme=EditorView.theme({'&':{height:'100%',backgroundColor:'#13200f',fontSize:'12px'},'.cm-scroller':{fontFamily:'SFMono-Regular, Menlo, monospace'},'.cm-gutters':{backgroundColor:'#182914',color:'#6f8f60',border:0},'.cm-activeLine':{backgroundColor:'#253b1c'},'.cm-activeLineGutter':{backgroundColor:'#253b1c'},'&.cm-focused':{outline:'none'}});
export function CodeEditor({path,text,onChange}:{path:string,text:string,onChange:(text:string)=>void}){
  const extensions=useMemo(()=>{const ext=path.split('.').at(-1)?.toLowerCase();const lang=['js','jsx','ts','tsx','mjs','cjs'].includes(ext??'')?javascript({jsx:true,typescript:ext==='ts'||ext==='tsx'}):ext==='json'?json():ext==='py'?python():ext==='html'||ext==='svelte'?html():ext==='css'?css():ext==='md'?markdown():null;return[theme,EditorView.contentAttributes.of({'aria-label':'File contents'}),...lang?[lang]:[]];},[path]);
  return <CodeMirror aria-label="File contents" value={text} height="100%" theme="dark" extensions={extensions} onChange={onChange} basicSetup={{lineNumbers:true,foldGutter:true,highlightActiveLine:true,searchKeymap:true,autocompletion:true}}/>;
}

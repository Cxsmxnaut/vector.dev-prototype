export async function api(path:string,body?:unknown):Promise<any>{
  const r=await fetch('/api/'+path,{credentials:'same-origin',...(body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});
  let data;try{data=await r.json();}catch{throw new Error(r.status===401?'Your local connection expired. Reopen the private connection link.':`Request failed (${r.status})`);}
  if(!r.ok||data.error)throw new Error(data.error??`Request failed (${r.status})`);return data;
}
export async function rpc(method:string,params:unknown={}){return(await api('rpc',{method,params})).result;}
export const encode=(value:string)=>{const bytes=new TextEncoder().encode(value);let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(text);};
export const decode=(value:string)=>new TextDecoder().decode(Uint8Array.from(atob(value),c=>c.charCodeAt(0)));
export const pretty=(v:unknown)=>typeof v==='string'?v:JSON.stringify(v,null,2);

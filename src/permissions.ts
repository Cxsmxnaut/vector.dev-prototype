export function agentPolicy(mode:string,existing:boolean){
  if(existing&&mode==='inherit')return{};
  if(!['inherit','read-only','workspace-write','danger-full-access'].includes(mode))throw new Error('Unknown permission mode');
  return{sandbox:mode==='inherit'?'workspace-write':mode,approvalPolicy:'untrusted'};
}

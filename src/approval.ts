export function approvalDecision(request:any,accept:boolean){
  if(request.method==='execCommandApproval'||request.method==='applyPatchApproval')return{decision:accept?'approved':'denied'};
  const choices=request.params?.availableDecisions;
  if(accept&&Array.isArray(choices)&&!choices.includes('accept'))throw new Error('This request does not offer a one-time approval.');
  return{decision:accept?'accept':Array.isArray(choices)&&!choices.includes('decline')?'cancel':'decline'};
}
export function permissionChoices(profile:any){const result:any[]=[];if(profile?.network?.enabled===true)result.push({key:'network',label:'Network access',kind:'network',value:profile.network});for(const kind of ['read','write','entries'])for(const [i,value]of(profile?.fileSystem?.[kind]??[]).entries())result.push({key:kind+':'+i,label:kind==='entries'?JSON.stringify(value):`${kind==='read'?'Read':'Write'}: ${value}`,kind,value});return result;}
export function selectedPermissions(profile:any,keys:string[]){const selected=new Set(keys),permissions:any={};for(const choice of permissionChoices(profile)){if(!selected.has(choice.key))continue;if(choice.kind==='network')permissions.network={...choice.value};else{permissions.fileSystem??={read:null,write:null,...profile.fileSystem.globScanMaxDepth!==undefined?{globScanMaxDepth:profile.fileSystem.globScanMaxDepth}:{}};permissions.fileSystem[choice.kind]??=[];permissions.fileSystem[choice.kind].push(choice.value);}}return{permissions,scope:'turn'};}

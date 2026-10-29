export type Item={id:string,type:string,[key:string]:any};
export type Turn={id:string,items:Item[],status:string,error?:any,[key:string]:any};
export function applyThreadEvent(turns:Turn[],event:any):Turn[]{
  const p=event.params??{},m=event.method;
  if(m==='turn/started'||m==='turn/completed'){
    const existing=turns.find(t=>t.id===p.turn.id);
    const turn={...existing,...p.turn,items:p.turn.items?.length?p.turn.items:existing?.items??[]};
    return existing?turns.map(t=>t.id===turn.id?turn:t):[...turns,turn];
  }
  if(!p.turnId)return turns;
  const tid=p.turnId;let updated=turns.some(t=>t.id===tid)?turns:[...turns,{id:tid,items:[],status:'inProgress'}];
  return updated.map(t=>{
    if(t.id!==tid)return t;
    let items=[...t.items];
    if((m==='item/started'||m==='item/completed')&&p.item){const index=items.findIndex(i=>i.id===p.item.id);if(index<0)items.push(p.item);else items[index]={...items[index],...p.item};}
    else if(m==='item/agentMessage/delta'||m==='item/commandExecution/outputDelta'||m==='item/reasoning/summaryTextDelta'){
      let i=items.findIndex(x=>x.id===p.itemId);if(i<0){items.push({id:p.itemId,type:m.includes('agentMessage')?'agentMessage':m.includes('reasoning')?'reasoning':'commandExecution'});i=items.length-1;}
      const item={...items[i]};if(m.includes('agentMessage'))item.text=(item.text??'')+p.delta;
      else if(m.includes('reasoning')){const n=p.summaryIndex??0;item.summary=[...(item.summary??[])];item.summary[n]=(item.summary[n]??'')+p.delta;}
      else item.aggregatedOutput=(item.aggregatedOutput??'')+p.delta;
      items[i]=item;
    }else return t;
    return{...t,items};
  });
}

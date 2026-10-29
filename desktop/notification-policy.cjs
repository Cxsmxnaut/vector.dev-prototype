function notificationSpec(event,settings,{focused=false,threadName}={}){
  const test=event.method==='vector/notificationTest',complete=event.method==='turn/completed',input=event.id!==undefined&&!!event.method;
  if(!settings.notifications||(!test&&focused)||(!test&&!complete&&!input))return null;
  const title=test?'vector.dev notifications':input?'Codex needs your input':event.params?.turn?.status==='failed'?'Codex task failed':event.params?.turn?.status==='interrupted'?'Codex task interrupted':'Codex finished';
  return{title,body:test?'Notifications are enabled for this Mac app.':settings.notificationPreview&&threadName?threadName:'Open vector.dev to view the conversation.',threadId:event.params?.threadId,key:complete?event.params?.turn?.id:input?'request:'+event.id:null};
}
module.exports={notificationSpec};

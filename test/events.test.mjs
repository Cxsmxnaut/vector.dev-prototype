import test from 'node:test';
import assert from 'node:assert/strict';
import {applyThreadEvent} from '../src/events.ts';
test('streamed text survives a metadata-only turn completion and is not duplicated',()=>{
  let turns=applyThreadEvent([],{method:'turn/started',params:{turn:{id:'t',items:[],status:'inProgress'}}});
  turns=applyThreadEvent(turns,{method:'item/agentMessage/delta',params:{turnId:'t',itemId:'i',delta:'Hello '}});
  turns=applyThreadEvent(turns,{method:'item/agentMessage/delta',params:{turnId:'t',itemId:'i',delta:'world'}});
  turns=applyThreadEvent(turns,{method:'item/completed',params:{turnId:'t',item:{id:'i',type:'agentMessage',text:'Hello world'}}});
  turns=applyThreadEvent(turns,{method:'turn/completed',params:{turn:{id:'t',items:[],status:'completed'}}});
  assert.equal(turns[0].items.length,1);assert.equal(turns[0].items[0].text,'Hello world');assert.equal(turns[0].status,'completed');
});
test('late notifications create missing turns and append output without mutating prior state',()=>{const original=[{id:'a',items:[],status:'completed'}];const result=applyThreadEvent(original,{method:'item/commandExecution/outputDelta',params:{turnId:'b',itemId:'cmd',delta:'out'}});assert.equal(original.length,1);assert.equal(result[1].items[0].aggregatedOutput,'out');});
test('reasoning summaries preserve separate chunks',()=>{let r=applyThreadEvent([],{method:'item/reasoning/summaryTextDelta',params:{turnId:'t',itemId:'r',summaryIndex:1,delta:'Second'}});r=applyThreadEvent(r,{method:'item/reasoning/summaryTextDelta',params:{turnId:'t',itemId:'r',summaryIndex:0,delta:'First'}});assert.deepEqual(r[0].items[0].summary,['First','Second']);});

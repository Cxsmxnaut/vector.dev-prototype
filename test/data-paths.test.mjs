import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {clientDataDir} from '../server/data-paths.mjs';
test('the rebrand preserves existing local data without overwriting or moving it',async()=>{
  const home=await mkdtemp(join(tmpdir(),'vector-data-'));
  try{assert.equal(clientDataDir(home),join(home,'vector.dev'));await mkdir(join(home,'happier-clone'));assert.equal(clientDataDir(home),join(home,'happier-clone'));await mkdir(join(home,'vector.dev'));assert.equal(clientDataDir(home),join(home,'vector.dev'));}finally{await rm(home,{recursive:true,force:true});}
});

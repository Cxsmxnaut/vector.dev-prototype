import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {findCodex,protocolMethods} from '../server/rpc.mjs';
await promisify(execFile)(findCodex(),['app-server','generate-ts','--experimental','--out',fileURLToPath(new URL('../protocol/',import.meta.url))],{maxBuffer:8*1024*1024});
const methods=protocolMethods();
await writeFile(new URL('../server/methods.json',import.meta.url),JSON.stringify(methods,null,2)+'\n');
console.log(`Updated the local protocol references and ${methods.length} backend methods.`);

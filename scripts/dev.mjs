import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const build=spawn(process.execPath,[fileURLToPath(new URL('../node_modules/vite/bin/vite.js',import.meta.url)),'build','--watch'],{cwd:root,stdio:'inherit'});
const server=spawn(process.execPath,['--watch',fileURLToPath(new URL('../server/main.mjs',import.meta.url))],{cwd:root,stdio:'inherit'});
let stopping=false;function stop(){if(stopping)return;stopping=true;build.kill();server.kill();}
for(const child of [build,server]){child.on('error',e=>{console.error(e.message);stop();process.exitCode=1;});child.on('exit',code=>{if(!stopping){process.exitCode=code??1;stop();}});}
process.on('SIGINT',stop);process.on('SIGTERM',stop);

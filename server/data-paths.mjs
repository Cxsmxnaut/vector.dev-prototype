import {existsSync} from 'node:fs';
import {join} from 'node:path';

// Retain access to private drafts/backups from builds preceding the rebrand.
export function clientDataDir(home){
  const current=join(home,'vector.dev');
  const legacy=join(home,'happier-clone');
  return !existsSync(current)&&existsSync(legacy)?legacy:current;
}

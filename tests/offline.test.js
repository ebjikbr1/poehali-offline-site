import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import vm from 'node:vm';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
test('offline cache includes every file needed at installation',()=>{
  const worker=readFileSync(resolve(root,'sw.js'),'utf8');
  const files=vm.runInNewContext(`${worker}\nfiles`,{self:{addEventListener(){}}});
  for(const file of files)assert.ok(existsSync(resolve(root,file)),`Missing cached file: ${file}`);
  assert.ok(files.includes('poehali.html'));
  assert.ok(files.includes('poehali.webmanifest'));
  const standalone=readFileSync(resolve(root,'poehali.html'),'utf8');
  assert.match(standalone,/serviceWorker\.register\('\.\/sw\.js'\)/);
});

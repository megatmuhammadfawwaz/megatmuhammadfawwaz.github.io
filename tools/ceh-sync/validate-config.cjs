'use strict';
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const sandbox={window:{}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../ceh/sync-config.js'),'utf8'),sandbox,{timeout:1000});
const config=sandbox.window.CEH_SYNC_CONFIG || {};
if(!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(config.url || '')) {
  throw new Error('CEH online progress is not configured. Set the Supabase project URL before publishing.');
}
let publicKey=/^sb_publishable_[A-Za-z0-9_-]+$/.test(config.publishableKey || '');
if(!publicKey) {
  try {publicKey=JSON.parse(Buffer.from(config.publishableKey.split('.')[1],'base64url')).role==='anon';} catch {}
}
if(!publicKey) throw new Error('Use only a Supabase publishable key or legacy anon key. Secret/service-role keys are forbidden.');
console.log('CEH public configuration validated. Confirm schema and Auth redirect settings before deploying.');

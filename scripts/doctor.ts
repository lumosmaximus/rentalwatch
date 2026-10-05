import {readFile} from 'node:fs/promises';
import {createClient} from '@supabase/supabase-js';
const keys=['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','INGESTION_ALLOWED_HOSTS','RESEND_API_KEY','ALERT_FROM','APP_URL'];
async function loadEnv(){for(const path of ['.env.local','.env.worker']){try{const text=await readFile(path,'utf8');for(const line of text.split(/\r?\n/)){const match=line.match(/^([A-Z_]+)=(.*)$/);if(match&&keys.includes(match[1])&&!process.env[match[1]])process.env[match[1]]=match[2].trim().replace(/^['"]|['"]$/g,'')}}catch{}}}
async function main(){await loadEnv();let missing=0;for(const key of ['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','INGESTION_ALLOWED_HOSTS']){const set=!!process.env[key];console.log(`${set?'READY':'NEEDED'}: ${key}`);if(!set)missing++}console.log(process.env.RESEND_API_KEY?'Email provider configured; sender verification and delivery still need a live test.':'Email is optional; in-app notifications do not require an email provider.');
 if(missing){console.log('Follow /setup and LAUNCH.md. No credentials have been printed.');process.exitCode=1;return}
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}});
 for(const table of ['groups','properties','sources','segments','snapshots','unit_history','unit_spells','events','alert_rules','notifications']){const {error}=await db.from(table).select('id',{head:true}).limit(1);console.log(`${error?'FAILED':'READY'}: database ${table}${error?` (code ${error.code||'connection'})`:''}`);if(error)process.exitCode=1}
 console.log('This checks connection and tables only. Run the first scheduled check and the two-account access test before launch.');}
void main().catch(()=>{console.error('Connection check failed. Verify the local settings; no secret values are logged.');process.exitCode=1});

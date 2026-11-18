'use strict';
/* Cloud sync adapter. No service-role keys or persistent screenshot uploads. */
const CLOUD_URL='https://uslgixwhcsgxljejscqq.supabase.co';
const CLOUD_KEY='sb_publishable_bLck1oTt4LEJTBji731siw_ni3JQDgE';
const supa=window.supabase.createClient(CLOUD_URL,CLOUD_KEY,{auth:{flowType:'pkce',detectSessionInUrl:true,autoRefreshToken:true,persistSession:true}});
let cloudUser=null;
const cloudMessage=(msg)=>{document.getElementById('cloud-status').textContent=msg};
const isoDate=(s)=>new Date((s||new Date().toISOString().slice(0,10))+'T12:00:00Z').toISOString();
const mapToDb=b=>({id:b.id,user_id:cloudUser.id,sportsbook:b.book||'Other',sport:b.sport||null,event_name:b.event||null,bet_type:b.type||'Single',selection:b.selection,odds:Number(b.odds),stake:Number(b.stake),payout:b.status==='Cashout'?Number(b.cashoutReturn||0):null,status:({Pending:'pending',Win:'won',Loss:'lost',Push:'push',Void:'void',Cashout:'cashed_out'})[b.status]||'pending',placed_at:isoDate(b.date),notes:b.notes||null,source:'manual'});
const mapFromDb=(b,tags)=>({id:b.id,date:b.placed_at.slice(0,10),type:b.bet_type||'Single',sport:b.sport||'',book:b.sportsbook,selection:b.selection,event:b.event_name||'',odds:b.odds,stake:Number(b.stake),status:({pending:'Pending',won:'Win',lost:'Loss',push:'Push',void:'Void',cashed_out:'Cashout'})[b.status]||'Pending',cashoutReturn:Number(b.payout||0),tags:tags||[],notes:b.notes||''});
async function getRemote(){
 const {data:bs,error:be}=await supa.from('bets').select('*').order('placed_at',{ascending:false});if(be)throw be;
 const {data:ts,error:te}=await supa.from('tags').select('id,name');if(te)throw te;
 const {data:links,error:le}=await supa.from('bet_tags').select('bet_id,tag_id');if(le)throw le;
 const names=new Map(ts.map(t=>[t.id,t.name]));const bt=new Map();
 for(const link of links){if(!bt.has(link.bet_id))bt.set(link.bet_id,[]);const name=names.get(link.tag_id);if(name)bt.get(link.bet_id).push(name)}
 return bs.map(b=>mapFromDb(b,bt.get(b.id)||[]));
}
async function uploadLocal(changedIds=null){
 if(!cloudUser)throw Error('Sign in first');
 const local=changedIds?bets.filter(b=>changedIds.has(b.id)):bets.slice();
 if(!local.length){cloudMessage('No local bets to upload');return}
 const {error:e}=await supa.from('bets').upsert(local.map(mapToDb),{onConflict:'id'});if(e)throw e;
 const allNames=[...new Set(local.flatMap(b=>b.tags||[]))];
 if(allNames.length){
  const {error:tErr}=await supa.from('tags').upsert(allNames.map(name=>({user_id:cloudUser.id,name})),{onConflict:'user_id,name'});if(tErr)throw tErr;
  const {data:tagRows,error:gErr}=await supa.from('tags').select('id,name');if(gErr)throw gErr;
  const ids=new Map(tagRows.map(t=>[t.name,t.id]));
  const betIds=local.map(b=>b.id);
  const {error:dErr}=await supa.from('bet_tags').delete().in('bet_id',betIds);if(dErr)throw dErr;
  const relations=local.flatMap(b=>(b.tags||[]).filter(n=>ids.has(n)).map(n=>({user_id:cloudUser.id,bet_id:b.id,tag_id:ids.get(n)})));
  if(relations.length){const {error:rErr}=await supa.from('bet_tags').insert(relations);if(rErr)throw rErr}
 }
 cloudMessage('Uploaded '+local.length+' bets to Supabase');
}
async function refreshAuth(){
 const {data:{user},error}=await supa.auth.getUser();cloudUser=error?null:user;
 document.body.classList.toggle('auth-locked',!cloudUser);
 document.getElementById('cloud-login').hidden=!!cloudUser;
 document.getElementById('cloud-logout').hidden=!cloudUser;
 document.getElementById('cloud-upload').disabled=!cloudUser;
 document.getElementById('cloud-download').disabled=!cloudUser;
 cloudMessage(cloudUser?'Signed in: '+cloudUser.email:'Not signed in · local bets remain on this device');
}
document.getElementById('cloud-login').onclick=async()=>{
 const email=prompt('Email address for your Sports Bet Tracker login:');if(!email)return;
 const {error}=await supa.auth.signInWithOtp({email:email.trim(),options:{emailRedirectTo:location.origin+location.pathname}});
 cloudMessage(error?'Login error: '+error.message:'Check your email for the login link');
};
document.getElementById('cloud-logout').onclick=async()=>{await supa.auth.signOut();await refreshAuth()};
document.getElementById('cloud-upload').onclick=async()=>{
 if(!confirm('Upload your locally saved bets to Supabase? Matching bet IDs will be updated. Existing cloud-only bets will remain.'))return;
 try{cloudMessage('Uploading...');await uploadLocal()}catch(e){cloudMessage('Upload failed: '+e.message)}
};
document.getElementById('cloud-download').onclick=async()=>{
 if(!confirm('Merge Supabase bets into this browser? Cloud versions replace matching local bet IDs. Cloud-only bets are added. Make a JSON backup first if you want an extra safety copy.'))return;
 try{cloudMessage('Downloading...');const remote=await getRemote();const byId=new Map(bets.map(b=>[b.id,b]));remote.forEach(b=>byId.set(b.id,b));const old=bets;bets=[...byId.values()];if(!save()){bets=old;throw Error('Local storage save failed')}render();cloudMessage('Merged '+remote.length+' cloud bets into this browser')}catch(e){cloudMessage('Download failed: '+e.message)}
};
// Automatic bidirectional sync. Only upload changed records to avoid overwriting
// newer edits made on another device. Cloud remains authoritative for existing IDs
// when this device first signs in.
let baseline=new Map(bets.map(b=>[b.id,JSON.stringify(b)]));
let dirty=new Set(),syncTimer=null,syncBusy=false,syncReady=false,activeUserId=null;
let lastRefresh=0;
const setBaseline=()=>{baseline=new Map(bets.map(b=>[b.id,JSON.stringify(b)]))};
function recordLocalChanges(){
 for(const b of bets)if(baseline.get(b.id)!==JSON.stringify(b))dirty.add(b.id);
 scheduleSync();
}
function scheduleSync(delay=900){if(!cloudUser||!syncReady)return;clearTimeout(syncTimer);syncTimer=setTimeout(()=>syncCycle().catch(e=>cloudMessage('Sync failed: '+e.message)),delay)}
async function pullCloud(){
 if(!cloudUser)return;
 const remote=await getRemote(),merged=new Map(bets.map(b=>[b.id,b]));
 for(const b of remote)if(!dirty.has(b.id))merged.set(b.id,b);
 const old=bets;bets=[...merged.values()];
 setBaseline();if(!save()){bets=old;throw Error('Could not save downloaded bets')}
 render();setBaseline();lastRefresh=Date.now();
 cloudMessage('Cloud synced · '+remote.length+' cloud bets');
}
async function syncCycle(forcePull=false){
 if(!cloudUser||syncBusy||!syncReady)return;
 syncBusy=true;
 try{
  if(dirty.size){
   const sending=new Set(dirty);cloudMessage('Saving changes to cloud...');
   await uploadLocal(sending);
   for(const id of sending)dirty.delete(id);
  }
  if(forcePull||Date.now()-lastRefresh>12000)await pullCloud();
 }finally{syncBusy=false;if(dirty.size)scheduleSync(1500)}
}
async function initializeCloud(){
 if(!cloudUser)return;
 const id=cloudUser.id;
 if(activeUserId!==id){activeUserId=id;syncReady=false;dirty.clear();setBaseline()}
 try{
  cloudMessage('Loading cloud bets...');
  const remote=await getRemote(),merged=new Map(bets.map(b=>[b.id,b]));
  for(const b of remote)merged.set(b.id,b);
  const old=bets;bets=[...merged.values()];
  setBaseline();if(!save()){bets=old;throw Error('Could not save cloud data locally')}
  render();setBaseline();lastRefresh=Date.now();syncReady=true;
  cloudMessage('Cloud synced · '+remote.length+' cloud bets');
 }catch(e){cloudMessage('Cloud load failed: '+e.message);syncReady=true}
}
window.addEventListener('tracker:local-saved',recordLocalChanges);
supa.auth.onAuthStateChange(()=>{setTimeout(async()=>{await refreshAuth();if(cloudUser){if(!syncReady||activeUserId!==cloudUser.id)await initializeCloud();else scheduleSync(100)}else{syncReady=false;activeUserId=null;dirty.clear()}},0)});
(async()=>{await refreshAuth();if(cloudUser)await initializeCloud()})();
document.addEventListener('visibilitychange',()=>{if(!document.hidden)scheduleSync(100)});
window.addEventListener('focus',()=>scheduleSync(100));
setInterval(()=>{if(!document.hidden)scheduleSync(100)},20000);

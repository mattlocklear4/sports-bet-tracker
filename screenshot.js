'use strict';
/* Client-side OCR prototype: images stay in memory and are never uploaded or stored. */
(()=>{
 const button=document.getElementById('screenshot-btn'),fileInput=document.getElementById('screenshot-file'),panel=document.getElementById('scan-panel'),status=document.getElementById('scan-status');
 const setStatus=s=>{panel.hidden=false;status.textContent=s};
 const loadOCR=()=>new Promise((resolve,reject)=>{
   if(window.Tesseract)return resolve(window.Tesseract);
   const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
   script.onload=()=>window.Tesseract?resolve(window.Tesseract):reject(Error('OCR unavailable'));
   script.onerror=()=>reject(Error('Could not load the text recognition library'));document.head.appendChild(script);
 });
 const parse=text=>{
   const lines=text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
   const full=lines.join(' ');
   const book=/draftkings|\bDK\d{10,}\b/i.test(full)?'DraftKings':/fanduel/i.test(full)?'FanDuel':/caesars/i.test(full)?'Caesars':/fanatics/i.test(full)?'Fanatics':/bet365/i.test(full)?'Bet365':null;
   const amountAfter=label=>{
     const m=full.match(new RegExp(label+'\\s*[:;]?\\s*\\$?\\s*([\\d,]+(?:\\.\\d{1,2})?)','i'));
     return m?Number(m[1].replaceAll(',','')):null;
   };
   const stake=amountAfter('(?:wager\\s*amount|stake|risk|bet\\s*amount|amount\\s*wagered)');
   const payout=amountAfter('(?:total\\s*payout|potential\\s*payout|to\\s*return)');
   const oddsMatches=[...full.matchAll(/(?:^|\s)([+−–-]\s*\d{3,4})(?=\s|$|\))/g)];
   const odds=oddsMatches.length?Number(oddsMatches[0][1].replace(/[−–]/g,'-').replace(/\s/g,'')):null;
   const sport=/\b(golf|pga|dp world|liv|winning score o\/u|rsm classic|masters|open championship)\b/i.test(full)?'Golf':/\b(nfl|football)\b/i.test(full)?'NFL':/\b(nba|basketball)\b/i.test(full)?'NBA':/\b(mlb|baseball)\b/i.test(full)?'MLB':null;
   const candidate=lines.find(l=>/\b(over|under|moneyline|spread|to win|round score|birdies|bogeys)\b/i.test(l)&&l.length>5);
   const selection=candidate?candidate.replace(/\s*[+−–-]\s*\d{3,4}\s*$/,'').trim():null;
   const market=lines.find(l=>/winning score o\/u|round score|birdies or better|bogey|moneyline|spread/i.test(l));
   const eventLine=lines.find(l=>/\b(?:classic|championship|open|masters|invitational|tournament)\b/i.test(l)&&!/^receipt/i.test(l));
   const event=eventLine?eventLine.replace(/\s*(?:[•·+|]|\s)\s*(?:mon|tue|wed|thu|fri|sat|sun)\b.*$/i,'').trim():null;
   const placed=full.match(/\b([A-Z][a-z]{2})\s+(\d{1,2}),?\s+(20\d{2})\b/);
   const monthMap={Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12};
   const date=placed&&monthMap[placed[1]]?placed[3]+'-'+String(monthMap[placed[1]]).padStart(2,'0')+'-'+placed[2].padStart(2,'0'):null;
   const notes=[market?'Market: '+market:null,payout!==null?'Potential payout: $'+payout.toFixed(2):null,'Screenshot OCR (verify all values):',text.slice(0,1800)].filter(Boolean).join('\n');
   return {book,stake,odds,sport,selection,event,date,notes,raw:text};
 };
 button.addEventListener('click',()=>fileInput.click());
 document.getElementById('scan-cancel').addEventListener('click',()=>{panel.hidden=true;fileInput.value=''});
 fileInput.addEventListener('change',async()=>{
  const file=fileInput.files?.[0];if(!file)return;
  if(!/^image\/(png|jpeg|webp)$/.test(file.type)){setStatus('Please choose a PNG, JPG, or WebP screenshot.');fileInput.value='';return}
  if(file.size>12*1024*1024){setStatus('Image is larger than 12 MB. Please crop or compress it.');fileInput.value='';return}
  try{
   setStatus('Reading screenshot locally... This can take 10–30 seconds on a phone.');
   const T=await loadOCR();const worker=await T.createWorker('eng');
   let result;try{result=await worker.recognize(file)}finally{await worker.terminate()}
   const extracted=parse(result.data.text||'');
   if(!extracted.raw.trim()){setStatus('No text recognized. Try a clearer screenshot or use Add Bet.');return}
   document.getElementById('add').click();
   const form=document.getElementById('betform');
   for(const [key,val] of Object.entries(extracted)){
    if(key==='raw'||val===null||val===undefined)continue;
    const input=form.elements.namedItem(key);
    if(input&&(!input.options||[...input.options].some(o=>o.value===String(val))))input.value=String(val);
   }
   form.elements.notes.value=extracted.notes;
   setStatus('Text recognized. Review all fields in the Add Bet form; missing fields must be entered manually. The screenshot is not stored.');
  }catch(err){setStatus('Could not scan screenshot: '+err.message+'. You can still enter the bet manually.')}
  finally{fileInput.value=''}
 });
})();
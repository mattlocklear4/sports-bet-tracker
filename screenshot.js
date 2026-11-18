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
 const readTop=async(file,worker)=>{
   const bitmap=await createImageBitmap(file);
   try{
     const h=Math.max(1,Math.floor(bitmap.height*.30));
     const scale=2,canvas=document.createElement('canvas');
     canvas.width=bitmap.width*scale;canvas.height=h*scale;
     const ctx=canvas.getContext('2d',{willReadFrequently:true});
     ctx.drawImage(bitmap,0,0,bitmap.width,h,0,0,canvas.width,canvas.height);
     const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);
     for(let i=0;i<pixels.data.length;i+=4){
       const v=.2126*pixels.data[i]+.7152*pixels.data[i+1]+.0722*pixels.data[i+2];
       const bright=v>105?255:0;
       pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=bright;
     }
     ctx.putImageData(pixels,0,0);
     const result=await worker.recognize(canvas);
     return result.data.text||'';
   }finally{bitmap.close()}
 };
 const parse=text=>{
   const lines=text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
   const full=lines.join(' ');
   const book=/draftkings|\bDK\d{10,}\b/i.test(full)?'DraftKings':/fanduel/i.test(full)?'FanDuel':/caesars/i.test(full)?'Caesars':/fanatics/i.test(full)?'Fanatics':/bet365/i.test(full)?'Bet365':null;
   const amountAfter=label=>{
     const m=full.match(new RegExp(label+'\\s*[:;]?\\s*\\$?\\s*([\\d,]+(?:\\.\\d{1,2})?)','i'));
     return m?Number(m[1].replaceAll(',','')):null;
   };
   const stake=amountAfter('(?:wager(?:\\s*amount)?|stake|risk|bet\\s*amount|amount\\s*wagered)');
   const payout=amountAfter('(?:total\\s*payout|potential\\s*payout|to\\s*return)');
   const paid=amountAfter('(?:paid|total\\s*paid|total\\s*returned)');
   const oddsMatches=[...full.matchAll(/(?:^|[\s|¦•·])([+−–-]\s*\d{3,4})(?=\s|$|[|¦•·)])/g)];
   const odds=oddsMatches.length?Number(oddsMatches[0][1].replace(/[−–]/g,'-').replace(/\s/g,'')):null;
   const sport=/\b(golf|pga|dp world|liv|winning score o\/u|rsm classic|masters|open championship|round score|greens in regulation|r3 o\/u)\b/i.test(full)?'Golf':/\b(nfl|football)\b/i.test(full)?'NFL':/\b(nba|basketball)\b/i.test(full)?'NBA':/\b(mlb|baseball)\b/i.test(full)?'MLB':null;
   const candidate=lines.find(l=>/\b(over|under|moneyline|spread|to win|round score|birdies|bogeys)\b/i.test(l)&&l.length>5);
   const pickLine=lines.find(l=>/^\s*(?:over|under)\s*\d+(?:[.,]\d+)?\b/i.test(l));
   const pickMatch=full.match(/\b(over|under)\s*(\d{1,3}(?:[.,]\d+)?)\b/i);
   const selection=pickLine?pickLine.replace(/\s*(?:[|¦•·])?\s*[+−–-]\s*\d{3,4}\s*$/,'').trim():pickMatch?(pickMatch[1][0].toUpperCase()+pickMatch[1].slice(1).toLowerCase()+' '+pickMatch[2].replace(',','.')):candidate?candidate.replace(/\s*[+−–-]\s*\d{3,4}\s*$/,'').trim():null;
   const market=lines.find(l=>/winning score o\/u|round score|greens in regulation|birdies or better|bogey|moneyline|spread/i.test(l));
   const eventLine=lines.find(l=>/\b(?:classic|championship|open|masters|invitational|tournament)\b/i.test(l)&&!/^receipt/i.test(l)) || lines.find(l=>/\s+v\s+.+\s+v\s+.+(?:\s*[-–]\s*R\d)?$/i.test(l));
   const event=eventLine?eventLine.replace(/\s*(?:[•·+|]|\s)\s*(?:mon|tue|wed|thu|fri|sat|sun)\b.*$/i,'').trim():null;
   const placed=full.match(/\b([A-Z][a-z]{2})\s+(\d{1,2}),?\s+(20\d{2})\b/);
   const monthMap={Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12};
   const date=placed&&monthMap[placed[1]]?placed[3]+'-'+String(monthMap[placed[1]]).padStart(2,'0')+'-'+placed[2].padStart(2,'0'):null;
   const status=/\b(lost|loss|losing)\b/i.test(full)?'Loss':/\b(won|winner|winning bet)\b/i.test(full)?'Win':/\b(pushed|push)\b/i.test(full)?'Push':/\b(voided|void)\b/i.test(full)?'Void':/\b(cashed out|cashout)\b/i.test(full)?'Cashout':'Pending';
   const notes=[market?'Market: '+market:null,paid!==null?'Actual paid: $'+paid.toFixed(2):payout!==null?'Potential payout: $'+payout.toFixed(2):null,'Screenshot OCR (verify all values):',text.slice(0,1800)].filter(Boolean).join('\n');
   return {book,stake,odds,sport,selection,event,date,status,notes,raw:text};
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
   let result;try{result=await worker.recognize(file)}catch(e){await worker.terminate();throw e}
   let topText='';
   try{setStatus('Checking selection and odds with enhanced recognition...');topText=await readTop(file,worker)}catch(e){console.warn('Enhanced OCR unavailable',e)}
   const extracted=parse(result.data.text||'');
   const top=parse(topText);
   // Re-read the bet heading without thresholding: thin white text can disappear in binary OCR.
   let headingText='';
   try{
     const bitmap=await createImageBitmap(file);
     try{
       const canvas=document.createElement('canvas');
       canvas.width=bitmap.width*2;canvas.height=Math.round(bitmap.height*.48*2);
       canvas.getContext('2d').drawImage(bitmap,0,0,bitmap.width,bitmap.height*.48,0,0,canvas.width,canvas.height);
       headingText=(await worker.recognize(canvas)).data.text||'';
     }finally{bitmap.close()}
   }catch(e){console.warn('Heading OCR unavailable',e)}
   // Diagnostics: keep the OCR's literal heading text visible for troubleshooting.
   // DraftKings OCR often collapses '13.5' to '13s' or 'izs'.
   // Only repair the heading's Over/Under token; never infer odds or stake.
   const normalizeHeadingPick = raw => {
     const compact=raw.replace(/\\s+/g,'').toLowerCase();
     const m=compact.match(/(?:over|under|0ver|0nder)([0-9ilzso]{2,4})/i);
     if(!m)return null;
     let digits=m[1].replace(/[il]/g,'1').replace(/z/g,'2').replace(/[so]/g,'5');
     // Three digit forms represent two-digit .5 golf prop lines, e.g. 135 or 695.
     if(!/^\\d{3}$/.test(digits)||digits[2]!=='5')return null;
     const side=/^(?:over|0ver)/i.test(m[0])?'Over':'Under';
     return side+' '+digits.slice(0,2)+'.5';
   };
   const repairedSelection=normalizeHeadingPick(headingText)||normalizeHeadingPick(result.data.text||'')||normalizeHeadingPick(topText);
   const headingPick=(headingText+'\n'+topText+'\n'+(result.data.text||'')).match(/\b(over|under|0ver|0nder)\s*([0-9]{1,3})\s*[.,]?\s*([05])(?=\s|[|¦•·+−–-]|$)/i);
   if(headingPick){
     extracted.selection=(/^o|^0/i.test(headingPick[1])?'Over':'Under')+' '+headingPick[2]+'.'+headingPick[3];
   }

   const topPick=topText.match(/\b(over|under)\s*(\d{1,3}(?:[.,]\d+)?)\b/i);
   if(topPick&&!headingPick){
     extracted.selection=topPick[1][0].toUpperCase()+topPick[1].slice(1).toLowerCase()+' '+topPick[2].replace(',','.');
   }
   const roundScore=/round\s*\d+\s*(?:o\/u|score)|round score/i.test((extracted.notes||'')+' '+(result.data.text||''));
   if(roundScore&&/^\s*(?:Over|Under)\s+[678]\d\d\s*$/i.test(extracted.selection||'')){
     extracted.selection=extracted.selection.replace(/(\d{2})(\d)\s*$/,'$1.$2');
   }
   if(repairedSelection)extracted.selection=repairedSelection;
   if(top.odds!==null)extracted.odds=top.odds;
   const isGIR=/greens in regulation/i.test(result.data.text||'');
   if(isGIR&&/^\s*(Over|Under)\s+1[0-8]\d\s*$/i.test(extracted.selection||''))extracted.selection=extracted.selection.replace(/(1[0-8])(\d)\s*$/,'$1.$2');
   extracted.notes+='\nScanner diagnostics (raw heading text follows):\n'+headingText.slice(0,1500)+'\nTop crop:\n'+topText.slice(0,1000)+'\nFull OCR excerpt:\n'+(result.data.text||'').slice(0,1000);
   extracted.notes+='\nHeading OCR: '+headingText.slice(0,500)+'\nEnhanced top OCR: '+topText.slice(0,500);
   if(!extracted.raw.trim()){setStatus('No text recognized. Try a clearer screenshot or use Add Bet.');return}
   document.getElementById('add').click();
   const form=document.getElementById('betform');
   for(const [key,val] of Object.entries(extracted)){
    if(key==='raw'||val===null||val===undefined)continue;
    const input=form.elements.namedItem(key);
    if(input&&(!input.options||[...input.options].some(o=>o.value===String(val))))input.value=String(val);
   }
   if(extracted.odds===null){form.elements.odds.value='';form.elements.odds.placeholder='Odds not recognized — enter manually';}
   form.elements.notes.value=extracted.notes;
   if(!extracted.selection){setStatus('Selection was not recognized. Open Notes in the Add Bet form and copy the text under "Scanner diagnostics" so we can fix the OCR accurately.');}
   else setStatus('Text recognized. Review all fields in the Add Bet form; missing fields must be entered manually. The screenshot is not stored.');
  }catch(err){setStatus('Could not scan screenshot: '+err.message+'. You can still enter the bet manually.')}
  finally{fileInput.value=''}
 });
})();

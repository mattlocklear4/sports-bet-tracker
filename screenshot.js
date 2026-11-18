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
   const moneyBefore=label=>{const m=full.match(new RegExp('\\$\\s*([\\d,]+(?:\\.\\d{1,2})?)\\s*'+label,'i'));return m?Number(m[1].replaceAll(',','')):null};
   const stake=amountAfter('(?:wager(?:\\s*amount)?|stake|risk|bet\\s*amount|amount\\s*wagered)') ?? moneyBefore('(?:total\\s*wager|wagered)');
   const payout=amountAfter('(?:total\\s*payout|potential\\s*payout|to\\s*return)');
   const paid=amountAfter('(?:paid|total\\s*paid|total\\s*returned)') ?? moneyBefore('won\\s*on\\s*fanduel');
   const oddsMatches=[...full.matchAll(/(?:^|[\s|¦•·])([+−–-]\s*\d{3,4})(?=\s|$|[|¦•·)])/g)];
   const odds=oddsMatches.length?Number(oddsMatches[0][1].replace(/[−–]/g,'-').replace(/\s/g,'')):null;
   const sport=/\b(golf|winning score|pga|dp world|liv|winning score o\/u|rsm classic|masters|open championship|round score|greens in regulation|r3 o\/u)\b/i.test(full)?'Golf':/\b(nfl|football)\b/i.test(full)?'NFL':/\b(nba|basketball)\b/i.test(full)?'NBA':/\b(mlb|baseball)\b/i.test(full)?'MLB':null;
   const candidate=lines.find(l=>/\b(over|under|moneyline|spread|to win|round score|birdies|bogeys)\b/i.test(l)&&l.length>5);
   const pickLine=lines.find(l=>/^\s*(?:over|under)\s*\d+(?:[.,]\d+)?\b/i.test(l));
   const pickMatch=full.match(/\b(over|under)\s*(\d{1,3}(?:[.,]\d+)?)\b/i);
   const selection=pickLine?pickLine.replace(/\s*(?:[|¦•·])?\s*[+−–-]\s*\d{3,4}\s*$/,'').trim():pickMatch?(pickMatch[1][0].toUpperCase()+pickMatch[1].slice(1).toLowerCase()+' '+pickMatch[2].replace(',','.')):candidate?candidate.replace(/\s*[+−–-]\s*\d{3,4}\s*$/,'').trim():null;
   const market=lines.find(l=>/winning score o\/u|round score|greens in regulation|birdies or better|bogey|moneyline|spread/i.test(l));
   const eventLine=lines.find(l=>/\b(?:classic|championship|open|masters|invitational|tournament)\b/i.test(l)&&!/^receipt/i.test(l)) || lines.find(l=>/\s+v\s+.+\s+v\s+.+(?:\s*[-–]\s*R\d)?$/i.test(l));
   const event=eventLine?eventLine.replace(/^\\s*(?:winning\\s+score\\s*[-–:]\\s*)/i,'').replace(/\s*(?:[•·+|]|\s)\s*(?:mon|tue|wed|thu|fri|sat|sun)\b.*$/i,'').trim():null;
   const placedNumeric=full.match(/\bplaced\s*[:;]?\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(20\d{2})/i);
   const placedMonth=full.match(/\b(?:placed\s*[:;]?\s*)?([A-Z][a-z]{2})\s+(\d{1,2}),?\s+(20\d{2})\b/);
   const monthMap={Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12};
   const date=placedNumeric?placedNumeric[3]+'-'+placedNumeric[1].padStart(2,'0')+'-'+placedNumeric[2].padStart(2,'0'):placedMonth&&monthMap[placedMonth[1]]?placedMonth[3]+'-'+String(monthMap[placedMonth[1]]).padStart(2,'0')+'-'+placedMonth[2].padStart(2,'0'):null;
   const status=/\b(lost|loss|losing)\b/i.test(full)?'Loss':/\b(won|winner|winning bet)\b/i.test(full)?'Win':/\b(pushed|push)\b/i.test(full)?'Push':/\b(voided|void)\b/i.test(full)?'Void':/\b(cashed out|cashout)\b/i.test(full)?'Cashout':'Pending';
   const notes=[market?'Market: '+market:null,paid!==null?'Actual paid: $'+paid.toFixed(2):payout!==null?'Potential payout: $'+payout.toFixed(2):null,'Screenshot OCR (verify all values):',text.slice(0,1800)].filter(Boolean).join('\n');
   return {book,stake,odds,sport,selection,event,date,status,cashoutReturn:status==='Win'&&paid!==null?paid:status==='Cashout'&&paid!==null?paid:null,notes,raw:text};
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
   // Parse the wager heading from OCR lines independently of market and event.
   // The full OCR often reads decimal-five as "s" (over13s).
   const headingSources=[result.data.text||'',headingText,topText];
   const parseHeading=raw=>{
     for(const line of raw.split(/\r?\n/)){
       const match=line.match(/\b(over|under|0ver|0nder)\s*([0-9ilzo]{1,3})\s*([.,sS5])\s*([0-9])?(?=\s|[|¦•·+−–-]|$)/i)
         ||line.match(/\b(over|under|0ver|0nder)\s*([0-9ilzo]{2,3})([sS5])(?=\s|[|¦•·+−–-]|$)/i);
       if(!match)continue;
       const side=/^(?:over|0ver)/i.test(match[1])?'Over':'Under';
       const whole=match[2].toLowerCase().replace(/[il]/g,'1').replace(/z/g,'2').replace(/o/g,'0');
       if(!/^\d{1,3}$/.test(whole))continue;
       let value=null;
       if(match[4])value=whole+'.'+match[4];
       else if(/[sS5]/.test(match[3]))value=whole+'.5';
       else if(whole.length===3&&/[.,]/.test(match[3]))continue;
       if(value!==null&&Number(value)>=0&&Number(value)<=400)return side+' '+value;
     }
     // Fallback for OCR text where punctuation disappears entirely.
     const compact=raw.replace(/\s+/g,'').toLowerCase();
     const m=compact.match(/(?:over|under|0ver|0nder)(\d{2})([s5])(?=[^\d]|$)/i);
     if(m)return (/^(?:over|0ver)/i.test(m[0])?'Over':'Under')+' '+m[1]+'.5';
     return null;
   };
   const headingSelection=headingSources.map(parseHeading).find(Boolean);
   if(headingSelection)extracted.selection=headingSelection;
   // Preserve the market/player as part of the description rather than replacing it
   // with the unrelated three-player tee-time grouping.
   const marketLine=(result.data.text||'').split(/\r?\n/).map(x=>x.trim()).find(x=>/greens in regulation|round score|birdies or better|bogey|winning score/i.test(x));
   if(marketLine&&headingSelection){
     const cleanMarket=marketLine.replace(/[|¦]+\s*$/,'').trim();
     if(cleanMarket&&!/^(?:over|under)\b/i.test(cleanMarket))extracted.selection=headingSelection+' — '+cleanMarket;
   }
   if(top.odds!==null)extracted.odds=top.odds;
   if(/fanduel/i.test([result.data.text||'',headingText,topText].join(' ')) || /\bus-va:[a-z0-9]+/i.test(result.data.text||'')){
     extracted.book='FanDuel';
     const fullText=result.data.text||'';
     const allText=[fullText,headingText,topText].join('\n');
     const fdPick=allText.match(/\b(Over|Under)\s*(\d{1,3}[.,]\d)\s*(?:Shots)?/i);
     // Recognize football passing-yard props before any golf-specific formatting.
     const passingMarket=allText.match(/([A-Z][A-Za-z.'-]+\s+[A-Z][A-Za-z.'-]+)\s*[-–]\s*PASSING\s*(?:YDS|YARDS)/i);
     const passingPick=allText.match(/\b([A-Z][A-Za-z.'-]+\s+[A-Z][A-Za-z.'-]+)\s+(Over|Under)\s*(\d{1,3}(?:[.,]\d)?)\b/i);
     const matchup=allText.match(/([^\n\r]{3,70}?)\s+@\s+([^\n\r]{3,70}?)(?=\s{2,}|\s+\d{1,2}:\d{2}\s*(?:AM|PM)|$)/im);
     const isPassing=!!passingMarket||/\bPASSING\s*(?:YDS|YARDS)\b/i.test(allText);
     const isGolf=/\bWINNING\s+SCORE\b|\bROUND\s*\d+\s+SCORE\b|\bGREENS\s+IN\s+REGULATION\b/i.test(allText);
     if(isPassing){
       const player=passingMarket?.[1]||passingPick?.[1]||'';
       const side=passingPick?.[2]||fdPick?.[1]||'';
       const line=passingPick?.[3]||fdPick?.[2]||'';
       extracted.selection=[player,side,line,'Passing Yards'].filter(Boolean).join(' ');
       extracted.sport=/\b(?:Elks|Stampeders|Argonauts|Roughriders|Blue Bombers|Alouettes|Redblacks)\b/i.test(allText)?'CFL Football':'Football';
       if(matchup)extracted.event=matchup[1].trim()+' @ '+matchup[2].trim();
     }else if(isGolf){
       if(fdPick)extracted.selection=fdPick[1][0].toUpperCase()+fdPick[1].slice(1).toLowerCase()+' '+fdPick[2].replace(',','.')+' Shots — Winning Score';
       const fdEvent=allText.match(/WINNING\s+SCORE\s*[-–]\s*([^\n\r]+)/i);
       if(fdEvent)extracted.event=fdEvent[1].trim().replace(/\s*[-–]\s*\d{3,4}\s*$/,'');
       extracted.sport='Golf';
     }
     // FanDuel displays two monetary columns: "$62.50  $112.50" on one
     // row and "TOTAL WAGER  WON ON FANDUEL" on the next. OCR may flatten
     // the columns, so never use the generic "wager: next number" rule here.
     const fdLines=allText.split(/\r?\n/);
     const cashRe=/\$\s*([\d,]+(?:\.\d{1,2})?)/g;
     const candidates=[];
     for(let i=0;i<fdLines.length;i++){
       if(/TOTAL\s*WAGER|WON\s*ON\s*FANDUEL/i.test(fdLines[i])){
         const vicinity=fdLines.slice(Math.max(0,i-2),i+1).join(' ');
         const amounts=[...vicinity.matchAll(cashRe)].map(m=>Number(m[1].replaceAll(',','')));
         if(amounts.length>=2)candidates.push({stake:amounts[amounts.length-2],paid:amounts[amounts.length-1]});
       }
     }
     const paired=candidates.find(p=>p.stake>0&&p.paid>=0);
     const flat=allText.replace(/\s+/g,' ');
     const before=(label)=>{const m=flat.match(new RegExp('\\$\\s*([\\d,]+(?:\\.\\d{1,2})?)\\s*'+label,'i'));return m?Number(m[1].replaceAll(',','')):null};
     const wagerBefore=before('TOTAL\\s*WAGER');
     const wonBefore=before('WON\\s*ON\\s*FANDUEL');
     // Do not trust a generic stake extraction when the FanDuel two-column
     // layout is present; an incorrect stake is worse than an empty field.
     const allAmounts=[...allText.matchAll(/\$\s*([\d,]+(?:\.\d{1,2})?)/g)].map(m=>Number(m[1].replaceAll(',','')));
     extracted.stake=paired?.stake??(wagerBefore>0?wagerBefore:null)??(allAmounts.length>=2&&allAmounts[0]>0?allAmounts[0]:null);
     const winnings=paired?.paid??wonBefore??(allAmounts.length>=2?allAmounts[1]:null);
     if(/\bRETURNED\b/i.test(allText)&&winnings===0&&extracted.stake>0)extracted.status='Loss';
     if(/\bWON\s+ON\s+FANDUEL\b/i.test(allText)&&winnings!==null&&winnings>0)extracted.status='Win';
     const playerMarket=allText.match(/([A-Z][a-z]+\s+[A-Z][a-z]+)\s+ROUND\s*(\d+)\s+SCORE/i);
     if(playerMarket){extracted.selection=playerMarket[1]+' '+(fdPick?fdPick[1]+' '+fdPick[2]:'')+' — Round '+playerMarket[2]+' Score';extracted.sport='Golf';}
     extracted.cashoutReturn=extracted.status==='Win'?winnings:null;
     const dateMatch=allText.match(/\bplaced\s*[:;]?\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(20\d{2})/i);
     if(dateMatch)extracted.date=dateMatch[3]+'-'+dateMatch[1].padStart(2,'0')+'-'+dateMatch[2].padStart(2,'0');
   }
   // Keep a concise diagnostic without appending pages of repeated OCR to notes.
   extracted.notes+='\nScanner: '+(headingSelection||'selection needs review');
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

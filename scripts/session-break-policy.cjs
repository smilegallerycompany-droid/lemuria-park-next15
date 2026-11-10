'use strict';
// Sales restriction only. No session/order/ticket/payment rows are changed.
const NOTICE='Перерыв с 13:00 до 13:30 и с 17:00 до 17:30';
function isBreak(session,location=session?.location){
 if(!session||location?.slug!=='saratov')return false;
 const at=new Date(session.startsAt);if(!Number.isFinite(+at))return true;
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:location.timezone||'Europe/Saratov',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(at).map(x=>[x.type,x.value]));
 if(`${p.year}-${p.month}-${p.day}`<'2026-11-07')return false;
 const minute=Number(p.hour)*60+Number(p.minute);
 return minute>=780&&minute<810||minute>=1020&&minute<1050;
}
async function filterCandidates(db,params,rows){
 if(!rows.length)return rows;
 const location=await db.location.findUnique({where:{id:params.locationId},select:{slug:true,timezone:true}});
 if(location?.slug!=='saratov')return rows;
 return rows.filter(s=>!isBreak(s,location));
}
// Fetch another page when a break occupies a slot in the preview. Read-only.
async function nearestSessions(fetchPage, location, limit=6){
 const result=[];
 for(let skip=0;;skip+=limit){
  const rows=await fetchPage(skip,limit);
  for(const row of rows)if(!isBreak(row,location)){result.push(row);if(result.length===limit)return result;}
  if(rows.length<limit)return result;
 }
}
module.exports={NOTICE,isBreak,filterCandidates,nearestSessions};

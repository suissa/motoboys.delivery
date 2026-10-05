import type {Driver} from "../domain.js";

const timeZone=process.env.CITY_TIMEZONE??"America/Sao_Paulo";
const ACTIVE_STATUSES=new Set<Driver["status"]>(["AVAILABLE","BUSY"]);

function parts(date:Date){
 const result=new Intl.DateTimeFormat("en-CA",{timeZone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(date);
 return{
  year:Number(result.find(x=>x.type==="year")?.value),
  month:Number(result.find(x=>x.type==="month")?.value),
  day:Number(result.find(x=>x.type==="day")?.value)
 };
}

function offsetMinutes(date:Date){
 const value=new Intl.DateTimeFormat("en-US",{timeZone,timeZoneName:"longOffset",hour:"2-digit",minute:"2-digit"}).formatToParts(date).find(x=>x.type==="timeZoneName")?.value??"GMT";
 const match=value.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
 if(!match)return 0;
 const minutes=Number(match[2])*60+Number(match[3]??0);
 return match[1]==="-"?-minutes:minutes;
}

export function dayKey(date=new Date()){
 const p=parts(date);
 return `${p.year}-${String(p.month).padStart(2,"0")}-${String(p.day).padStart(2,"0")}`;
}

export function startOfLocalDay(date=new Date()){
 const p=parts(date);
 return new Date(Date.UTC(p.year,p.month-1,p.day)-offsetMinutes(date)*60_000);
}

export function isWorking(d:Driver){
 return ACTIVE_STATUSES.has(d.status)&&!!d.sessionId;
}

export function normalizeWorkDay(d:Driver,now=new Date()){
 const today=dayKey(now);
 if(d.workDate===today)return undefined;
 const previous={
  workDate:d.workDate,
  completedToday:d.completedToday,
  activeSecondsToday:d.activeSecondsToday,
  earnedToday:d.earnedToday,
  activeSinceAt:d.activeSinceAt
 };
 const start=startOfLocalDay(now);
 d.workDate=today;
 d.completedToday=0;
 d.activeSecondsToday=0;
 d.earnedToday=0;
 if(isWorking(d))d.activeSinceAt=start.toISOString();
 else delete d.activeSinceAt;
 return previous;
}

export function beginActivePeriod(d:Driver,when=new Date()){
 normalizeWorkDay(d,when);
 d.activeSinceAt=when.toISOString();
 return when;
}

export function stopActivePeriod(d:Driver,when=new Date()){
 normalizeWorkDay(d,when);
 if(!d.activeSinceAt)return 0;
 const start=Math.max(Date.parse(d.activeSinceAt),startOfLocalDay(when).getTime());
 const seconds=Math.max(0,Math.floor((when.getTime()-start)/1000));
 d.activeSecondsToday+=seconds;
 delete d.activeSinceAt;
 return seconds;
}

export function effectiveActiveSeconds(d:Driver,now=new Date()){
 const today=dayKey(now);
 if(d.workDate!==today){
  if(!isWorking(d))return 0;
  const start=startOfLocalDay(now).getTime();
  return Math.max(0,Math.floor((now.getTime()-start)/1000));
 }
 let seconds=d.activeSecondsToday;
 if(isWorking(d)&&d.activeSinceAt){
  const start=Math.max(Date.parse(d.activeSinceAt),startOfLocalDay(now).getTime());
  seconds+=Math.max(0,Math.floor((now.getTime()-start)/1000));
 }
 return Math.max(0,seconds);
}

export function effectiveCompletedToday(d:Driver,now=new Date()){
 return d.workDate===dayKey(now)?d.completedToday:0;
}

export function effectiveEarnedToday(d:Driver,now=new Date()){
 return d.workDate===dayKey(now)?d.earnedToday:0;
}

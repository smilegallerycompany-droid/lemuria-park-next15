"use strict";

// Small invitation batches use the existing append-only audit event store.
// No orders, payments, sessions or ticket inventory are created by invitations.
const {createHash, randomBytes} = require('node:crypto');
const TYPE = 'InvitationTicket';
const PREFIX = 'LPINV1-';
const tokenPattern = /^LPINV1-[A-Za-z0-9_-]{43}$/;
const printedPattern = /^LP-(?:0[1-9]|10)-[A-F0-9]{6}$/;
const hashToken = token => createHash('sha256').update(token).digest('hex');
const key = (event, hash) => `invitation-v1-${event}-${hash}`;
const newToken = () => PREFIX + randomBytes(32).toString('base64url');

function localDay(now, timezone) {
  const date = new Intl.DateTimeFormat('en-CA', {timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  const weekday = new Intl.DateTimeFormat('en-US', {timeZone:timezone,weekday:'short'}).format(now);
  return {date, weekday, allowed: !['Sat','Sun'].includes(weekday)};
}

function validIssue(event, hash) {
  const m = event?.metadata;
  return event?.action === 'INVITATION_ISSUED' && event?.entityType === TYPE
    && m?.version === 1 && m?.tokenHash === hash && typeof m.number === 'string'
    && typeof m.locationId === 'string' && typeof m.batch === 'string'
    && m.attraction === 'LEMURS' && m.weekdayOnly === true && m.admissions === 1;
}

async function checkInInvitation(db, params, options = {}) {
  const token = params.qrToken.trim();
  if (!token.startsWith(PREFIX) && !printedPattern.test(token)) return null;
  if (!tokenPattern.test(token) && !printedPattern.test(token)) return {result:'INVALID',message:'Пригласительный не найден'};
  if (!params.cashierId) throw new Error('INVITATION_STAFF_REQUIRED');
  const hash = hashToken(token), issueId = key('issue', hash), now = options.now || new Date();
  return db.$transaction(async tx => {
    // Lock the issue event before checking/creating the unique use event.
    // PostgreSQL READ COMMITTED rechecks use state after a concurrent lock wait.
    const locked = await tx.$queryRaw`SELECT "id" FROM "AuditLog" WHERE "id" = ${issueId} FOR UPDATE`;
    if (locked.length !== 1) return {result:'INVALID',message:'Пригласительный не найден'};
    const issue = await tx.auditLog.findUnique({where:{id:issueId}});
    if (!validIssue(issue, hash)) return {result:'INVALID',message:'Пригласительный недействителен'};
    const meta = issue.metadata;
    const location = await tx.location.findUnique({where:{id:meta.locationId},select:{id:true,name:true,timezone:true,status:true}});
    if (!location) return {result:'INVALID',message:'Локация не найдена'};
    const day = localDay(now, location.timezone);
    const ticket = {publicId:meta.number,status:'VALID',sessionLocalDate:'Открытая дата',sessionLocalTime:'ПН-ПТ · лемуры',usedAt:null,locationName:location.name};
    const deny = async (result,message) => {
      await tx.auditLog.create({data:{actorId:params.cashierId,action:'INVITATION_CHECK_IN_DENIED',entityType:TYPE,entityId:meta.number,metadata:{result,batch:meta.batch,locationId:location.id}}});
      return {result,message,ticket};
    };
    if (Array.isArray(params.allowedLocationIds) && !params.allowedLocationIds.includes(location.id)) {
      return deny('WRONG_LOCATION',`Пригласительный для другой локации: ${location.name}`);
    }
    const cancelled = await tx.auditLog.findUnique({where:{id:key('cancel',hash)}});
    if (cancelled) return deny('CANCELLED','Пригласительный отменён');
    const used = await tx.auditLog.findUnique({where:{id:key('use',hash)}});
    if (used) {
      ticket.status='USED'; ticket.usedAt=used.createdAt.toISOString();
      return deny('ALREADY_USED','Пригласительный уже использован');
    }
    if (location.status !== 'ACTIVE') return deny('INVALID','Локация сейчас не принимает гостей');
    if (day.date < (meta.validFrom || '2026-11-07') || day.date > (meta.validThrough || '2026-12-20')) return deny('EXPIRED','Срок действия пригласительного истёк или ещё не наступил');
    if (!day.allowed || day.weekday==='Tue') return deny('WRONG_DATE','Пригласительный действует ПН, СР, ЧТ, ПТ; вторник — выходной');
    await tx.auditLog.create({data:{id:key('use',hash),actorId:params.cashierId,action:'INVITATION_CHECK_IN',entityType:TYPE,entityId:meta.number,createdAt:now,metadata:{version:1,batch:meta.batch,locationId:location.id,admissions:1,attraction:'LEMURS',localDate:day.date,timezone:location.timezone}}});
    return {result:'SUCCESS',message:'Проход разрешён · пригласительный · 1 человек · лемуры',ticket:{...ticket,status:'USED',usedAt:now.toISOString()}};
  }, {timeout:15000,isolationLevel:'ReadCommitted'});
}

async function issueBatch(db, {batch, locationId, actorId, invitations}) {
  if (!batch || !locationId || !actorId || !Array.isArray(invitations) || invitations.length !== 10) throw new Error('INVALID_INVITATION_BATCH');
  if (new Set(invitations.map(x=>x.number)).size !== 10 || new Set(invitations.map(x=>x.tokenHash)).size !== 10) throw new Error('DUPLICATE_INVITATION');
  for (const item of invitations) {
    if ((!/^LP-WD-261109-\d{3}$/.test(item.number) && !printedPattern.test(item.number)) || !/^[a-f0-9]{64}$/.test(item.tokenHash)) throw new Error('INVALID_INVITATION');
  }
  return db.$transaction(async tx => {
    const location = await tx.location.findUnique({where:{id:locationId},select:{id:true,slug:true,status:true}});
    if (!location || location.slug !== 'saratov' || location.status !== 'ACTIVE') throw new Error('INVALID_INVITATION_LOCATION');
    const actor = await tx.user.findUnique({where:{id:actorId},select:{role:true,status:true}});
    if (!actor || !['OWNER','DIRECTOR','ADMIN'].includes(actor.role) || actor.status !== 'ACTIVE') throw new Error('INVALID_ISSUER');
    let created=0;
    for (const item of invitations) {
      const id=key('issue',item.tokenHash);
      const metadata={version:1,batch,number:item.number,tokenHash:item.tokenHash,locationId,admissions:1,weekdayOnly:true,attraction:'LEMURS',validFrom:'2026-11-07',validThrough:'2026-12-20'};
      const old=await tx.auditLog.findUnique({where:{id}});
      if (old) {
        if (!validIssue(old,item.tokenHash) || old.entityId!==item.number || old.metadata.batch!==batch || old.metadata.locationId!==locationId) throw new Error('INVITATION_ISSUE_CONFLICT');
      } else {
        const duplicate=await tx.auditLog.findFirst({where:{entityType:TYPE,entityId:item.number,action:'INVITATION_ISSUED'}});
        if (duplicate) throw new Error('INVITATION_NUMBER_CONFLICT');
        await tx.auditLog.create({data:{id,actorId,action:'INVITATION_ISSUED',entityType:TYPE,entityId:item.number,metadata}});
        created++;
      }
    }
    return {ok:true,batch,total:invitations.length,created};
  },{timeout:20000,isolationLevel:'Serializable'});
}

module.exports={PREFIX,TYPE,newToken,hashToken,key,localDay,validIssue,checkInInvitation,issueBatch};

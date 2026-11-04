"use strict";
// Temporary private IAM-only recovery for one pre-existing ACTIVE OWNER.
// The owner enters the new password manually. No credential values are logged.
function assertWindow(expiresAt, now=Date.now()) {
 const expires=Date.parse(expiresAt||'');
 if(!Number.isFinite(expires)||now>=expires) throw new Error('RECOVERY_EXPIRED');
}
function assertTarget(user,email) {
 if(!user || user.email.toLowerCase()!==email.toLowerCase() || user.role!=='OWNER' || user.status!=='ACTIVE') throw new Error('TARGET_NOT_ACTIVE_OWNER');
}
function assertPassword(password) {
 if(typeof password!=='string'||password.length<12||password.length>128) throw new Error('PASSWORD_LENGTH');
}
function start(env=process.env) {
 const http=require('node:http');
 const {PrismaClient}=require('/app/node_modules/@prisma/client');
 const bcrypt=require('/app/node_modules/bcryptjs');
 const email=String(env.RECOVERY_EMAIL||'').toLowerCase();
 if(!email.includes('@')||!env.RECOVERY_REQUEST_ID) throw new Error('RECOVERY_CONFIG');
 const url=env.DATABASE_URL||`postgresql://${encodeURIComponent(env.DB_USER)}:${encodeURIComponent(env.DB_PASSWORD)}@${env.DB_HOST}:${env.DB_PORT||6432}/${env.DB_NAME}?sslmode=require&connection_limit=1&connect_timeout=10`;
 const db=new PrismaClient({datasources:{db:{url}},log:[]});
 http.createServer(async(req,res)=>{
  res.setHeader('Content-Type','application/json'); res.setHeader('Cache-Control','no-store');
  try {
   assertWindow(env.RECOVERY_EXPIRES_AT);
   if(req.method!=='POST'||req.url!=='/recover-owner'){res.writeHead(404);res.end('{"ok":false}');return;}
   let body='';for await(const part of req){body+=part;if(body.length>4096)throw new Error('BODY_TOO_LARGE');}
   const input=JSON.parse(body);assertPassword(input.password);
   // Existing hash and signing secrets are never selected or returned.
   const hash=await bcrypt.hash(input.password,12);
   const result=await db.$transaction(async tx=>{
    const [identity]=await tx.$queryRawUnsafe('SELECT current_database() AS database');
    if(identity.database!=='lemuria')throw new Error('WRONG_DATABASE');
    const users=await tx.user.findMany({where:{email:{equals:email,mode:'insensitive'}},select:{id:true,email:true,role:true,status:true}});
    if(users.length!==1)throw new Error('TARGET_NOT_UNIQUE');
    const user=users[0];assertTarget(user,email);
    const prior=await tx.auditLog.findFirst({where:{action:'OWNER_ACCESS_RECOVERED',entityId:user.id,metadata:{path:['recoveryRequestId'],equals:env.RECOVERY_REQUEST_ID}},select:{id:true}});
    if(prior)throw new Error('RECOVERY_ALREADY_COMPLETED');
    await tx.user.update({where:{id:user.id},data:{passwordHash:hash}});
    const sessions=await tx.staffSession.updateMany({where:{userId:user.id,revokedAt:null},data:{revokedAt:new Date()}});
    await tx.auditLog.create({data:{actorId:user.id,action:'OWNER_ACCESS_RECOVERED',entityType:'User',entityId:user.id,metadata:{recoveryRequestId:env.RECOVERY_REQUEST_ID,source:'authorized-cloud-owner-manual-recovery',revokedSessions:sessions.count}}});
    return {revokedSessions:sessions.count};
   },{timeout:20000,isolationLevel:'Serializable'});
   console.log(JSON.stringify({event:'OWNER_ACCESS_RECOVERED',requestId:env.RECOVERY_REQUEST_ID}));
   res.end(JSON.stringify({ok:true,...result}));
  } catch(e) {
   const safe=new Set(['RECOVERY_EXPIRED','PASSWORD_LENGTH','BODY_TOO_LARGE','WRONG_DATABASE','TARGET_NOT_UNIQUE','TARGET_NOT_ACTIVE_OWNER','RECOVERY_ALREADY_COMPLETED']);
   const code=safe.has(e.message)?e.message:'RECOVERY_FAILED';
   res.writeHead(code==='RECOVERY_EXPIRED'?410:400);res.end(JSON.stringify({ok:false,error:code}));
  }
 }).listen(Number(env.PORT||8080),'0.0.0.0');
}
module.exports={assertWindow,assertTarget,assertPassword,start};
if(require.main===module)start();

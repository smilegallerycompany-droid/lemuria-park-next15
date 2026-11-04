/* Independent private Serverless Container worker; no app startup or migrations. */
"use strict";
const http = require("node:http");

function reportDate(now, timeZone) {
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
  const previous = new Date(`${day}T12:00:00Z`);
  previous.setUTCDate(previous.getUTCDate() - 1);
  return previous.toISOString().slice(0, 10);
}

function recipients(value) {
  const ids = JSON.parse(value || "[]");
  if (!Array.isArray(ids) || !ids.length || ids.some(id => !/^-?\d+$/.test(String(id)))) {
    throw new Error("REPORT_RECIPIENTS_NOT_CONFIGURED");
  }
  return [...new Set(ids.map(String))];
}

const SQL = `
WITH bounds AS (
 SELECT ($1::date::timestamp AT TIME ZONE $2) AT TIME ZONE 'UTC' AS start_at,
        (($1::date + 1)::timestamp AT TIME ZONE $2) AT TIME ZONE 'UTC' AS end_at
), online_payments AS (
 SELECT p."orderId", p.amount,
  CASE WHEN COALESCE(p.payload->'object'->>'captured_at',p.payload->>'captured_at','')
                  ~ '^\\d{4}-\\d{2}-\\d{2}T'
       THEN COALESCE(p.payload->'object'->>'captured_at',p.payload->>'captured_at')::timestamptz AT TIME ZONE 'UTC'
       ELSE p."updatedAt" END AS confirmed_at,
  NOT (COALESCE(p.payload->'object'->>'captured_at',p.payload->>'captured_at','') ~ '^\\d{4}-\\d{2}-\\d{2}T') AS fallback_time
 FROM "Payment" p JOIN "Order" o ON o.id=p."orderId"
 WHERE o.source::text='ONLINE' AND p.status::text='SUCCEEDED'
   AND p.method::text='CARD_ONLINE' AND p.provider='yookassa'
   AND p.currency='RUB' AND o.currency='RUB'
   AND COALESCE(p.payload->'object'->>'test',p.payload->>'test','false') <> 'true'
), paid AS (
 SELECT COUNT(DISTINCT p."orderId")::int AS paid_orders,
        COALESCE(SUM(p.amount),0)::bigint AS paid_amount,
        COUNT(*) FILTER(WHERE p.fallback_time)::int AS payment_time_fallbacks
 FROM online_payments p CROSS JOIN bounds b
 WHERE p.confirmed_at >= b.start_at AND p.confirmed_at < b.end_at
), refunds AS (
 SELECT COUNT(*)::int AS refund_count,
        COALESCE(SUM(r.amount),0)::bigint AS refund_amount,
        COUNT(*) FILTER(WHERE r."completedAt" IS NULL)::int AS refund_time_fallbacks
 FROM "Refund" r JOIN "Order" o ON o.id=r."orderId" CROSS JOIN bounds b
 WHERE o.source::text='ONLINE' AND o.currency='RUB'
   AND r.status::text IN ('COMPLETED','SUCCEEDED')
   AND COALESCE(r."completedAt",r."updatedAt") >= b.start_at
   AND COALESCE(r."completedAt",r."updatedAt") < b.end_at
   AND EXISTS (SELECT 1 FROM online_payments p WHERE p."orderId"=o.id)
), created AS (
 SELECT COUNT(*)::int AS created_orders FROM "Order" o CROSS JOIN bounds b
 WHERE o.source::text='ONLINE' AND o.currency='RUB'
   AND o."createdAt">=b.start_at AND o."createdAt"<b.end_at
)
SELECT * FROM paid CROSS JOIN refunds CROSS JOIN created`;

function rub(value) {
  const cents = BigInt(value);
  const sign = cents < 0n ? "−" : "";
  const n = cents < 0n ? -cents : cents;
  return `${sign}${(n / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")},${(n % 100n).toString().padStart(2,"0")} ₽`;
}

function formatReport(row, date, timeZone) {
  const net = BigInt(row.paid_amount) - BigInt(row.refund_amount);
  const lines = [
    "Лемурия Парк — онлайн-заказы",
    `Дата: ${date.split("-").reverse().join(".")}`,
    `Сутки: 00:00–24:00 (${timeZone})`, "",
    `Создано заказов: ${row.created_orders}`,
    `Оплачено заказов: ${row.paid_orders}`,
    `Сумма оплат: ${rub(row.paid_amount)}`,
    `Возвратов: ${row.refund_count}`,
    `Сумма возвратов: ${rub(row.refund_amount)}`,
    `Оплаты минус возвраты: ${rub(net)}`, "",
    "Только онлайн-продажи. Возвраты учитываются в день завершения, включая заказы прошлых дней.",
  ];
  if (Number(row.payment_time_fallbacks) || Number(row.refund_time_fallbacks)) {
    lines.push(`Примечание: для ${row.payment_time_fallbacks} оплат и ${row.refund_time_fallbacks} возвратов без даты подтверждения использовано время обновления записи.`);
  }
  return lines.join("\n");
}

function databaseUrl(env) {
  if (env.DATABASE_URL) return env.DATABASE_URL;
  for (const key of ["DB_HOST","DB_NAME","DB_USER","DB_PASSWORD"]) {
    if (!env[key]) throw new Error(`MISSING_${key}`);
  }
  return `postgresql://${encodeURIComponent(env.DB_USER)}:${encodeURIComponent(env.DB_PASSWORD)}@${env.DB_HOST}:${env.DB_PORT || "6432"}/${env.DB_NAME}?sslmode=require&connection_limit=1&connect_timeout=10&pool_timeout=10`;
}

async function collect(prisma, date, timeZone) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("INVALID_REPORT_DATE");
  return prisma.$transaction(async tx => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '20000ms'");
    const [identity] = await tx.$queryRawUnsafe("SELECT current_database() AS name");
    if (identity.name !== "lemuria") throw new Error("WRONG_DATABASE");
    const rows = await tx.$queryRawUnsafe(SQL, date, timeZone);
    return JSON.parse(JSON.stringify(rows[0], (_, v) => typeof v === "bigint" ? v.toString() : v));
  }, { maxWait: 10000, timeout: 25000 });
}

async function telegram(token, chatId, text) {
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({chat_id: chatId, text, link_preview_options: {is_disabled:true}}),
    signal: AbortSignal.timeout(15000),
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(`TELEGRAM_SEND_FAILED_${response.status}`);
  return { chatId: String(chatId), messageId: result.result.message_id };
}

function start(env = process.env) {
  const { PrismaClient } = require("/app/node_modules/@prisma/client");
  const prisma = new PrismaClient({datasources:{db:{url:databaseUrl(env)}}});
  // Platform IAM must protect this container; do not grant public invocation.
  const server = http.createServer(async (req,res) => {
    res.setHeader("Content-Type","application/json; charset=utf-8");
    if (req.method === "GET") { res.end(JSON.stringify({ok:true,worker:"telegram-online-report-v1"})); return; }
    if (req.method !== "POST" || req.url !== "/") { res.writeHead(404); res.end('{"ok":false}'); return; }
    try {
      let body="";
      for await (const chunk of req) { body+=chunk; if(body.length>4096)throw new Error("BODY_TOO_LARGE"); }
      const input=JSON.parse(body);
      if (!['preview','send'].includes(input.mode)) throw new Error("INVALID_MODE");
      const timeZone=env.REPORT_TIMEZONE || "Europe/Saratov";
      const date=input.date || reportDate(new Date(),timeZone);
      const row=await collect(prisma,date,timeZone);
      const text=formatReport(row,date,timeZone);
      if(input.mode==='preview') {res.end(JSON.stringify({ok:true,date,timeZone,row,text}));return;}
      if(!env.TELEGRAM_BOT_TOKEN) throw new Error("MISSING_TELEGRAM_BOT_TOKEN");
      const results=[];
      // Explicit allowlist only; /start never subscribes a new recipient automatically.
      for(const id of recipients(env.REPORT_CHAT_IDS)) results.push(await telegram(env.TELEGRAM_BOT_TOKEN,id,text));
      console.log(JSON.stringify({event:"DAILY_ONLINE_REPORT_SENT",date,timeZone,deliveries:results}));
      res.end(JSON.stringify({ok:true,date,deliveries:results}));
    } catch(error) {
      // Do not print request bodies, URLs, database errors, credentials or PII.
      console.error(JSON.stringify({event:"DAILY_ONLINE_REPORT_FAILED",code:error.code || "REPORT_FAILED"}));
      res.writeHead(500);res.end('{"ok":false,"error":"REPORT_FAILED"}');
    }
  });
  server.listen(Number(env.PORT || 8080),'0.0.0.0');
  for(const signal of ['SIGTERM','SIGINT']) process.on(signal,()=>server.close(()=>prisma.$disconnect().finally(()=>process.exit(0))));
}

module.exports={reportDate,recipients,formatReport,databaseUrl,SQL,collect,start};
if(require.main===module) start();

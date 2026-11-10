'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {nearestSessions}=require('./session-break-policy.cjs');
const loc={slug:'saratov',timezone:'Europe/Saratov'};
const make=t=>({startsAt:new Date(`2026-11-11T${t}:00+04:00`)});
test('fills six slots after removing both breaks using Saratov local time',async()=>{
 const rows=['12:00','12:30','13:00','13:30','16:30','17:00','17:30','18:00'].map(make);
 const original=JSON.stringify(rows),calls=[];
 const actual=await nearestSessions(async(skip,take)=>{calls.push(skip);return rows.slice(skip,skip+take)},loc);
 assert.deepEqual(actual,[rows[0],rows[1],rows[3],rows[4],rows[6],rows[7]]);
 assert.deepEqual(calls,[0,6]);assert.equal(JSON.stringify(rows),original);
});
test('keeps 13:30 and 17:30 and handles exhausted schedule',async()=>{
 const rows=['13:00','13:30','17:00','17:30'].map(make);
 assert.deepEqual(await nearestSessions(async(skip,take)=>rows.slice(skip,skip+take),loc),[rows[1],rows[3]]);
 assert.deepEqual(await nearestSessions(async()=>[],loc),[]);
});
test('other locations retain their existing times',async()=>{
 const rows=['13:00','17:00'].map(make);
 assert.deepEqual(await nearestSessions(async()=>rows,{slug:'volgograd',timezone:'Europe/Moscow'}),rows);
});

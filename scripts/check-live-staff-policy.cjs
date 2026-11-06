#!/usr/bin/env node
"use strict";
// Exercise the actual production bundle's pure role/location policy.
// No database, cookies, passwords or employee records are used.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(process.argv[2]||'');
const modules={},cache={};
for(const file of fs.readdirSync(path.join(root,'.next/server/chunks'))){
 if(!file.endsWith('.js'))continue;
 const chunk=require(path.join(root,'.next/server/chunks',file));
 for(const [id,body] of Object.entries(chunk.modules||{})){
  // Next emits route-specific export subsets; prefer the complete definition.
  if(!modules[id]||body.toString().length>modules[id].toString().length)modules[id]=body;
 }
}
function load(id){
 if(cache[id])return cache[id].exports;
 assert.equal(typeof modules[id],'function','Production policy dependency '+id);
 const module={exports:{}};cache[id]=module;modules[id](module,module.exports,load);return module.exports;
}
load.d=(target,definitions)=>{for(const key in definitions)Object.defineProperty(target,key,{enumerable:true,get:definitions[key]});};
const policy=load(83961);
const locationScope=namedGuard('locationIds');
const assertLocation=namedGuard('Нет доступа к этой локации');
let checks=0;
const deny=action=>{assert.throws(action,error=>error.code==='FORBIDDEN');checks++;};
for(const role of ['CASHIER','ADMIN','DIRECTOR','ONLINE_MANAGER']){
 const actor={role,locationIds:['saratov'],readOnly:false};
 assert.deepEqual(locationScope(actor),['saratov']);checks++;
 assertLocation(actor,'saratov');checks++;
 deny(()=>assertLocation(actor,'volgograd'));
}
for(const readOnly of [false,true]){
 const actor={role:'OWNER',locationIds:['saratov'],readOnly};
 assert.equal(locationScope(actor),null);checks++;
 assertLocation(actor,'volgograd');checks++;
}
function namedGuard(text){
 const matches=[...new Set(Object.values(policy))].filter(fn=>typeof fn==='function'&&fn.toString().includes(text));
 assert.equal(matches.length,1,'Unique guard: '+text);return matches[0];
}
const prices=namedGuard('Изменять цены');
const operations=namedGuard('Недостаточно прав для управления данными парка');
const reports=namedGuard('Заполнять отчёт может');
for(const role of ['OWNER','DIRECTOR']){prices({role,readOnly:false});checks++;}
for(const role of ['OWNER','DIRECTOR'])deny(()=>prices({role,readOnly:true}));
for(const role of ['ADMIN','CASHIER','ONLINE_MANAGER'])deny(()=>prices({role,readOnly:false}));
for(const role of ['OWNER','DIRECTOR','ADMIN']){
 operations({role,readOnly:false});checks++;
 reports({role,readOnly:false});checks++;
 deny(()=>operations({role,readOnly:true}));
 deny(()=>reports({role,readOnly:true}));
}
for(const role of ['CASHIER','ONLINE_MANAGER']){
 deny(()=>operations({role,readOnly:false}));
 deny(()=>reports({role,readOnly:false}));
}
for(const role of ['CASHIER','ADMIN','DIRECTOR','ONLINE_MANAGER']){
 const unassigned={role,locationIds:[],readOnly:false};
 assert.deepEqual(locationScope(unassigned),[]);checks++;
 deny(()=>assertLocation(unassigned,'saratov'));
 deny(()=>assertLocation(unassigned,'volgograd'));
}
console.log(JSON.stringify({ok:true,checks,administratorRestrictedToAssignedLocations:true,administratorCannotChangePrices:true,readonlyOwnerCannotWrite:true,ownerCanViewBothLocations:true,note:'Cashier report writes use a separate own-shift endpoint; no global finance grant tested here.'}));

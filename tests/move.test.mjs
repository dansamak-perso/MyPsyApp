import fs from 'fs';
import { JSDOM } from 'jsdom';
import React from 'react';
import ReactDOMClient from 'react-dom/client';
const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:'https://example.com/',pretendToBeVisual:true});
const {window}=dom; global.window=window; global.document=window.document;
Object.defineProperty(global,'navigator',{value:window.navigator,configurable:true});
for(const k of ['HTMLElement','Element','Node','Blob','File','URL','HTMLInputElement','HTMLTextAreaElement','Audio','FileReader']) global[k]=window[k];
global.getComputedStyle=window.getComputedStyle; global.localStorage=window.localStorage;
global.requestAnimationFrame=cb=>setTimeout(cb,0); global.IS_REACT_ACT_ENVIRONMENT=true;
window.alert=()=>{}; let answers=[]; window.confirm=()=>answers.length?answers.shift():true;
const iso=x=>x.toISOString().slice(0,10);
const today=new Date('2026-09-02T12:00:00');
const RealDate=Date;
global.Date=class extends RealDate{ constructor(...a){ return a.length?new RealDate(...a):new RealDate(today); } static now(){ return today.getTime(); } };
const TODAY=iso(today), MON=iso(new RealDate('2026-08-31T12:00:00')), SUN=iso(new RealDate('2026-08-30T12:00:00')), NEXT=iso(new RealDate('2026-09-09T12:00:00'));
const seed=()=>window.localStorage.setItem('clinic_data_v1',JSON.stringify({schemaVersion:2,
 patients:[{id:'p1',name:'דנה כהן',sessionRate:300,payerType:'private'}],
 appointments:[{id:'s1',patientId:'p1',date:MON,startTime:'10:00',duration:50,status:'scheduled',paid:false}],
 payments:[]}));
seed();
window.React=React; window.ReactDOM=ReactDOMClient; global.React=React; global.ReactDOM=ReactDOMClient;
const html=fs.readFileSync(new URL('../index.html', import.meta.url),'utf8');
const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
const {act}=await import('react-dom/test-utils');
const mount=async()=>{ document.getElementById('root').innerHTML=''; await act(async()=>{ (0,eval)(scripts[scripts.length-1]); }); };
await mount();
const store=()=>JSON.parse(window.localStorage.getItem('clinic_data_v1'));
const txt=()=>document.getElementById('root').textContent;
const findAll=(sel,re)=>[...document.querySelectorAll(sel)].filter(e=>re.test(e.textContent));
const click=async(el,w)=>{ if(!el) throw new Error('nf '+w); await act(async()=>el.dispatchEvent(new window.MouseEvent('click',{bubbles:true}))); };
const setVal=async(el,v)=>{ const k=Object.keys(el).find(x=>x.startsWith('__reactProps$')); await act(async()=>el[k].onChange({target:{value:v}})); };
let bad=0; const check=(n,ok)=>{ if(!ok)bad++; console.log((ok?'PASS ':'FAIL ')+n); };

await click(findAll('button',/בואי נסדר את היום/)[0],'start');
check('single move button (merged)', findAll('button',/עברה לתאריך אחר/).length===1);
check('old reschedule button gone', findAll('button',/נדחתה ל-/).length===0);
await click(findAll('button',/עברה לתאריך אחר/)[0],'open');
check('free date input', !!document.querySelector('.modal input[type="date"]'));
check('free time input', !!document.querySelector('.modal input[type="time"]'));
check('quick chips present', findAll('.modal button',/שבוע הבא/).length===1 && findAll('.modal button',/^היום$/).length===1);

// --- PAST branch: asks for confirmation
await setVal(document.querySelector('.modal input[type="date"]'),SUN);
check('past date asks to confirm attendance', /האם הפגישה אכן התקיימה אז/.test(txt()));
check('offers yes-came', findAll('.modal button',/כן, הגיע/).length===1);
check('offers not-sure', findAll('.modal button',/עדיין לא בטוח/).length===1);
await setVal(document.querySelector('.modal input[type="time"]'),'14:30');
await click(findAll('.modal button',/כן, הגיע/)[0],'confirm past');
let a=store().appointments.find(x=>x.id==='s1');
check('moved to past date', a.date===SUN);
check('time applied', a.startTime==='14:30');
check('status completed', a.status==='completed');

// --- PAST but unconfirmed -> stays pending
seed(); await mount();
await click(findAll('button',/בואי נסדר את היום/)[0],'start2');
await click(findAll('button',/עברה לתאריך אחר/)[0],'open2');
await setVal(document.querySelector('.modal input[type="date"]'),SUN);
await click(findAll('.modal button',/עדיין לא בטוח/)[0],'not sure');
a=store().appointments.find(x=>x.id==='s1');
check('unconfirmed past stays scheduled', a.date===SUN && a.status==='scheduled');
await click(findAll('button',/חזרה למסך הבית/)[0],'close');
await click(findAll('button',/בואי נסדר את היום/)[0],'reopen');
check('still asked to confirm later', /האם הפגישה התקיימה/.test(txt()));

// --- FUTURE branch: stays scheduled, no attendance question
seed(); await mount();
await click(findAll('button',/בואי נסדר את היום/)[0],'start3');
await click(findAll('button',/עברה לתאריך אחר/)[0],'open3');
await setVal(document.querySelector('.modal input[type="date"]'),NEXT);
check('future shows no attendance question', !/האם הפגישה אכן התקיימה אז/.test(txt()));
check('future explains it will ask later', /נבקש כאן לאשר שהגיע/.test(txt()));
await click(findAll('.modal button',/קביעה למועד החדש/)[0],'save future');
a=store().appointments.find(x=>x.id==='s1');
check('moved to future date', a.date===NEXT);
check('future stays scheduled', a.status==='scheduled');
check('future not pending yet', /יום נקי/.test(txt()));
check('no NaN', !txt().includes('NaN'));
process.exit(bad?1:0);

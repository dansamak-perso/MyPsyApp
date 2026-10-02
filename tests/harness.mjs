// Shared harness: boots index.html in jsdom with fake IndexedDB and an
// in-memory Google Drive, so two "devices" can share one Drive file.
import fs from 'fs';
import { JSDOM } from 'jsdom';
import React from 'react';
import ReactDOMClient from 'react-dom/client';
import { IDBFactory } from 'fake-indexeddb';

export function makeDrive(initial) {
  return { content: initial ? JSON.stringify(initial) : '', version: initial ? 1 : 0, uploads: 0, fileId: 'F1' };
}

export async function boot({ local, drive, clientId = null, idb = null, rawLocal = null, htmlPath = new URL('../index.html', import.meta.url) }) {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.indexedDB = idb || new IDBFactory();
  const g = globalThis;
  g.window = window;
  g.document = window.document;
  Object.defineProperty(g, 'navigator', { value: window.navigator, configurable: true });
  for (const k of ['HTMLElement', 'Element', 'Node', 'Blob', 'File', 'URL', 'HTMLInputElement', 'HTMLTextAreaElement', 'Audio', 'FileReader']) g[k] = window[k];
  g.getComputedStyle = window.getComputedStyle;
  g.localStorage = window.localStorage;
  g.indexedDB = window.indexedDB;
  g.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  g.IS_REACT_ACT_ENVIRONMENT = true;
  const ui = { alerts: [], answers: [] };
  window.alert = (m) => ui.alerts.push(m);
  window.confirm = () => (ui.answers.length ? ui.answers.shift() : true);
  if (rawLocal) window.localStorage.setItem('clinic_data_v1', rawLocal);
  else if (local) window.localStorage.setItem('clinic_data_v1', JSON.stringify(local));
  if (clientId) {
    window.localStorage.setItem('gdrive_client_id', clientId);
    window.localStorage.setItem('gdrive_file_id', 'F1');
  }
  // fake Google Identity Services: silent token always granted
  window.google = { accounts: { oauth2: { initTokenClient: () => {
    const c = { callback: () => {}, requestAccessToken() { setTimeout(() => c.callback({ access_token: 'tok', expires_in: 3600 }), 0); } };
    return c;
  } } } };
  // fake Drive REST
  const fetchImpl = async (url, opts = {}) => {
    const u = String(url);
    if (window.__dbg) console.log('DBG[' + window.__dbg + '] fetch', opts.method || 'GET', u.replace('https://www.googleapis.com', ''));
    const json = (o) => ({ ok: true, json: async () => o, text: async () => JSON.stringify(o) });
    if (!drive) return { ok: false, json: async () => ({}), text: async () => '' };
    if (u.includes('/upload/drive/v3/files/') && opts.method === 'PATCH') {
      drive.content = opts.body; drive.version += 1; drive.uploads += 1;
      return json({ version: String(drive.version) });
    }
    if (u.includes('?fields=version')) return json({ version: String(drive.version) });
    if (u.includes('alt=media')) return { ok: true, text: async () => drive.content, json: async () => JSON.parse(drive.content || 'null') };
    if (u.includes('/drive/v3/files?q=')) return json({ files: [{ id: 'F1', name: 'x' }] });
    return json({ id: 'F1' });
  };
  window.fetch = fetchImpl;
  g.fetch = fetchImpl;
  window.React = React;
  window.ReactDOM = ReactDOMClient;
  g.React = React;
  g.ReactDOM = ReactDOMClient;
  const html = fs.readFileSync(htmlPath, 'utf8');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const { act } = await import('react-dom/test-utils');
  // each device runs in its own JS realm: no shared globals between devices
  await act(async () => { window.eval(scripts[scripts.length - 1]); });
  const settle = async (ms = 60) => { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); };
  const api = {
    window, ui, act, settle,
    store: () => JSON.parse(window.localStorage.getItem('clinic_data_v1') || 'null'),
    raw: () => window.localStorage.getItem('clinic_data_v1') || '',
    txt: () => window.document.getElementById('root').textContent,
    findAll: (sel, re) => [...window.document.querySelectorAll(sel)].filter((e) => re.test(e.textContent)),
    async click(el, what) {
      if (!el) throw new Error('not found: ' + what);
      await act(async () => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })));
    },
    async setVal(el, v) {
      const k = Object.keys(el).find((x) => x.startsWith('__reactProps$'));
      await act(async () => el[k].onChange({ target: { value: v } }));
    },
    async idbKeys() {
      return new Promise((resolve) => {
        const req = window.indexedDB.open('clinic_audio', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('notes');
        req.onsuccess = () => {
          const tx = req.result.transaction('notes', 'readonly');
          const r = tx.objectStore('notes').getAllKeys();
          r.onsuccess = () => resolve(r.result);
        };
      });
    },
  };
  api.idb = window.indexedDB;
  return api;
}

export function reporter() {
  let bad = 0;
  return {
    check(name, ok) { if (!ok) bad++; console.log((ok ? 'PASS ' : 'FAIL ') + name); },
    done() { process.exit(bad ? 1 : 0); },
  };
}

export const pad = (n) => String(n).padStart(2, '0');
export const localDay = (offset = 0) => {
  const x = new Date(Date.now() + offset * 864e5);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
};

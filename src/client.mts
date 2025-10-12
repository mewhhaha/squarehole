/**
 * @module
 * Minimal client-interaction helpers for Squarehole.
 *
 * Provides a Qwik-like on-demand loading model without a compiler.
 * - Define small client handlers on the server with `define()`; they're shipped on first interaction.
 * - Or reference pre-existing ESM modules by URL with `module()`.
 * - Attach interactions ergonomically with `on(event, ref, args)`.
 */

import { into, type Html } from "./runtime/node.mts";
import { SIGNAL } from "./runtime/signal.mts";
import { registerClientFunction } from "./client-server.mts";
import { useHook } from "./runtime/hooks.mts";

// -----------------------
// Types
// -----------------------

export type Handler<Args = unknown, This = any> = (
  this: This,
  el: Element,
  ev: Event,
  state: Args,
) => unknown | Promise<unknown>;

export type DefinedRef<Args = unknown> = {
  readonly t: "f";
  readonly i: string; // id
  // For typing only
  readonly _a?: Args;
};

export type ClientRef = { t: "f"; i: string };

type ArgsOf<F> = F extends (this: any, el: any, ev: any, state: infer A) => any
  ? A
  : never;

// -----------------------
// Server helpers
// -----------------------

/**
 * Define a small client handler inline on the server.
 * The function must be self-contained (no server-only references) and operate on DOM + event + state.
 */
export function define<Args = unknown>(fn: Handler<Args>): DefinedRef<Args> {
  const src = fn.toString();
  const id = stableId(src);
  registerClientFunction(id, src);
  return { t: "f", i: id } as const;
}

// -----------------------
// Minimal state utilities
// -----------------------

export type Signal<T> = {
  readonly __client: "sig";
  readonly id: string;
  readonly initial: T;
  toJSON(): { __client: "sig"; i: string };
};

export function useState<T>(initial: T): Signal<T> {
  return useHook(() => {
    const id = crypto.randomUUID().replaceAll(/[^A-Za-z0-9_-]/g, "");
    return {
      __client: "sig",
      id,
      initial,
      [SIGNAL]: true,
      toJSON() {
        return { __client: "sig", i: id } as const;
      },
    } as const;
  });
}

/**
 * Small bootstrap script to enable delegated event handling and on-demand module loading.
 * Include once per document, typically inside the root layout after content.
 */
export const Client = ({ nonce }: { nonce?: string }): Html => {
  const nonceAttr = nonce ? ` nonce="${nonce}"` : "";
  return into(`
<script type="module"${nonceAttr}>
  (function(){
    const loaded = new Map();
    async function load(spec){ if(!loaded.has(spec)) loaded.set(spec, import(spec)); return loaded.get(spec); }
    const state = new Map();
    // Persistent per-element context for handlers, keyed by encoded payload
    const CTX = Symbol.for('client.ctx');
    // Signal id -> set of bound attribute bindings { el, attr, val }
    const watchers = new Map();
    function valDecode(s){ try { return JSON.parse(decodeURIComponent(escape(atob(s)))); } catch { return undefined; } }
    function seed(){
      document.querySelectorAll('[data-client-t]').forEach((el)=>{
        const id = el.getAttribute('data-client-t');
        const enc = el.getAttribute('data-client-v');
        if(id && enc && !state.has(id)) state.set(id, valDecode(enc));
      });
    }
    function set(id, next){
      const prev = state.get(id);
      const val = (typeof next === 'function') ? next(prev) : next;
      state.set(id, val);
      document.querySelectorAll('[data-client-t="'+id+'"]').forEach(el => { el.textContent = String(val); });
      // Update any attribute bindings that reference this signal
      const setFor = watchers.get(id);
      if (setFor && setFor.size) {
        setFor.forEach((b)=>{ try { applyAttr(b.el, b.attr, b.val); } catch(_){} });
      }
    }
    function get(id){ return state.get(id); }
    function revive(key, value){
      if(value && value.__client === 'sig' && typeof value.i === 'string'){
        const id = value.i;
        return {
          id,
          get(){ return get(id); },
          set(next){ return set(id, next); }
        };
      }
      return value;
    }
    function decodePayload(el, type){
      const name = 'data-client-' + type;
      const val = el.getAttribute(name);
      if(!val) return null;
      try{
        const json = decodeURIComponent(escape(atob(val)));
        return JSON.parse(json, revive);
      }catch(_){ return null; }
    }
    function decodeRaw(val){
      try{ return JSON.parse(decodeURIComponent(escape(atob(val))), revive); }catch(_){ return null; }
    }
    function collectSignalIds(ctx){
      const ids = new Set();
      try {
        for (const k in ctx) {
          const v = ctx[k];
          if (v && typeof v === 'object' && typeof v.id === 'string') ids.add(v.id);
        }
      } catch(_){}
      return ids;
    }
    async function applyAttr(el, attr, val){
      const data = val && decodeRaw(val);
      if(!data) return;
      let fn;
      if(data.t === 'm'){
        const mod = await load(data.s);
        fn = mod[data.e] ?? mod.default;
      } else if (data.t === 'f') {
        const mod = await load('/_client/f/' + data.i + '.js');
        fn = mod.default;
      } else return;
      const ctx = getCtx(el, val, (data && typeof data.a === 'object' && data.a) || {});
      let result;
      try { result = await fn.call(ctx, el, new Event('update'), ctx); } catch(_) { return; }
      // Apply result to attribute
      if (attr === 'class') {
        el.setAttribute('class', result == null ? '' : String(result));
      } else if (attr === 'hidden' || attr === 'disabled' || attr === 'inert') {
        if (!!result) el.setAttribute(attr, ''); else el.removeAttribute(attr);
      } else {
        if (result == null) el.removeAttribute(attr); else el.setAttribute(attr, String(result));
      }
      // Register watchers for signals referenced by ctx
      const ids = collectSignalIds(ctx);
      ids.forEach((id)=>{
        if(!watchers.has(id)) watchers.set(id, new Set());
        watchers.get(id).add({ el, attr, val });
      });
    }
    function getCtx(el, key, init){
      let map = el[CTX];
      if(!map){ map = new Map(); el[CTX] = map; }
      if(map.has(key)) return map.get(key);
      map.set(key, init);
      return init;
    }
    async function handle(ev){
      let el = ev.target instanceof Element ? ev.target : null;
      while(el){
        const name = 'data-client-' + ev.type;
        const val = el.getAttribute(name);
        const data = val && decodePayload(el, ev.type);
        if(data){
          if(data.t === 'm'){
            const mod = await load(data.s);
            const fn = mod[data.e] ?? mod.default;
            const ctx = getCtx(el, val, (data && typeof data.a === 'object' && data.a) || {});
            await fn.call(ctx, el, ev, ctx);
          } else if (data.t === 'f') {
            const mod = await load('/_client/f/' + data.i + '.js');
            const fn = mod.default;
            const ctx = getCtx(el, val, (data && typeof data.a === 'object' && data.a) || {});
            await fn.call(ctx, el, ev, ctx);
          }
          return;
        }
        el = el.parentElement;
      }
    }
    // Dynamically bind delegated events for any data-client-<event> present
    function bindDelegatedEvents(){
      const events = new Set();
      // scan once at startup; add listeners for all found event types
      document.querySelectorAll('*').forEach((el)=>{
        const names = el.getAttributeNames?.();
        if(!names) return;
        for(const n of names){
          if(n && n.startsWith('data-client-')){
            const ev = n.slice(12);
            if(ev && ev !== 'mount' && ev !== 'unmount' && ev !== 't' && ev !== 'v'){
              events.add(ev);
            }
          }
        }
      });
      for(const e of events){ document.addEventListener(e, handle); }
    }
    bindDelegatedEvents();
    // Bind attribute handlers and compute initial values
    function bindAttrHandlers(){
      document.querySelectorAll('*').forEach((el)=>{
        const names = el.getAttributeNames?.();
        if(!names) return;
        for(const n of names){
          if(n && n.startsWith('data-client-attr-')){
            const attr = n.slice(17);
            const val = el.getAttribute(n);
            if (!val) continue;
            applyAttr(el, attr, val);
          }
        }
      });
    }
    // Mount handlers after DOM is ready
    function runMounts(){
      document.querySelectorAll('[data-client-mount]').forEach(async (el)=>{
        const val = el.getAttribute('data-client-mount');
        const data = val && decodeRaw(val);
        if(!data) return;
        try {
          if(data.t === 'm'){
            const mod = await load(data.s);
            const fn = mod[data.e] ?? mod.default;
            const ctx = getCtx(el, val, (data && typeof data.a === 'object' && data.a) || {});
            await fn.call(ctx, el, new Event('mount'), ctx);
          } else if (data.t === 'f') {
            const mod = await load('/_client/f/' + data.i + '.js');
            const fn = mod.default;
            const ctx = getCtx(el, val, (data && typeof data.a === 'object' && data.a) || {});
            await fn.call(ctx, el, new Event('mount'), ctx);
          }
        } catch(_) {}
      });
    }
    // Unmount handlers when elements are removed
    function observeRemovals(){
      const callUnmount = async (el)=>{
        const val = el.getAttribute && el.getAttribute('data-client-unmount');
        if(!val) return;
        const data = decodeRaw(val);
        if(!data) return;
        try{
          if(data.t === 'm'){
            const mod = await load(data.s);
            const fn = mod[data.e] ?? mod.default;
            const ctx = getCtx(el, val, (data && typeof data.a === 'object' && data.a) || {});
            await fn.call(ctx, el, new Event('unmount'), ctx);
          } else if (data.t === 'f') {
            const mod = await load('/_client/f/' + data.i + '.js');
            const fn = mod.default;
            const ctx = getCtx(el, val, (data && typeof data.a === 'object' && data.a) || {});
            await fn.call(ctx, el, new Event('unmount'), ctx);
          }
        } catch(_) {}
        // cleanup context map for this payload
        try { const map = el[CTX]; if(map && typeof map.delete === 'function') map.delete(val); } catch(_){}
      };
      const mo = new MutationObserver((mutations)=>{
        for(const m of mutations){
          m.removedNodes && m.removedNodes.forEach((n)=>{
            if(!(n instanceof Element)) return;
            // Call on the removed element and any descendants
            callUnmount(n);
            n.querySelectorAll && n.querySelectorAll('[data-client-unmount]').forEach((el)=>callUnmount(el));
            // Best-effort: clear entire context holder to allow GC
            try { if(n[CTX]) { n[CTX].clear?.(); n[CTX] = undefined; } } catch(_){}
          });
        }
      });
      mo.observe(document, { childList: true, subtree: true });
    }
    if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ()=>{ seed(); runMounts(); bindAttrHandlers(); });
    else { seed(); runMounts(); bindAttrHandlers(); }
    observeRemovals();
    // expose minimal API for inline handlers to use
    window.__client = Object.assign(window.__client || {}, { load, set, get, state });
  })();
</script>`);
};

// -----------------------
// Utilities
// -----------------------

function stableId(src: string): string {
  // FNV-1a 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < src.length; i++) {
    h ^= src.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // base36 string
  return 'f' + (h >>> 0).toString(36);
}

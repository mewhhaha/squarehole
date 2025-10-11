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
  readonly __sh: "sig";
  readonly id: string;
  readonly initial: T;
  toJSON(): { __sh: "sig"; i: string };
};

export function useState<T>(initial: T): Signal<T> {
  return useHook(() => {
    const id = crypto.randomUUID().replaceAll(/[^A-Za-z0-9_-]/g, "");
    return {
      __sh: "sig",
      id,
      initial,
      [SIGNAL]: true,
      toJSON() {
        return { __sh: "sig", i: id } as const;
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
    const CTX = Symbol.for('sh.ctx');
    function valDecode(s){ try { return JSON.parse(decodeURIComponent(escape(atob(s)))); } catch { return undefined; } }
    function seed(){
      document.querySelectorAll('[data-sh-t]').forEach((el)=>{
        const id = el.getAttribute('data-sh-t');
        const enc = el.getAttribute('data-sh-v');
        if(id && enc && !state.has(id)) state.set(id, valDecode(enc));
      });
    }
    function set(id, next){
      const prev = state.get(id);
      const val = (typeof next === 'function') ? next(prev) : next;
      state.set(id, val);
      document.querySelectorAll('[data-sh-t="'+id+'"]').forEach(el => { el.textContent = String(val); });
    }
    function get(id){ return state.get(id); }
    function revive(key, value){
      if(value && value.__sh === 'sig' && typeof value.i === 'string'){
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
      const name = 'data-sh-' + type;
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
        const name = 'data-sh-' + ev.type;
        const val = el.getAttribute(name);
        const data = val && decodePayload(el, ev.type);
        if(data){
          try {
            if(data.t === 'm'){
              const mod = await load(data.s);
              const fn = mod[data.e] ?? mod.default;
              const ctx = getCtx(el, val, (data && typeof data.a === 'object' && data.a) || {});
              await fn.call(ctx, el, ev, ctx);
            } else if (data.t === 'f') {
              const mod = await load('/_sh/f/' + data.i + '.js');
              const fn = mod.default;
              const ctx = getCtx(el, val, (data && typeof data.a === 'object' && data.a) || {});
              await fn.call(ctx, el, ev, ctx);
            }
          } finally {
            // Always prevent default when a handler is present
            if(typeof ev.preventDefault === 'function') ev.preventDefault();
          }
          return;
        }
        el = el.parentElement;
      }
    }
    const events = ['click','change','input','submit'];
    for(const e of events){ document.addEventListener(e, handle); }
    // Mount handlers after DOM is ready
    function runMounts(){
      document.querySelectorAll('[data-sh-mount]').forEach(async (el)=>{
        const val = el.getAttribute('data-sh-mount');
        const data = val && decodeRaw(val);
        if(!data) return;
        try {
          if(data.t === 'm'){
            const mod = await load(data.s);
            const fn = mod[data.e] ?? mod.default;
            const ctx = getCtx(el, val, (data && typeof data.a === 'object' && data.a) || {});
            await fn.call(ctx, el, new Event('mount'), ctx);
          } else if (data.t === 'f') {
            const mod = await load('/_sh/f/' + data.i + '.js');
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
        const val = el.getAttribute && el.getAttribute('data-sh-unmount');
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
            const mod = await load('/_sh/f/' + data.i + '.js');
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
            n.querySelectorAll && n.querySelectorAll('[data-sh-unmount]').forEach((el)=>callUnmount(el));
            // Best-effort: clear entire context holder to allow GC
            try { if(n[CTX]) { n[CTX].clear?.(); n[CTX] = undefined; } } catch(_){}
          });
        }
      });
      mo.observe(document, { childList: true, subtree: true });
    }
    if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ()=>{ seed(); runMounts(); });
    else { seed(); runMounts(); }
    observeRemovals();
    // expose minimal API for inline handlers to use
    window.__sh = Object.assign(window.__sh || {}, { load, set, get, state });
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

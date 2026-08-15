/* ============================================================
   api.js — HTTP + SSE client for the backend
   ============================================================ */
const API = (() => {
  'use strict';

  const BASE = '';  // same origin

  async function request(method, path, body) {
    const opts = {
      method,
      headers: {},
    };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    try {
      const res = await fetch(BASE + path, opts);
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw { status: res.status, message: text || res.statusText };
      }
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) return res.json();
      return res.text();
    } catch (err) {
      if (err && err.status) throw err;
      throw { status: 0, message: 'Erro de conexão' };
    }
  }

  function get(path) { return request('GET', path); }
  function post(path, body) { return request('POST', path, body); }
  function del(path) { return request('DELETE', path); }

  // SSE — returns EventSource and a cleanup function
  function subscribeSSE(onEvent) {
    const es = new EventSource(BASE + '/api/events');
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        onEvent(data);
      } catch (_) { /* ignore */ }
    };
    es.onerror = () => {
      onEvent({ type: '_error' });
    };
    return () => es.close();
  }

  return { get, post, del, subscribeSSE };
})();

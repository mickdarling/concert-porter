/**
 * Concert Porter — setlist.fm CORS relay.
 *
 * The setlist.fm API sends no CORS headers, so browsers can't call it
 * directly. This Cloudflare Worker forwards read-only search requests
 * and adds CORS. Deploy with `wrangler deploy` from this folder.
 *
 * API key resolution: the caller's `x-api-key` header wins; otherwise
 * the Worker's SETLISTFM_API_KEY secret is used
 * (`wrangler secret put SETLISTFM_API_KEY`).
 */

// Browser callers must come from one of these origins (or localhost, for
// development). Non-browser callers (no Origin header) can fake origins
// anyway, so they're allowed through — the endpoint allowlist and
// setlist.fm's own rate limits bound what they can do.
const ALLOWED_ORIGINS = ['https://mickdarling.github.io'];

function originAllowed(origin) {
  if (!origin) return true;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  try {
    const h = new URL(origin).hostname;
    return h === 'localhost' || h === '127.0.0.1';
  } catch (e) {
    return false;
  }
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'x-api-key, accept',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

// Only read-only endpoints the porter actually needs.
const ALLOWED = /^rest\/1\.0\/(search\/setlists|artist\/[0-9a-f-]+\/setlists|setlist\/[a-z0-9]+)$/;

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const cors = corsHeaders(origin);

    if (request.method === 'OPTIONS') {
      if (!originAllowed(origin)) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.method !== 'GET') {
      return json({ error: 'GET only' }, 405, cors);
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/(api\/)?/, '');
    if (path === 'health' || path === '') {
      return json({ ok: true, service: 'concert-porter-relay' }, 200, cors);
    }
    if (!originAllowed(origin)) {
      return json({ error: 'origin not allowed' }, 403, corsHeaders(null));
    }
    if (!ALLOWED.test(path)) {
      return json({ error: 'endpoint not allowed', path }, 400, cors);
    }

    // Rate limits (checked before touching setlist.fm, so a hammering
    // caller never consumes upstream quota): per-IP first, then a global
    // ceiling that keeps total traffic inside the API key's allowance.
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (env.RL_IP) {
      const { success } = await env.RL_IP.limit({ key: ip });
      if (!success) return json({ error: 'rate limited — slow down and retry' }, 429, cors);
    }
    if (env.RL_GLOBAL) {
      const { success } = await env.RL_GLOBAL.limit({ key: 'global' });
      if (!success) return json({ error: 'rate limited — relay is at capacity, retry shortly' }, 429, cors);
    }

    const apiKey = request.headers.get('x-api-key') || env.SETLISTFM_API_KEY;
    if (!apiKey) {
      return json({ error: 'no API key: send x-api-key or set SETLISTFM_API_KEY secret' }, 401, cors);
    }

    const upstream = await fetch(`https://api.setlist.fm/${path}${url.search}`, {
      headers: {
        'x-api-key': apiKey,
        'Accept': 'application/json',
        'User-Agent': 'concert-porter-relay (github.com/mickdarling/concert-porter)',
      },
    });

    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json', ...cors },
    });
  },
};

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  });
}

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

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'x-api-key, accept',
  'Access-Control-Max-Age': '86400',
};

// Only read-only endpoints the porter actually needs.
const ALLOWED = /^rest\/1\.0\/(search\/setlists|artist\/[0-9a-f-]+\/setlists|setlist\/[a-z0-9]+)$/;

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }
    if (request.method !== 'GET') {
      return json({ error: 'GET only' }, 405);
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/(api\/)?/, '');
    if (!ALLOWED.test(path)) {
      return json({ error: 'endpoint not allowed', path }, 400);
    }

    const apiKey = request.headers.get('x-api-key') || env.SETLISTFM_API_KEY;
    if (!apiKey) {
      return json({ error: 'no API key: send x-api-key or set SETLISTFM_API_KEY secret' }, 401);
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
      headers: { 'Content-Type': 'application/json', ...CORS },
    });
  },
};

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

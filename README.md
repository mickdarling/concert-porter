# Concert Porter

Port your **[Concert Archives](https://www.concertarchives.org)** history into
**[What I've Heard](https://whativeheard.com)** — matched through the
[setlist.fm](https://www.setlist.fm) archive, no click-through automation.

## How it works

What I've Heard has no database of its own: every show you can tick is a
setlist.fm entry, keyed by the artist's MusicBrainz ID and the setlist's
8-character setlist.fm ID, stored in your browser's localStorage
(`seen:attended:v1` / `seen:tickmeta:v1`).

So the port is a *matching* problem, and this tool is the matcher:

1. **Export** your history on concertarchives.org
   (user menu → *Export To Spreadsheet* — the CSV arrives by email).
2. **Drop the CSV** on the Concert Porter page. Columns are auto-detected;
   fix the mapping if it guessed wrong.
3. Each show is **looked up on setlist.fm** by artist + date and scored
   against your venue and city. One clear hit → matched. Multiple shows that
   night → you pick. Nothing on setlist.fm that day → reported, not guessed.
4. The matched set becomes a **bookmarklet** (or console snippet): open
   whativeheard.com, click it, and your shows appear ticked — merged with
   anything you'd already ticked, never overwriting. Sign in there afterwards
   and it syncs across your devices.

Shows setlist.fm doesn't know can't exist in What I've Heard. The porter
gives you an `unmatched.csv`; adding those shows on setlist.fm makes them
flow through everywhere.

## Running it

The app is a single static page — no build, no dependencies:

- open `index.html` straight from disk, or
- serve the folder (`python3 -m http.server`), or
- deploy it anywhere static (GitHub Pages, Cloudflare Pages).

### The relay (required once)

The setlist.fm API doesn't send CORS headers, so the browser can't call it
directly. `worker/` contains a ~60-line Cloudflare Worker that forwards
read-only lookups and adds CORS:

```sh
cd worker
wrangler deploy
wrangler secret put SETLISTFM_API_KEY   # optional — users can bring their own key
```

Put the deployed URL in the app's *Relay URL* field. A setlist.fm API key is
[free to get](https://www.setlist.fm/settings/api); if the relay holds a key,
users don't need their own.

Lookups are throttled (~1.5/sec) and cached in localStorage, so a big history
can be matched across multiple sittings without re-hitting the API.

## Honesty notes

- Independent tool; not affiliated with Concert Archives, What I've Heard,
  or setlist.fm. Data is fetched live from the setlist.fm API under their
  terms — the relay only exposes read-only search endpoints.
- The What I've Heard storage schema (`seen:*:v1`) is unofficial and was
  observed, not documented. If the site changes it, the injector needs a
  matching update. Injection is merge-only and reversible (untick anything
  in their UI).
- Your CSV never leaves your browser; only artist + date pairs go to the
  relay for lookup.

## License

[AGPL-3.0](LICENSE) — run it, fork it, host it; if you serve a modified
version to others, share your changes the same way.

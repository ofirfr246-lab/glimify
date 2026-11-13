# Glimify — marketing site (pre-launch)

Static site (HTML/CSS/vanilla JS, no build step). Deploys as-is to GitHub Pages.

## Structure
- `index.html` — landing page (hero + live dashboard preview, Sell/Bill/Grow/Analyze, features, how it works, story, pricing, FAQ, waitlist)
- `privacy.html`, `terms.html` — **drafts**, marked as such, `noindex`
- `assets/css/styles.css`, `assets/js/main.js`
- `assets/js/config.js` — runtime config: `SITE_URL`, `WAITLIST_ENDPOINT`, `WAITLIST_HEADERS`
- `site.config.json` + `scripts/set_domain.py` — the single source of the domain for static files
- `og-image.png` (1200×630), `favicon.png`, `sitemap.xml`, `robots.txt`, `.nojekyll`
- `assets/fonts/` — self-hosted Geist, Geist Mono, Instrument Serif (SIL OFL)

## Change the domain
    python3 scripts/set_domain.py yourdomain.com
For a custom domain on GitHub Pages, also add a `CNAME` file containing the domain.

## Turn on the waitlist
Until `WAITLIST_ENDPOINT` is set, the form validates the email, sends nothing, and shows
"Thanks — the waitlist opens soon" (and says the email wasn't saved).

Suggested backend (Supabase):

```sql
create table public.waitlist (
  id bigint generated always as identity primary key,
  email text not null unique check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  product_url text,
  stage text,
  source text,
  created_at timestamptz not null default now()
);
alter table public.waitlist enable row level security;
create policy "anon can insert" on public.waitlist for insert to anon with check (true);
-- no select/update/delete policies => the public key can only insert
```

Then in `assets/js/config.js`:
```js
WAITLIST_ENDPOINT: "https://<project>.supabase.co/rest/v1/waitlist",
WAITLIST_HEADERS: { apikey: "<anon key>", Authorization: "Bearer <anon key>", Prefer: "return=minimal" }
```
A duplicate email returns 409, which the form treats as "already on the list".
Only use the public anon/publishable key here — never a service-role or secret key.

## Feature pages
- `features.html` (hub) and `features/<slug>.html` (16 pages) are **generated**.
  Edit copy in `scripts/features_data.py`, mock UIs in `scripts/feature_mocks.py`, then run:
  `python3 scripts/build_features.py` (also refreshes the index nav/feature-grid links and `sitemap.xml`).
- Styles: `assets/css/features.css` · scripts: `assets/js/features.js` (hub filter + example-data mock animations).
- `scripts/set_domain.py` now also rewrites `features/*.html`.

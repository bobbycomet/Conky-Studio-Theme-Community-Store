# Theme Vault manifest format

Mirrors the Node Vault plugin manifest: a `manifest.json` at the repo root
lists themes either inline or as a `{"$ref": "..."}` pointing at a JSON file
under `Themes/`. The site resolves refs relative to the manifest's own URL,
so this works unmodified from `raw.githubusercontent.com`, GitHub Pages, or
any other static host.

## manifest.json

```json
{
  "api_version": "1.0",
  "updated_at": "2026-08-06",
  "themes": [
    { "$ref": "Themes/scifi-hud-blue.json" },
    { "$ref": "Themes/terminal-green.json" }
  ]
}
```

`themes` entries may also be full theme objects inline instead of a `$ref`;
useful for a single-theme repo that doesn't want a `Themes/` folder at all.

## Themes/<id>.json

```json
{
  "id": "scifi-hud-blue",
  "name": "Sci-Fi HUD (Blue)",
  "author": "someuser",
  "version": "1.2.0",
  "description": "One-line summary shown on the card. Keep it under ~120 chars.",
  "tags": ["scifi", "hud", "dark", "1080p"],

  "preview": "preview.png",
  "screenshots": ["shot-desktop.png", "shot-night.png"],

  "plugins": ["visual.orbit_field", "visual.ring_track"],

  "link": "https://github.com/someuser/conky-scifi-hud",
  "host": "GitHub",

  "readme_url": "https://raw.githubusercontent.com/someuser/conky-scifi-hud/main/README.md",

  "license": "GPL-3.0",
  "resolution": "1920x1080",
  "conky_version": "1.19+"
}
```

### Field notes

| Field | Required | Notes |
|---|---|---|
| `id` | **yes** | Unique slug. Used in the URL hash (`#/theme/<id>`) and as the copy target for "Copy theme ID". |
| `name` | no | Display title. Falls back to `id`. |
| `author` | no | Falls back to "unattributed". |
| `version` | no | Free-form string. |
| `description` | no | Shown on the card (2-line clamp) and at the top of the detail page. |
| `tags` | no | Array of strings. Drives the tag-filter row. |
| `preview` | no | Path relative to *this JSON file* (or an absolute URL). This is the card's hero image, so themes without one just fall back to a placeholder — don't skip it if you can help it. |
| `screenshots` | no | Extra images shown in a gallery on the detail page only. |
| `plugins` | no | Plugin IDs (as listed on Node Vault) that this theme depends on. Rendered as chips linking back to the plugin's Node Vault page. Omit if the theme only uses built-in nodes. |
| `link` | **yes** | Where to actually get it: the GitHub repo, Pling/openDesktop page, KDE Store listing, etc. This is a "go install it there" link, not a direct-download URL the app fetches for you. |
| `host` | no | Label shown as a badge ("GitHub", "Pling", "KDE Store", "openDesktop", "GitLab"). Auto-detected from `link`'s domain if omitted; only set this if the auto-detect would guess wrong. |
| `readme` | no | Inline markdown string, for short READMEs you'd rather not host separately. |
| `readme_url` | no | URL to a raw Markdown file, fetched lazily only when someone opens the detail page (not preloaded for the whole grid). If both `readme` and `readme_url` are set, `readme` wins. |
| `license` | no | Free-form string (e.g. "GPL-3.0", "MIT", "CC-BY-SA-4.0"). |
| `resolution` | no | e.g. `"1920x1080"` — helps people browsing skip themes built for the wrong aspect ratio. |
| `conky_version` | no | Compatibility note, e.g., `"1.19+"`. |

Everything except `id` and `link` is optional and has a safe fallback; a
minimal entry with just those two fields and a `preview` will still render
correctly, just sparsely.


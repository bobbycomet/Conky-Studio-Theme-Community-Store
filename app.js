(() => {
  "use strict";

  // -----------------------------------------------------------------
  // Config
  // -----------------------------------------------------------------
  // Official pack (manifest next to Themes/*.json on the main repo).
  // Community pack (separate repo). Override either with ?manifest=<url>.
  const CATALOGS = {
    official: {
      id: "official",
      label: "Official pack",
      url: "https://raw.githubusercontent.com/bobbycomet/Conky-Studio/main/theme-manifest.json",
    },
    community: {
      id: "community",
      label: "Community pack",
      url: "https://raw.githubusercontent.com/bobbycomet/Conky-Studio-Theme-Community-Store/main/manifest.json",
    },
  };

  // Fill this in once Node Vault has a real URL, to make "Uses these
  // plugins" chips clickable. Left null renders them as plain (non-link)
  // chips instead of guessing at a URL that might be wrong.
  const NODE_VAULT_BASE_URL = null; // e.g. "https://bobbycomet.github.io/node-vault/"

  const params = new URLSearchParams(location.search);
  const overrideManifest = params.get("manifest");
  const initialCatalog =
    params.get("catalog") === "official" ? "official" : "community";

  // Bare (non-URL) preview/screenshot filenames resolve against this
  // folder for the website only, when the manifest is local.
  const IMG_BASE = "./images/";

  // Known hosting platforms get their own filter tab; anything else is
  // grouped under "Other" for filtering purposes (its real name still
  // shows on the badge itself).
  const KNOWN_HOSTS = ["GitHub", "GitLab", "Pling", "openDesktop", "KDE Store", "GNOME Look", "XFCE Look"];

  // -----------------------------------------------------------------
  // State
  // -----------------------------------------------------------------
  let allThemes = [];
  let activeCatalog = initialCatalog;
  let manifestMeta = { source: "", updated_at: "", api_version: "" };
  let filters = { host: "all", tag: null, query: "" };
  let manifestBaseUrl = "";

  // -----------------------------------------------------------------
  // Elements
  // -----------------------------------------------------------------
  const el = {
    tabs: document.getElementById("filter-tabs"),
    tagRow: document.getElementById("filter-tags"),
    grid: document.getElementById("theme-grid"),
    resultCount: document.getElementById("result-count"),
    statePanel: document.getElementById("state-panel"),
    viewGrid: document.getElementById("view-grid"),
    viewHero: document.getElementById("view-hero"),
    filterRail: document.getElementById("filter-rail"),
    viewDetail: document.getElementById("view-detail"),
    detailContent: document.getElementById("detail-content"),
    search: document.getElementById("search-input"),
    toast: document.getElementById("toast"),
    copyManifestBtn: document.getElementById("copy-manifest-url"),
    catalogSwitch: document.getElementById("catalog-switch"),
  };

  function currentManifestUrl() {
    if (overrideManifest) return overrideManifest;
    return CATALOGS[activeCatalog].url;
  }

  // -----------------------------------------------------------------
  // Fetch
  // -----------------------------------------------------------------
  async function loadManifest() {
    showState("loading");
    const MANIFEST_URL = currentManifestUrl();
    try {
      const res = await fetch(MANIFEST_URL, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const rawThemes = Array.isArray(data.themes) ? data.themes : [];
      const themes = await resolveThemeRefs(rawThemes, MANIFEST_URL);
      allThemes = themes
        .filter((t) => t && t.raw && t.raw.id)
        .map((t) => normalizeTheme(t.raw, t.sourceUrl))
        .sort(
          (a, b) =>
            (a.name || a.id).localeCompare(b.name || b.id) ||
            a.id.localeCompare(b.id)
        );
      manifestBaseUrl = MANIFEST_URL;
      manifestMeta = {
        source: MANIFEST_URL,
        updated_at: data.updated_at || "",
        api_version: data.api_version || "",
      };
      if (allThemes.length === 0) {
        showState("empty");
      } else {
        hideState();
        buildFilterUI();
        route();
      }
      syncCatalogUI();
    } catch (err) {
      showState("error", err);
      syncCatalogUI();
    }
  }

  // A manifest entry may embed a full theme object, or point at one with
  // {"$ref": "Themes/some-theme.json"}, resolved relative to the manifest's
  // own URL. We track each theme's own source URL (the ref file's URL, or
  // the manifest's URL for inline entries) so preview/screenshot paths can
  // resolve relative to *that* file, not the manifest root -- important
  // since preview.png normally sits next to its theme JSON in Themes/.
  async function resolveThemeRefs(entries, manifestUrl) {
    const base = new URL(manifestUrl, location.href);
    return Promise.all(
      entries.map(async (entry) => {
        if (!entry || typeof entry !== "object" || !("$ref" in entry)) {
          return { raw: entry, sourceUrl: base.toString() };
        }
        const refUrl = new URL(String(entry["$ref"]), base).toString();
        const res = await fetch(refUrl, { cache: "no-store" });
        if (!res.ok)
          throw new Error(
            `Couldn't fetch ${entry["$ref"]}: HTTP ${res.status}`
          );
        const raw = await res.json();
        return { raw, sourceUrl: refUrl };
      })
    );
  }

  function detectHost(link) {
    try {
      const host = new URL(link).hostname.replace(/^www\./i, "").toLowerCase();
      if (host.includes("github.com")) return "GitHub";
      if (host.includes("gitlab.com")) return "GitLab";
      if (host.includes("pling.com")) return "Pling";
      if (host.includes("opendesktop.org")) return "openDesktop";
      if (host.includes("store.kde.org") || host === "kde.org") return "KDE Store";
      if (host.includes("gnome-look.org")) return "GNOME Look";
      if (host.includes("xfce-look.org")) return "XFCE Look";
      // Fall back to a readable guess from the domain itself.
      const bare = host.split(".").slice(0, -1).join(".") || host;
      return bare.charAt(0).toUpperCase() + bare.slice(1);
    } catch (_) {
      return "Other";
    }
  }

  function filterGroupForHost(host) {
    return KNOWN_HOSTS.includes(host) ? host : "Other";
  }

  function normalizeTheme(t, sourceUrl) {
    const link = (t.link || "").trim();
    const host = (t.host || "").trim() || (link ? detectHost(link) : "Other");
    return {
      id: String(t.id),
      name: t.name || t.id,
      author: t.author || "",
      version: t.version || "",
      description: t.description || "",
      tags: Array.isArray(t.tags) ? t.tags.filter(Boolean) : [],
      preview: (t.preview || "").trim(),
      screenshots: Array.isArray(t.screenshots) ? t.screenshots.filter(Boolean) : [],
      plugins: Array.isArray(t.plugins) ? t.plugins.filter(Boolean) : [],
      link,
      host,
      hostGroup: filterGroupForHost(host),
      readme: t.readme || "",
      readmeUrl: t.readme_url || "",
      license: t.license || "",
      resolution: t.resolution || "",
      conkyVersion: t.conky_version || "",
      sourceUrl,
    };
  }

  // preview/screenshot: absolute URL, path relative to the theme's own
  // source file (its $ref, or the manifest if inline), or a bare filename
  // under IMG_BASE for local site assets.
  function resolveMediaSrc(value, sourceUrl) {
    const v = (value || "").trim();
    if (!v) return null;
    if (/^https?:\/\//i.test(v)) return v;
    if (v.startsWith("./") || v.startsWith("../") || v.includes("/")) {
      try {
        return new URL(v, sourceUrl || manifestBaseUrl || location.href).toString();
      } catch (_) {
        /* fall through */
      }
    }
    if (sourceUrl && /^https?:\/\//i.test(sourceUrl)) {
      try {
        return new URL(v, sourceUrl).toString();
      } catch (_) {
        /* fall through */
      }
    }
    return IMG_BASE + v;
  }

  // -----------------------------------------------------------------
  // Catalog switch
  // -----------------------------------------------------------------
  function syncCatalogUI() {
    if (!el.catalogSwitch) return;
    el.catalogSwitch.querySelectorAll(".catalog-tab").forEach((btn) => {
      const selected = btn.dataset.catalog === activeCatalog;
      btn.setAttribute("aria-selected", String(selected));
      btn.classList.toggle("active", selected);
    });
  }

  if (el.catalogSwitch) {
    el.catalogSwitch.addEventListener("click", (e) => {
      const btn = e.target.closest(".catalog-tab");
      if (!btn || !btn.dataset.catalog) return;
      if (overrideManifest) {
        showToast("Catalog locked by ?manifest= URL");
        return;
      }
      if (btn.dataset.catalog === activeCatalog) return;
      activeCatalog = btn.dataset.catalog;
      filters = { host: "all", tag: null, query: filters.query };
      location.hash = "#/";
      loadManifest();
    });
  }

  // -----------------------------------------------------------------
  // Filter UI
  // -----------------------------------------------------------------
  function buildFilterUI() {
    const counts = { all: allThemes.length };
    const tagCounts = new Map();
    for (const t of allThemes) {
      counts[t.hostGroup] = (counts[t.hostGroup] || 0) + 1;
      for (const tag of t.tags) tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    }

    el.tabs.innerHTML = "";
    const groups = ["all", ...KNOWN_HOSTS, "Other"].filter(
      (g, i, arr) => arr.indexOf(g) === i && (g === "all" || counts[g])
    );
    for (const group of groups) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "filter-tab";
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-selected", String(filters.host === group));
      btn.dataset.host = group;
      const label = group === "all" ? "All" : group;
      btn.innerHTML = `${escapeHtml(label)} <span class="count">${counts[group] || 0}</span>`;
      btn.addEventListener("click", () => {
        filters.host = group;
        renderGrid();
        syncFilterUI();
      });
      el.tabs.appendChild(btn);
    }

    el.tagRow.innerHTML = "";
    const topTags = [...tagCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12);
    for (const [tag] of topTags) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "tag-chip";
      chip.textContent = tag;
      chip.addEventListener("click", () => {
        filters.tag = filters.tag === tag ? null : tag;
        renderGrid();
        syncFilterUI();
      });
      el.tagRow.appendChild(chip);
    }
    syncFilterUI();
  }

  function syncFilterUI() {
    el.tabs.querySelectorAll(".filter-tab").forEach((btn) => {
      btn.setAttribute("aria-selected", String(btn.dataset.host === filters.host));
    });
    el.tagRow.querySelectorAll(".tag-chip").forEach((chip) => {
      chip.classList.toggle("active", chip.textContent === filters.tag);
    });
  }

  el.search.addEventListener(
    "input",
    debounce(() => {
      filters.query = el.search.value.trim().toLowerCase();
      renderGrid();
    }, 150)
  );

  function debounce(fn, ms) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  // -----------------------------------------------------------------
  // Grid
  // -----------------------------------------------------------------
  function filteredThemes() {
    return allThemes.filter((t) => {
      if (filters.host !== "all" && t.hostGroup !== filters.host) return false;
      if (filters.tag && !t.tags.includes(filters.tag)) return false;
      if (filters.query) {
        const haystack = [t.name, t.id, t.description, t.author, t.host, ...t.tags]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(filters.query)) return false;
      }
      return true;
    });
  }

  function renderGrid() {
    const list = filteredThemes();
    el.resultCount.textContent =
      list.length === allThemes.length
        ? `${list.length} theme${list.length === 1 ? "" : "s"}`
        : `${list.length} of ${allThemes.length} themes`;

    if (list.length === 0) {
      el.grid.innerHTML = "";
      showInlineEmpty();
      return;
    }
    el.statePanel.hidden = true;
    el.grid.hidden = false;

    el.grid.innerHTML = "";
    for (const t of list) el.grid.appendChild(renderCard(t));
  }

  function showInlineEmpty() {
    el.statePanel.hidden = false;
    el.statePanel.innerHTML = `
      <h2>No themes match that</h2>
      <p>Try a different search term, or clear the host and tag filters.</p>
      <button class="btn btn-ghost" id="clear-filters" type="button">Clear filters</button>
    `;
    document.getElementById("clear-filters").addEventListener("click", () => {
      filters = { host: "all", tag: null, query: "" };
      el.search.value = "";
      syncFilterUI();
      renderGrid();
    });
  }

  function renderCard(t) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "theme-card";
    card.setAttribute("aria-label", `${t.name}, hosted on ${t.host}`);

    const previewSrc = resolveMediaSrc(t.preview, t.sourceUrl);
    card.innerHTML = `
      <div class="card-preview">
        ${
          previewSrc
            ? `<img src="${escapeAttr(previewSrc)}" alt="" loading="lazy" onerror="this.closest('.card-preview').classList.add('is-placeholder'); this.remove()">`
            : ""
        }
        <span class="card-preview-frame" aria-hidden="true"></span>
      </div>
      <div class="card-body">
        <div class="card-heading">
          <div class="card-label">${escapeHtml(t.name)}</div>
          <div class="card-id">${escapeHtml(t.id)}</div>
        </div>
        ${t.description ? `<p class="card-desc">${escapeHtml(t.description)}</p>` : ""}
        <div class="card-tags">${t.tags
          .slice(0, 3)
          .map((tag) => `<span class="tag-chip">${escapeHtml(tag)}</span>`)
          .join("")}</div>
        <div class="card-meta">
          <span>${escapeHtml(t.author || "unattributed")}${
            t.version ? " · v" + escapeHtml(t.version) : ""
          }</span>
          <span class="badge">${escapeHtml(t.host)}</span>
        </div>
      </div>
    `;
    card.addEventListener("click", () => {
      location.hash = `#/theme/${encodeURIComponent(t.id)}`;
    });
    return card;
  }

  // -----------------------------------------------------------------
  // Detail view
  // -----------------------------------------------------------------
  async function renderDetail(t) {
    const previewSrc = resolveMediaSrc(t.preview, t.sourceUrl);
    const shotSrcs = t.screenshots
      .map((s) => resolveMediaSrc(s, t.sourceUrl))
      .filter(Boolean);

    const mediaBlocks = [];
    if (previewSrc) {
      mediaBlocks.push(`
        <figure class="detail-media-item">
          <img class="detail-media-shot" src="${escapeAttr(previewSrc)}" alt="${escapeAttr(t.name)} preview" loading="lazy" onerror="this.closest('figure').remove()">
          <figcaption>Preview</figcaption>
        </figure>`);
    }
    shotSrcs.forEach((src, i) => {
      mediaBlocks.push(`
        <figure class="detail-media-item">
          <img class="detail-media-shot" src="${escapeAttr(src)}" alt="${escapeAttr(t.name)} screenshot ${i + 1}" loading="lazy" onerror="this.closest('figure').remove()">
          <figcaption>Screenshot</figcaption>
        </figure>`);
    });

    const pluginChips = t.plugins
      .map((pid) => {
        if (NODE_VAULT_BASE_URL) {
          const href = new URL(`#/plugin/${encodeURIComponent(pid)}`, NODE_VAULT_BASE_URL).toString();
          return `<a class="tag-chip" href="${escapeAttr(href)}" target="_blank" rel="noopener">${escapeHtml(pid)}</a>`;
        }
        return `<span class="tag-chip">${escapeHtml(pid)}</span>`;
      })
      .join("");

    el.detailContent.innerHTML = `
      <div class="detail-head">
        <div class="detail-icon">
          ${
            previewSrc
              ? `<img src="${escapeAttr(previewSrc)}" alt="" onerror="this.remove()">`
              : `<span class="dot"></span>`
          }
        </div>
        <div>
          <h1 class="detail-title">${escapeHtml(t.name)}</h1>
          <div class="detail-id">${escapeHtml(t.id)}</div>
        </div>
      </div>

      <div class="detail-meta-row">
        <span>Author <b>${escapeHtml(t.author || "unattributed")}</b></span>
        ${t.version ? `<span>Version <b>${escapeHtml(t.version)}</b></span>` : ""}
        <span>Host <b>${escapeHtml(t.host)}</b></span>
        ${t.resolution ? `<span>Built for <b>${escapeHtml(t.resolution)}</b></span>` : ""}
        ${t.conkyVersion ? `<span>Conky <b>${escapeHtml(t.conkyVersion)}</b></span>` : ""}
        ${t.license ? `<span>License <b>${escapeHtml(t.license)}</b></span>` : ""}
      </div>

      ${
        t.tags.length
          ? `<div class="detail-tags">${t.tags
              .map((tag) => `<span class="tag-chip">${escapeHtml(tag)}</span>`)
              .join("")}</div>`
          : ""
      }

      ${t.description ? `<p class="detail-desc">${escapeHtml(t.description)}</p>` : ""}

      ${
        mediaBlocks.length
          ? `<div class="detail-media">${mediaBlocks.join("")}</div>`
          : ""
      }

      <div class="detail-actions">
        <a class="btn btn-primary" href="${escapeAttr(t.link)}" target="_blank" rel="noopener">Get it on ${escapeHtml(t.host)} ↗</a>
        <button class="btn btn-ghost" id="copy-id" type="button">Copy theme ID</button>
        <button class="btn btn-ghost" id="copy-source" type="button">Copy store URL</button>
      </div>

      ${
        pluginChips
          ? `
      <div class="detail-block">
        <h2>Uses these plugins</h2>
        <div class="detail-tags">${pluginChips}</div>
        ${!NODE_VAULT_BASE_URL ? `<p class="card-desc">Install these from Node Vault before trying this theme.</p>` : ""}
      </div>`
          : ""
      }

      <div class="detail-block" id="readme-block">
        <h2>README</h2>
        <div id="readme-content" class="readme-body"><p class="card-desc">Loading…</p></div>
      </div>
    `;

    document
      .getElementById("copy-id")
      .addEventListener("click", () => copyToClipboard(t.id, "Theme ID copied"));
    document.getElementById("copy-source").addEventListener("click", () =>
      copyToClipboard(
        new URL(currentManifestUrl(), location.href).toString(),
        "Store URL copied"
      )
    );

    loadReadme(t);
  }

  async function loadReadme(t) {
    const target = document.getElementById("readme-content");
    if (!target) return;
    if (t.readme) {
      target.innerHTML = mdToHtml(t.readme);
      return;
    }
    if (!t.readmeUrl) {
      target.innerHTML = `<p class="card-desc">No README provided. Check the link above for docs.</p>`;
      return;
    }
    try {
      const res = await fetch(t.readmeUrl, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      target.innerHTML = mdToHtml(text);
    } catch (err) {
      target.innerHTML = `
        <p class="card-desc">Couldn't load the README (${escapeHtml(String((err && err.message) || err))}).
        <a href="${escapeAttr(t.readmeUrl)}" target="_blank" rel="noopener">Open it directly ↗</a></p>`;
    }
  }

  // Minimal, safe-by-construction markdown renderer: everything is
  // HTML-escaped first, then a small set of markdown constructs are
  // layered on top of the escaped text. README content comes from
  // arbitrary third-party repos, so raw HTML is never trusted directly.
  function mdToHtml(raw) {
    const escaped = escapeHtml(String(raw || "").replace(/\r\n/g, "\n"));

    // Fenced code blocks first, stashed so nothing inside them gets
    // touched by the inline passes below.
    const blocks = [];
    let text = escaped.replace(/```([\s\S]*?)```/g, (_, code) => {
      blocks.push(`<pre class="readme-code"><code>${code.replace(/^\n/, "")}</code></pre>`);
      return `\u0000BLOCK${blocks.length - 1}\u0000`;
    });

    text = text
      // headings
      .replace(/^###\s+(.*)$/gm, "<h4>$1</h4>")
      .replace(/^##\s+(.*)$/gm, "<h3>$1</h3>")
      .replace(/^#\s+(.*)$/gm, "<h3>$1</h3>")
      // inline code
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      // bold / italic
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(?:^|[^*])\*([^*]+)\*(?!\*)/g, (m, inner) => m.replace(`*${inner}*`, `<em>${inner}</em>`))
      // links -- only http(s), never javascript: or data:
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

    // Unordered lists
    text = text.replace(/(^(?:[-*]\s+.*\n?)+)/gm, (block) => {
      const items = block
        .trim()
        .split("\n")
        .map((line) => line.replace(/^[-*]\s+/, "").trim())
        .map((li) => `<li>${li}</li>`)
        .join("");
      return `<ul>${items}</ul>\n`;
    });

    // Paragraphs: wrap any remaining bare lines/blank-separated chunks.
    text = text
      .split(/\n{2,}/)
      .map((chunk) => {
        const trimmed = chunk.trim();
        if (!trimmed) return "";
        if (/^<(h3|h4|ul|pre)/.test(trimmed)) return trimmed;
        return `<p>${trimmed.replace(/\n/g, "<br>")}</p>`;
      })
      .join("\n");

    // Restore fenced code blocks.
    text = text.replace(/\u0000BLOCK(\d+)\u0000/g, (_, i) => blocks[Number(i)]);

    return text;
  }

  // -----------------------------------------------------------------
  // Router
  // -----------------------------------------------------------------
  function route() {
    const hash = location.hash || "#/";
    const match = hash.match(/^#\/theme\/(.+)$/);
    if (match) {
      const id = decodeURIComponent(match[1]);
      const theme = allThemes.find((t) => t.id === id);
      if (theme) {
        renderDetail(theme);
        toggleViews("detail");
        window.scrollTo({ top: 0 });
        return;
      }
    }
    toggleViews("grid");
    renderGrid();
  }

  function toggleViews(which) {
    const isDetail = which === "detail";
    el.viewDetail.hidden = !isDetail;
    el.viewHero.hidden = isDetail;
    el.filterRail.hidden = isDetail;
    el.viewGrid.hidden = isDetail;
    const resources = document.getElementById("view-resources");
    if (resources) resources.hidden = isDetail;
  }

  window.addEventListener("hashchange", route);

  // -----------------------------------------------------------------
  // Loading / error / empty states
  // -----------------------------------------------------------------
  function showState(kind, err) {
    el.grid.hidden = true;
    el.statePanel.hidden = false;
    el.resultCount.textContent = "";
    if (kind === "loading") {
      el.statePanel.innerHTML = `<div class="spinner"></div><h2>Loading the catalog</h2><p>Fetching the current theme manifest.</p>`;
    } else if (kind === "empty") {
      el.statePanel.innerHTML = `<h2>Nothing published yet</h2><p>This store's manifest does not list any themes right now. Switch catalog or check back later.</p>`;
    } else if (kind === "error") {
      el.statePanel.innerHTML = `
        <h2>Could not load the catalog</h2>
        <p>${escapeHtml(String((err && err.message) || err || "The manifest did not load."))}</p>
        <button class="btn btn-ghost" id="retry-load" type="button">Try again</button>
      `;
      document
        .getElementById("retry-load")
        .addEventListener("click", loadManifest);
    }
  }

  function hideState() {
    el.statePanel.hidden = true;
    el.grid.hidden = false;
  }

  // -----------------------------------------------------------------
  // Utilities
  // -----------------------------------------------------------------
  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[c])
    );
  }
  function escapeAttr(str) {
    return escapeHtml(str);
  }

  function copyToClipboard(text, message) {
    const done = () => showToast(message);
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard
        .writeText(text)
        .then(done)
        .catch(() => fallbackCopy(text, done));
    } else {
      fallbackCopy(text, done);
    }
  }

  function fallbackCopy(text, done) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
    } catch (e) {
      /* ignore */
    }
    document.body.removeChild(ta);
    done();
  }

  let toastTimer;
  function showToast(message) {
    el.toast.textContent = message;
    el.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove("show"), 2200);
  }

  el.copyManifestBtn.addEventListener("click", () =>
    copyToClipboard(
      new URL(currentManifestUrl(), location.href).toString(),
      "Manifest URL copied"
    )
  );

  // -----------------------------------------------------------------
  // Boot
  // -----------------------------------------------------------------
  loadManifest();
})();

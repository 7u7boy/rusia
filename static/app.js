"use strict";
/* Ruso A1 · Práctica — frontend */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const norm = s => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[¿?¡!().,…]/g, "").replace(/\s+/g, " ").trim();
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const store = { get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };

const CN = ["Nominativo", "Genitivo", "Dativo", "Acusativo", "Instrumental", "Preposicional"];
const clab = c => c ? c + " · " + CN[c - 1] : "Verbo";
const UNITS = {
  "1": { t: "Primeros pasos", d: "Saludos, países, la ciudad, números y profesiones" },
  "2": { t: "Mi mundo", d: "Objetos, familia, gustos, cultura y deportes" },
  "3": { t: "Casa y carácter", d: "La casa, muebles, adjetivos, colores y modismos" },
  "4": { t: "Comida y moda", d: "Comida, restaurante, ropa y estaciones" },
};
const VMODES = [["listen-say", "🔊 Escuchar y decir"], ["listen", "🔊 Escuchar y elegir"], ["ru-es", "Ruso → Español"], ["es-ru", "Español → Ruso"], ["write", "✍️ Escribir"], ["flash", "Tarjetas"]];

const S = {
  user: null, stats: null, vocab: [], gram: [], sent: [], tabla: "",
  byKey: {},
  cfg: store.get("cfg", { kind: "vocab", vmode: "listen-say", fmode: "build", voice: "irina", count: 20, vsel: null, gsel: null }),
};
const saveCfg = () => store.set("cfg", S.cfg);

/* ---------------- API ---------------- */
async function api(path, body) {
  const opt = body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
  const r = await fetch(path, { credentials: "same-origin", ...opt });
  let data = {}; try { data = await r.json(); } catch (e) {}
  if (!r.ok) throw Object.assign(new Error(data.error || "Error de conexión"), { status: r.status });
  return data;
}
async function refreshStats() { if (!S.user) { S.stats = null; return; } try { S.stats = await api("/api/stats"); } catch (e) { S.stats = null; } }

/* ---------------- audio ---------------- */
let player = null;
function play(url, slow) {
  try { if (player) player.pause(); player = new Audio(url); player.playbackRate = slow ? 0.75 : 1; player.preservesPitch = true; const p = player.play(); if (p && p.catch) p.catch(() => {}); } catch (e) {}
}
const sayWord = (it, slow) => it && it.a && play(`/audio/${S.cfg.voice}/w/${it.id}.mp3`, slow);
const saySent = (it, slow) => play(`/audio/${S.cfg.voice}/s/${it.id}.mp3`, slow);
const audioBtns = () => `<div class="audio"><button class="chip" data-say="1">🔊 Escuchar</button><button class="chip" data-say="slow">🐢 Lento</button></div>`;

/* ---------------- UI helpers ---------------- */
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.remove("hidden"); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add("hidden"), 2600); }
function modal(html) { $("#modalcard").innerHTML = html; $("#modal").classList.remove("hidden"); const f = $("input", $("#modalcard")); if (f) f.focus(); }
function closeModal() { $("#modal").classList.add("hidden"); }
$("#modal").addEventListener("click", e => { if (e.target.id === "modal") closeModal(); });
document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });

function renderUser() {
  const box = $("#userbox");
  if (!S.user) { box.innerHTML = `<button class="btn sm" id="loginbtn">Entrar</button>`; $("#loginbtn").onclick = () => authModal("login"); return; }
  const ini = (S.user.name || S.user.username).trim().slice(0, 1).toUpperCase();
  box.innerHTML = `<div class="menu"><button class="avatar" id="av" aria-label="Menú de usuario">${esc(ini)}</button>
    <div class="dropdown hidden" id="dd"><div class="small muted" style="padding:8px 12px">${esc(S.user.name)}<br>@${esc(S.user.username)}</div>
    <a href="#/progreso">Mi progreso</a><button id="pwbtn">Cambiar contraseña</button><button id="outbtn">Cerrar sesión</button></div></div>`;
  $("#av").onclick = e => { e.stopPropagation(); $("#dd").classList.toggle("hidden"); };
  document.addEventListener("click", () => $("#dd") && $("#dd").classList.add("hidden"), { once: true });
  $("#outbtn").onclick = async () => { await api("/api/logout", {}); S.user = null; S.stats = null; renderUser(); route(); toast("Sesión cerrada"); };
  $("#pwbtn").onclick = passwordModal;
}

function authModal(which, after) {
  const reg = which === "register";
  modal(`<h2>${reg ? "Crear cuenta" : "Entrar"}</h2><p class="muted small" style="margin-top:-6px">${reg ? "Gratis. Tu progreso se guarda en la nube y lo ves desde cualquier dispositivo." : "Bienvenido de nuevo."}</p>
  <form id="af">
    ${reg ? `<div class="field"><label for="an">Tu nombre</label><input class="in" id="an" autocomplete="name" maxlength="60" placeholder="Jonathan"></div>` : ""}
    <div class="field"><label for="au">Usuario</label><input class="in" id="au" autocomplete="username" autocapitalize="off" maxlength="32" placeholder="jonathan"></div>
    <div class="field"><label for="ap">Contraseña</label><input class="in" id="ap" type="password" autocomplete="${reg ? "new-password" : "current-password"}" placeholder="${reg ? "Mínimo 8 caracteres" : ""}"></div>
    <div class="err" id="aerr"></div>
    <button class="btn wide" id="asub">${reg ? "Crear cuenta" : "Entrar"}</button>
  </form>
  <p class="small muted" style="text-align:center;margin:14px 0 0">${reg ? "¿Ya tienes cuenta?" : "¿No tienes cuenta?"} <a href="#" id="aswitch">${reg ? "Entrar" : "Crear una"}</a></p>`);
  $("#aswitch").onclick = e => { e.preventDefault(); authModal(reg ? "login" : "register", after); };
  $("#af").onsubmit = async e => {
    e.preventDefault(); $("#asub").disabled = true; $("#aerr").textContent = "";
    try {
      const body = { username: $("#au").value, password: $("#ap").value }; if (reg) body.name = $("#an").value;
      const r = await api(reg ? "/api/register" : "/api/login", body);
      S.user = r.user; closeModal(); renderUser(); await refreshStats(); toast(reg ? `¡Bienvenido, ${S.user.name}!` : `Hola, ${S.user.name}`);
      if (after) after(); else route();
    } catch (err) { $("#aerr").textContent = err.message; $("#asub").disabled = false; }
  };
}
function passwordModal() {
  modal(`<h2>Cambiar contraseña</h2><form id="pf"><div class="field"><label>Contraseña actual</label><input class="in" type="password" id="po" autocomplete="current-password"></div>
  <div class="field"><label>Nueva contraseña</label><input class="in" type="password" id="pn" autocomplete="new-password" placeholder="Mínimo 8 caracteres"></div><div class="err" id="perr"></div>
  <button class="btn wide">Guardar</button></form>`);
  $("#pf").onsubmit = async e => { e.preventDefault(); try { await api("/api/password", { old: $("#po").value, new: $("#pn").value }); closeModal(); toast("Contraseña cambiada"); } catch (err) { $("#perr").textContent = err.message; } };
}

/* ---------------- router ---------------- */
const view = () => $("#view");
function setNav(r) { $$("#nav a, #tabbar a").forEach(a => a.classList.toggle("on", a.dataset.r === r)); }
function route() {
  document.body.classList.remove("focus");
  const r = (location.hash.replace(/^#\/?/, "").split("/")[0]) || "";
  setNav(r);
  if (player) player.pause();
  ({ "": pageHome, practicar: pagePractice, referencia: pageReference, progreso: pageProgress }[r] || pageHome)();
  window.scrollTo(0, 0);
}
window.addEventListener("hashchange", route);
document.addEventListener("click", e => { const a = e.target.closest("a[href^='#/']"); if (a && a.getAttribute("href") === (location.hash || "#/")) { e.preventDefault(); R = null; route(); } });

/* ---------------- helpers on data ---------------- */
const vocabSections = () => S.vocab.map(s => s.section);
const gramSections = () => S.gram.map(s => s.section);
const sectionStat = (kind, sec) => (S.stats && S.stats.sections.find(x => x.kind === kind && x.section === sec)) || null;
function unitProgress(u) {
  const secs = S.vocab.filter(s => s.unit === u); const total = secs.reduce((a, s) => a + s.items.length, 0);
  const mastered = secs.reduce((a, s) => a + ((sectionStat("vocab", s.section) || {}).mastered || 0), 0);
  return { total, mastered, pct: total ? Math.round(mastered / total * 100) : 0 };
}
const counts = () => ({ v: S.vocab.reduce((a, s) => a + s.items.length, 0), g: S.gram.reduce((a, s) => a + s.items.length, 0), s: S.sent.length });

/* ---------------- pages ---------------- */
function pageHome() {
  const c = counts();
  const units = Object.keys(UNITS).map(u => {
    const p = S.user ? unitProgress(u) : null;
    return `<div class="card unit-card" data-unit="${u}"><div class="n">Unidad ${u}</div><b>${UNITS[u].t}</b><div class="muted small">${UNITS[u].d}</div>
      ${p ? `<div class="bar" style="margin-top:12px"><i style="width:${p.pct}%"></i></div><div class="small muted" style="margin-top:6px">${p.mastered} de ${p.total} palabras dominadas</div>` : ""}</div>`;
  }).join("");
  if (!S.user) {
    view().innerHTML = `
    <section class="hero">
      <div><h1>Aprende ruso A1<br>practicando un poco cada día</h1>
        <p class="lead">Vocabulario con audio, los 6 casos, verbos y oraciones del curso <i>Точка Ру A1</i>. Desde el celular o la computadora.</p>
        <div class="row"><a class="btn" href="#/practicar">Empezar a practicar</a><button class="btn ghost" id="hreg">Crear cuenta gratis</button></div>
        <p class="small muted" style="margin-top:12px">Puedes practicar sin cuenta. Con cuenta, tu progreso queda guardado.</p></div>
      <div class="hero-art"><div class="t small">Palabra del día</div><div class="w" id="wotd">…</div><div class="t" id="wotde"></div>
        <div style="margin-top:16px"><button class="chip" id="wplay" style="background:rgba(255,255,255,.18);border:0;color:#fff">🔊 Escuchar</button></div>
        <div style="margin-top:18px"><span class="pill">${c.v} palabras</span><span class="pill">${c.g} preguntas</span><span class="pill">${c.s} oraciones</span></div></div>
    </section>
    <section class="sec grid g4">
      <div class="card feat"><div class="ic">🔊</div><b>Escucha y responde</b><span class="muted small">Cada palabra tiene audio con dos voces y el acento marcado.</span></div>
      <div class="card feat"><div class="ic">🧩</div><b>Gramática paso a paso</b><span class="muted small">Casos, pronombres, adjetivos y verbos con la explicación de cada respuesta.</span></div>
      <div class="card feat"><div class="ic">🔨</div><b>Arma oraciones</b><span class="muted small">Elige la forma correcta de cada palabra y entiende por qué.</span></div>
      <div class="card feat"><div class="ic">📈</div><b>Tu progreso</b><span class="muted small">Racha diaria, palabras dominadas y repaso de tus errores.</span></div>
    </section>
    <section class="sec"><h2>Unidades</h2><div class="grid g2">${units}</div></section>`;
    $("#hreg").onclick = () => authModal("register");
    wordOfDay();
  } else {
    const t = S.stats ? S.stats.totals : { streak: 0, answers: 0, right: 0, mastered: 0, week_sessions: 0 };
    const acc = t.answers ? Math.round(t.right / t.answers * 100) : 0;
    const weak = S.stats ? S.stats.weak.filter(k => S.byKey[k]).length : 0;
    view().innerHTML = `
    <section><h1 style="font-size:clamp(26px,4vw,34px)">Hola, ${esc(S.user.name)} 👋</h1><p class="lead" style="margin-bottom:18px">${t.streak ? `Llevas <b>${t.streak} ${t.streak === 1 ? "día" : "días"}</b> seguidos practicando.` : "Hoy es un buen día para practicar."}</p>
      <div class="grid g4">
        <div class="card stat"><div class="v">🔥 ${t.streak}</div><div class="k">Racha de días</div></div>
        <div class="card stat"><div class="v">${t.mastered}</div><div class="k">Dominadas</div></div>
        <div class="card stat"><div class="v">${acc}%</div><div class="k">Aciertos</div></div>
        <div class="card stat"><div class="v">${t.week_sessions}</div><div class="k">Sesiones esta semana</div></div>
      </div>
      <div class="row" style="margin-top:16px"><a class="btn" href="#/practicar">Practicar</a>${weak ? `<button class="btn ghost" id="hweak">Repasar mis errores (${weak})</button>` : ""}</div>
    </section>
    <section class="sec"><h2>Unidades</h2><div class="grid g2">${units}</div></section>
    <section class="sec grid g2"><div class="card"><h2>Palabra del día</h2><div class="q" style="text-align:left;margin:0" id="wotd">…</div><div class="muted" id="wotde"></div><div style="margin-top:10px"><button class="chip" id="wplay">🔊 Escuchar</button></div></div>
      <div class="card"><h2>Ranking de la semana</h2><div id="lb" class="small muted">Cargando…</div></div></section>`;
    if ($("#hweak")) $("#hweak").onclick = startWeak;
    wordOfDay(); loadLeaderboard();
  }
  $$(".unit-card").forEach(el => el.onclick = () => { S.cfg.kind = "vocab"; S.cfg.vsel = vocabSections().filter(s => s[0] === el.dataset.unit); saveCfg(); location.hash = "#/practicar"; });
}
function wordOfDay() {
  const all = S.vocab.flatMap(s => s.items.filter(i => i.ru.length > 3 && !/[?!…]/.test(i.ru)));
  if (!all.length) return;
  const d = new Date(); const n = (d.getFullYear() * 400 + d.getMonth() * 31 + d.getDate()) % all.length; const w = all[n];
  $("#wotd").textContent = w.st; $("#wotde").textContent = w.es; $("#wplay").onclick = () => sayWord(w);
}
async function loadLeaderboard() {
  try { const r = await api("/api/leaderboard"); $("#lb").innerHTML = r.top.length ? r.top.map((x, i) => `<div class="lb"><span>${["🥇", "🥈", "🥉"][i] || (i + 1) + "."} ${esc(x.name)}</span><b>${x.points}</b></div>`).join("") + `<p class="small muted">Puntos = respuestas correctas en los últimos 7 días.</p>` : "Nadie ha practicado esta semana todavía. ¡Sé el primero!"; } catch (e) { $("#lb").textContent = "No disponible."; }
}

/* ---------------- practice setup ---------------- */
function pagePractice() {
  const c = S.cfg;
  if (!c.vsel) c.vsel = vocabSections(); if (!c.gsel) c.gsel = gramSections();
  const kinds = [["vocab", "📖 Vocabulario"], ["gram", "🧩 Gramática"], ["sent", "🔨 Oraciones"]];
  view().innerHTML = `<h1 style="font-size:clamp(26px,4vw,34px)">Practicar</h1>
  <div class="layout"><div>
    <div class="seg" id="kinds">${kinds.map(k => `<button data-k="${k[0]}" class="${c.kind === k[0] ? "on" : ""}">${k[1]}</button>`).join("")}</div>
    <div id="opts"></div>
  </div>
  <aside class="side"><div class="card"><div class="label" style="margin-top:0">Resumen</div><div id="summary" class="muted"></div>
    <div class="label">Preguntas</div><div class="chips" id="counts"></div>
    <div class="startbar"><button class="btn wide" id="go">Empezar</button></div>
    ${S.user ? "" : `<p class="small muted" style="margin:12px 0 0"><a href="#" id="pslog">Entra</a> para guardar tu progreso.</p>`}</div></aside></div>`;
  $$("#kinds button").forEach(b => b.onclick = () => { c.kind = b.dataset.k; saveCfg(); pagePractice(); });
  if ($("#pslog")) $("#pslog").onclick = e => { e.preventDefault(); authModal("login"); };
  const o = $("#opts");
  const secChips = (all, selKey, kind, withUnits) => {
    const sel = new Set(c[selKey]);
    const units = withUnits ? [...new Set(all.map(s => s[0]))] : [];
    const pct = s => { const st = sectionStat(kind, s); if (!st) return ""; const tot = (kind === "vocab" ? S.vocab : S.gram).find(x => x.section === s).items.length; return ` · ${Math.round(st.mastered / tot * 100)}%`; };
    return `<div class="chips">${`<button class="chip ${sel.size === all.length ? "on" : ""}" data-s="*">Todas</button>`}${units.map(u => { const us = all.filter(s => s[0] === u); return `<button class="chip unit ${us.every(s => sel.has(s)) ? "on" : ""}" data-u="${u}">Unidad ${u}</button>`; }).join("")}</div>
      <div class="chips" style="margin-top:8px">${all.map(s => `<button class="chip ${sel.has(s) ? "on" : ""}" data-s="${esc(s)}">${esc(s)}${S.user ? `<span class="muted">${pct(s)}</span>` : ""}</button>`).join("")}</div>`;
  };
  const bindSec = (all, selKey) => {
    $$("[data-s],[data-u]", o).forEach(b => b.onclick = () => {
      let sel = new Set(c[selKey]);
      if (b.dataset.s === "*") sel = sel.size === all.length ? new Set() : new Set(all);
      else if (b.dataset.u) { const us = all.filter(s => s[0] === b.dataset.u); const on = us.every(s => sel.has(s)); us.forEach(s => on ? sel.delete(s) : sel.add(s)); }
      else sel.has(b.dataset.s) ? sel.delete(b.dataset.s) : sel.add(b.dataset.s);
      c[selKey] = [...sel]; saveCfg(); pagePractice();
    });
  };
  if (c.kind === "vocab") {
    o.innerHTML = `<div class="label">Modo</div><div class="chips">${VMODES.map(m => `<button class="chip ${c.vmode === m[0] ? "on" : ""}" data-m="${m[0]}">${m[1]}</button>`).join("")}</div>
      <div class="label">Voz</div><div class="chips"><button class="chip ${c.voice === "irina" ? "on" : ""}" data-v="irina">👩 Mujer</button><button class="chip ${c.voice === "dmitri" ? "on" : ""}" data-v="dmitri">👨 Hombre</button></div>
      <div class="label">Secciones</div>${secChips(vocabSections(), "vsel", "vocab", true)}`;
    $$("[data-m]", o).forEach(b => b.onclick = () => { c.vmode = b.dataset.m; saveCfg(); pagePractice(); });
    $$("[data-v]", o).forEach(b => b.onclick = () => { c.voice = b.dataset.v; saveCfg(); play(`/audio/${c.voice}/w/453272608c.mp3`); pagePractice(); });
    bindSec(vocabSections(), "vsel");
  } else if (c.kind === "gram") {
    o.innerHTML = `<div class="label">Temas</div>${secChips(gramSections(), "gsel", "gram", false)}<p class="small muted" style="margin-top:14px">¿Dudas? Consulta la <a href="#/referencia">referencia</a> con todas las tablas.</p>`;
    bindSec(gramSections(), "gsel");
  } else {
    o.innerHTML = `<div class="label">Modo</div><div class="chips"><button class="chip ${c.fmode === "build" ? "on" : ""}" data-f="build">🔨 Construir</button><button class="chip ${c.fmode === "analyze" ? "on" : ""}" data-f="analyze">🔍 Analizar</button></div>
      <p class="muted small" style="margin-top:12px"><b>Construir:</b> eliges la forma correcta de cada palabra.<br><b>Analizar:</b> dices en qué caso está cada palabra.</p>
      <div class="label">Voz</div><div class="chips"><button class="chip ${c.voice === "irina" ? "on" : ""}" data-v="irina">👩 Mujer</button><button class="chip ${c.voice === "dmitri" ? "on" : ""}" data-v="dmitri">👨 Hombre</button></div>`;
    $$("[data-f]", o).forEach(b => b.onclick = () => { c.fmode = b.dataset.f; saveCfg(); pagePractice(); });
    $$("[data-v]", o).forEach(b => b.onclick = () => { c.voice = b.dataset.v; saveCfg(); pagePractice(); });
  }
  const pool = buildPool();
  $("#counts").innerHTML = [10, 20, 40, "Todas"].map(n => `<button class="chip ${c.count === n ? "on" : ""}" data-n="${n}">${n}</button>`).join("");
  $$("#counts [data-n]").forEach(b => b.onclick = () => { c.count = b.dataset.n === "Todas" ? "Todas" : +b.dataset.n; saveCfg(); pagePractice(); });
  const label = { vocab: "palabras", gram: "preguntas", sent: "oraciones" }[c.kind];
  $("#summary").innerHTML = `<b style="color:var(--ink);font-size:22px">${pool.length}</b> ${label} disponibles`;
  $("#go").disabled = pool.length < (c.kind === "sent" ? 1 : 4);
  $("#go").onclick = () => { let d = shuffle(pool); if (c.count !== "Todas") d = d.slice(0, c.count); startRun(d, c.kind === "vocab" ? c.vmode : c.kind === "sent" ? c.fmode : "mcq"); };
}
function buildPool() {
  const c = S.cfg;
  if (c.kind === "vocab") { const sel = new Set(c.vsel); return S.vocab.filter(s => sel.has(s.section)).flatMap(s => s.items.map(i => ({ t: "v", ...i, section: s.section }))); }
  if (c.kind === "gram") { const sel = new Set(c.gsel); return S.gram.filter(s => sel.has(s.section)).flatMap(s => s.items.map(i => ({ t: "g", ...i, section: s.section }))); }
  return S.sent.map(i => ({ t: "s", ...i, section: "Oraciones" }));
}
function startWeak() {
  const items = S.stats.weak.map(k => S.byKey[k]).filter(Boolean);
  if (!items.length) { toast("¡No tienes errores pendientes!"); return; }
  startRun(shuffle(items).slice(0, 40), "weak");
}

/* ---------------- runner ---------------- */
let R = null;
function startRun(deck, mode) {
  R = { deck, mode, i: 0, right: 0, results: [], missed: [] };
  document.body.classList.add("focus");
  location.hash !== "#/practicar" && history.replaceState(null, "", "#/practicar");
  showItem();
}
function runnerShell(inner) {
  const pct = Math.round(R.i / R.deck.length * 100);
  view().innerHTML = `<div class="runner"><div class="rtop"><button class="x" id="quit" aria-label="Salir">✕</button><div class="bar"><i style="width:${pct}%"></i></div><b class="small">${R.i + 1}/${R.deck.length}</b></div>
    <div class="card" id="qc">${inner}</div><div id="after" style="margin-top:14px"></div></div>`;
  $("#quit").onclick = () => { if (R.results.length && confirmQuit()) finish(); else route(); };
  $$("[data-say]").forEach(b => b.onclick = () => { const it = R.deck[R.i]; it.t === "s" ? saySent(it, b.dataset.say === "slow") : sayWord(it, b.dataset.say === "slow"); });
}
function confirmQuit() { return true; }
function record(it, ok) {
  const key = (it.t === "v" ? "v:" : it.t === "g" ? "g:" : "s:") + it.id;
  R.results.push({ key, kind: it.t === "v" ? "vocab" : it.t === "g" ? "gram" : "sent", section: it.section, ok });
  if (ok) R.right++; else R.missed.push(it);
}
function nextBtn(label = "Siguiente") {
  $("#after").innerHTML = `<button class="btn wide" id="next">${label} →</button>`;
  $("#next").onclick = advance; $("#next").focus({ preventScroll: true });
}
function advance() { R.i++; if (R.i >= R.deck.length) finish(); else showItem(); }
function showItem() {
  const it = R.deck[R.i];
  const m = R.mode === "weak" ? (it.t === "v" ? "ru-es" : it.t === "s" ? "build" : "mcq") : R.mode;
  if (it.t === "g") return showMCQ(it, it.q, it.a, it.o, it.e, true);
  if (it.t === "s") return showSentence(it, m === "analyze");
  return showVocab(it, m);
}
function vocabDistractors(it, key) {
  const pool = S.vocab.flatMap(s => s.items.map(i => ({ ...i, section: s.section })));
  const same = shuffle(pool.filter(x => x.section === it.section)), other = shuffle(pool.filter(x => x.section !== it.section));
  const out = []; for (const x of [...same, ...other]) { if (x[key] !== it[key] && !out.some(o => o[key] === x[key])) out.push(x); if (out.length === 3) break; } return out;
}
function showVocab(it, m) {
  if (m === "listen-say" || m === "flash") {
    const listen = m === "listen-say";
    runnerShell(`<div class="cat">${esc(it.section)}</div><div class="reveal"><div class="q ${listen ? "big" : ""}">${listen ? "🎧" : esc(it.st)}</div>${listen || it.a ? audioBtns() : ""}
      <div class="muted small" id="tip">${listen ? "Escucha y di la traducción en voz alta" : "¿Sabes qué significa?"}</div><div class="hidden" id="ans">${listen ? `<div class="q" style="margin:0">${esc(it.st)}</div>` : ""}<div class="ans">${esc(it.es)}</div></div></div>`);
    $("#after").innerHTML = `<button class="btn wide" id="rev">Ver respuesta</button>`;
    if (listen) setTimeout(() => sayWord(it), 200);
    $("#rev").onclick = () => {
      $("#ans").classList.remove("hidden"); $("#tip").classList.add("hidden"); if (!listen) sayWord(it);
      $("#after").innerHTML = `<div class="row"><button class="btn danger" style="flex:1" id="no">No la sabía</button><button class="btn" style="flex:1" id="yes">La sabía</button></div>`;
      $("#no").onclick = () => { record(it, false); advance(); }; $("#yes").onclick = () => { record(it, true); advance(); };
    };
    return;
  }
  if (m === "write") {
    runnerShell(`<div class="cat">${esc(it.section)}</div><div class="q">${esc(it.st)}</div>${audioBtns()}
      <form id="wf"><input class="in" id="wi" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Escribe en español"><button class="btn wide" style="margin-top:10px">Comprobar</button></form><div id="fb"></div>`);
    const inp = $("#wi"); inp.focus();
    $("#wf").onsubmit = e => {
      e.preventDefault(); const v = norm(inp.value); if (!v || inp.disabled) return;
      const alts = it.es.split(/[\/,;]/).map(s => norm(s.replace(/\(.*?\)/g, ""))).filter(Boolean);
      const ok = alts.includes(v) || norm(it.es) === v || norm(it.es.replace(/\(.*?\)/g, "")) === v;
      inp.disabled = true; record(it, ok); sayWord(it);
      $("#fb").innerHTML = `<div class="fb ${ok ? "ok" : "bad"}">${ok ? "¡Correcto!" : "Respuesta"}: <b>${esc(it.es)}</b></div>`; nextBtn();
    };
    return;
  }
  const listen = m === "listen", toRu = m === "es-ru", key = toRu ? "st" : "es";
  const opts = shuffle([it, ...vocabDistractors(it, toRu ? "ru" : "es")]);
  const qhtml = listen ? `<div class="q big" id="hq">🎧</div>${audioBtns()}` : toRu ? `<div class="q">${esc(it.es)}</div>` : `<div class="q">${esc(it.st)}</div>${it.a ? audioBtns() : ""}`;
  showMCQ(it, qhtml, it[key], null, "", false, opts.map(o => o[key]), true);
  if (listen) setTimeout(() => sayWord(it), 200);
}
function showMCQ(it, q, ans, wrongs, expl, isGram, ready, raw) {
  let opts = ready || shuffle([ans, ...wrongs]);
  if (isGram && opts.every(o => /^\d · /.test(o)) && !/caso número/.test(q)) opts = opts.slice().sort();
  runnerShell(`<div class="cat">${esc(it.section)}</div>${raw ? q : `<div class="q sm">${q}</div>`}<div class="opts ${opts.every(o => o.length < 22) ? "two" : ""}" id="opts">${opts.map((o, i) => `<button class="opt" data-i="${i}"><span class="k">${i + 1}</span><span>${esc(o)}</span></button>`).join("")}</div><div id="fb"></div><div class="hint">Atajos: teclas 1–${opts.length} y Enter</div>`);
  $$(".opt").forEach(b => b.onclick = () => {
    if ($(".opt:disabled")) return;
    const ok = opts[+b.dataset.i] === ans; record(it, ok);
    $$(".opt").forEach(x => { x.disabled = true; if (opts[+x.dataset.i] === ans) x.classList.add("ok"); }); if (!ok) b.classList.add("bad");
    if (it.t === "v") { sayWord(it); if ($("#hq")) { $("#hq").textContent = it.st; $("#hq").classList.remove("big"); } }
    $("#fb").innerHTML = `<div class="fb ${ok ? "ok" : "bad"}">${ok ? "¡Correcto!" : `Correcta: <b>${esc(ans)}</b>.`}${expl ? " " + esc(expl) : ""}</div>`;
    nextBtn();
  });
}
function showSentence(it, analyze) {
  const parts = it.tpl.split(/\{(\d)\}/);
  const steps = analyze ? it.s.map((x, i) => i).filter(i => it.s[i][3] > 0) : it.s.map((x, i) => i);
  let k = 0, allok = true; const res = {};
  const sentHTML = () => parts.map((p, j) => {
    if (j % 2 === 0) return esc(p); const i = +p, sl = it.s[i];
    if (analyze) { const cls = res[i] === undefined ? (i === steps[k] ? "cur" : "") : (res[i] ? "okw" : "badw"); return `<span class="${cls}">${esc(sl[1])}</span>`; }
    if (res[i] !== undefined) return `<span class="${res[i] ? "okw" : "badw"}">${esc(sl[1])}</span>`;
    return `<span class="${i === steps[k] ? "cur" : "gap"}">___<small> (${esc(sl[0])})</small></span>`;
  }).join("");
  const draw = () => {
    const done = k >= steps.length;
    runnerShell(`<div class="cat">${analyze ? "Analizar" : "Construir"}</div><div class="es">${esc(it.es)}</div><div class="sent">${sentHTML()}</div>
      ${done ? audioBtns() : `<div class="muted small" style="text-align:center;margin-bottom:10px">${analyze ? "¿En qué caso está la palabra marcada?" : `Elige la forma correcta de <b>${esc(it.s[steps[k]][0])}</b>`}</div>`}
      <div class="opts ${analyze ? "two" : ""}" id="opts"></div><div class="expl">${steps.slice(0, k).map(i => { const sl = it.s[i]; return `<div class="xrow"><span><b>${esc(sl[1])}</b>${analyze ? "" : ` <small class="muted">(${esc(sl[0])})</small>`}</span><span>${clab(sl[3])}. ${esc(sl[4])}</span></div>`; }).join("")}</div>`);
    if (done) { record(it, allok); saySent(it); nextBtn(); return; }
    const sl = it.s[steps[k]];
    const opts = analyze ? [1, 2, 3, 4, 5, 6].map(clab) : shuffle([sl[1], ...sl[2]]); const ans = analyze ? clab(sl[3]) : sl[1];
    $("#opts").innerHTML = opts.map((o, i) => `<button class="opt" data-i="${i}"><span class="k">${i + 1}</span><span>${esc(o)}</span></button>`).join("");
    $$(".opt").forEach(b => b.onclick = () => {
      if ($(".opt:disabled")) return; const ok = opts[+b.dataset.i] === ans; res[steps[k]] = ok; if (!ok) allok = false;
      $$(".opt").forEach(x => { x.disabled = true; if (opts[+x.dataset.i] === ans) x.classList.add("ok"); }); if (!ok) b.classList.add("bad");
      setTimeout(() => { k++; draw(); }, ok ? 450 : 1300);
    });
  };
  draw();
}
document.addEventListener("keydown", e => {
  if (!R || !document.body.classList.contains("focus") || e.target.tagName === "INPUT") return;
  const n = parseInt(e.key, 10); const opts = $$(".opt");
  if (n >= 1 && n <= opts.length && !opts[n - 1].disabled) { opts[n - 1].click(); return; }
  if (e.key === "Enter") { const b = $("#next") || $("#rev"); if (b) { e.preventDefault(); b.click(); } }
});
async function finish() {
  const r = R; const pct = r.results.length ? Math.round(r.right / r.results.length * 100) : 0;
  let saved = "";
  if (S.user && r.results.length) {
    try {
      const groups = {}; r.results.forEach(x => (groups[x.kind] = groups[x.kind] || []).push(x));
      for (const k in groups) await api("/api/session", { kind: k, mode: r.mode, results: groups[k] });
      await refreshStats(); saved = `<div class="save"><span class="dot"></span>Progreso guardado</div>`;
    } catch (e) { saved = `<div class="save" style="color:var(--bad)">No se pudo guardar: ${esc(e.message)}</div>`; }
  } else if (!S.user) saved = `<div class="save"><a href="#" id="rsreg">Crea una cuenta</a>&nbsp;para guardar tu progreso.</div>`;
  const msg = pct >= 90 ? "¡Excelente! 🎉" : pct >= 70 ? "¡Muy bien! 💪" : pct >= 50 ? "Vas por buen camino" : "Sigue practicando, ¡tú puedes!";
  view().innerHTML = `<div class="runner"><div class="card result"><div class="cat">${msg}</div><div class="big" style="margin:12px 0 4px">${pct}%</div>
    <p class="muted" style="text-align:center;margin:0">${r.right} de ${r.results.length} correctas</p>${saved}
    ${r.missed.length ? `<div class="label">Para repasar</div>${r.missed.map(m => `<div class="xrow"><span>${m.t === "v" ? esc(m.st) : m.t === "g" ? m.q : esc(m.es)}</span><span>${esc(m.t === "v" ? m.es : m.t === "g" ? m.a : m.tpl.replace(/\{(\d)\}/g, (_, i) => m.s[i][1]))}</span></div>`).join("")}` : `<p style="text-align:center">¡Sin errores!</p>`}
    <div class="row" style="margin-top:18px">${r.missed.length ? `<button class="btn" style="flex:1" id="again">Repasar los fallados</button>` : ""}<a class="btn line" style="flex:1" href="#/practicar" id="back">Volver</a></div></div></div>`;
  if ($("#again")) $("#again").onclick = () => startRun(shuffle(r.missed), r.mode);
  if ($("#rsreg")) $("#rsreg").onclick = e => { e.preventDefault(); authModal("register"); };
  $("#back").onclick = e => { e.preventDefault(); R = null; route(); };
  R = null; document.body.classList.remove("focus");
}

/* ---------------- reference ---------------- */
function pageReference() {
  view().innerHTML = `<h1 style="font-size:clamp(26px,4vw,34px)">Referencia</h1><p class="lead">Todas las tablas para repasar: casos, terminaciones, pronombres y verbos.</p><div class="toc" id="toc"></div><div class="ref" id="ref">${S.tabla}</div>`;
  const hs = $$("#ref h3"); $("#toc").innerHTML = hs.map((h, i) => { h.id = "t" + i; return `<a class="chip" href="#" data-t="t${i}">${esc(h.textContent)}</a>`; }).join("");
  $$("#toc [data-t]").forEach(a => a.onclick = e => { e.preventDefault(); document.getElementById(a.dataset.t).scrollIntoView({ behavior: "smooth" }); });
  $$("#ref table").forEach(t => { const w = document.createElement("div"); w.className = "tscroll"; t.parentNode.insertBefore(w, t); w.appendChild(t); });
}

/* ---------------- progress ---------------- */
function pageProgress() {
  if (!S.user) {
    view().innerHTML = `<div class="card empty" style="max-width:480px;margin:30px auto"><div style="font-size:44px">📈</div><h2>Guarda tu progreso</h2><p>Crea una cuenta gratis para ver tu racha, las palabras que dominas y repasar tus errores desde cualquier dispositivo.</p>
      <div class="row" style="justify-content:center"><button class="btn" id="pr1">Crear cuenta</button><button class="btn ghost" id="pr2">Entrar</button></div></div>`;
    $("#pr1").onclick = () => authModal("register"); $("#pr2").onclick = () => authModal("login"); return;
  }
  const st = S.stats; if (!st) { view().innerHTML = `<div class="loader">Cargando…</div>`; refreshStats().then(pageProgress); return; }
  const t = st.totals, acc = t.answers ? Math.round(t.right / t.answers * 100) : 0;
  const rows = (kind, list) => list.map(sec => {
    const tot = sec.items.length, s = sectionStat(kind, sec.section) || { seen: 0, mastered: 0, right: 0, wrong: 0 };
    const pct = Math.round(s.mastered / tot * 100), a = s.right + s.wrong ? Math.round(s.right / (s.right + s.wrong) * 100) : null;
    return `<div class="prow"><div><b>${esc(sec.section)}</b><div class="bar" style="margin-top:6px"><i style="width:${pct}%"></i></div></div><div class="pct">${pct}%</div><div class="sub">${s.mastered}/${tot} dominadas · ${s.seen} vistas${a !== null ? ` · ${a}% aciertos` : ""}</div></div>`;
  }).join("");
  const kindName = { vocab: "Vocabulario", gram: "Gramática", sent: "Oraciones" };
  const weak = st.weak.filter(k => S.byKey[k]).length;
  view().innerHTML = `<h1 style="font-size:clamp(26px,4vw,34px)">Mi progreso</h1>
    <div class="grid g4"><div class="card stat"><div class="v">🔥 ${t.streak}</div><div class="k">Racha de días</div></div><div class="card stat"><div class="v">${t.mastered}</div><div class="k">Dominadas</div></div>
      <div class="card stat"><div class="v">${acc}%</div><div class="k">Aciertos</div></div><div class="card stat"><div class="v">${t.answers}</div><div class="k">Respuestas</div></div></div>
    <div class="row" style="margin-top:16px">${weak ? `<button class="btn" id="pw">Repasar mis errores (${weak})</button>` : `<span class="muted">No tienes errores pendientes. 👏</span>`}</div>
    <p class="small muted">Una palabra o pregunta cuenta como <b>dominada</b> cuando la última vez la acertaste y la has acertado más veces de las que la fallaste.</p>
    <section class="sec grid g2"><div class="card"><h2>Vocabulario</h2>${rows("vocab", S.vocab)}</div><div class="card"><h2>Gramática</h2>${rows("gram", S.gram)}</div></section>
    <section class="sec card"><h2>Últimas sesiones</h2>${st.recent.length ? st.recent.map(s => `<div class="xrow"><span>${kindName[s.kind] || s.kind} · ${new Date(s.at).toLocaleDateString("es", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span><span><b>${s.correct}/${s.total}</b></span></div>`).join("") : `<p class="muted">Todavía no hay sesiones.</p>`}</section>
    <section class="sec"><button class="btn danger sm" id="reset">Borrar mi progreso</button></section>`;
  if ($("#pw")) $("#pw").onclick = startWeak;
  $("#reset").onclick = () => {
    modal(`<h2>¿Borrar tu progreso?</h2><p class="muted">Se eliminarán todas tus estadísticas y sesiones. No se puede deshacer.</p><div class="row"><button class="btn line" style="flex:1" id="rc">Cancelar</button><button class="btn danger" style="flex:1" id="rk">Borrar</button></div>`);
    $("#rc").onclick = closeModal; $("#rk").onclick = async () => { await api("/api/reset", {}); closeModal(); await refreshStats(); pageProgress(); toast("Progreso borrado"); };
  };
}

/* ---------------- boot ---------------- */
(async function boot() {
  view().innerHTML = `<div class="loader">Cargando…</div>`;
  try {
    const [v, g, s, t, me] = await Promise.all([fetch("/data/vocab.json").then(r => r.json()), fetch("/data/gram.json").then(r => r.json()), fetch("/data/sent.json").then(r => r.json()), fetch("/data/tabla.html").then(r => r.text()), api("/api/me").catch(() => ({ user: null }))]);
    S.vocab = v; S.gram = g; S.sent = s.map(x => ({ id: x.id, es: x.es, tpl: x.t, s: x.s })); S.tabla = t; S.user = me.user;
    v.forEach(sec => sec.items.forEach(i => S.byKey["v:" + i.id] = { t: "v", ...i, section: sec.section }));
    g.forEach(sec => sec.items.forEach(i => S.byKey["g:" + i.id] = { t: "g", ...i, section: sec.section }));
    S.sent.forEach(i => S.byKey["s:" + i.id] = { t: "s", ...i, section: "Oraciones" });
    const vs = new Set(vocabSections()), gs = new Set(gramSections());
    if (S.cfg.vsel) S.cfg.vsel = S.cfg.vsel.filter(x => vs.has(x)); if (S.cfg.gsel) S.cfg.gsel = S.cfg.gsel.filter(x => gs.has(x));
    await refreshStats();
  } catch (e) { view().innerHTML = `<div class="card empty">No se pudo cargar el contenido. Revisa tu conexión y recarga la página.</div>`; return; }
  renderUser(); route();
})();

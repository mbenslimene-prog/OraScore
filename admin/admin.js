// Page d'administration OraScore : connexion par lien e-mail (Supabase Auth), données et actions par
// les fonctions /api/admin/* qui vérifient à chaque appel que la personne connectée est l'administrateur.
// Toutes les valeurs saisies par les candidats sont échappées avant affichage.
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fr = (d) => new Date(d).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
let sb, session, D = null, filtre = "a_traiter", ouvert = null, envoi = null;

function toast(msg, err) {
  const t = $("toast"); t.textContent = msg; t.style.color = err ? "#fca5a5" : "#86efac"; t.style.display = "block";
  clearTimeout(t._t); t._t = setTimeout(() => (t.style.display = "none"), 5000);
}

async function api(path, body) {
  const r = await fetch(path, { method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
    body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) { await sb.auth.signOut(); location.reload(); }
  if (!r.ok || j.ok === false) throw new Error(j.error || `erreur ${r.status}`);
  return j;
}

async function demarrer() {
  const cfg = await (await fetch("/api/admin/data?config")).json();
  sb = supabase.createClient(cfg.supabaseUrl, cfg.anonKey);
  const { data } = await sb.auth.getSession();
  session = data.session;
  if (!session) {
    $("login").hidden = false;
    $("loginForm").onsubmit = async (e) => {
      e.preventDefault();
      const { error } = await sb.auth.signInWithOtp({ email: $("loginEmail").value.trim(),
        options: { shouldCreateUser: false, emailRedirectTo: location.origin + "/admin/" } });
      // Même message dans tous les cas : on ne révèle pas quelles adresses sont autorisées
      if (error) console.error("connexion :", error.status, error.message);
      $("loginMsg").textContent = !error || /not allowed|signups/i.test(error.message)
        ? "Si cette adresse est autorisée, un lien de connexion vient d'être envoyé."
        : error.status === 429 || /rate limit|security purposes/i.test(error.message)
          ? "Trop de liens demandés récemment : le service d'envoi limite le nombre de liens par heure. Réessayez dans une heure, ou utilisez le dernier lien reçu s'il a moins d'une heure."
          : "Envoi impossible pour le moment (" + (error.message || "erreur") + "), réessayez dans quelques minutes.";
    };
    return;
  }
  $("who").innerHTML = `${esc(session.user.email)} · <button id="logout">Se déconnecter</button>`;
  $("logout").onclick = async () => { await sb.auth.signOut(); location.reload(); };
  $("app").hidden = false;
  await charger();
}

async function charger() {
  try { D = await api("/api/admin/data"); afficher(); }
  catch (e) { $("cfgWarn").innerHTML = `<div class="warn">Chargement impossible : ${esc(e.message)}</div>`; }
}

const profil = (c) => `${c.type_base || "?"} · ${c.os || "?"} · ${c.version || "?"}`;
function acceptesProfil(c) {
  return D.candidatures.filter((x) => x.statut === "acceptée" && profil(x) === profil(c)).length;
}

function afficher() {
  const C = D.candidatures, Lc = D.licences;
  const warn = [];
  if (!D.driveConfigure) warn.push("Variable <b>DRIVE_URL</b> absente dans Vercel : l'e-mail d'acceptation ne peut pas être préparé.");
  if (!D.clesConfigurees) warn.push("Variable <b>EA_KEYS</b> absente dans Vercel : les clés de licence ne peuvent pas être envoyées.");
  $("cfgWarn").innerHTML = warn.map((w) => `<div class="warn">${w}</div>`).join("");
  const n = (f) => C.filter(f).length;
  const libres = Lc.filter((l) => l.statut === "libre" && !l.reserve).length;
  const reserve = Lc.filter((l) => l.statut === "libre" && l.reserve).length;
  $("cards").innerHTML = [
    [n((c) => c.statut === "nouvelle"), "Nouvelles demandes"],
    [n((c) => c.statut === "en attente"), "En attente"],
    [n((c) => c.statut === "acceptée"), "Acceptées"],
    [`${libres} + ${reserve}`, "Licences libres (+ réserve)"],
  ].map(([v, l]) => `<div class="card"><div class="n">${esc(v)}</div><div class="l">${esc(l)}</div></div>`).join("");

  const F = { a_traiter: ["À traiter", (c) => ["nouvelle", "en attente"].includes(c.statut)],
              acceptee: ["Acceptées", (c) => c.statut === "acceptée"], refusee: ["Refusées", (c) => c.statut === "refusée"],
              toutes: ["Toutes", () => true] };
  $("filters").innerHTML = Object.entries(F).map(([k, [l, f]]) =>
    `<button data-f="${k}" class="${k === filtre ? "on" : ""}">${l} (${C.filter(f).length})</button>`).join("");
  $("filters").querySelectorAll("button").forEach((b) => (b.onclick = () => { filtre = b.dataset.f; afficher(); }));

  const liste = C.filter(F[filtre][1]);
  $("cands").innerHTML = liste.length ? liste.map((c) => `
    <tr class="cand" data-id="${c.id}"><td>${c.id}</td><td>${fr(c.created_at)}</td>
      <td><b>${c.prenom || c.nom ? `${esc(c.prenom)} ${esc(c.nom)}` : "(sans nom)"}</b>${c.societe ? ` — ${esc(c.societe)}` : ""}<br><span class="muted">${esc(c.email)}</span></td>
      <td class="hide-s">${esc(profil(c))}</td><td><span class="tag t-${esc(c.statut).replace(" ", ".")}">${esc(c.statut)}</span></td></tr>
    ${ouvert === c.id ? detail(c) : ""}`).join("") : `<tr><td colspan="5" class="muted">Aucune candidature.</td></tr>`;
  $("cands").querySelectorAll("tr.cand").forEach((tr) => (tr.onclick = () => {
    ouvert = ouvert === Number(tr.dataset.id) ? null : Number(tr.dataset.id); afficher(); }));
  brancherActions();

  $("lics").innerHTML = Lc.map((l) => `<div class="${l.reserve ? "res" : ""}"><b>N°${l.numero}</b>${l.reserve ? " · réserve" : ""}<br>
    <span class="tag t-${esc(l.statut)}">${esc(l.statut)}</span><br>${l.titulaire ? esc(l.titulaire) : '<span class="muted">—</span>'}
    ${l.date_attribution ? `<br><span class="muted">${esc(l.date_attribution)}</span>` : ""}</div>`).join("");

  $("couv").innerHTML = D.couverture.length ? D.couverture.map((p) => `<tr><td>${esc(p.type_base)}</td><td>${esc(p.os)}</td>
    <td>${esc(p.version)}</td><td>${p.candidatures}</td><td>${p.acceptees}${p.acceptees >= 2 ? ' <span class="tag t-refusée">complet</span>' : ""}</td></tr>`).join("")
    : `<tr><td colspan="5" class="muted">Aucune donnée.</td></tr>`;
}

function detail(c) {
  const h = D.historique.filter((e) => e.candidature_id === c.id);
  const lic = D.licences.find((l) => l.candidature_id === c.id && l.statut === "attribuée");
  const nbProfil = acceptesProfil(c);
  const libresRes = D.licences.filter((l) => l.statut === "libre" && l.reserve).map((l) => l.numero);
  const ouvertA = ["nouvelle", "en attente"].includes(c.statut);
  return `<tr class="detail"><td colspan="5"><div class="grid">
    <div><b>Coordonnées</b><br>${esc(c.prenom)} ${esc(c.nom)}${c.societe ? ` (${esc(c.societe)})` : ""}<br>${esc(c.email)}<br>
      Téléphone : ${esc(c.telephone || "non communiqué")}<br>Profil : ${esc(profil(c))}<br>Précisions : ${esc(c.precisions || "aucune")}
      ${lic ? `<br><b>Licence n°${lic.numero}</b> attribuée le ${esc(lic.date_attribution)}` : ""}
      ${c.notes ? `<br><br><b>Notes</b><br><span class="muted">${esc(c.notes).replace(/\n/g, "<br>")}</span>` : ""}</div>
    <div><b>Historique</b><ul class="hist">${h.map((e) => `<li><b>${esc(e.evenement)}</b> · ${fr(e.created_at)}${e.details ? ` — ${esc(e.details)}` : ""}</li>`).join("") || "<li>—</li>"}</ul></div>
  </div>
  ${ouvertA && nbProfil >= 2 ? `<div class="warn">Ce profil (${esc(profil(c))}) a déjà ${nbProfil} licences : votre règle est de 2 au maximum.</div>` : ""}
  <div class="actions">
    ${ouvertA ? `<button class="prim" data-a="accepter" data-id="${c.id}">Accepter…</button>
      <select data-lic="${c.id}"><option value="">Prochaine licence libre</option>${libresRes.map((n) => `<option value="${n}">Licence de réserve n°${n}</option>`).join("")}</select>
      <button data-a="refuser" data-id="${c.id}">Refuser…</button>
      <select data-motif="${c.id}"><option value="profil">Motif : profil déjà couvert</option><option value="complet">Motif : programme complet</option><option value="autre">Motif : autre</option></select>
      ${c.statut === "nouvelle" ? `<button data-a="attente" data-id="${c.id}">Mettre en attente</button>` : ""}` : ""}
    ${c.statut === "acceptée" ? `<button data-a="retour" data-id="${c.id}">Retour reçu</button>
      <button data-a="témoignage" data-id="${c.id}">Témoignage reçu</button>
      <button data-a="correction" data-id="${c.id}">Correction faite</button>` : ""}
    ${lic ? `<button data-a="liberer" data-num="${lic.numero}">Libérer la licence n°${lic.numero}</button>
      <button class="danger" data-a="revoquer" data-num="${lic.numero}">Révoquer la licence n°${lic.numero}</button>` : ""}
    <input data-note="${c.id}" placeholder="Ajouter une note…" style="flex:1;min-width:200px"><button data-a="note" data-id="${c.id}">Noter</button>
  </div></td></tr>`;
}

function brancherActions() {
  document.querySelectorAll("[data-a]").forEach((b) => (b.onclick = async (ev) => {
    ev.stopPropagation();
    const a = b.dataset.a, id = Number(b.dataset.id);
    try {
      if (a === "accepter") {
        const numero = document.querySelector(`[data-lic="${id}"]`).value || undefined;
        const p = await api("/api/admin/action", { action: "apercu_acceptation", id, numero });
        ouvrirEnvoi(`Accepter — licence n°${p.numero}`, p, { action: "accepter", id, numero: p.numero });
      } else if (a === "refuser") {
        const motif = document.querySelector(`[data-motif="${id}"]`).value;
        const p = await api("/api/admin/action", { action: "apercu_refus", id, motif });
        ouvrirEnvoi("Refuser la candidature", p, { action: "refuser", id, motif });
      } else if (a === "attente") {
        await api("/api/admin/action", { action: "statut", id, statut: "en attente" }); toast("Mise en attente."); await charger();
      } else if (a === "note") {
        const t = document.querySelector(`[data-note="${id}"]`).value.trim(); if (!t) return;
        await api("/api/admin/action", { action: "note", id, texte: t }); toast("Note ajoutée."); await charger();
      } else if (["retour", "témoignage", "correction"].includes(a)) {
        const details = prompt(`${a} — précisions (facultatif) :`) ?? null; if (details === null) return;
        await api("/api/admin/action", { action: "evenement", id, evenement: a, details });
        toast(a === "retour" ? "Retour noté : les relances automatiques s'arrêtent." : "Noté."); await charger();
      } else if (a === "liberer") {
        if (!confirm(`Libérer la licence n°${b.dataset.num} ? Elle redevient libre et la demande repasse « à traiter ». ` +
                     "À réserver à un essai ou une erreur : la clé déjà envoyée reste utilisable dans OraScore.")) return;
        await api("/api/admin/action", { action: "liberer", numero: Number(b.dataset.num) }); toast("Licence libérée."); await charger();
      } else if (a === "revoquer") {
        if (!confirm(`Révoquer la licence n°${b.dataset.num} ? Elle ne sera plus attribuable.`)) return;
        await api("/api/admin/action", { action: "revoquer", numero: Number(b.dataset.num) }); toast("Licence révoquée."); await charger();
      }
    } catch (e) { toast(e.message, true); }
  }));
}

function ouvrirEnvoi(titre, p, base) {
  envoi = base;
  $("dlgTitle").textContent = titre; $("dlgTo").value = p.to; $("dlgSubject").value = p.subject; $("dlgText").value = p.text;
  $("dlgWarn").innerHTML = base.action === "accepter" ? '<div class="warn">Relisez le message : il contient la clé de licence. Il part depuis support@orascore.io.</div>' : "";
  $("dlg").showModal();
}
$("dlgCancel").onclick = () => $("dlg").close();
$("dlgSend").onclick = async () => {
  const btn = $("dlgSend"); btn.disabled = true;
  try {
    await api("/api/admin/action", { ...envoi, subject: $("dlgSubject").value, text: $("dlgText").value });
    $("dlg").close(); toast(envoi.action === "accepter" ? "Licence attribuée et e-mail envoyé." : "E-mail de refus envoyé.");
    await charger();
  } catch (e) { toast(e.message, true); } finally { btn.disabled = false; }
};

demarrer().catch((e) => { document.body.insertAdjacentHTML("beforeend", `<p class="err" style="padding:20px">Erreur : ${esc(e.message)}</p>`); });

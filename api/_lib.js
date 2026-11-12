// Outils communs aux fonctions d'administration (fichier « _ » : pas une route publique).
// Base Supabase par l'API REST avec la clé secrète (côté serveur seulement), e-mails par Brevo,
// contrôle de l'administrateur par son jeton de connexion Supabase (lien reçu par e-mail).

const SUPPORT = "support@orascore.io";

function env(name) {
  const v = process.env[name];
  if (!v) throw new Error(`configuration manquante : ${name}`);
  return v;
}

function base() {
  return env("SUPABASE_URL").replace(/\/$/, "");
}

function dbHeaders() {
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  // clé « sb_secret_… » : en-tête apikey seul ; ancienne clé JWT « eyJ… » : aussi en Bearer
  return { apikey: key, "content-type": "application/json",
           ...(key.startsWith("eyJ") ? { Authorization: `Bearer ${key}` } : {}) };
}

async function db(path, { method = "GET", body, prefer } = {}) {
  const r = await fetch(`${base()}/rest/v1/${path}`, {
    method, headers: { ...dbHeaders(), ...(prefer ? { Prefer: prefer } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`base ${r.status} : ${(await r.text()).slice(0, 200)}`);
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

// L'administrateur : jeton de session Supabase valide ET adresse = ADMIN_EMAIL
async function adminEmail(req) {
  const h = String(req.headers.authorization || "");
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!token) return null;
  const r = await fetch(`${base()}/auth/v1/user`, {
    headers: { apikey: env("SUPABASE_ANON_KEY"), Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return null;
  const u = await r.json();
  const ok = String(u.email || "").toLowerCase() === env("ADMIN_EMAIL").trim().toLowerCase();
  return ok ? u.email : null;
}

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Marque OraScore comme sur le site : « Ora » foncé, « Score » bleu (version HTML des e-mails)
const MARQUE = '<span style="font-weight:700;color:#0f172a">Ora</span><span style="font-weight:700;color:#0891b2">Score</span>';

// Texte brut -> HTML simple (paragraphes, lignes, liens cliquables, marque OraScore mise en forme)
function texteVersHtml(texte) {
  return String(texte).split(/\n{2,}/).map((p) =>
    "<p>" + esc(p).replace(/\n/g, "<br>")
      .replace(/(?<!\w)OraScore(?!\w|\.\w)/g, MARQUE)   // mot seul : pas dans 1_DEMARRER_OraScore.bat
      .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>') + "</p>").join("\n");
}

async function sendMail({ to, subject, text, replyTo = SUPPORT, senderName = "OraScore" }) {
  const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": env("BREVO_API_KEY"), "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ sender: { name: senderName, email: SUPPORT }, to: [{ email: to }],
                           replyTo: { email: replyTo }, subject, textContent: text,
                           htmlContent: texteVersHtml(text) }),
  });
  if (!r.ok) throw new Error(`Brevo ${r.status}`);
}

// Clés Early Adopter : variable secrète EA_KEYS = {"1": "EA…", …} (jamais en base ni dans le code)
function cleLicence(numero) {
  const cles = JSON.parse(env("EA_KEYS"));
  const k = cles[String(numero)];
  if (!k) throw new Error(`clé de la licence n°${numero} absente de EA_KEYS`);
  return k;
}

function titulaire(c) {
  return c.societe || `${c.prenom || ""} ${c.nom || ""}`.trim() || c.email;
}

// ── Modèles d'e-mails (relus et modifiables dans la page avant l'envoi) ──────
const SIGNATURE = "L'équipe OraScore\nsupport@orascore.io — https://orascore.io";

function modeleAcceptation(c, numero) {
  return {
    subject: "OraScore — votre licence Early Adopter",
    text: `Bonjour ${c.prenom || ""},

Merci de rejoindre le programme Early Adopter d'OraScore ! Voici tout ce qu'il vous faut pour démarrer.

1. Télécharger OraScore
Lien : ${env("DRIVE_URL")}
Le fichier fait environ 120 Mo. Google affiche « Impossible d'analyser ce fichier pour détecter des virus » : c'est normal pour un fichier de cette taille, cliquez sur « Télécharger quand même ».

2. Votre licence (offre Équipe, jusqu'à 25 bases, à vie)
Titulaire : ${titulaire(c)}
Clé : ${cleLicence(numero)}

3. Installer
- Windows : décompressez le ZIP, puis double-cliquez sur 1_DEMARRER_OraScore.bat. Laissez l'assistant vous guider : licence, déclaration de vos bases, test de connexion, première analyse, planification. Aucune installation ni droit d'administrateur nécessaire.
- Linux : décompressez le ZIP sur le serveur, puis lancez : bash linux/install_linux.sh
Le guide d'installation (PDF) et le fichier LISEZ-MOI.txt sont dans le ZIP.

4. Ce que je vous demande en échange
- tester OraScore sur au moins une de vos bases Oracle en exploitation ;
- me faire un retour : bugs rencontrés, résultats qui vous semblent faux, suggestions ;
- un court témoignage si vous êtes satisfait.
Répondez simplement à cet e-mail : je lis tout et je réponds personnellement.

Bonne analyse,

${SIGNATURE}`,
  };
}

const MOTIFS_REFUS = {
  profil: "nous avons déjà assez de testeurs pour un environnement comme le vôtre",
  complet: "toutes les licences du programme sont désormais attribuées",
  autre: "votre profil ne correspond pas aux environnements que nous cherchons à tester en ce moment",
};

function modeleRefus(c, motif) {
  return {
    subject: "OraScore — votre demande Early Adopter",
    text: `Bonjour ${c.prenom || ""},

Merci beaucoup pour votre intérêt pour OraScore et pour votre demande de participation au programme Early Adopter.

Pour garantir des tests sur des environnements très variés, le nombre de licences est limité, et ${MOTIFS_REFUS[motif] || MOTIFS_REFUS.autre}. Je ne peux donc pas vous proposer de licence pour le moment.

Je garde vos coordonnées pour vous prévenir dès l'ouverture des ventes, si vous le souhaitez : il suffit de répondre « oui » à cet e-mail.

Merci encore,

${SIGNATURE}`,
  };
}

function modeleRelance(c, rang) {
  if (rang === 1) {
    return {
      subject: "OraScore — l'installation s'est-elle bien passée ?",
      text: `Bonjour ${c.prenom || ""},

Juste un mot pour savoir si l'installation d'OraScore s'est bien passée et si vous avez pu lancer une première analyse.

Si quelque chose a bloqué (connexion, droits du compte, message incompréhensible), dites-le-moi simplement en réponse : c'est exactement ce que je cherche à corriger.

Merci encore pour votre participation,

${SIGNATURE}`,
    };
  }
  return {
    subject: "OraScore — votre avis après deux semaines",
    text: `Bonjour ${c.prenom || ""},

Vous utilisez OraScore depuis deux semaines : votre avis m'intéresse beaucoup.

1. Un résultat vous a-t-il paru faux ou exagéré (un OK qui aurait dû être une alerte, ou l'inverse) ?
2. Un message ou un conseil était-il peu clair ?
3. Qu'est-ce qui vous manque le plus ?
4. Si vous êtes satisfait, accepteriez-vous que je cite une phrase de votre retour sur le site (avec votre prénom et votre fonction, ou de façon anonyme, comme vous préférez) ?

Merci pour votre aide,

${SIGNATURE}`,
  };
}

async function journal(candidature_id, evenement, details) {
  await db("historique", { method: "POST", body: { candidature_id, evenement, details } });
}

function lireCorps(req) {
  return typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
}

module.exports = { MARQUE, texteVersHtml, SUPPORT, env, db, adminEmail, esc, sendMail, cleLicence, titulaire, journal, lireCorps,
                   modeleAcceptation, modeleRefus, modeleRelance, MOTIFS_REFUS };

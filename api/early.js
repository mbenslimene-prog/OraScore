// Inscription au programme Early Adopter (fonction Vercel, Node 18+ : fetch intégré).
// Envoie deux e-mails par l'API transactionnelle de Brevo (domaine orascore.io authentifié DKIM) :
//   1. la demande, à support@orascore.io (réponse directe au visiteur grâce à replyTo) ;
//   2. un accusé de réception au visiteur.
// La clé n'est jamais dans le code : variable d'environnement BREVO_API_KEY, réglée dans Vercel.

const SUPPORT = "support@orascore.io";
const EMAIL_RE = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/;

// Profil du candidat : valeurs des listes du formulaire seulement (sert à varier les environnements)
const CHOIX = {
  type: ["Instance unique", "RAC", "Data Guard", "RAC + Data Guard"],
  os: ["Linux", "AIX", "Windows", "Solaris", "Autre"],
  version: ["12.2", "18c", "19c", "21c", "23ai / 26ai", "Plusieurs versions"],
};
const choix = (champ, v) => (CHOIX[champ].includes(String(v)) ? String(v) : "non précisé");

const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function sendMail(apiKey, payload) {
  const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": apiKey, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error(`Brevo ${r.status}`);
}

async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false });
  }
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return res.status(500).json({ ok: false, error: "configuration" });

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  const email = String(body.email || "").trim().slice(0, 200);
  const env = String(body.env || "").trim().slice(0, 200);
  const profil = { type: choix("type", body.type), os: choix("os", body.os), version: choix("version", body.version) };
  const resume = `${profil.type} · ${profil.os} · Oracle ${profil.version}`;
  // Champ piège rempli : un robot. On répond « ok » sans rien envoyer.
  if (body.site) return res.status(200).json({ ok: true });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ ok: false, error: "email" });

  try {
    await sendMail(apiKey, {
      sender: { name: "Site OraScore", email: SUPPORT },
      to: [{ email: SUPPORT }],
      replyTo: { email },
      subject: `Early Adopter : ${email} — ${resume}`,
      textContent: `Nouvelle demande Early Adopter.
E-mail : ${email}
Type de base : ${profil.type}
OS du serveur : ${profil.os}
Version Oracle : ${profil.version}
Précisions : ${env || "aucune"}

Répondre à ce message répond directement au demandeur.`,
      htmlContent: `<p>Nouvelle demande Early Adopter.</p>
        <p><b>E-mail :</b> ${esc(email)}<br><b>Type de base :</b> ${esc(profil.type)}<br>
        <b>OS du serveur :</b> ${esc(profil.os)}<br><b>Version Oracle :</b> ${esc(profil.version)}<br>
        <b>Précisions :</b> ${esc(env || "aucune")}</p>
        <p>Répondre à ce message répond directement au demandeur.</p>`,
    });
    await sendMail(apiKey, {
      sender: { name: "OraScore", email: SUPPORT },
      to: [{ email }],
      replyTo: { email: SUPPORT },
      subject: "OraScore : votre demande Early Adopter est bien reçue",
      // version texte en plus du HTML : un message HTML seul est mal noté par les filtres (Yahoo)
      textContent: `Bonjour,

Merci pour votre intérêt pour OraScore. Votre demande de licence Early Adopter est bien reçue : vous recevrez sous 24 h le lien de téléchargement et les instructions.

Pour toute question, répondez simplement à cet e-mail.

L'équipe OraScore — https://orascore.io`,
      htmlContent: `<p>Bonjour,</p>
        <p>Merci pour votre intérêt pour OraScore. Votre demande de licence Early Adopter est bien reçue :
        vous recevrez sous 24 h le lien de téléchargement et les instructions.</p>
        <p>Pour toute question, répondez simplement à cet e-mail.</p>
        <p>L'équipe OraScore — <a href="https://orascore.io">orascore.io</a></p>`,
    });
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("early:", e.message);           // jamais la clé ni le contenu
    return res.status(502).json({ ok: false, error: "envoi" });
  }
}

module.exports = handler;

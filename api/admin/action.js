// Page d'administration : actions sur une candidature ou une licence.
// Les envois d'e-mails se font en deux temps : « apercu_… » renvoie le texte (modifiable dans la
// page), puis « accepter » / « refuser » envoie le texte relu par l'administrateur.
const L = require("../_lib.js");

const STATUTS = ["nouvelle", "en attente", "acceptée", "refusée", "abandon"];
const EVENEMENTS = ["retour", "correction", "témoignage", "autre"];

async function candidature(id) {
  const [c] = await L.db(`candidatures?id=eq.${Number(id)}&select=*`);
  if (!c) throw new Error("candidature introuvable");
  return c;
}

async function licenceLibre(numero) {
  const filtre = numero ? `numero=eq.${Number(numero)}&` : "reserve=eq.false&";
  const [l] = await L.db(`licences?${filtre}statut=eq.libre&select=*&order=numero.asc&limit=1`);
  return l || null;
}

async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false });
  try {
    if (!(await L.adminEmail(req))) return res.status(401).json({ ok: false, error: "non autorisé" });
    const b = L.lireCorps(req);
    const a = b.action;

    if (a === "apercu_acceptation") {
      const c = await candidature(b.id);
      const l = await licenceLibre(b.numero);
      if (!l) return res.status(409).json({ ok: false, error: b.numero ? "cette licence n'est pas libre"
                                                                    : "plus de licence libre hors réserve (choisissez 11 ou 12)" });
      return res.status(200).json({ ok: true, numero: l.numero, to: c.email, ...L.modeleAcceptation(c, l.numero) });
    }

    if (a === "accepter") {
      const c = await candidature(b.id);
      const l = await licenceLibre(b.numero);
      if (!l || l.numero !== Number(b.numero)) return res.status(409).json({ ok: false, error: "cette licence n'est plus libre" });
      if (!String(b.text || "").includes(L.cleLicence(l.numero))) {
        return res.status(400).json({ ok: false, error: "le texte ne contient plus la clé de la licence : envoi annulé" });
      }
      await L.sendMail({ to: c.email, subject: String(b.subject).slice(0, 200), text: String(b.text) });
      const today = new Date().toISOString().slice(0, 10);
      await L.db(`licences?numero=eq.${l.numero}`, { method: "PATCH",
        body: { statut: "attribuée", candidature_id: c.id, titulaire: L.titulaire(c), date_attribution: today } });
      await L.db(`candidatures?id=eq.${c.id}`, { method: "PATCH", body: { statut: "acceptée" } });
      await L.journal(c.id, "acceptation", `Licence n°${l.numero}`);
      await L.journal(c.id, "envoi", `Lien et clé de la licence n°${l.numero} envoyés à ${c.email}`);
      return res.status(200).json({ ok: true });
    }

    if (a === "apercu_refus") {
      const c = await candidature(b.id);
      return res.status(200).json({ ok: true, to: c.email, ...L.modeleRefus(c, b.motif) });
    }

    if (a === "refuser") {
      const c = await candidature(b.id);
      await L.sendMail({ to: c.email, subject: String(b.subject).slice(0, 200), text: String(b.text) });
      await L.db(`candidatures?id=eq.${c.id}`, { method: "PATCH", body: { statut: "refusée" } });
      await L.journal(c.id, "refus", `E-mail de refus envoyé (${b.motif || "autre"})`);
      return res.status(200).json({ ok: true });
    }

    if (a === "statut") {
      if (!["nouvelle", "en attente", "abandon"].includes(b.statut)) return res.status(400).json({ ok: false, error: "statut" });
      const c = await candidature(b.id);
      await L.db(`candidatures?id=eq.${c.id}`, { method: "PATCH", body: { statut: b.statut } });
      await L.journal(c.id, "autre", `Statut : ${b.statut}`);
      return res.status(200).json({ ok: true });
    }

    if (a === "note") {
      const c = await candidature(b.id);
      const texte = String(b.texte || "").trim().slice(0, 1000);
      if (!texte) return res.status(400).json({ ok: false, error: "note vide" });
      const date = new Date().toLocaleDateString("fr-FR");
      await L.db(`candidatures?id=eq.${c.id}`, { method: "PATCH",
        body: { notes: [c.notes, `${date} : ${texte}`].filter(Boolean).join("\n") } });
      await L.journal(c.id, "autre", `Note : ${texte}`);
      return res.status(200).json({ ok: true });
    }

    if (a === "evenement") {
      if (!EVENEMENTS.includes(b.evenement)) return res.status(400).json({ ok: false, error: "événement" });
      const c = await candidature(b.id);
      await L.journal(c.id, b.evenement, String(b.details || "").slice(0, 1000) || null);
      return res.status(200).json({ ok: true });
    }

    if (a === "liberer") {
      // Annule une attribution (essai ou erreur) : licence de nouveau libre, demande de nouveau à traiter.
      // La clé déjà envoyée reste reconnue par OraScore (vérification hors ligne) : à réserver aux essais.
      const [l] = await L.db(`licences?numero=eq.${Number(b.numero)}&select=*`);
      if (!l || l.statut !== "attribuée") return res.status(409).json({ ok: false, error: "licence non attribuée" });
      await L.db(`licences?numero=eq.${l.numero}`, { method: "PATCH",
        body: { statut: "libre", candidature_id: null, titulaire: null, date_attribution: null } });
      if (l.candidature_id) {
        await L.db(`candidatures?id=eq.${l.candidature_id}`, { method: "PATCH", body: { statut: "nouvelle" } });
        await L.journal(l.candidature_id, "autre", `Licence n°${l.numero} libérée (attribution annulée)`);
      }
      return res.status(200).json({ ok: true });
    }

    if (a === "revoquer") {
      const [l] = await L.db(`licences?numero=eq.${Number(b.numero)}&select=*`);
      if (!l || l.statut !== "attribuée") return res.status(409).json({ ok: false, error: "licence non attribuée" });
      await L.db(`licences?numero=eq.${l.numero}`, { method: "PATCH", body: { statut: "révoquée" } });
      if (l.candidature_id) await L.journal(l.candidature_id, "autre", `Licence n°${l.numero} révoquée`);
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ ok: false, error: "action inconnue" });
  } catch (e) {
    console.error("admin action:", e.message);
    return res.status(500).json({ ok: false, error: e.message.startsWith("configuration") || e.message.startsWith("clé")
                                                    || e.message.startsWith("candidature") ? e.message : "erreur serveur" });
  }
}

module.exports = handler;
module.exports.STATUTS = STATUTS;

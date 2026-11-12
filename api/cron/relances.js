// Relances automatiques des Early Adopters (tâche planifiée Vercel, une fois par jour) :
//   relance 1 : 4 jours après l'envoi de la licence ; relance 2 : 14 jours après.
// Aucune relance si un « retour » ou un « témoignage » a été noté pour la personne.
// Appel réservé à Vercel : en-tête Authorization: Bearer <CRON_SECRET>.
const L = require("../_lib.js");

const JOUR = 24 * 3600 * 1000;

async function handler(req, res) {
  if (String(req.headers.authorization || "") !== `Bearer ${process.env.CRON_SECRET || "∅"}`) {
    return res.status(401).json({ ok: false });
  }
  const bilan = [];
  try {
    const acceptees = await L.db("candidatures?statut=eq.acceptée&select=*");
    for (const c of acceptees) {
      const evts = await L.db(`historique?candidature_id=eq.${c.id}&select=evenement,details,created_at&order=created_at.asc`);
      const envoi = evts.find((e) => e.evenement === "envoi");
      if (!envoi || evts.some((e) => e.evenement === "retour" || e.evenement === "témoignage")) continue;
      const deja = evts.filter((e) => e.evenement === "relance").length;
      const age = (Date.now() - new Date(envoi.created_at).getTime()) / JOUR;
      const rang = deja === 0 && age >= 4 ? 1 : deja === 1 && age >= 14 ? 2 : 0;
      if (!rang) continue;
      await L.sendMail({ to: c.email, ...L.modeleRelance(c, rang) });
      await L.journal(c.id, "relance", `Relance ${rang} envoyée automatiquement`);
      bilan.push(`${c.id}:${rang}`);
    }
    return res.status(200).json({ ok: true, relances: bilan });
  } catch (e) {
    console.error("relances:", e.message);
    return res.status(500).json({ ok: false, relances: bilan });
  }
}

module.exports = handler;

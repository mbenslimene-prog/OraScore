// Page d'administration : lecture des candidatures, licences, historique et couverture des profils
const { db, adminEmail, env } = require("../_lib.js");

async function handler(req, res) {
  try {
    // Réglages publics pour la page de connexion (adresse du projet et clé publique)
    if (req.query && req.query.config !== undefined) {
      return res.status(200).json({ supabaseUrl: env("SUPABASE_URL"), anonKey: env("SUPABASE_ANON_KEY") });
    }
    if (!(await adminEmail(req))) return res.status(401).json({ ok: false, error: "non autorisé" });
    const [candidatures, licences, historique, couverture] = await Promise.all([
      db("candidatures?select=*&order=id.desc"),
      db("licences?select=*&order=numero.asc"),
      db("historique?select=*&order=created_at.asc"),
      db("couverture_profils?select=*"),
    ]);
    return res.status(200).json({ ok: true, candidatures, licences, historique, couverture,
                                  driveConfigure: Boolean(process.env.DRIVE_URL),
                                  clesConfigurees: Boolean(process.env.EA_KEYS) });
  } catch (e) {
    console.error("admin data:", e.message);
    return res.status(500).json({ ok: false, error: e.message.startsWith("configuration") ? e.message : "erreur serveur" });
  }
}

module.exports = handler;

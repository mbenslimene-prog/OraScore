// Inscription Early Adopter : envoyée par le site lui-même (fonction /api/early, e-mail via Brevo),
// sans dépendre du logiciel de messagerie du visiteur
async function submitEarly(ev) {
  ev.preventDefault();
  const email = document.getElementById('early-email').value.trim();
  const prenom = document.getElementById('early-prenom').value.trim();
  const nom = document.getElementById('early-nom').value.trim();
  const tel = document.getElementById('early-tel').value.trim();
  const societe = document.getElementById('early-societe').value.trim();
  const env = document.getElementById('early-env').value.trim();
  const type = document.getElementById('early-type').value;
  const os = document.getElementById('early-os').value;
  const version = document.getElementById('early-version').value;
  const site = document.getElementById('early-site').value;
  const msg = document.getElementById('early-msg');
  const btn = document.getElementById('early-btn');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    msg.textContent = '⚠ Veuillez entrer une adresse email valide.';
    msg.style.color = '#f59e0b';
    return false;
  }
  if (!prenom || !nom) {
    msg.textContent = '⚠ Indiquez votre prénom et votre nom.';
    msg.style.color = '#f59e0b';
    return false;
  }
  if (tel && !/^[+0-9][0-9 .()\-]{5,24}$/.test(tel)) {   // facultatif ; vérifié s'il est saisi
    msg.textContent = '⚠ Indiquez un numéro de téléphone valide (ex. 06 12 34 56 78 ou +33 6 12 34 56 78).';
    msg.style.color = '#f59e0b';
    return false;
  }
  if (!type || !os || !version) {
    msg.textContent = "⚠ Indiquez le type de base, l'OS et la version Oracle : ils servent à varier les environnements testés.";
    msg.style.color = '#f59e0b';
    return false;
  }
  btn.disabled = true;
  msg.textContent = 'Envoi en cours…';
  msg.style.color = '';
  try {
    const r = await fetch('/api/early', {method: 'POST', headers: {'Content-Type': 'application/json'},
                                         body: JSON.stringify({prenom, nom, email, tel, societe, env, type, os, version, site})});
    if (r.status === 429) {
      msg.innerHTML = "⚠ Une demande a déjà été envoyée récemment avec cette adresse ou depuis cette connexion : nous vous répondons sous 24h. Pour corriger une information, écrivez à <a href=\"mailto:support@orascore.io\">support@orascore.io</a>.";
      msg.style.color = '#f59e0b';
      return false;
    }
    if (!r.ok) throw new Error(r.status);
    const rep = await r.json().catch(() => ({}));
    msg.textContent = rep.accuse === false
      ? '✓ Demande reçue ; réponse sous 24h.'
      : '✓ Demande reçue. Un e-mail de confirmation vient de vous être envoyé (pensez aux indésirables) ; réponse sous 24h.';
    msg.style.color = '#86efac';
    document.getElementById('early-form').reset();
  } catch (e) {
    msg.innerHTML = "⚠ L'envoi a échoué. Écrivez-nous directement à <a href=\"mailto:support@orascore.io\">support@orascore.io</a>.";
    msg.style.color = '#f59e0b';
  } finally {
    btn.disabled = false;
  }
  return false;
}

document.getElementById('early-form').addEventListener('submit', submitEarly);

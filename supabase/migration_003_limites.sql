-- OraScore — limites d'envoi du formulaire Early Adopter (16/11/2026)
-- À exécuter une fois dans Supabase : projet « orascore » → SQL Editor → coller → Run.
-- Chaque envoi du formulaire laisse une empreinte (HMAC-SHA256) de l'adresse de connexion,
-- jamais l'adresse elle-même ; les lignes de plus de 2 jours sont effacées automatiquement.
create table if not exists public.envois (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  ip_hash    text not null
);
create index if not exists envois_ip_date on public.envois (ip_hash, created_at);
create index if not exists candidatures_email_date on public.candidatures (email, created_at);

alter table public.envois enable row level security;
revoke all on public.envois from anon, authenticated;
grant select, insert, delete on public.envois to service_role;
grant usage, select on all sequences in schema public to service_role;

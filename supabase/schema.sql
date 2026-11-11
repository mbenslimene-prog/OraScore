-- OraScore — base de gestion des Early Adopters (puis des clients)
-- À exécuter une fois dans Supabase : projet « orascore » → SQL Editor → coller → Run.
-- Base fermée au public (RLS sans aucune règle) : seule la fonction du site, côté serveur,
-- y écrit avec la clé service_role rangée dans Vercel. Les clés de licence n'y sont JAMAIS :
-- seul leur numéro (1 à 12) ; les clés restent dans le fichier privé de l'éditeur.

-- Candidatures : une ligne par demande envoyée depuis orascore.io
create table if not exists public.candidatures (
    id           bigint generated always as identity primary key,
    created_at   timestamptz not null default now(),
    email        text not null,
    type_base    text,                      -- Instance unique, RAC, Data Guard, RAC + Data Guard
    os           text,                      -- Linux, AIX, Windows, Solaris, Autre
    version      text,                      -- 12.2 … 23ai / 26ai, Plusieurs versions
    precisions   text,                      -- texte libre (Exadata, cloud, nombre de bases…)
    statut       text not null default 'nouvelle'
                 check (statut in ('nouvelle', 'en attente', 'acceptée', 'refusée', 'abandon')),
    notes        text,
    source       text not null default 'site'
);
create index if not exists candidatures_email_idx on public.candidatures (lower(email));

-- Licences Early Adopter : 1 à 10 annoncées, 11 et 12 en réserve
create table if not exists public.licences (
    numero            int primary key check (numero between 1 and 99),
    offre             text not null default 'early_adopter',
    reserve           boolean not null default false,
    statut            text not null default 'libre'
                      check (statut in ('libre', 'attribuée', 'révoquée')),
    candidature_id    bigint references public.candidatures (id),
    titulaire         text,                 -- nom affiché dans les rapports OraScore
    date_attribution  date,
    notes             text
);
insert into public.licences (numero, reserve)
select n, n > 10 from generate_series(1, 12) as n
on conflict (numero) do nothing;

-- Historique de chaque client : demande, acceptation, envoi, relances, retours, corrections
create table if not exists public.historique (
    id              bigint generated always as identity primary key,
    created_at      timestamptz not null default now(),
    candidature_id  bigint references public.candidatures (id) on delete cascade,
    evenement       text not null
                    check (evenement in ('demande', 'acceptation', 'refus', 'envoi', 'relance',
                                         'retour', 'correction', 'témoignage', 'autre')),
    details         text
);
create index if not exists historique_candidature_idx on public.historique (candidature_id, created_at);

-- Vue de suivi : couverture des profils (pour respecter « 2 licences maximum par profil »)
create or replace view public.couverture_profils as
select c.type_base, c.os, c.version,
       count(*)                                        as candidatures,
       count(*) filter (where c.statut = 'acceptée')   as acceptees
from public.candidatures c
group by c.type_base, c.os, c.version
order by acceptees desc, candidatures desc;

-- Fermé au public : aucune règle RLS = aucun accès sans la clé service_role
alter table public.candidatures enable row level security;
alter table public.licences     enable row level security;
alter table public.historique   enable row level security;
-- La vue lit les tables avec les droits de l'appelant (pas de fuite par la vue)
alter view public.couverture_profils set (security_invoker = true);

-- Droits explicites (projet créé avec « Automatically expose new tables » DÉCOCHÉ) :
-- seul le rôle service_role (clé secrète de la fonction du site) lit et écrit ;
-- anon et authenticated (clés publiques) n'ont aucun accès.
revoke all on public.candidatures, public.licences, public.historique, public.couverture_profils
    from anon, authenticated;
grant usage on schema public to service_role;
grant select, insert, update, delete on public.candidatures, public.licences, public.historique
    to service_role;
grant select on public.couverture_profils to service_role;
grant usage, select on all sequences in schema public to service_role;

-- OraScore — ajout des coordonnées des candidats (12/11/2026)
-- À exécuter une fois dans Supabase : projet « orascore » → SQL Editor → coller → Run.
alter table public.candidatures add column if not exists prenom    text;
alter table public.candidatures add column if not exists nom       text;
alter table public.candidatures add column if not exists telephone text;
alter table public.candidatures add column if not exists societe   text;

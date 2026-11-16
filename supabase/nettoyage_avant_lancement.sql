-- OraScore — remise à zéro des essais avant le lancement (16/11/2026)
-- À exécuter UNE fois dans Supabase : projet « orascore » → SQL Editor → coller → Run.
-- EFFACE DÉFINITIVEMENT toutes les candidatures, leur historique et les empreintes de connexion.
-- Les 12 licences sont conservées et remises « libres » ; la prochaine demande portera le n°1.
begin;

update public.licences
   set statut = 'libre', candidature_id = null, titulaire = null, date_attribution = null, notes = null;

delete from public.historique;
delete from public.envois;
delete from public.candidatures;

alter table public.candidatures alter column id restart with 1;
alter table public.historique   alter column id restart with 1;
alter table public.envois       alter column id restart with 1;

commit;

-- Contrôle : 0 candidature, 0 historique, 0 envoi, 12 licences libres
select (select count(*) from public.candidatures) as candidatures,
       (select count(*) from public.historique)   as historique,
       (select count(*) from public.envois)       as envois,
       (select count(*) from public.licences where statut = 'libre') as licences_libres;

-- Familien-Carsharing: Profilfarben, die auch farbenblinde Menschen unterscheiden
-- Im Supabase-Dashboard unter SQL Editor ausfuehren (nach 0007).
--
-- Die alte Farbliste hatte zwei fast gleiche Farben (Ocker #a16207 und
-- Braunorange #b45309), dazu Paare, die bei Rot-Gruen-Schwaeche verschwimmen.
-- Die neue Liste hat sechs Farben, die sich paarweise auch bei Rot-Gruen-
-- Schwaeche unterscheiden lassen (geprueft mit dem Paletten-Validator):
--
--   #2a78d6 Blau    #d95926 Orange   #199e70 Tuerkis
--   #eda100 Gelb    #e87ba4 Rosa     #4a3aa7 Violett
--
-- Jede Person bekommt die neue Farbe, die ihrer alten am naechsten ist. Haetten
-- dabei zwei aktive Personen dieselbe Farbe, bekommt die spaeter angelegte die
-- erste noch freie. Die Farbe laesst sich danach unter "Mehr" wie gewohnt
-- aendern. Das Skript kann gefahrlos mehrmals laufen.

drop table if exists profile_colors;
create temporary table profile_colors as
select id,
       active,
       created_at,
       case lower(color)
         when '#1d4ed8' then '#2a78d6'
         when '#b45309' then '#d95926'
         when '#0f766e' then '#199e70'
         when '#15803d' then '#199e70'
         when '#a16207' then '#eda100'
         when '#be123c' then '#e87ba4'
         when '#7c3aed' then '#4a3aa7'
         when '#2a78d6' then '#2a78d6'
         when '#d95926' then '#d95926'
         when '#199e70' then '#199e70'
         when '#eda100' then '#eda100'
         when '#e87ba4' then '#e87ba4'
         when '#4a3aa7' then '#4a3aa7'
       end as wanted
from public.profiles;

do $$
declare
  palette text[] := array['#2a78d6', '#d95926', '#199e70', '#eda100', '#e87ba4', '#4a3aa7'];
  taken text[] := '{}';
  pending uuid[] := '{}';
  person record;
  free text;
begin
  -- 1. Wer als Erster eine Farbe hatte, behaelt ihre neue Entsprechung.
  for person in
    select id, wanted from profile_colors where active order by created_at, id
  loop
    if person.wanted is not null and person.wanted <> all (taken) then
      update public.profiles set color = person.wanted where id = person.id;
      taken := taken || person.wanted;
    else
      pending := pending || person.id;
    end if;
  end loop;

  -- 2. Die uebrigen bekommen die erste noch freie Farbe. Sind alle sechs
  --    vergeben, bleibt es bei der naechsten Entsprechung.
  for person in
    select id, wanted from profile_colors
    where id = any (pending) order by created_at, id
  loop
    select c into free from unnest(palette) with ordinality as p (c, n)
    where c <> all (taken) order by n limit 1;
    update public.profiles set color = coalesce(free, person.wanted, palette[1])
    where id = person.id;
    if free is not null then
      taken := taken || free;
    end if;
  end loop;

  -- 3. Ehemalige Mitglieder: nur die naechste Entsprechung, ohne Abgleich.
  update public.profiles p set color = coalesce(pc.wanted, palette[1])
  from profile_colors pc where pc.id = p.id and not pc.active;
end $$;

drop table profile_colors;

-- Neue Familienmitglieder starten mit Blau.
alter table public.profiles alter column color set default '#2a78d6';

-- Kontrolle: jede Zeile sollte "ok" zeigen.
select display_name,
       color,
       case when color in ('#2a78d6', '#d95926', '#199e70', '#eda100', '#e87ba4', '#4a3aa7')
            then 'ok' else 'FEHLER: alte Farbe' end as pruefung
from public.profiles
order by active desc, created_at;

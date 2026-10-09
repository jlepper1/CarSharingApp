-- Familien-Carsharing: eigenes Profil nur eingeschraenkt aenderbar
-- Im Supabase-Dashboard unter SQL Editor ausfuehren (nach 0004).
--
-- Bisher durfte jede Person ihre ganze Profilzeile aendern, also auch "active".
-- Wer deaktiviert wurde, konnte sich so ueber die API selbst wieder freischalten.
-- Ab jetzt darf man am eigenen Profil nur Name und Farbe aendern, und nur als
-- aktives Familienmitglied. "active" setzt nur noch das Dashboard.

revoke update on public.profiles from anon, authenticated;
grant update (display_name, color) on public.profiles to authenticated;

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (id = auth.uid() and public.is_family_member())
  with check (id = auth.uid() and public.is_family_member());

# Familien-Carsharing

Eine Web-App für die Familie: zwei Autos reservieren, Kilometer erfassen, Kosten
eintragen und fair abrechnen. Läuft auf iPhone und Android als App auf dem
Startbildschirm (PWA), ohne App Store.

## Was die App kann

- **Kalender** – wer hat wann welches Auto reserviert. Doppelbuchungen werden von
  der Datenbank verhindert, nicht nur im Browser.
- **Fahrten** – Kilometerstand vor und nach der Fahrt; die Strecke rechnet die App
  selbst aus. Vergessene Fahrten fallen als Lücke auf.
- **Kosten** – Tanken, KFZ-Versicherung, KFZ-Steuer, Reparaturen, Wartung, Reifen.
  Jahresbeiträge werden taggenau auf die Monate verteilt.
- **Abrechnung** – pro Person: gefahrene Kilometer, bezahlte Beträge, eigener
  Anteil, und ein Vorschlag, wer wem wie viel überweist.
- **Einstellungen** – die Verteilregel ist umschaltbar:
  | Regel | Bedeutung |
  | --- | --- |
  | Fixkosten gleich, Verbrauch nach km | Versicherung und Steuer gleichmäßig, Sprit und Reparaturen nach Kilometern *(Voreinstellung)* |
  | Alles nach Kilometern | Wer mehr fährt, zahlt mehr von allem |
  | Alles zu gleichen Teilen | Kilometer nur zur Information |

## Einrichtung

Einmalig, dauert etwa 15 Minuten.

### 1. Supabase-Projekt anlegen

1. Auf [supabase.com](https://supabase.com) kostenlos registrieren.
2. Neues Projekt anlegen (Region Frankfurt ist am nächsten).
3. Im Menü **SQL Editor** öffnen, den Inhalt von
   [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql)
   komplett einfügen und ausführen.

### 2. Selbstregistrierung abschalten

**Authentication → Sign In / Providers → Email**: den Schalter
*Allow new users to sign up* ausschalten. Sonst könnten Fremde Zugänge anlegen.

### 3. Fünf Zugänge anlegen

**Authentication → Users → Add user**, für jedes Familienmitglied einmal:

- E-Mail und Passwort eintragen
- *Auto Confirm User* aktivieren

Ein Profil wird automatisch angelegt. Den Anzeigenamen und die Farbe ändert jede
Person später selbst in der App unter **Mehr → Mein Profil**.

### 4. Schlüssel eintragen

In Supabase unter **Project Settings → API** stehen *Project URL* und der
*anon public* Schlüssel. Damit eine Datei `.env.local` im Projektordner anlegen:

```
VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```

Vorlage dafür ist `.env.example`. Der anon-Key ist öffentlich und darf im Browser
stehen – geschützt werden die Daten durch die Row-Level-Security-Regeln aus dem
SQL-Skript.

### 5. Autos anlegen

App starten, anmelden, unter **Mehr → Autos** beide Autos mit dem aktuellen
Kilometerstand eintragen. Ab diesem Stand wird gerechnet.

## Entwicklung

```bash
npm install
npm run dev      # Entwicklungsserver, auch im WLAN erreichbar
npm test         # Unit-Tests der Abrechnung
npm run build    # Produktions-Build
```

Der Entwicklungsserver ist im lokalen Netz erreichbar. Die Adresse
(`http://192.168.x.x:5173`) steht beim Start in der Konsole und lässt sich direkt
auf dem Handy öffnen.

## Veröffentlichen

Bei jedem Push auf `main` baut GitHub Actions die App und veröffentlicht sie auf
GitHub Pages. Vorher einmalig:

1. **Settings → Pages → Source**: *GitHub Actions* auswählen.
2. **Settings → Secrets and variables → Actions**: die beiden Secrets
   `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY` anlegen.

Die App liegt danach unter `https://<benutzername>.github.io/CarSharingApp/`.

## App aufs Handy holen

- **iPhone**: Seite in **Safari** öffnen (nicht Chrome), *Teilen* → *Zum
  Home-Bildschirm*.
- **Android**: in Chrome öffnen, Menü → *App installieren*.

## Technik

React + TypeScript + Vite, Tailwind CSS, Supabase (PostgreSQL) als Backend.

Der gesamte Datenzugriff läuft über die Schnittstelle
[`src/data/DataProvider.ts`](src/data/DataProvider.ts). Kein Bildschirm spricht
direkt mit Supabase. Ein Wechsel auf ein anderes Backend – etwa OneDrive – heißt
deshalb: eine neue Datei neben
[`src/data/supabase/SupabaseProvider.ts`](src/data/supabase/SupabaseProvider.ts)
schreiben, ohne die Oberfläche anzufassen.

Die Abrechnung in [`src/lib/settlement.ts`](src/lib/settlement.ts) rechnet
ausschließlich in ganzen Cent und verteilt Restcent nach dem Verfahren der
größten Reste, damit die Summe der Anteile exakt dem Gesamtbetrag entspricht.
Abgedeckt ist das durch die Tests in `src/lib/settlement.test.ts`.

### Was noch fehlt

Offline lassen sich Daten ansehen, aber nicht eintragen – dafür braucht es eine
Verbindung. Eine Warteschlange für Offline-Eingaben ist bewusst noch nicht gebaut.

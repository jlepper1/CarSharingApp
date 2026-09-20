/** Shown when the Supabase keys are missing, instead of a blank white page. */
export default function SetupScreen({ message }: { message: string }) {
  return (
    <div className="mx-auto max-w-lg px-4 py-12">
      <h1 className="mb-2 text-xl font-semibold text-slate-900">Einrichtung nötig</h1>
      <p className="mb-4 text-sm text-slate-600">{message}</p>
      <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">
        <li>Auf supabase.com ein kostenloses Projekt anlegen.</li>
        <li>
          In <code className="rounded bg-slate-200 px-1">supabase/migrations/0001_init.sql</code> das
          SQL kopieren und im SQL-Editor von Supabase ausführen.
        </li>
        <li>
          Datei <code className="rounded bg-slate-200 px-1">.env.local</code> anlegen (Vorlage:
          <code className="rounded bg-slate-200 px-1">.env.example</code>) und URL sowie Anon-Key
          eintragen.
        </li>
        <li>Entwicklungsserver neu starten.</li>
      </ol>
    </div>
  )
}

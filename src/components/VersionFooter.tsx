/** Which build is running, so a bug report can name the exact version. */
export default function VersionFooter() {
  return (
    <p className="mt-6 text-center text-xs text-slate-400">
      Version {__APP_VERSION__} · {__GIT_HASH__} · {__GIT_AUTHOR__} · entwickelt mit Claude AI
    </p>
  )
}

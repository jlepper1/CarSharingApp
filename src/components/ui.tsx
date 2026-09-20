import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'

/** Small shared building blocks, so the screens stay about behaviour. */

export function Screen({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-6">
      <header className="sticky top-0 z-10 -mx-4 mb-4 flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-100/90 px-4 py-3 backdrop-blur safe-top">
        <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
        {action}
      </header>
      {children}
    </div>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}>
      {children}
    </div>
  )
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
}

export function Button({ variant = 'primary', className = '', ...props }: ButtonProps) {
  const styles = {
    primary: 'bg-brand-700 text-white active:bg-brand-900 disabled:bg-slate-300',
    secondary: 'bg-white text-slate-800 border border-slate-300 active:bg-slate-100',
    danger: 'bg-red-600 text-white active:bg-red-700',
    ghost: 'text-brand-700 active:bg-brand-50',
  }[variant]

  return (
    <button
      {...props}
      className={`min-h-11 rounded-lg px-4 text-sm font-medium transition-colors disabled:opacity-60 ${styles} ${className}`}
    />
  )
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-slate-500">{hint}</span> : null}
    </label>
  )
}

const inputStyles =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100'

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputStyles} ${className}`} />
}

export function Select({ className = '', ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${inputStyles} ${className}`} />
}

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
      {message}
    </div>
  )
}

export function InfoBanner({ children }: { children: ReactNode }) {
  return (
    <div className="mb-3 rounded-lg border border-brand-100 bg-brand-50 px-3 py-2 text-sm text-brand-900">
      {children}
    </div>
  )
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white/60 px-4 py-10 text-center text-sm text-slate-500">
      {children}
    </div>
  )
}

export function Spinner({ label = 'Lädt …' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-brand-700" />
      {label}
    </div>
  )
}

export function PersonDot({ color, name }: { color: string; name: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <span>{name}</span>
    </span>
  )
}

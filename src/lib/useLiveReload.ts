import { useEffect, useRef } from 'react'
import { useApp } from '../context/AppContext'
import type { LiveTable } from '../data/DataProvider'

/**
 * Reload quietly when another family member changes one of the tables, so two
 * phones never show different numbers. Bursts of changes (a trip and its fuel
 * receipt saved together) trigger a single reload.
 */
export function useLiveReload(tables: LiveTable[], reload: () => void) {
  const { provider } = useApp()
  const reloadRef = useRef(reload)
  useEffect(() => {
    reloadRef.current = reload
  })

  const key = tables.join(',')
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const unsubscribe = provider.subscribe(key.split(',') as LiveTable[], () => {
      clearTimeout(timer)
      timer = setTimeout(() => reloadRef.current(), 500)
    })
    return () => {
      clearTimeout(timer)
      unsubscribe()
    }
  }, [provider, key])
}

import { useRef, useCallback } from 'react'

export function useAutoSave(saveFn, delay = 1500) {
  const timeoutRef = useRef(null)
  const savedRef = useRef(false)

  const triggerSave = useCallback((...args) => {
    savedRef.current = false
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    timeoutRef.current = setTimeout(async () => {
      await saveFn(...args)
      savedRef.current = true
      // Reset saved indicator after 2 seconds
      setTimeout(() => { savedRef.current = false }, 2000)
    }, delay)
  }, [saveFn, delay])

  const cancelSave = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
  }, [])

  return { triggerSave, cancelSave, saved: savedRef }
}

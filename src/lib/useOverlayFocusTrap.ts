import { useEffect, useRef } from 'react'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

function isFocusable(element: HTMLElement) {
  if (element.hasAttribute('disabled')) return false
  if (element.getAttribute('aria-hidden') === 'true') return false
  return element.getClientRects().length > 0
}

function getFocusableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(isFocusable)
}

type UseOverlayFocusTrapArgs = {
  active: boolean
  containerRef: React.RefObject<HTMLElement | null>
  onClose?: () => void
}

export function useOverlayFocusTrap({ active, containerRef, onClose }: UseOverlayFocusTrapArgs) {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!active) return

    const container = containerRef.current
    if (!container) return

    const previousActive = document.activeElement instanceof HTMLElement ? document.activeElement : null

    const focusInitialTarget = () => {
      const focusable = getFocusableElements(container)
      const initialTarget = focusable[0] ?? container
      initialTarget.focus()
    }

    const rafId = window.requestAnimationFrame(focusInitialTarget)
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && onCloseRef.current) {
        event.preventDefault()
        onCloseRef.current()
        return
      }

      if (event.key !== 'Tab') return

      const focusable = getFocusableElements(container)
      if (focusable.length === 0) {
        event.preventDefault()
        container.focus()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null

      if (!activeElement || !container.contains(activeElement)) {
        event.preventDefault()
        first.focus()
        return
      }

      if (event.shiftKey && activeElement === first) {
        event.preventDefault()
        last.focus()
        return
      }

      if (!event.shiftKey && activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      window.cancelAnimationFrame(rafId)
      document.removeEventListener('keydown', handleKeyDown)
      previousActive?.focus()
    }
  }, [active, containerRef])
}

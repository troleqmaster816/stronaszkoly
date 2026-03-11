import React, { useRef } from 'react'
import { useOverlayFocusTrap } from '@/lib/useOverlayFocusTrap'

type ModalProps = {
  children: React.ReactNode
  onClose?: () => void
  zIndexClassName?: string
  overlayClassName?: string
  panelClassName?: string
  centerClassName?: string
}

export function Modal({
  children,
  onClose,
  zIndexClassName = 'z-50',
  overlayClassName = 'bg-black/60',
  panelClassName = '',
  centerClassName = 'items-center justify-center',
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  useOverlayFocusTrap({ active: true, containerRef: panelRef, onClose })

  return (
    <div
      className={`fixed inset-0 ${zIndexClassName} overflow-y-auto p-3 sm:p-4`}
      onClick={onClose}
    >
      <div className={`absolute inset-0 ${overlayClassName}`} />
      <div className={`relative flex min-h-full w-full ${centerClassName}`}>
        <div
          ref={panelRef}
          className={`relative my-auto ${panelClassName}`}
          role="dialog"
          aria-modal="true"
          tabIndex={-1}
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      </div>
    </div>
  )
}

export default Modal

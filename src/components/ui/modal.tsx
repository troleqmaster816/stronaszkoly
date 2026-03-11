import React from 'react'

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
  return (
    <div
      className={`fixed inset-0 ${zIndexClassName} overflow-y-auto p-3 sm:p-4`}
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div className={`absolute inset-0 ${overlayClassName}`} />
      <div className={`relative flex min-h-full w-full ${centerClassName}`}>
        <div className={`relative my-auto ${panelClassName}`} onClick={(e) => e.stopPropagation()}>
          {children}
        </div>
      </div>
    </div>
  )
}

export default Modal

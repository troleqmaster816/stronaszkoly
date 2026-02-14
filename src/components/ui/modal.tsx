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
    <div className={`fixed inset-0 ${zIndexClassName} flex ${centerClassName}`} role="dialog" aria-modal="true">
      <div className={`absolute inset-0 ${overlayClassName}`} onClick={onClose} />
      <div className={`relative ${panelClassName}`}>{children}</div>
    </div>
  )
}

export default Modal

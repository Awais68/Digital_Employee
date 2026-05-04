import { useEffect, useCallback } from 'react'

export function useKeyboardShortcuts(handlers = {}) {
  const {
    onSearch,       // Ctrl+K or Cmd+K
    onApprove,      // Ctrl+Enter or Cmd+Enter
    onReject,       // Ctrl+Delete or Cmd+Delete
    onSave,         // Ctrl+S or Cmd+S
    onUndo,         // Ctrl+Z or Cmd+Z
    onClose,        // Escape
    onNewFile,      // Ctrl+N or Cmd+N
    onNavigate,     // Alt+1-9 for pages
  } = handlers

  const handleKeyDown = useCallback((e) => {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
    const ctrlOrCmd = isMac ? e.metaKey : e.ctrlKey

    // Ctrl+K - Focus search
    if (ctrlOrCmd && e.key === 'k') {
      e.preventDefault()
      onSearch?.()
    }

    // Ctrl+Enter - Approve
    if (ctrlOrCmd && e.key === 'Enter') {
      e.preventDefault()
      onApprove?.()
    }

    // Ctrl+Delete - Reject
    if (ctrlOrCmd && e.key === 'Delete') {
      e.preventDefault()
      onReject?.()
    }

    // Ctrl+S - Save
    if (ctrlOrCmd && e.key === 's') {
      e.preventDefault()
      onSave?.()
    }

    // Ctrl+Z - Undo (only if not in input/textarea)
    if (ctrlOrCmd && e.key === 'z' && !['INPUT', 'TEXTAREA'].includes(e.target.tagName)) {
      e.preventDefault()
      onUndo?.()
    }

    // Escape - Close modal/dialog
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose?.()
    }

    // Ctrl+N - New file
    if (ctrlOrCmd && e.key === 'n') {
      e.preventDefault()
      onNewFile?.()
    }

    // Alt+1-9 - Navigate pages
    if (e.altKey && e.key >= '1' && e.key <= '9') {
      e.preventDefault()
      const pages = ['dashboard', 'approvals', 'emails', 'whatsapp', 'todos', 'social', 'accounting', 'cloud', 'logs']
      const index = parseInt(e.key) - 1
      if (pages[index]) {
        onNavigate?.(pages[index])
      }
    }
  }, [onSearch, onApprove, onReject, onSave, onUndo, onClose, onNewFile, onNavigate])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])
}

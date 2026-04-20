import { useState, useEffect } from 'react'
import { Send, Edit2, Trash2, Archive, Mail, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'
import axios from 'axios'

const folders = ['Inbox', 'Needs_Action', 'Approved', 'Done', 'Rejected']

export default function Emails() {
  const [selectedFolder, setSelectedFolder] = useState('Inbox')
  const [emails, setEmails] = useState([])
  const [selectedEmail, setSelectedEmail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [actionLoading, setActionLoading] = useState(false)

  const fetchEmails = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await axios.get(`/api/emails?folder=${selectedFolder}`)
      setEmails(res.data)
      if (res.data.length > 0 && !selectedEmail) {
        // Don't auto-select to keep it clean, or select first
      }
    } catch (err) {
      console.error('Failed to fetch emails:', err)
      setError('Failed to load emails from ' + selectedFolder)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchEmails()
  }, [selectedFolder])

  const handleAction = async (action, toFolder) => {
    if (!selectedEmail) return
    
    setActionLoading(true)
    try {
      await axios.post('/api/emails/move', {
        id: selectedEmail.id,
        fromFolder: selectedEmail.folder,
        toFolder: toFolder
      })
      setSelectedEmail(null)
      fetchEmails()
    } catch (err) {
      console.error('Action failed:', err)
      alert('Failed to perform action')
    } finally {
      setActionLoading(false)
    }
  }

  const getPriorityColor = (priority) => {
    switch (priority?.toLowerCase()) {
      case 'high': return 'dark:bg-red-500/20 dark:text-red-400 bg-red-50 text-red-700'
      case 'medium': return 'dark:bg-yellow-500/20 dark:text-yellow-400 bg-yellow-50 text-yellow-700'
      case 'low': return 'dark:bg-green-500/20 dark:text-green-400 bg-green-50 text-green-700'
      default: return 'dark:bg-gray-500/20 dark:text-gray-400 bg-gray-50 text-gray-700'
    }
  }

  return (
    <div className="grid grid-cols-4 gap-4 h-[calc(100vh-140px)]">
      {/* Left: Folders */}
      <div className="col-span-1 space-y-2 border-r dark:border-[#1A1A24] pr-4">
        <h3 className="text-xs font-black dark:text-[#7A7A85] px-4 py-2 uppercase tracking-widest font-mono">MAILBOX</h3>
        {folders.map(folder => (
          <button
            key={folder}
            onClick={() => {setSelectedFolder(folder); setSelectedEmail(null)}}
            className={`
              w-full text-left px-4 py-2 rounded font-bold text-sm transition-all flex justify-between items-center
              ${selectedFolder === folder
                ? 'dark:bg-[#00FF88] dark:text-[#0A0A0F] bg-blue-500 text-white'
                : 'dark:text-[#7A7A85] text-gray-600 hover:dark:bg-[#1A1A24] hover:bg-gray-50'
              }
            `}
          >
            {folder.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* Middle: Email List */}
      <div className="col-span-1 border-r dark:border-[#1A1A24] overflow-y-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <Loader2 className="animate-spin text-[#00FF88]" />
            <p className="text-[10px] font-mono dark:text-[#7A7A85]">SCANNING VAULT...</p>
          </div>
        ) : error ? (
          <div className="p-4 text-center text-red-400 text-xs font-mono">
            <AlertCircle className="mx-auto mb-2" size={20} />
            {error}
          </div>
        ) : emails.length > 0 ? (
          emails.map(email => (
            <div
              key={email.id}
              onClick={() => setSelectedEmail(email)}
              className={`
                px-4 py-4 border-b dark:border-[#1A1A24] cursor-pointer transition-all relative group
                ${selectedEmail?.id === email.id
                  ? 'dark:bg-[#1A1A24] border-l-4 border-l-[#00FF88]'
                  : 'hover:dark:bg-[#1A1A24]/50 border-l-4 border-l-transparent'
                }
              `}
            >
              <div className="flex items-center justify-between mb-1">
                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase ${getPriorityColor(email.priority)}`}>
                  {email.priority}
                </span>
                <span className="text-[9px] dark:text-[#7A7A85] font-mono">
                  {new Date(email.time).toLocaleDateString()}
                </span>
              </div>
              <p className="font-bold dark:text-[#E0E0E6] text-sm truncate mb-0.5">
                {email.from}
              </p>
              <p className="text-xs dark:text-[#7A7A85] truncate">
                {email.subject}
              </p>
            </div>
          ))
        ) : (
          <div className="p-12 text-center text-[#7A7A85] font-mono italic text-xs">
            NO EMAILS FOUND
          </div>
        )}
      </div>

      {/* Right: Email Preview */}
      <div className="col-span-2 flex flex-col">
        {selectedEmail ? (
          <>
            <div className="p-8 flex-1 overflow-y-auto">
              <div className="mb-8 border-b dark:border-[#1A1A24] pb-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <p className="text-[10px] font-black dark:text-[#7A7A85] uppercase tracking-tighter mb-1">SENDER</p>
                    <p className="text-xl font-black dark:text-[#E0E0E6]">
                      {selectedEmail.from}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-black dark:text-[#7A7A85] uppercase tracking-tighter mb-1">RECEIVED</p>
                    <p className="text-sm font-bold dark:text-[#E0E0E6]">
                      {new Date(selectedEmail.time).toLocaleString()}
                    </p>
                  </div>
                </div>

                <div>
                  <p className="text-[10px] font-black dark:text-[#7A7A85] uppercase tracking-tighter mb-1">SUBJECT</p>
                  <p className="text-lg font-bold dark:text-[#00FF88] leading-tight">
                    {selectedEmail.subject}
                  </p>
                </div>
              </div>

              <div className="prose dark:prose-invert max-w-none">
                <p className="text-sm dark:text-[#E0E0E6] whitespace-pre-wrap leading-relaxed font-mono">
                  {selectedEmail.body || selectedEmail.preview || 'No content available.'}
                </p>
              </div>
            </div>

            {/* Action Bar */}
            <div className="p-4 border-t dark:border-[#1A1A24] flex gap-3 bg-[#12121A]">
              {selectedEmail.folder === 'Inbox' || selectedEmail.folder === 'Needs_Action' ? (
                <>
                  <button 
                    onClick={() => handleAction('approve', 'Approved')}
                    disabled={actionLoading}
                    className="flex items-center justify-center gap-2 flex-1 px-4 py-3 rounded font-black text-xs dark:bg-[#00FF88] dark:text-[#0A0A0F] uppercase tracking-widest disabled:opacity-50"
                  >
                    {actionLoading ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
                    Approve & Move
                  </button>
                  <button 
                    onClick={() => handleAction('reject', 'Rejected')}
                    disabled={actionLoading}
                    className="flex items-center justify-center gap-2 px-6 py-3 rounded font-black text-xs dark:bg-red-500/20 dark:text-red-400 uppercase tracking-widest disabled:opacity-50"
                  >
                    Reject
                  </button>
                </>
              ) : (
                <p className="text-[10px] font-mono dark:text-[#7A7A85] w-full text-center py-2 italic">
                  Status: {selectedEmail.folder.toUpperCase()}
                </p>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full space-y-4">
            <Mail size={64} className="dark:text-[#1A1A24]" />
            <p className="text-[10px] font-mono dark:text-[#7A7A85] uppercase tracking-widest">Select a message to view content</p>
          </div>
        )}
      </div>
    </div>
  )
}

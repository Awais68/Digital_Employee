import { useState, useEffect, useRef } from 'react'
import {
  Send, Edit2, Trash2, Archive, Mail, Loader2, AlertCircle,
  CheckCircle2, Reply, Forward, CornerDownLeft, FileText,
  ChevronDown, ChevronUp, Eye, Sparkles,
} from 'lucide-react'
import axios from 'axios'
import { useToast } from '../context/ToastContext'

const folders = ['Inbox', 'Needs_Action', 'Approved', 'Done', 'Rejected']

const replyTemplates = [
  {
    name: 'Acknowledgment',
    subject: 'Re: {subject}',
    body: `Dear {sender},\n\nThank you for your email regarding "{subject}".\n\nWe have received your message and are reviewing it. You can expect a detailed response within 24-48 hours.\n\nBest regards,\nDigital Employee Team`,
  },
  {
    name: 'Follow-up',
    subject: 'Follow-up: {subject}',
    body: `Hi {sender},\n\nFollowing up on our previous communication regarding "{subject}".\n\nCould you please provide any additional details or updates on your end?\n\nLooking forward to hearing from you.\n\nRegards,\nDigital Employee Team`,
  },
  {
    name: 'Escalation',
    subject: 'Escalation Required: {subject}',
    body: `This matter requires immediate attention.\n\nSubject: {subject}\nFrom: {sender}\n\nAction needed: Please review and respond at your earliest convenience.\n\nThis has been escalated for priority handling.\n\n--\nAutomated Escalation`,
  },
  {
    name: 'Resolution',
    subject: 'Resolved: {subject}',
    body: `Dear {sender},\n\nWe are pleased to inform you that the matter regarding "{subject}" has been resolved.\n\nIf you have any further questions, please don't hesitate to reach out.\n\nBest regards,\nDigital Employee Team`,
  },
  {
    name: 'Custom',
    subject: '',
    body: '',
  },
]

export default function Emails() {
  const [selectedFolder, setSelectedFolder] = useState('Inbox')
  const [emails, setEmails] = useState([])
  const [selectedEmail, setSelectedEmail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [showReply, setShowReply] = useState(false)
  const [replySubject, setReplySubject] = useState('')
  const [replyBody, setReplyBody] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState(null)
  const [showTemplates, setShowTemplates] = useState(false)
  const [replyLoading, setReplyLoading] = useState(false)
  const [replySuccess, setReplySuccess] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const replyRef = useRef(null)
  const { success, error: toastError } = useToast()

  const fetchEmails = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await axios.get(`/api/emails?folder=${selectedFolder}`)
      setEmails(res.data)
    } catch (err) {
      console.error('Failed to fetch emails:', err)
      setError('Failed to load emails from ' + selectedFolder)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchEmails()
    setSelectedEmail(null)
    setShowReply(false)
    setSelectedTemplate(null)
  }, [selectedFolder])

  const handleAction = async (action, toFolder) => {
    if (!selectedEmail) return
    
    setActionLoading(true)
    try {
      await axios.post('/api/emails/move', {
        id: selectedEmail.id,
        fromFolder: selectedEmail.folder || selectedFolder,
        toFolder: toFolder
      })
      success(`Email ${action}d successfully`)
      setSelectedEmail(null)
      setShowReply(false)
      fetchEmails()
    } catch (err) {
      console.error('Action failed:', err)
      toastError('Failed to perform action')
    } finally {
      setActionLoading(false)
    }
  }

  const applyTemplate = (template) => {
    if (!selectedEmail) return
    
    const sender = selectedEmail.from || selectedEmail.frontmatter?.from || 'there'
    const subject = selectedEmail.subject || selectedEmail.frontmatter?.subject || 'your inquiry'
    
    setReplySubject(template.subject
      .replace('{subject}', subject)
      .replace('{sender}', sender)
    )
    setReplyBody(template.body
      .replace(/\{subject\}/g, subject)
      .replace(/\{sender\}/g, sender)
    )
    setSelectedTemplate(template.name)
    setShowTemplates(false)
    setShowReply(true)
  }

  const handleSendReply = async () => {
    if (!replySubject.trim() || !replyBody.trim()) {
      toastError('Subject and body are required')
      return
    }

    setReplyLoading(true)
    try {
      // Save reply as draft for approval
      await axios.post('/api/emails/reply', {
        originalId: selectedEmail.id,
        originalFrom: selectedEmail.from || selectedEmail.frontmatter?.from,
        originalSubject: selectedEmail.subject || selectedEmail.frontmatter?.subject,
        replySubject,
        replyBody,
        template: selectedTemplate,
      })
      setReplySuccess(true)
      success('Reply saved for approval')
      
      setTimeout(() => {
        setShowReply(false)
        setReplySuccess(false)
      }, 2000)
    } catch (err) {
      console.error('Failed to save reply:', err)
      toastError('Failed to save reply')
    } finally {
      setReplyLoading(false)
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
            onClick={() => {setSelectedFolder(folder); setSelectedEmail(null); setShowReply(false)}}
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

        {/* Quick Templates */}
        <div className="pt-4 border-t dark:border-[#1A1A24]">
          <h3 className="text-xs font-black dark:text-[#7A7A85] px-4 py-2 uppercase tracking-widest font-mono flex items-center gap-2">
            <Sparkles size={14} />
            QUICK TEMPLATES
          </h3>
          {replyTemplates.slice(0, -1).map(template => (
            <button
              key={template.name}
              onClick={() => selectedEmail && applyTemplate(template)}
              disabled={!selectedEmail}
              className="w-full text-left px-4 py-1.5 text-xs dark:text-[#B0C4FF] text-gray-600 hover:dark:bg-[#1A1A24] hover:bg-gray-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {template.name}
            </button>
          ))}
        </div>
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
              onClick={() => {
                setSelectedEmail(email)
                setShowReply(false)
                setReplySuccess(false)
              }}
              className={`
                px-4 py-4 border-b dark:border-[#1A1A24] cursor-pointer transition-all relative group
                ${selectedEmail?.id === email.id
                  ? 'dark:bg-[#1A1A24] border-l-4 border-l-[#00FF88]'
                  : 'hover:dark:bg-[#1A1A24]/50 border-l-4 border-l-transparent'
                }
              `}
            >
              <div className="flex items-center justify-between mb-1">
                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase ${getPriorityColor(email.priority || email.frontmatter?.priority)}`}>
                  {email.priority || email.frontmatter?.priority || 'normal'}
                </span>
                <span className="text-[9px] dark:text-[#7A7A85] font-mono">
                  {new Date(email.time || email.createdAt).toLocaleDateString()}
                </span>
              </div>
              <p className="font-bold dark:text-[#E0E0E6] text-sm truncate mb-0.5">
                {email.from || email.frontmatter?.from || 'Unknown'}
              </p>
              <p className="text-xs dark:text-[#7A7A85] truncate">
                {email.subject || email.frontmatter?.subject || 'No subject'}
              </p>
            </div>
          ))
        ) : (
          <div className="p-12 text-center text-[#7A7A85] font-mono italic text-xs">
            NO EMAILS FOUND
          </div>
        )}
      </div>

      {/* Right: Email Preview + Reply */}
      <div className="col-span-2 flex flex-col">
        {selectedEmail ? (
          <>
            {/* Reply Success Banner */}
            {replySuccess && (
              <div className="bg-green-500/10 border-b border-green-500/30 p-3 flex items-center gap-2">
                <CheckCircle2 size={16} className="text-green-500" />
                <span className="text-sm text-green-400">Reply drafted and saved to Pending_Approval</span>
              </div>
            )}

            {/* Email Header */}
            <div className="p-6 border-b dark:border-[#1A1A24]">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="text-lg font-bold dark:text-[#E0E0E6] text-gray-900 mb-2">
                    {selectedEmail.subject || selectedEmail.frontmatter?.subject || 'No subject'}
                  </h3>
                  <div className="flex items-center gap-4 text-sm">
                    <div>
                      <span className="dark:text-[#7A7A85] text-gray-500">From:</span>
                      <span className="ml-1 dark:text-[#E0E0E6] text-gray-900 font-medium">
                        {selectedEmail.from || selectedEmail.frontmatter?.from || 'Unknown'}
                      </span>
                    </div>
                    <div>
                      <span className="dark:text-[#7A7A85] text-gray-500">Received:</span>
                      <span className="ml-1 dark:text-[#E0E0E6] text-gray-900">
                        {new Date(selectedEmail.time || selectedEmail.createdAt).toLocaleString()}
                      </span>
                    </div>
                    {selectedEmail.priority || selectedEmail.frontmatter?.priority ? (
                      <span className={`text-xs font-bold px-2 py-0.5 rounded ${getPriorityColor(selectedEmail.priority || selectedEmail.frontmatter?.priority)}`}>
                        {(selectedEmail.priority || selectedEmail.frontmatter?.priority).toUpperCase()}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowReply(!showReply)}
                    className="p-2 rounded-lg dark:bg-[#1A1A24] bg-gray-100 hover:dark:bg-[#2A2A3A] hover:bg-gray-200 transition-colors"
                  >
                    <Reply size={16} className="dark:text-[#00FF88] text-green-600" />
                  </button>
                </div>
              </div>
            </div>

            {/* Reply Composer */}
            {showReply && (
              <div ref={replyRef} className="border-b dark:border-[#1A1A24] bg-[#0D0D14]">
                <div className="p-4 space-y-3">
                  {/* Template Selector */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowTemplates(!showTemplates)}
                      className="flex items-center gap-2 px-3 py-1.5 rounded text-xs dark:bg-[#1A1A24] bg-gray-100 dark:text-[#E0E0E6] text-gray-900 hover:dark:bg-[#2A2A3A] hover:bg-gray-200 transition-colors"
                    >
                      <FileText size={14} />
                      {selectedTemplate || 'Select Template'}
                      {showTemplates ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                    {showTemplates && (
                      <div className="absolute mt-8 w-48 card rounded-lg shadow-xl z-10">
                        {replyTemplates.map(template => (
                          <button
                            key={template.name}
                            onClick={() => applyTemplate(template)}
                            className="w-full text-left px-4 py-2 text-sm dark:text-[#E0E0E6] text-gray-900 hover:dark:bg-[#1A1A24] hover:bg-gray-50 first:rounded-t-lg last:rounded-b-lg transition-colors"
                          >
                            {template.name}
                          </button>
                        ))}
                      </div>
                    )}
                    <button
                      onClick={() => setShowPreview(!showPreview)}
                      className="flex items-center gap-2 px-3 py-1.5 rounded text-xs dark:bg-[#1A1A24] bg-gray-100 dark:text-[#E0E0E6] text-gray-900 hover:dark:bg-[#2A2A3A] hover:bg-gray-200 transition-colors"
                    >
                      <Eye size={14} />
                      Preview
                    </button>
                  </div>

                  {showPreview ? (
                    <div className="p-4 rounded-lg dark:bg-[#1A1A24] bg-gray-50">
                      <p className="text-xs dark:text-[#7A7A85] text-gray-500 mb-1">To: {selectedEmail.from || selectedEmail.frontmatter?.from}</p>
                      <p className="text-xs dark:text-[#7A7A85] text-gray-500 mb-3">Subject: {replySubject}</p>
                      <div className="text-sm dark:text-[#E0E0E6] text-gray-900 whitespace-pre-wrap font-mono">
                        {replyBody || <span className="italic dark:text-[#7A7A85]">Nothing to preview</span>}
                      </div>
                    </div>
                  ) : (
                    <>
                      <input
                        type="text"
                        value={replySubject}
                        onChange={(e) => setReplySubject(e.target.value)}
                        placeholder="Subject"
                        className="w-full px-3 py-2 rounded-lg dark:bg-[#1A1A24] dark:text-[#E0E0E6] bg-gray-50 text-gray-900 text-sm font-mono"
                      />
                      <textarea
                        value={replyBody}
                        onChange={(e) => setReplyBody(e.target.value)}
                        placeholder="Type your reply..."
                        rows={6}
                        className="w-full px-3 py-2 rounded-lg dark:bg-[#1A1A24] dark:text-[#E0E0E6] bg-gray-50 text-gray-900 text-sm font-mono resize-none"
                      />
                    </>
                  )}

                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleSendReply}
                      disabled={replyLoading || !replySubject.trim() || !replyBody.trim()}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm dark:bg-[#00FF88] dark:text-[#0A0A0F] bg-green-500 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {replyLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                      Save Reply
                    </button>
                    <button
                      onClick={() => {
                        setShowReply(false)
                        setShowPreview(false)
                        setReplySubject('')
                        setReplyBody('')
                        setSelectedTemplate(null)
                      }}
                      className="px-4 py-2 rounded-lg font-medium text-sm dark:text-[#7A7A85] text-gray-500 hover:dark:bg-[#1A1A24] hover:bg-gray-100 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Email Body */}
            <div className="p-6 flex-1 overflow-y-auto">
              <div className="prose dark:prose-invert max-w-none">
                <p className="text-sm dark:text-[#E0E0E6] whitespace-pre-wrap leading-relaxed font-mono">
                  {selectedEmail.body || selectedEmail.content || selectedEmail.preview || 'No content available.'}
                </p>
              </div>
            </div>

            {/* Action Bar */}
            <div className="p-4 border-t dark:border-[#1A1A24] flex gap-3 bg-[#12121A]">
              {(selectedEmail.folder === 'Inbox' || selectedEmail.folder === 'Needs_Action' || selectedFolder === 'Inbox' || selectedFolder === 'Needs_Action') ? (
                <>
                  <button 
                    onClick={() => handleAction('approve', 'Approved')}
                    disabled={actionLoading}
                    className="flex items-center justify-center gap-2 flex-1 px-4 py-3 rounded font-black text-xs dark:bg-[#00FF88] dark:text-white bg-green-500 text-white uppercase tracking-widest disabled:opacity-50"
                  >
                    {actionLoading ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
                    Approve
                  </button>
                  <button
                    onClick={() => {
                      setSelectedEmail(null)
                      setShowReply(false)
                    }}
                    disabled={actionLoading}
                    className="flex items-center justify-center gap-2 px-4 py-3 rounded font-medium text-xs dark:bg-[#1A1A24] dark:text-[#E0E0E6] bg-gray-100 text-gray-700 disabled:opacity-50"
                  >
                    <CornerDownLeft size={16} />
                    Move to Needs Action
                  </button>
                  <button 
                    onClick={() => handleAction('reject', 'Rejected')}
                    disabled={actionLoading}
                    className="flex items-center justify-center gap-2 px-6 py-3 rounded font-black text-xs dark:bg-red-500/20 dark:text-red-400 uppercase tracking-widest disabled:opacity-50"
                  >
                    <Trash2 size={16} />
                    Reject
                  </button>
                </>
              ) : (
                <p className="text-[10px] font-mono dark:text-[#7A7A85] w-full text-center py-2 italic">
                  Status: {(selectedEmail.folder || selectedFolder).toUpperCase()}
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

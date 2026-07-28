import { useState, useEffect, useRef } from 'react'
import {
  Send, Edit2, Trash2, Archive, Mail, Loader2, AlertCircle,
  CheckCircle2, Reply, Forward, CornerDownLeft, FileText,
  ChevronDown, ChevronUp, Eye, Sparkles, Square, CheckSquare,
} from 'lucide-react'
import axios from 'axios'
import { useToast } from '../context/ToastContext'

const CATEGORIES = ['All', 'Support', 'Sales Inquiry', 'Meeting Request', 'Invoice', 'Newsletter', 'Spam', 'Internal']
const CATEGORY_COLORS = {
  'Support': { bg: 'bg-blue-500/20', text: 'text-blue-400' },
  'Sales Inquiry': { bg: 'bg-green-500/20', text: 'text-green-400' },
  'Meeting Request': { bg: 'bg-purple-500/20', text: 'text-purple-400' },
  'Invoice': { bg: 'bg-yellow-500/20', text: 'text-yellow-400' },
  'Newsletter': { bg: 'bg-pink-500/20', text: 'text-pink-400' },
  'Spam': { bg: 'bg-red-500/20', text: 'text-red-400' },
  'Internal': { bg: 'bg-cyan-500/20', text: 'text-cyan-400' },
}

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
  const [selectedForBulk, setSelectedForBulk] = useState(new Set())
  const [bulkActionLoading, setBulkActionLoading] = useState(false)
  const [showBulkMove, setShowBulkMove] = useState(false)
  const replyRef = useRef(null)
  const { success, error: toastError } = useToast()

  const fetchEmails = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await axios.get(`/api/emails?folder=${selectedFolder}`)
      const emailsWithPriority = res.data.map(email => ({
        ...email,
        detectedPriority: detectEmailPriority(email)
      }))
      const priorityOrder = { IMMEDIATE: 1, URGENT: 2, NORMAL: 3, INFO: 4 }
      emailsWithPriority.sort((a, b) => priorityOrder[a.detectedPriority] - priorityOrder[b.detectedPriority])
      setEmails(emailsWithPriority)
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

  const toggleBulkSelect = (id) => {
    setSelectedForBulk(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAllEmails = () => {
    if (selectedForBulk.size === emails.length) {
      setSelectedForBulk(new Set())
    } else {
      setSelectedForBulk(new Set(emails.map(e => e.id)))
    }
  }

  const handleBulkMove = async (toFolder) => {
    if (selectedForBulk.size === 0) return
    
    setBulkActionLoading(true)
    const selectedIds = Array.from(selectedForBulk)
    
    try {
      await Promise.all(
        selectedIds.map(id =>
          axios.post('/api/emails/move', {
            id,
            fromFolder: selectedFolder,
            toFolder,
          })
        )
      )
      success(`${selectedIds.length} email(s) moved to ${toFolder.replace('_', ' ')}`)
      setSelectedForBulk(new Set())
      setShowBulkMove(false)
      fetchEmails()
    } catch (err) {
      console.error('Bulk move failed:', err)
      toastError('Failed to move emails')
    } finally {
      setBulkActionLoading(false)
    }
  }

  function detectEmailPriority(email) {
    const subject = email.subject?.toLowerCase() || ''
    const from = email.from?.toLowerCase() || ''
    const body = email.body?.toLowerCase() || ''

    if (subject.includes('urgent') ||
        subject.includes('immediate') ||
        subject.includes('critical') ||
        subject.includes('emergency')) {
      return 'IMMEDIATE'
    }

    if (subject.includes('important') ||
        subject.includes('asap') ||
        subject.includes('follow up') ||
        from.includes('boss') ||
        from.includes('client')) {
      return 'URGENT'
    }

    if (subject.includes('meeting') ||
        subject.includes('invoice') ||
        subject.includes('proposal')) {
      return 'NORMAL'
    }

    return 'INFO'
  }

  function getPriorityConfig(priority) {
    const configs = {
      IMMEDIATE: { label: '🔴 IMMEDIATE', className: 'dark:bg-red-500/20 dark:text-red-400 bg-red-50 text-red-700 border-l-red-500' },
      URGENT:    { label: '🟠 URGENT',    className: 'dark:bg-orange-500/20 dark:text-orange-400 bg-orange-50 text-orange-700 border-l-orange-500' },
      NORMAL:    { label: '🟡 NORMAL',    className: 'dark:bg-yellow-500/20 dark:text-yellow-400 bg-yellow-50 text-yellow-700 border-l-yellow-500' },
      INFO:      { label: '🟢 INFO',      className: 'dark:bg-green-500/20 dark:text-green-400 bg-green-50 text-green-700 border-l-green-500' },
    }
    return configs[priority] || configs['INFO']
  }

  const getPriorityColor = (priority) => {
    return getPriorityConfig(priority).className
  }

  const [priorityFilter, setPriorityFilter] = useState('All')
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [priorityCounts, setPriorityCounts] = useState({ IMMEDIATE: 0, URGENT: 0, NORMAL: 0, INFO: 0 })
  const [categoryCounts, setCategoryCounts] = useState({})

  useEffect(() => {
    const pCounts = { IMMEDIATE: 0, URGENT: 0, NORMAL: 0, INFO: 0 }
    const cCounts = {}
    emails.forEach(e => {
      pCounts[e.detectedPriority]++
      const cat = e.category || 'Uncategorized'
      cCounts[cat] = (cCounts[cat] || 0) + 1
    })
    setPriorityCounts(pCounts)
    setCategoryCounts(cCounts)
  }, [emails])

  const filteredEmails = emails
    .filter(e => priorityFilter === 'All' || e.detectedPriority === priorityFilter)
    .filter(e => categoryFilter === 'All' || (e.category || 'Uncategorized') === categoryFilter)

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 md:h-[calc(100vh-140px)]">
      {/* Left: Folders */}
      <div className="md:col-span-1">
        {/* Mobile: horizontal scroll folder pills */}
        <div className="flex md:hidden gap-2 overflow-x-auto pb-2 -mx-1 px-1">
          {folders.map(folder => (
            <button
              key={folder}
              onClick={() => {setSelectedFolder(folder); setSelectedEmail(null); setShowReply(false)}}
              className={`shrink-0 px-3 py-1.5 rounded-lg font-bold text-xs transition-all whitespace-nowrap ${
                selectedFolder === folder
                  ? 'dark:bg-[#00FF88] dark:text-[#0A0A0F] bg-blue-500 text-white'
                  : 'dark:bg-[#1A1A24] dark:text-[#7A7A85] bg-gray-100 text-gray-600'
              }`}
            >
              {folder.replace('_', ' ')}
            </button>
          ))}
        </div>
        {/* Desktop: vertical folder list */}
        <div className="hidden md:block space-y-2 border-r dark:border-[#1A1A24] pr-4">
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
            {replyTemplates.map(template => (
              <button
                key={template.name}
                onClick={() => {
                  if (selectedEmail) {
                    applyTemplate(template)
                  } else {
                    setReplySubject(template.subject.replace('{subject}', 'Your Inquiry').replace('{sender}', 'Valued Customer'))
                    setReplyBody(template.body.replace(/\{subject\}/g, 'Your Inquiry').replace(/\{sender\}/g, 'Valued Customer'))
                    setSelectedTemplate(template.name)
                    setShowReply(true)
                  }
                }}
                className="w-full text-left px-4 py-1.5 text-xs dark:text-[#B0C4FF] text-gray-600 hover:dark:bg-[#1A1A24] hover:bg-gray-50 transition-colors"
              >
                {template.name}
              </button>
            ))}
          </div>
        </div>
      </div>

       {/* Middle: Email List */}
       <div className="md:col-span-1 md:border-r dark:border-[#1A1A24] flex flex-col">
         {/* Priority Filter Bar */}
          <div className="p-3 border-b dark:border-[#1A1A24] space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-black dark:text-[#7A7A85] uppercase tracking-widest font-mono shrink-0">📧 {selectedFolder.replace('_', ' ')}</h3>
              <div className="flex gap-1 text-[9px] font-mono overflow-x-auto">
                {['IMMEDIATE', 'URGENT', 'NORMAL', 'INFO'].map(p => (
                  <button
                    key={p}
                    onClick={() => setPriorityFilter(priorityFilter === p ? 'All' : p)}
                    className={`shrink-0 px-1.5 py-0.5 rounded font-bold transition-colors ${
                      priorityFilter === p
                        ? 'dark:bg-[#00FF88] dark:text-[#0A0A0F] bg-blue-500 text-white'
                        : 'dark:bg-[#1A1A24] dark:text-[#7A7A85] hover:dark:bg-[#2A2A3A]'
                    }`}
                  >
                    {getPriorityConfig(p).label.split(' ')[0]} {priorityCounts[p] || ''}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2 text-[10px] font-mono">
              <span className="dark:text-[#7A7A85] text-[9px] uppercase tracking-wider shrink-0">Cat:</span>
              <div className="flex gap-1 overflow-x-auto md:flex-wrap">
                  {CATEGORIES.map(c => (
                  <button key={c} onClick={() => setCategoryFilter(categoryFilter === c ? 'All' : c)}
                    className={`shrink-0 px-1.5 py-0.5 rounded transition-colors ${
                      categoryFilter === c
                        ? 'dark:bg-[#00FF88] dark:text-[#0A0A0F] text-white bg-blue-500'
                        : 'dark:bg-[#1A1A24] dark:text-[#7A7A85] hover:dark:bg-[#2A2A3A]'
                    }`}>
                    {c}{c !== 'All' && categoryCounts[c] ? ` (${categoryCounts[c]})` : ''}
                  </button>
                ))}
              </div>
            </div>
          </div>

         {/* Bulk Actions Bar */}
        {selectedForBulk.size > 0 && (
          <div className="p-3 border-b dark:border-[#1A1A24] bg-[#00FF88]/5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold dark:text-[#00FF88]">{selectedForBulk.size} selected</span>
              <button
                onClick={() => setSelectedForBulk(new Set())}
                className="text-xs dark:text-[#7A7A85] hover:dark:text-[#E0E0E6]"
              >
                Clear
              </button>
            </div>
            <div className="flex gap-1 flex-wrap">
              {['Approved', 'Done', 'Needs_Action', 'Rejected'].map(folder => (
                <button
                  key={folder}
                  onClick={() => handleBulkMove(folder)}
                  disabled={bulkActionLoading}
                  className="px-2 py-1 rounded text-[10px] font-bold dark:bg-[#1A1A24] dark:text-[#E0E0E6] hover:dark:bg-[#2A2A3A] disabled:opacity-50 transition-colors"
                >
                  → {folder.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Select All */}
        {emails.length > 0 && (
          <button
            onClick={selectAllEmails}
            className="flex items-center gap-2 px-4 py-2 border-b dark:border-[#1A1A24] text-xs dark:text-[#7A7A85] hover:dark:bg-[#1A1A24]/50 transition-colors"
          >
            {selectedForBulk.size === emails.length ? (
              <CheckSquare size={14} className="dark:text-[#00FF88]" />
            ) : (
              <Square size={14} />
            )}
            {selectedForBulk.size === emails.length ? 'Deselect All' : 'Select All'}
          </button>
        )}

        {/* Email List - content-visibility for rendering performance (rendering-content-visibility) */}
        <div className="flex-1 overflow-y-auto content-visibility-auto" style={{ containIntrinsicSize: '0 5000px' }}>
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
         ) : filteredEmails.length > 0 ? (
           ['IMMEDIATE', 'URGENT', 'NORMAL', 'INFO'].map(priority => {
             const priorityEmails = filteredEmails.filter(e => e.detectedPriority === priority)
             if (priorityEmails.length === 0) return null
             return (
               <div key={priority}>
                 <div className={`text-[9px] font-black px-4 py-1 uppercase tracking-widest ${getPriorityConfig(priority).className}`}>
                   {getPriorityConfig(priority).label} ({priorityEmails.length})
                 </div>
                 {priorityEmails.map(email => (
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
                       ${selectedForBulk.has(email.id) ? 'dark:bg-[#00FF88]/5' : ''}
                     `}
                   >
                     <div className="flex items-start gap-2">
                       <button
                         onClick={(e) => {
                           e.stopPropagation()
                           toggleBulkSelect(email.id)
                         }}
                         className="mt-1 flex-shrink-0"
                       >
                         {selectedForBulk.has(email.id) ? (
                           <CheckSquare size={14} className="dark:text-[#00FF88]" />
                         ) : (
                           <Square size={14} className="dark:text-[#7A7A85] opacity-0 group-hover:opacity-100 transition-opacity" />
                         )}
                       </button>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-1">
                              <span className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase ${getPriorityColor(email.detectedPriority)}`}>
                                {email.detectedPriority}
                              </span>
                              {email.category && CATEGORY_COLORS[email.category] && (
                                <span className={`text-[9px] px-1.5 py-0.5 rounded ${CATEGORY_COLORS[email.category].bg} ${CATEGORY_COLORS[email.category].text}`}>
                                  {email.category}
                                </span>
                              )}
                              {email.processed && (
                                <span className="text-[10px] text-green-500 font-bold" title="Processed">✓</span>
                              )}
                            </div>
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
                         <div className="flex gap-1 mt-2">
                           <button
                             onClick={(e) => {
                               e.stopPropagation()
                               setSelectedEmail(email)
                               setShowReply(true)
                             }}
                             className="text-[9px] px-2 py-0.5 rounded dark:bg-[#1A1A24] dark:text-[#00FF88] hover:dark:bg-[#2A2A3A] transition-colors"
                           >
                             Reply
                           </button>
                           <button
                             onClick={(e) => {
                               e.stopPropagation()
                               // Forward to WhatsApp
                               window.open(`https://wa.me/?text=${encodeURIComponent(`From: ${email.from}\nSubject: ${email.subject}\n\n${email.body?.slice(0, 200)}`)}`, '_blank')
                             }}
                             className="text-[9px] px-2 py-0.5 rounded dark:bg-[#1A1A24] dark:text-green-400 hover:dark:bg-[#2A2A3A] transition-colors"
                           >
                             WhatsApp
                           </button>
                           <button
                             onClick={(e) => {
                               e.stopPropagation()
                               // Mark as read logic
                             }}
                             className="text-[9px] px-2 py-0.5 rounded dark:bg-[#1A1A24] dark:text-[#7A7A85] hover:dark:bg-[#2A2A3A] transition-colors"
                           >
                             Mark Read
                           </button>
                         </div>
                       </div>
                     </div>
                   </div>
                 ))}
               </div>
             )
           })
         ) : (
          <div className="p-12 text-center text-[#7A7A85] font-mono italic text-xs">
            NO EMAILS FOUND
          </div>
        )}
        </div>
      </div>

      {/* Right: Email Preview + Reply */}
      <div className="md:col-span-2 flex flex-col">
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
                        {(selectedEmail.priority || selectedEmail.frontmatter?.priority || '').toUpperCase()}
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
                  {!selectedEmail.processed && (
                    <button
                      onClick={async () => {
                        setActionLoading(true)
                        try {
                          await axios.post(`/api/emails/${selectedEmail.id}/mark-processed`)
                          success('Email marked as processed')
                          fetchEmails()
                        } catch { toastError('Failed to mark processed') }
                        setActionLoading(false)
                      }}
                      disabled={actionLoading}
                      className="flex items-center justify-center gap-2 px-4 py-3 rounded font-medium text-xs dark:bg-[#00FF88]/10 dark:text-[#00FF88] bg-green-50 text-green-700 disabled:opacity-50"
                    >
                      <CheckCircle2 size={16} />
                      Mark Processed
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setSelectedEmail(null)
                      setShowReply(false)
                    }}
                    disabled={actionLoading}
                    className="flex items-center justify-center gap-2 px-4 py-3 rounded font-medium text-xs dark:bg-[#1A1A24] dark:text-[#E0E0E6] bg-gray-100 text-gray-700 disabled:opacity-50"
                  >
                    <CornerDownLeft size={16} />
                    Needs Action
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
                  {selectedEmail.processed && <span className="ml-2 text-green-500 font-bold">✓ Processed</span>}
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

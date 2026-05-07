import { useState, useEffect } from 'react'
import {
  Send, Save, Upload, Calendar, Sparkles, Copy, Check, Loader2,
  AlertCircle, Trash2, Edit2, Clock, CheckCircle2, Eye,
  Linkedin, Facebook, Instagram, Twitter, Hash, Image,
} from 'lucide-react'
import axios from 'axios'
import { useToast } from '../context/ToastContext'

const platforms = [
  { id: 'linkedin', name: 'LinkedIn', limit: 3000, color: '#0A66C2', icon: Linkedin, handleFormat: '@name', hashtagMax: 5 },
  { id: 'facebook', name: 'Facebook', limit: 63206, color: '#1877F2', icon: Facebook, handleFormat: '@name', hashtagMax: 10 },
  { id: 'instagram', name: 'Instagram', limit: 2200, color: '#E4405F', icon: Instagram, handleFormat: '@name', hashtagMax: 30 },
  { id: 'twitter', name: 'Twitter', limit: 280, color: '#1DA1F2', icon: Twitter, handleFormat: '@name', hashtagMax: 3 },
]

export default function SocialMedia() {
  const [content, setContent] = useState('')
  const [selectedPlatforms, setSelectedPlatforms] = useState(['linkedin'])
  const [scheduleTime, setScheduleTime] = useState('')
  const [showSchedule, setShowSchedule] = useState(false)
  const [activeTab, setActiveTab] = useState('compose')
  const [topic, setTopic] = useState('')
  const [generatedPosts, setGeneratedPosts] = useState({})
  const [isGenerating, setIsGenerating] = useState(false)
  const [copiedId, setCopiedId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [queue, setQueue] = useState([])
  const [history, setHistory] = useState([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [draftId, setDraftId] = useState(null)
  const [editingDraft, setEditingDraft] = useState(false)
  const { success, error: toastError, warning } = useToast()

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const [queueRes, historyRes] = await Promise.all([
        axios.get('/api/social/drafts'),
        axios.get('/api/social/history')
      ])
      setQueue(queueRes.data)
      setHistory(historyRes.data)
    } catch (err) {
      console.error('Failed to fetch social data:', err)
      setError('Failed to load social media data.')
    } finally {
      setLoading(false)
    }
  }

  const charCount = (platform) => {
    const p = platforms.find(x => x.id === platform)
    return { current: content.length, max: p.limit }
  }

  const isOverLimit = (platform) => {
    const { current, max } = charCount(platform)
    return current > max
  }

  const getHashtags = (text) => {
    const matches = text.match(/#[\w]+/g)
    return matches || []
  }

  const togglePlatform = (id) => {
    setSelectedPlatforms(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const handlePost = async () => {
    if (!content.trim() || selectedPlatforms.length === 0) return
    
    setIsSubmitting(true)
    try {
      const res = await axios.post('/api/social/post', {
        content,
        platforms: selectedPlatforms,
        scheduleTime: showSchedule && scheduleTime ? scheduleTime : null,
        draftId,
      })
      
      if (res.data.success) {
        if (showSchedule && scheduleTime) {
          success(`Post scheduled for ${selectedPlatforms.join(', ')}`)
        } else {
          success(`Post sent for approval - check Approvals tab to publish`)
        }
        setContent('')
        setDraftId(null)
        setScheduleTime('')
        setShowSchedule(false)
        setEditingDraft(false)
        fetchData()
      } else {
        toastError(res.data.message || 'Failed to create post')
      }
    } catch (err) {
      console.error('Failed to create post:', err)
      const data = err.response?.data
      let msg = 'Failed to submit post'
      if (data?.message) {
        msg = data.message
      } else if (data?.error) {
        msg = data.error
      }
      toastError(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSaveDraft = async () => {
    if (!content.trim()) return
    
    try {
      const res = await axios.post('/api/social/draft', {
        content,
        platforms: selectedPlatforms,
        scheduleTime: showSchedule && scheduleTime ? scheduleTime : null,
      })
      success('Draft saved')
      fetchData()
    } catch (err) {
      console.error('Failed to save draft:', err)
      const msg = err.response?.data?.message || err.response?.data?.error || err.message || 'Failed to save draft'
      toastError(msg)
    }
  }

  const handleDeleteDraft = async (id) => {
    try {
      await axios.delete(`/api/social/draft/${id}`)
      success('Draft deleted')
      fetchData()
    } catch (err) {
      const msg = err.response?.data?.message || err.response?.data?.error || err.message || 'Unknown error'
      toastError(`Failed: ${msg}`)
      console.error('Delete error:', err.response?.data)
    }
  }

  const handleEditDraft = (draft) => {
    setContent(draft.content || draft.preview)
    setDraftId(draft.id)
    const platforms = typeof draft.platforms === 'string' ? draft.platforms.split(',') : (draft.platforms || ['linkedin'])
    setSelectedPlatforms(platforms)
    setEditingDraft(true)
    setActiveTab('compose')
  }

  const handlePublishNow = async (draft) => {
    try {
      const res = await axios.post(`/api/social/draft/${draft.id}/publish`)
      success('Draft published')
      fetchData()
    } catch (err) {
      const data = err.response?.data
      let msg = 'Failed to publish'
      if (data?.message) {
        msg = data.message
      }
      if (data?.results) {
        const details = Object.entries(data.results)
          .filter(([, r]) => !r.success)
          .map(([p, r]) => `${p}: ${r.message || r.error || 'unknown error'}`)
          .join('; ')
        if (details) msg += ` — ${details}`
      }
      toastError(msg)
    }
  }

  const generateAIPosts = async () => {
    if (!topic.trim()) return

    setIsGenerating(true)
    setTimeout(() => {
      setGeneratedPosts({
        twitter: [
          `🚀 Exciting news about ${topic}! The future is here! #innovation`,
          `Did you know? ${topic} is transforming the industry. Join us! 🌟`,
        ],
        linkedin: [
          `We're thrilled to announce our new approach to ${topic}. This represents a significant milestone in our journey to deliver exceptional value to our stakeholders.`,
        ],
        facebook: `🎉 Big news! We're excited to share our latest development in ${topic}. Check out the full story!`,
        instagram: `✨ The future of ${topic} starts now ✨\n\nWe're thrilled to unveil what we've been building. #innovation #${topic.replace(/\s+/g, '')}`,
      })
      setIsGenerating(false)
    }, 1500)
  }

  const handleUseGeneratedPost = (platform, text) => {
    setContent(text)
    setSelectedPlatforms([platform])
    setActiveTab('compose')
    setShowPreview(true)
    success(`Loaded ${platform} post`)
  }

  const copyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  // Platform Preview Component
  const PlatformPreview = ({ platform, content: postContent }) => {
    const p = platforms.find(x => x.id === platform)
    if (!p) return null
    const Icon = p.icon

    const hashtags = getHashtags(postContent)
    const hasImage = postContent.includes('📸') || postContent.includes('🖼️') || postContent.includes('🎨')

    return (
      <div className="rounded-xl overflow-hidden border dark:border-[#1A1A24] border-gray-200 bg-white dark:bg-[#0F1A2E]">
        {/* Platform Header */}
        <div className="flex items-center gap-2 p-3 border-b dark:border-[#1A1A24] border-gray-100">
          <Icon size={16} style={{ color: p.color }} />
          <span className="text-xs font-bold" style={{ color: p.color }}>{p.name} Preview</span>
          <span className="ml-auto text-xs dark:text-[#7A7A85] text-gray-400">
            {postContent.length}/{p.limit}
          </span>
        </div>

        {/* Content Preview */}
        <div className="p-4">
          {/* User Avatar + Name */}
          <div className="flex items-center gap-2 mb-3">
            <div className="w-10 h-10 rounded-full dark:bg-[#1A1A24] bg-gray-100" />
            <div>
              <p className="text-sm font-bold dark:text-[#E0E0E6] text-gray-900">Your Company</p>
              <p className="text-xs dark:text-[#7A7A85] text-gray-500">@yourcompany · Just now</p>
            </div>
          </div>

          {/* Post Content */}
          <p className="text-sm dark:text-[#E0E0E6] text-gray-900 whitespace-pre-wrap mb-3 leading-relaxed">
            {postContent || <span className="italic dark:text-[#7A7A85] text-gray-400">Your post will appear here...</span>}
          </p>

          {/* Image Placeholder */}
          {hasImage && (
            <div className="rounded-lg dark:bg-[#1A1A24] bg-gray-100 h-40 mb-3 flex items-center justify-center">
              <Image size={24} className="dark:text-[#7A7A85] text-gray-400" />
            </div>
          )}

          {/* Hashtag Warning */}
          {hashtags.length > p.hashtagMax && (
            <div className="flex items-center gap-1 text-xs text-yellow-500 mb-2">
              <AlertCircle size={12} />
              Max {p.hashtagMax} hashtags for {p.name} (using {hashtags.length})
            </div>
          )}

          {/* Engagement Bar */}
          {postContent && (
            <div className="flex items-center justify-between pt-3 border-t dark:border-[#1A1A24] border-gray-100 text-xs dark:text-[#7A7A85] text-gray-500">
              <span>💬 0</span>
              <span>🔄 0</span>
              <span>❤️ 0</span>
              <span>📤</span>
            </div>
          )}
        </div>

        {/* Character Bar */}
        <div className="h-1 dark:bg-[#1A1A24] bg-gray-100">
          <div
            className={`h-full transition-all ${isOverLimit(platform) ? 'bg-red-500' : postContent.length / p.limit > 0.8 ? 'bg-yellow-500' : 'bg-green-500'}`}
            style={{ width: `${Math.min((postContent.length / p.limit) * 100, 100)}%` }}
          />
        </div>
      </div>
    )
  }

  if (loading && activeTab !== 'compose' && activeTab !== 'generate') {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <Loader2 className="w-8 h-8 animate-spin text-[#00FF88]" />
        <p className="text-[#7A7A85] font-mono">LOADING SOCIAL FEED...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex gap-4 border-b dark:border-[#1A1A24] border-gray-200 overflow-x-auto">
        {[
          { id: 'compose', label: 'Compose', icon: Edit2 },
          { id: 'generate', label: 'AI Generate', icon: Sparkles },
          { id: 'queue', label: 'Queue', icon: Clock },
          { id: 'history', label: 'History', icon: CheckCircle2 },
        ].map(tab => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 font-medium text-sm border-b-2 transition-all capitalize flex items-center gap-2 ${
                activeTab === tab.id
                  ? 'dark:border-[#00FF88] dark:text-[#00FF88] border-blue-500 text-blue-600'
                  : 'dark:border-transparent dark:text-[#7A7A85] border-transparent text-gray-500'
              }`}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          )
        })}
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/50 p-4 rounded-lg flex items-center gap-3 text-red-400 font-mono text-sm">
          <AlertCircle size={20} />
          {error}
        </div>
      )}

      {/* Compose Tab */}
      {activeTab === 'compose' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Editor */}
          <div className="lg:col-span-2 space-y-6">
            {editingDraft && (
              <div className="flex items-center gap-2 p-3 rounded-lg dark:bg-[#FFB800]/10 bg-yellow-50 border dark:border-[#FFB800]/30 border-yellow-200">
                <Edit2 size={16} className="dark:text-[#FFB800] text-yellow-600" />
                <span className="text-sm dark:text-[#E0E0E6] text-gray-900">Editing draft</span>
                <button onClick={() => { setEditingDraft(false); setDraftId(null); setContent('') }} className="ml-auto text-xs dark:text-[#7A7A85] underline">Cancel</button>
              </div>
            )}

            <div className="card p-6">
              <h2 className="text-lg font-bold dark:text-[#E0E0E6] text-gray-900 mb-4 font-mono">
                {editingDraft ? 'EDIT DRAFT' : 'COMPOSE POST'}
              </h2>
              
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Write your post content here..."
                className="w-full px-4 py-3 rounded-lg dark:bg-[#1A1A24] dark:text-[#E0E0E6] bg-gray-50 min-h-[200px] font-mono text-sm"
              />

              {/* Platform Selection */}
              <div className="my-6">
                <p className="text-sm font-semibold dark:text-[#E0E0E6] mb-3 font-mono">TARGET PLATFORMS</p>
                <div className="flex flex-wrap gap-2">
                  {platforms.map(p => {
                    const Icon = p.icon
                    const limit = charCount(p.id)
                    return (
                      <button
                        key={p.id}
                        onClick={() => togglePlatform(p.id)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold transition-all ${
                          selectedPlatforms.includes(p.id)
                            ? 'text-[#0A0A0F]'
                            : 'dark:bg-[#1A1A24] dark:text-[#7A7A85] bg-gray-100'
                        }`}
                        style={selectedPlatforms.includes(p.id) ? { backgroundColor: p.color } : {}}
                      >
                        <Icon size={14} />
                        {p.name}
                        {isOverLimit(p.id) && <AlertCircle size={12} />}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Schedule */}
              <div className="mb-4">
                <button
                  onClick={() => setShowSchedule(!showSchedule)}
                  className="flex items-center gap-2 text-sm dark:text-[#7A7A85] text-gray-500 hover:dark:text-[#E0E0E6]"
                >
                  <Calendar size={16} />
                  {showSchedule ? 'Hide Schedule' : 'Schedule for later'}
                </button>
                {showSchedule && (
                  <input
                    type="datetime-local"
                    value={scheduleTime}
                    onChange={(e) => setScheduleTime(e.target.value)}
                    className="mt-2 px-4 py-2 rounded-lg dark:bg-[#1A1A24] dark:text-[#E0E0E6] bg-gray-50 text-sm"
                  />
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={handlePost}
                  disabled={isSubmitting || !content.trim() || selectedPlatforms.some(isOverLimit)}
                  className="flex items-center justify-center gap-2 flex-1 px-4 py-3 rounded font-bold dark:bg-[#00FF88] dark:text-[#0A0A0F] bg-blue-500 text-white disabled:opacity-50"
                >
                  {isSubmitting ? <Loader2 className="animate-spin" /> : <Send size={18} />}
                  {editingDraft ? 'UPDATE' : showSchedule && scheduleTime ? 'SCHEDULE' : 'SUBMIT FOR APPROVAL'}
                </button>
                <button
                  onClick={handleSaveDraft}
                  disabled={!content.trim()}
                  className="flex items-center gap-2 px-4 py-3 rounded font-medium dark:bg-[#1A1A24] dark:text-[#E0E0E6] bg-gray-100 text-gray-700 disabled:opacity-50"
                >
                  <Save size={16} />
                  Save Draft
                </button>
                <button
                  onClick={() => setShowPreview(!showPreview)}
                  className="flex items-center gap-2 px-4 py-3 rounded font-medium dark:bg-[#1A1A24] dark:text-[#E0E0E6] bg-gray-100 text-gray-700"
                >
                  <Eye size={16} />
                  Preview
                </button>
              </div>
            </div>
          </div>

          {/* Preview Panel */}
          {showPreview && (
            <div className="lg:col-span-1 space-y-4">
              {selectedPlatforms.map(platform => (
                <PlatformPreview key={platform} platform={platform} content={content} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Generate Tab */}
      {activeTab === 'generate' && (
        <div className="space-y-6">
          <div className="card p-6">
            <h2 className="text-lg font-bold dark:text-[#E0E0E6] text-gray-900 mb-4 font-mono flex items-center gap-2">
              <Sparkles size={20} className="dark:text-[#00FF88] text-blue-500" />
              AI CONTENT GENERATOR
            </h2>

            <div className="flex gap-3 mb-6">
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Enter a topic for AI generation..."
                className="flex-1 px-4 py-3 rounded-lg dark:bg-[#1A1A24] dark:text-[#E0E0E6] bg-gray-50"
              />
              <button
                onClick={generateAIPosts}
                disabled={isGenerating || !topic.trim()}
                className="flex items-center gap-2 px-6 py-3 rounded-lg font-medium dark:bg-[#00FF88] dark:text-[#0A0A0F] bg-blue-500 text-white"
              >
                {isGenerating ? <Loader2 className="animate-spin" size={18} /> : <Sparkles size={18} />}
                Generate
              </button>
            </div>
          </div>

          {/* Generated Results */}
          {Object.keys(generatedPosts).length > 0 && (
            <div className="space-y-4">
              {platforms.map(p => {
                const posts = generatedPosts[p.id]
                if (!posts || posts.length === 0) return null
                const Icon = p.icon
                return (
                  <div key={p.id} className="card p-6">
                    <h3 className="font-bold dark:text-[#E0E0E6] text-sm mb-4 flex items-center gap-2">
                      <Icon size={16} style={{ color: p.color }} />
                      {p.name} ({posts.length} options)
                    </h3>
                    <div className="space-y-3">
                      {(Array.isArray(posts) ? posts : [posts]).map((post, idx) => (
                        <div key={idx} className="p-4 rounded-lg dark:bg-[#1A1A24] bg-gray-50 border dark:border-[#1A1A24] border-gray-200">
                          <p className="text-sm dark:text-[#E0E0E6] mb-3">{post}</p>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleUseGeneratedPost(p.id, post)}
                              className="text-xs font-bold dark:text-[#00FF88] text-green-600 hover:underline"
                            >
                              USE THIS →
                            </button>
                            <button
                              onClick={() => copyToClipboard(post, `${p.id}-${idx}`)}
                              className="flex items-center gap-1 text-xs dark:text-[#7A7A85] text-gray-500 hover:dark:text-[#E0E0E6]"
                            >
                              {copiedId === `${p.id}-${idx}` ? <Check size={12} /> : <Copy size={12} />}
                              {copiedId === `${p.id}-${idx}` ? 'Copied' : 'Copy'}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Queue Tab */}
      {activeTab === 'queue' && (
        <div className="space-y-4">
          {queue.length > 0 ? queue.map(post => {
            const postPlatforms = post.platforms ? post.platforms.split(',') : [post.platform || 'unknown']
            const isApproved = post.status === 'approved'
            return (
            <div key={post.id} className={`card p-4 border-l-4 ${isApproved ? 'border-green-500' : 'border-yellow-500'}`}>
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <p className="text-sm dark:text-[#E0E0E6] mb-2">{post.preview?.trim().substring(0, 150) || 'Draft'}...</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${isApproved ? 'bg-green-500/20 text-green-500' : 'bg-yellow-500/20 text-yellow-500'}`}>
                      {isApproved ? 'APPROVED — READY TO PUBLISH' : (post.status || 'PENDING')}
                    </span>
                    {postPlatforms.map(p => (
                      <span key={p} className="text-[10px] px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 font-bold uppercase">
                        {p}
                      </span>
                    ))}
                    {post.scheduleTime && (
                      <span className="text-[10px] px-2 py-0.5 rounded dark:bg-blue-500/20 dark:text-blue-400 bg-blue-50 text-blue-600 flex items-center gap-1">
                        <Clock size={10} />
                        Scheduled: {new Date(post.scheduleTime).toLocaleString()}
                      </span>
                    )}
                    <span className="text-[10px] dark:text-[#7A7A85]">
                      {new Date(post.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleEditDraft(post)}
                    className="p-2 rounded dark:bg-[#1A1A24] dark:text-[#E0E0E6] hover:dark:bg-[#2A2A3A] transition-colors"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button
                      onClick={() => handlePublishNow(post)}
                      title="Publish Now"
                      className="p-2 rounded dark:bg-[#00FF88]/20 dark:text-[#00FF88] hover:dark:bg-[#00FF88]/30 transition-colors"
                    >
                      <Send size={14} />
                    </button>
                  <button
                    onClick={() => handleDeleteDraft(post.id)}
                    className="p-2 rounded dark:bg-red-500/20 dark:text-red-400 hover:dark:bg-red-500/30 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
            )
          }) : (
            <p className="text-center py-12 text-[#7A7A85] font-mono italic">QUEUE IS EMPTY</p>
          )}
        </div>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          {history.length > 0 ? history.map(post => (
            <div key={post.id} className="card p-4 border-l-4 border-[#00FF88]">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <p className="text-sm dark:text-[#E0E0E6] mb-2">{post.preview?.substring(0, 150) || 'Post'}...</p>
                  <div className="flex items-center gap-4">
                    <span className="text-[10px] px-2 py-0.5 rounded bg-[#00FF88]/20 text-[#00FF88] font-bold uppercase">
                      POSTED
                    </span>
                    <span className="text-[10px] dark:text-[#7A7A85]">
                      {new Date(post.date || post.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )) : (
            <p className="text-center py-12 text-[#7A7A85] font-mono italic">NO POST HISTORY FOUND</p>
          )}
        </div>
      )}
    </div>
  )
}

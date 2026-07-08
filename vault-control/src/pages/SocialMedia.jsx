import { useState, useEffect, useRef } from 'react'
import {
  Send, Save, Upload, Calendar, Sparkles, Copy, Check, Loader2,
  AlertCircle, Trash2, Edit2, Clock, CheckCircle2, Eye,
  Linkedin, Facebook, Instagram, Twitter, Hash, Image,
} from 'lucide-react'
import axios from 'axios'
import { useToast } from '../context/ToastContext'

const platforms = [
  { id: 'linkedin', name: 'LinkedIn', limit: 3000, color: '#0A66C2', icon: Linkedin, hashtagMax: 5, minWords: 50, maxWords: 500, requireImage: true },
  { id: 'facebook', name: 'Facebook', limit: 63206, color: '#1877F2', icon: Facebook, hashtagMax: 10, minWords: 50, maxWords: 500, requireImage: true },
  { id: 'instagram', name: 'Instagram', limit: 2200, color: '#E4405F', icon: Instagram, hashtagMax: 30, minWords: 50, maxWords: 500, requireImage: true },
  { id: 'twitter', name: 'Twitter', limit: 280, color: '#1DA1F2', icon: Twitter, hashtagMax: 3, minWords: 5, maxWords: 50, requireImage: false, disabled: true },
]

// MANDATORY MENTIONS - Maximum audience reach
const MANDATORY_MENTIONS = ['Ameen Alam', 'Zia Khan', 'Asharib Ali']

// STRICT RULES - Every post MUST follow these
const STRICT_RULES = {
  requireImage: true,
  requireHashtags: true,
  requireEmojis: true,
  requireMentions: true,
  minHashtags: 1,
  maxHashtags: 5,
  blockWithoutImage: true,
  spamKeywords: ['buy now', 'click here', 'limited time', 'act fast', '100% free', 'act now', 'free money'],
  minWords: 50,
}

export default function SocialMedia() {
  const [content, setContent] = useState('')
  const [selectedPlatforms, setSelectedPlatforms] = useState(['linkedin'])
  const [scheduleTime, setScheduleTime] = useState('')
  const [showSchedule, setShowSchedule] = useState(false)
  const [postMode, setPostMode] = useState('approval') // 'approval' | 'schedule' | 'now'
  const [activeTab, setActiveTab] = useState('compose')
  const [topic, setTopic] = useState('')
  const [generatedPosts, setGeneratedPosts] = useState({})
  const [isGenerating, setIsGenerating] = useState(false)
  const [copiedId, setCopiedId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [queue, setQueue] = useState([])
  const [pendingApproval, setPendingApproval] = useState([])
  const [publishing, setPublishing] = useState({})
  const [history, setHistory] = useState([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [draftId, setDraftId] = useState(null)
  const [editingDraft, setEditingDraft] = useState(false)
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const fileInputRef = useRef(null)
  const [historyFilter, setHistoryFilter] = useState('24h')
  const [pageName, setPageName] = useState('')
  const [validationErrors, setValidationErrors] = useState([])
  const [isGeneratingImage, setIsGeneratingImage] = useState(false)
  const { success, error: toastError, warning } = useToast()

  // STRICT VALIDATION FUNCTION
  const validatePost = (text, platforms, hasImage) => {
    const errors = []
    
    // Image validation (MANDATORY)
    if (STRICT_RULES.blockWithoutImage && !hasImage) {
      errors.push('Image is MANDATORY - every post must have an image')
    }
    
    // Content validation
    if (!text || text.trim().length === 0) {
      errors.push('Content cannot be empty')
      return errors
    }
    
    const words = text.split(/\s+/).filter(w => w.length > 0)
    
    // Global minimum word count
    if (words.length < STRICT_RULES.minWords) {
      errors.push(`Minimum ${STRICT_RULES.minWords} words required (current: ${words.length})`)
    }
    
    // Word count per platform
    platforms.forEach(platformId => {
      const platform = platforms.find(p => p.id === platformId)
      if (platform) {
        if (words.length < platform.minWords) {
          errors.push(`${platform.name}: Too few words (${words.length}/${platform.minWords} minimum)`)
        }
        if (words.length > platform.maxWords) {
          errors.push(`${platform.name}: Too many words (${words.length}/${platform.maxWords} maximum)`)
        }
      }
    })
    
    // Hashtag validation
    if (STRICT_RULES.requireHashtags) {
      const hashtags = text.match(/#\w+/g) || []
      if (hashtags.length < STRICT_RULES.minHashtags) {
        errors.push(`Too few hashtags (${hashtags.length}/${STRICT_RULES.minHashtags} minimum)`)
      }
    }
    
    // Mandatory mentions validation
    if (STRICT_RULES.requireMentions) {
      const textLower = text.toLowerCase()
      const missingMentions = MANDATORY_MENTIONS.filter(mention => !textLower.includes(mention.toLowerCase()))
      if (missingMentions.length > 0) {
        errors.push(`Missing mandatory mentions: ${missingMentions.join(', ')} - Required for maximum reach`)
      }
    }
    
    // Emoji validation
    if (STRICT_RULES.requireEmojis) {
      const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2702}-\u{27B0}\u{24C2}-\u{1F251}]/gu
      const emojis = text.match(emojiRegex) || []
      if (emojis.length < 1) {
        errors.push(`No emojis found - add at least 1 for engagement`)
      }
    }
    
    // Spam detection
    const lowerContent = text.toLowerCase()
    STRICT_RULES.spamKeywords.forEach(spam => {
      if (lowerContent.includes(spam.toLowerCase())) {
        errors.push(`Spam keyword detected: "${spam}"`)
      }
    })
    
    return errors
  }

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const [queueRes, pendingRes, historyRes] = await Promise.all([
        axios.get('/api/posts/queue'),
        axios.get('/api/posts/pending-approval'),
        axios.get('/api/social/history'),
      ])
      setQueue(Array.isArray(queueRes.data) ? queueRes.data : (queueRes.data?.queue || queueRes.data?.data || []))
      setPendingApproval(Array.isArray(pendingRes.data) ? pendingRes.data : (pendingRes.data?.approvals || pendingRes.data?.data || []))
      setHistory(Array.isArray(historyRes.data) ? historyRes.data : (historyRes.data?.history || historyRes.data?.data || []))
    } catch (err) {
      console.error('Failed to fetch social data:', err)
      setError('Failed to load social media data.')
    } finally {
      setLoading(false)
    }
  }

  const filteredHistory = history.filter(p => {
    if (historyFilter === '24h') {
      return new Date(p.date || p.createdAt) > new Date(Date.now() - 86400000)
    }
    if (historyFilter === '7d') {
      return new Date(p.date || p.createdAt) > new Date(Date.now() - 604800000)
    }
    if (historyFilter === '30d') {
      return new Date(p.date || p.createdAt) > new Date(Date.now() - 2592000000)
    }
    return true
  })

  const charCount = (platform) => {
    const p = platforms.find(x => x.id === platform)
    return { current: content.length, max: p.limit }
  }

  const isOverLimit = (platform) => {
    const { current, max } = charCount(platform)
    return current > max
  }

  const togglePlatform = (id) => {
    setSelectedPlatforms(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const handleAutoGenerateImage = async () => {
    if (!content.trim()) {
      toastError('Write post content first, then generate image')
      return
    }
    
    setIsGeneratingImage(true)
    try {
      const res = await axios.post('/api/posts/generate-image', {
        topic: content.substring(0, 100),
        style: 'professional'
      })
      
      if (res.data.imageUrl) {
        // Download the generated image
        const imgRes = await fetch(res.data.imageUrl)
        const blob = await imgRes.blob()
        const file = new File([blob], `generated_${Date.now()}.png`, { type: 'image/png' })
        
        setImageFile(file)
        setImagePreview(res.data.imageUrl)
        success('Image generated automatically!')
      } else {
        toastError('Image generation failed')
      }
    } catch (e) {
      console.error('Auto image generation failed:', e)
      toastError('Image generation failed: ' + (e.response?.data?.error || e.message))
    } finally {
      setIsGeneratingImage(false)
    }
  }

  const handleImageSelect = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setImageFile(file)
    const reader = new FileReader()
    reader.onload = () => setImagePreview(reader.result)
    reader.readAsDataURL(file)
  }

  const removeImage = () => {
    setImageFile(null)
    setImagePreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handlePost = async () => {
    // Add mandatory mentions if not present
    let finalContent = content
    const contentLower = finalContent.toLowerCase()
    const hasMentions = MANDATORY_MENTIONS.some(m => contentLower.includes(m.toLowerCase()))
    if (!hasMentions) {
      finalContent = `${finalContent.trimEnd()}\n\n${MANDATORY_MENTIONS.join(' ')}`
    }
    
    // STRICT VALIDATION - check both imageFile and imagePreview
    const hasImage = !!(imageFile || imagePreview)
    const errors = validatePost(finalContent, selectedPlatforms, hasImage)
    setValidationErrors(errors)
    
    if (errors.length > 0) {
      toastError('Validation failed: ' + errors[0])
      return
    }

    if (!finalContent.trim() || selectedPlatforms.length === 0) return

    setIsSubmitting(true)
    try {
      if (postMode === 'now') {
        const formData = new FormData()
        formData.append('content', finalContent)
        formData.append('platforms', JSON.stringify(selectedPlatforms))

        // Add image - try imageFile first, then fetch from imagePreview
        if (imageFile) {
          formData.append('image', imageFile)
          console.log('[Manual Post] With image file:', imageFile.name)
        } else if (imagePreview) {
          // Fetch image from URL and add to formData
          try {
            const fetchRes = await fetch(imagePreview)
            const blob = await fetchRes.blob()
            const file = new File([blob], `post_image_${Date.now()}.jpg`, { type: 'image/jpeg' })
            formData.append('image', file)
            console.log('[Manual Post] With image from URL:', imagePreview)
          } catch (e) {
            console.error('[Manual Post] Failed to fetch image:', e)
          }
        }

        const res = await axios.post('/api/posts/publish-now', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        })
        if (res.data.success) {
          const results = res.data.results || []
          results.forEach(r => {
            if (r.success) success(`Posted to ${r.platform}!`)
            else toastError(`${r.platform}: ${r.error}`)
          })
          setContent('')
          removeImage()
          setValidationErrors([])
          fetchData()
        } else {
          const errors = res.data.results?.filter(r => !r.success)?.map(r => r.error).join(', ')
          toastError(errors || 'Post failed')
        }
        return
      }

      let imageUrl = null
      if (imageFile) {
        const fd = new FormData()
        fd.append('image', imageFile)
        const imgRes = await axios.post('/api/posts/upload-image', fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        imageUrl = imgRes.data.url
      }

      const res = await axios.post('/api/posts/compose', {
        content,
        platforms: selectedPlatforms,
        imageUrl,
        scheduleTime: postMode === 'schedule' && scheduleTime ? scheduleTime : null,
        publishNow: false,
        topic: content.substring(0, 80),
      })

      if (res.data.success) {
        const msg = postMode === 'schedule' ? 'Post scheduled' : 'Post sent for approval'
        success(msg)
        setContent('')
        setDraftId(null)
        setScheduleTime('')
        setShowSchedule(false)
        setEditingDraft(false)
        setPageName('')
        removeImage()
        fetchData()
      } else {
        toastError(res.data.failed
          ? `Failed on: ${res.data.posts?.filter(p => !p.success).map(p => p.platform).join(', ')}`
          : 'Some posts failed to create')
      }
    } catch (err) {
      toastError(err.response?.data?.message || err.response?.data?.error || 'Failed to submit post')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSaveDraft = async () => {
    if (!content.trim()) return
    try {
      let imageUrl = null
      if (imageFile) {
        const formData = new FormData()
        formData.append('image', imageFile)
        const imgRes = await axios.post('/api/posts/upload-image', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        imageUrl = imgRes.data.url
      }
      const res = await axios.post('/api/social/draft', { content, platforms: selectedPlatforms, scheduleTime: showSchedule && scheduleTime ? scheduleTime : null, pageName: selectedPlatforms.includes('facebook') ? pageName || null : null, imageUrl })
      success('Draft saved')
      fetchData()
    } catch (err) {
      toastError(err.response?.data?.message || err.response?.data?.error || 'Failed to save draft')
    }
  }

  const handleDeleteDraft = async (id) => {
    try {
      await axios.delete(`/api/posts/${id}`)
      success('Deleted')
      setPendingApproval(prev => prev.filter(p => p.id !== id))
    } catch (err) {
      try {
        await axios.delete(`/api/social/draft/${id}`)
        success('Deleted')
        fetchData()
      } catch {
        toastError('Failed to delete')
      }
    }
  }

  const handleEditDraft = (draft) => {
    setContent(draft.content || draft.preview)
    setDraftId(draft.id)
    setSelectedPlatforms(typeof draft.platforms === 'string' ? draft.platforms.split(',') : (draft.platforms || ['linkedin']))
    setEditingDraft(true)
    setActiveTab('compose')
  }

  const handlePublishNow = async (draft) => {
    try {
      await axios.post(`/api/posts/${draft.id}/approve-publish`)
      success('Post published')
      fetchData()
    } catch (err) {
      toastError(err.response?.data?.error || 'Failed to publish')
    }
  }

  const handleApprove = async (postId) => {
    setPublishing(prev => ({ ...prev, [postId]: true }))
    try {
      const res = await axios.post(`/api/posts/${postId}/approve-publish`)
      if (res.data.success) {
        success(`✅ Published to ${res.data.platform}!`)
        setPendingApproval(prev => prev.filter(p => p.id !== postId))
      }
    } catch (e) {
      toastError(`❌ Publish failed: ${e.response?.data?.error || e.message}`)
    } finally {
      setPublishing(prev => ({ ...prev, [postId]: false }))
    }
  }

  const [topicSuggestions, setTopicSuggestions] = useState([])
  const [generatedImages, setGeneratedImages] = useState({})
  const [generateError, setGenerateError] = useState(null)
  const [workflowSteps, setWorkflowSteps] = useState({})
  const [resizedVariants, setResizedVariants] = useState({})

  useEffect(() => {
    axios.get('/api/posts/topics').then(r => setTopicSuggestions(r.data.topics || [])).catch(() => {})
  }, [])

  const generateAIPosts = async () => {
    if (!topic.trim()) return
    setIsGenerating(true)
    setGenerateError(null)
    setWorkflowSteps({})
    setResizedVariants({})
    try {
      const res = await axios.post('/api/posts/generate', {
        topic: topic.trim(),
        platforms: ['linkedin', 'twitter', 'facebook', 'instagram'],
        count: 2,
      }, { timeout: 120000 })
      if (res.data.success) {
        if (res.data.posts) {
          setGeneratedPosts(res.data.posts)
          const images = {}
          const workflow = {}
          const variants = {}
          for (const [platform, platformPosts] of Object.entries(res.data.posts)) {
            images[platform] = platformPosts.map(p => p.imageUrl)
            if (platformPosts[0]?.workflow) {
              workflow[platform] = platformPosts[0].workflow
            }
            if (platformPosts[0]?.resizedImages) {
              variants[platform] = platformPosts[0].resizedImages
            }
          }
          setGeneratedImages(images)
          setWorkflowSteps(workflow)
          setResizedVariants(variants)

          // AUTO-GENERATE IMAGE and set to compose tab
          const firstPost = Object.values(res.data.posts)[0]?.[0]
          if (firstPost) {
            setContent(firstPost.content)
            setSelectedPlatforms(Object.keys(res.data.posts))

            // Auto-generate image
            try {
              const imgRes = await axios.post('/api/posts/generate-image', {
                topic: topic.trim(),
                style: 'professional'
              })
              if (imgRes.data.imageUrl) {
                setImagePreview(imgRes.data.imageUrl)
                // Convert URL to File for publishing
                const fetchRes = await fetch(imgRes.data.imageUrl)
                const blob = await fetchRes.blob()
                const file = new File([blob], `ai_generated_${Date.now()}.jpg`, { type: 'image/jpeg' })
                setImageFile(file)
              }
            } catch (imgErr) {
              console.error('Auto image generation failed:', imgErr)
            }
          }
        }
        success(`Generated posts for "${topic}" with AI image`)
      } else {
        setGenerateError(res.data.error || 'Generation failed')
      }
    } catch (err) {
      const msg = err.response?.data?.error || err.message
      setGenerateError(msg)
      console.error('Generate error:', err)
    } finally {
      setIsGenerating(false)
    }
  }

  const handleUseGeneratedPost = (platform, text, imageUrl) => {
    setContent(text)
    setSelectedPlatforms([platform])
    setActiveTab('compose')
    setShowPreview(true)

    // Set image if available
    if (imageUrl) {
      setImagePreview(imageUrl)
      fetch(imageUrl).then(res => res.blob()).then(blob => {
        const file = new File([blob], `generated_${platform}_${Date.now()}.jpg`, { type: 'image/jpeg' })
        setImageFile(file)
      }).catch(() => {})
    }

    success(`Loaded ${platform} post with image`)
  }

  const copyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const PlatformPreview = ({ platform, content: postContent }) => {
    const p = platforms.find(x => x.id === platform)
    if (!p) return null
    const Icon = p.icon
    return (
      <div className="rounded-xl overflow-hidden border dark:border-[#1A1A24] border-gray-200 bg-white dark:bg-[#0F1A2E]">
        <div className="flex items-center gap-2 p-3 border-b dark:border-[#1A1A24] border-gray-100">
          <Icon size={16} style={{ color: p.color }} />
          <span className="text-xs font-bold" style={{ color: p.color }}>{p.name} Preview</span>
          <span className="ml-auto text-xs dark:text-[#7A7A85] text-gray-400">{postContent.length}/{p.limit}</span>
        </div>
        <div className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-10 h-10 rounded-full dark:bg-[#1A1A24] bg-gray-100" />
            <div>
              <p className="text-sm font-bold dark:text-[#E0E0E6] text-gray-900">Your Company</p>
              <p className="text-xs dark:text-[#7A7A85] text-gray-500">@yourcompany · Just now</p>
            </div>
          </div>
          {imagePreview && <img src={imagePreview} alt="Upload" className="w-full h-40 object-cover rounded-lg mb-3" />}
          <p className="text-sm dark:text-[#E0E0E6] text-gray-900 whitespace-pre-wrap mb-3 leading-relaxed">
            {postContent || <span className="italic dark:text-[#7A7A85] text-gray-400">Your post will appear here...</span>}
          </p>
          {postContent && (
            <div className="flex items-center justify-between pt-3 border-t dark:border-[#1A1A24] border-gray-100 text-xs dark:text-[#7A7A85] text-gray-500">
              <span>💬 0</span>
              <span>🔄 0</span>
              <span>❤️ 0</span>
              <span>📤</span>
            </div>
          )}
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
      <div className="flex gap-4 border-b dark:border-[#1A1A24] border-gray-200 overflow-x-auto">
        {[
          { id: 'compose', label: 'Compose', icon: Edit2 },
          { id: 'generate', label: 'AI Generate', icon: Sparkles },
          { id: 'approval', label: 'Approval', icon: CheckCircle2 },
          { id: 'queue', label: 'Queue', icon: Clock },
          { id: 'history', label: 'History', icon: Eye },
        ].map(tab => {
          const Icon = tab.icon
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 font-medium text-sm border-b-2 transition-all capitalize flex items-center gap-2 ${activeTab === tab.id ? 'dark:border-[#00FF88] dark:text-[#00FF88] border-blue-500 text-blue-600' : 'dark:border-transparent dark:text-[#7A7A85] border-transparent text-gray-500'}`}>
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

      {activeTab === 'compose' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {editingDraft && (
              <div className="flex items-center gap-2 p-3 rounded-lg dark:bg-[#FFB800]/10 bg-yellow-50 border dark:border-[#FFB800]/30 border-yellow-200">
                <Edit2 size={16} className="dark:text-[#FFB800] text-yellow-600" />
                <span className="text-sm dark:text-[#E0E0E6] text-gray-900">Editing draft</span>
                <button onClick={() => { setEditingDraft(false); setDraftId(null); setContent(''); removeImage() }} className="ml-auto text-xs dark:text-[#7A7A85] underline">Cancel</button>
              </div>
            )}

            <div className="card p-6">
              <h2 className="text-lg font-bold dark:text-[#E0E0E6] text-gray-900 mb-4 font-mono">{editingDraft ? 'EDIT DRAFT' : 'COMPOSE POST'}</h2>

              <textarea value={content} onChange={(e) => setContent(e.target.value)}
                placeholder="Write your post content here..."
                className="w-full px-4 py-3 rounded-lg dark:bg-[#1A1A24] dark:text-[#E0E0E6] bg-gray-50 min-h-[200px] font-mono text-sm" />

              {/* Image Upload - MANDATORY */}
              <div className="my-4">
                <p className="text-sm font-semibold dark:text-[#E0E0E6] mb-2 font-mono flex items-center gap-2">
                  IMAGE <span className="text-red-500 text-xs font-bold">*MANDATORY</span>
                </p>
                <input type="file" ref={fileInputRef} onChange={handleImageSelect} accept="image/*" className="hidden" />
                {imagePreview ? (
                  <div className="relative inline-block">
                    <img src={imagePreview} alt="Preview" className="h-40 rounded-lg object-cover" />
                    <button onClick={removeImage} className="absolute top-1 right-1 p-1 rounded-full bg-red-500 text-white text-xs">✕</button>
                    <span className="absolute bottom-1 left-1 px-2 py-0.5 rounded bg-green-500/80 text-white text-[10px] font-bold">✓ Image Ready</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <button onClick={() => fileInputRef.current?.click()}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg dark:bg-[#1A1A24] dark:text-[#7A7A85] bg-gray-100 text-sm border-2 border-dashed dark:border-red-500/50 border-red-300 hover:dark:border-red-500 transition-colors">
                        <Image size={16} /> Upload Image
                      </button>
                      <button onClick={handleAutoGenerateImage} disabled={isGeneratingImage || !content.trim()}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg dark:bg-[#00FF88]/20 dark:text-[#00FF88] bg-green-50 text-sm border-2 dark:border-[#00FF88]/50 border-green-300 hover:dark:border-[#00FF88] transition-colors disabled:opacity-50">
                        {isGeneratingImage ? <Loader2 className="animate-spin" size={14} /> : <Sparkles size={14} />}
                        {isGeneratingImage ? 'Generating...' : 'Auto Generate'}
                      </button>
                    </div>
                    <p className="text-[10px] text-red-400 font-mono">⚠️ Posts without images will be BLOCKED</p>
                  </div>
                )}
              </div>

              {/* Mandatory Mentions Display */}
              <div className="mb-4 p-3 rounded-lg dark:bg-blue-500/10 bg-blue-50 border dark:border-blue-500/30 border-blue-200">
                <p className="text-[10px] font-bold dark:text-blue-400 text-blue-600 mb-1 font-mono">MANDATORY MENTIONS (for 1000+ impressions)</p>
                <div className="flex flex-wrap gap-2">
                  {MANDATORY_MENTIONS.map(mention => (
                    <span key={mention} className="px-2 py-1 rounded dark:bg-blue-500/20 bg-blue-100 text-xs dark:text-blue-300 text-blue-700 font-bold">
                      {mention}
                    </span>
                  ))}
                </div>
                <p className="text-[10px] dark:text-[#7A7A85] text-gray-500 mt-1">These will be auto-added to your post</p>
              </div>

              <div className="my-6">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold dark:text-[#E0E0E6] font-mono">TARGET PLATFORMS</p>
                  <button onClick={() => {
                    const activePlatforms = platforms.filter(p => !p.disabled).map(p => p.id)
                    const allSelected = activePlatforms.every(id => selectedPlatforms.includes(id))
                    setSelectedPlatforms(allSelected ? [] : activePlatforms)
                  }}
                    className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${platforms.filter(p => !p.disabled).every(p => selectedPlatforms.includes(p.id)) ? 'bg-[#00FF88] text-[#0A0A0F]' : 'dark:bg-[#1A1A24] dark:text-[#00FF88] bg-gray-100 text-green-600 border dark:border-[#00FF88]/30 border-green-300'}`}>
                    {platforms.filter(p => !p.disabled).every(p => selectedPlatforms.includes(p.id)) ? '✓ ALL SELECTED' : 'SELECT ALL'}
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {platforms.map(p => {
                    const Icon = p.icon
                    return (
                      <button key={p.id} onClick={() => togglePlatform(p.id)} disabled={p.disabled}
                        className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold transition-all ${selectedPlatforms.includes(p.id) ? 'text-[#0A0A0F]' : 'dark:bg-[#1A1A24] dark:text-[#7A7A85] bg-gray-100'} ${p.disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                        style={selectedPlatforms.includes(p.id) ? { backgroundColor: p.color } : {}}>
                        <Icon size={14} />
                        {p.name}
                        {p.disabled && <span className="text-[10px] ml-1">(OFF)</span>}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="mb-4 space-y-3">
                <p className="text-sm font-semibold dark:text-[#E0E0E6] mb-1 font-mono">POST MODE</p>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => setPostMode('now')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold transition-all ${postMode === 'now' ? 'bg-[#00FF88] text-[#0A0A0F]' : 'dark:bg-[#1A1A24] dark:text-[#7A7A85] bg-gray-100'}`}>
                    <Send size={14} /> Publish Now
                  </button>
                  <button onClick={() => { setPostMode('schedule'); setShowSchedule(true) }}
                    className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold transition-all ${postMode === 'schedule' ? 'bg-[#FFB800] text-[#0A0A0F]' : 'dark:bg-[#1A1A24] dark:text-[#7A7A85] bg-gray-100'}`}>
                    <Calendar size={14} /> Schedule
                  </button>
                  <button onClick={() => setPostMode('approval')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold transition-all ${postMode === 'approval' ? 'bg-[#25D366] text-[#0A0A0F]' : 'dark:bg-[#1A1A24] dark:text-[#7A7A85] bg-gray-100'}`}>
                    <Clock size={14} /> Send for Approval
                  </button>
                </div>
                {postMode === 'schedule' && (
                  <input type="datetime-local" value={scheduleTime} onChange={(e) => setScheduleTime(e.target.value)}
                    className="mt-2 px-4 py-2 rounded-lg dark:bg-[#1A1A24] dark:text-[#E0E0E6] bg-gray-50 text-sm" />
                )}
              </div>

              {selectedPlatforms.includes('facebook') && (
                <div className="mb-4">
                  <label className="block text-xs font-semibold dark:text-[#7A7A85] text-gray-500 mb-1 font-mono">FACEBOOK PAGE (optional)</label>
                  <input type="text" value={pageName} onChange={(e) => setPageName(e.target.value)}
                    placeholder="e.g. AsTechDevelopers"
                    className="w-full px-4 py-2 rounded-lg dark:bg-[#1A1A24] dark:text-[#E0E0E6] bg-gray-50 text-sm border dark:border-[#2A3E5F] border-gray-200" />
                </div>
              )}

              {/* Validation Errors Display */}
              {validationErrors.length > 0 && (
                <div className="mb-4 p-4 rounded-lg dark:bg-red-500/10 bg-red-50 border dark:border-red-500/50 border-red-200">
                  <p className="text-sm font-bold dark:text-red-400 text-red-600 mb-2 font-mono flex items-center gap-2">
                    <AlertCircle size={16} /> VALIDATION FAILED
                  </p>
                  <ul className="text-xs dark:text-red-300 text-red-500 space-y-1">
                    {validationErrors.map((err, i) => (
                      <li key={i}>• {err}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Content Validation Status */}
              {content && (
                <div className="mb-4 p-3 rounded-lg dark:bg-[#1A1A24] bg-gray-50 border dark:border-[#2A3E5F] border-gray-200">
                  <p className="text-[10px] font-bold dark:text-[#B0C4FF] text-blue-600 mb-2 font-mono">CONTENT STATUS</p>
                  <div className="flex flex-wrap gap-3 text-[10px]">
                    <span className={`px-2 py-1 rounded ${content.split(/\s+/).filter(w => w.length > 0).length >= 150 ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                      Words: {content.split(/\s+/).filter(w => w.length > 0).length}/150 min
                    </span>
                    <span className={`px-2 py-1 rounded ${(content.match(/#\w+/g) || []).length >= 3 ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                      Hashtags: {(content.match(/#\w+/g) || []).length}/3 min
                    </span>
                    <span className={`px-2 py-1 rounded ${MANDATORY_MENTIONS.every(m => content.toLowerCase().includes(m.toLowerCase())) ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                      Mentions: {MANDATORY_MENTIONS.every(m => content.toLowerCase().includes(m.toLowerCase())) ? '✓ All tagged' : '✗ Required'}
                    </span>
                    <span className={`px-2 py-1 rounded ${(imageFile || imagePreview) ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                      Image: {(imageFile || imagePreview) ? '✓ Ready' : '✗ Required'}
                    </span>
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <button onClick={handlePost} disabled={isSubmitting || !content.trim() || selectedPlatforms.length === 0 || (!imageFile && !imagePreview)}
                  className="flex items-center justify-center gap-2 flex-1 px-4 py-3 rounded font-bold dark:bg-[#00FF88] dark:text-[#0A0A0F] bg-blue-500 text-white disabled:opacity-50 disabled:cursor-not-allowed">
                  {isSubmitting ? <Loader2 className="animate-spin" /> : postMode === 'now' ? <Send size={18} /> : postMode === 'schedule' ? <Calendar size={18} /> : <Clock size={18} />}
                  {editingDraft ? 'UPDATE' : postMode === 'now' ? 'PUBLISH NOW' : postMode === 'schedule' ? 'SCHEDULE' : 'SUBMIT FOR APPROVAL'}
                </button>
                <button onClick={handleSaveDraft} disabled={!content.trim()}
                  className="flex items-center gap-2 px-4 py-3 rounded font-medium dark:bg-[#1A1A24] dark:text-[#E0E0E6] bg-gray-100 text-gray-700 disabled:opacity-50">
                  <Save size={16} /> Save Draft
                </button>
                <button onClick={() => setShowPreview(!showPreview)}
                  className="flex items-center gap-2 px-4 py-3 rounded font-medium dark:bg-[#1A1A24] dark:text-[#E0E0E6] bg-gray-100 text-gray-700">
                  <Eye size={16} /> Preview
                </button>
              </div>
            </div>
          </div>

          {showPreview && (
            <div className="lg:col-span-1 space-y-4">
              {selectedPlatforms.map(platform => (
                <PlatformPreview key={platform} platform={platform} content={content} />
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'generate' && (
        <div className="space-y-6">
          <div className="card p-6">
            <h2 className="text-lg font-bold dark:text-[#E0E0E6] text-gray-900 mb-4 font-mono flex items-center gap-2">
              <Sparkles size={20} className="dark:text-[#00FF88] text-blue-500" />
              AI CONTENT GENERATOR
            </h2>
            <div className="flex gap-3 mb-4">
              <input type="text" value={topic} onChange={(e) => setTopic(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && generateAIPosts()}
                placeholder="Enter a topic for AI generation..."
                className="flex-1 px-4 py-3 rounded-lg dark:bg-[#1A1A24] dark:text-[#E0E0E6] bg-gray-50 text-sm" />
              <button onClick={generateAIPosts} disabled={isGenerating || !topic.trim()}
                className="flex items-center gap-2 px-6 py-3 rounded-lg font-medium dark:bg-[#00FF88] dark:text-[#0A0A0F] bg-blue-500 text-white disabled:opacity-50">
                {isGenerating ? <Loader2 className="animate-spin" size={18} /> : <Sparkles size={18} />}
                {isGenerating ? 'Generating...' : 'Generate'}
              </button>
            </div>
            {topicSuggestions.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                <span className="text-[10px] dark:text-[#7A7A85] uppercase tracking-wider mr-1 self-center">Suggestions:</span>
                {topicSuggestions.map(s => (
                  <button key={s} onClick={() => setTopic(s)}
                    className="text-[10px] px-2 py-1 rounded dark:bg-[#1A1A24] dark:text-[#B0C4FF] bg-gray-100 hover:dark:bg-[#2A3E5F] transition-colors">{s}</button>
                ))}
              </div>
            )}
            {generateError && (
              <div className="mt-4 p-4 rounded-lg bg-red-500/10 border border-red-500/50 flex items-start gap-3 text-red-400 font-mono text-sm">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <div>
                  <p className="font-bold">Generation Failed</p>
                  <p className="text-xs mt-1 opacity-80">{generateError}</p>
                </div>
              </div>
            )}
          </div>

          {Object.keys(generatedPosts).length > 0 && (
            <div className="space-y-4">
              {platforms.map(p => {
                const posts = generatedPosts[p.id]
                if (!posts || posts.length === 0) return null
                const Icon = p.icon
                const platformWorkflow = workflowSteps[p.id] || {}
                const platformVariants = resizedVariants[p.id] || {}
                return (
                  <div key={p.id} className="card p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-bold dark:text-[#E0E0E6] text-sm flex items-center gap-2">
                        <Icon size={16} style={{ color: p.color }} />
                        {p.name} ({posts.length} option{posts.length > 1 ? 's' : ''})
                      </h3>
                      {platformWorkflow.modelUsed && (
                        <span className="text-[10px] px-2 py-1 rounded bg-[#00FF88]/20 text-[#00FF88] font-bold font-mono">
                          Model: {platformWorkflow.modelUsed}
                        </span>
                      )}
                    </div>

                    {Object.keys(platformWorkflow).length > 0 && (
                      <div className="mb-4 p-3 rounded-lg dark:bg-[#1A1A24] bg-gray-50 border dark:border-[#1A1A24] border-gray-200">
                        <p className="text-[10px] font-bold dark:text-[#B0C4FF] text-blue-600 mb-2 font-mono">WORKFLOW STATUS</p>
                        <div className="flex flex-wrap gap-2">
                          {[
                            { key: 'step1_research', label: 'Research' },
                            { key: 'step2_brief', label: 'Brief' },
                            { key: 'step3_content', label: 'Content' },
                            { key: 'step4_image_validation', label: 'Img Valid' },
                            { key: 'step5_assembly', label: 'Assembly' },
                          ].map(step => (
                            <span key={step.key} className={`text-[10px] px-2 py-1 rounded font-bold ${
                              platformWorkflow[step.key] 
                                ? 'bg-green-500/20 text-green-400' 
                                : 'bg-red-500/20 text-red-400'
                            }`}>
                              {step.label}: {platformWorkflow[step.key] ? '✓' : '✗'}
                            </span>
                          ))}
                        </div>
                        {platformWorkflow.contentType && (
                          <p className="text-[10px] dark:text-[#7A7A85] text-gray-500 mt-2 font-mono">
                            Content Type: {platformWorkflow.contentType}
                          </p>
                        )}
                      </div>
                    )}

                    {Object.keys(platformVariants).length > 0 && (
                      <div className="mb-4">
                        <p className="text-[10px] font-bold dark:text-[#B0C4FF] text-blue-600 mb-2 font-mono">RESIZED VARIANTS</p>
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(platformVariants).map(([variant, data]) => (
                            <span key={variant} className="text-[10px] px-2 py-1 rounded bg-blue-500/20 text-blue-400 font-bold font-mono">
                              {variant}: {data.width}×{data.height} ({data.aspect})
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="space-y-3">
                      {(Array.isArray(posts) ? posts : [posts]).map((post, idx) => {
                        const imageUrl = generatedImages[p.id] || generatedImages[p.id]?.[idx]
                        return (
                          <div key={idx} className="p-4 rounded-lg dark:bg-[#1A1A24] bg-gray-50 border dark:border-[#1A1A24] border-gray-200">
                            {imageUrl && <img src={imageUrl} alt={`Generated for ${p.name}`} className="w-full h-40 object-cover rounded-lg mb-3" />}
                            <p className="text-sm dark:text-[#E0E0E6] mb-3 whitespace-pre-wrap">{typeof post === 'string' ? post : post.content || post.text || ''}</p>
                            <div className="flex items-center gap-2 flex-wrap">
                              <button onClick={() => handleUseGeneratedPost(p.id, typeof post === 'string' ? post : post.content || post.text || '', imageUrl)}
                                className="text-xs font-bold dark:text-[#00FF88] text-green-600 hover:underline">USE THIS →</button>
                              <button onClick={() => copyToClipboard(typeof post === 'string' ? post : post.content || post.text || '', `${p.id}-${idx}`)}
                                className="flex items-center gap-1 text-xs dark:text-[#7A7A85] text-gray-500 hover:dark:text-[#E0E0E6]">
                                {copiedId === `${p.id}-${idx}` ? <Check size={12} /> : <Copy size={12} />}
                                {copiedId === `${p.id}-${idx}` ? 'Copied' : 'Copy'}
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === 'approval' && (
        <div className="space-y-4">
          {pendingApproval.length > 0 ? pendingApproval.map(post => (
            <div key={post.id} className="card p-4 border-l-4 border-yellow-500">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <p className="text-sm dark:text-[#E0E0E6] mb-2 font-mono">{post.content?.substring(0, 200) || 'No content'}...</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="bg-yellow-500/20 text-yellow-500 text-[10px] px-2 py-0.5 rounded font-bold uppercase">PENDING APPROVAL</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 font-bold uppercase">{post.platform}</span>
                    {post.scheduled_for && (
                      <span className="text-[10px] px-2 py-0.5 rounded dark:bg-blue-500/20 dark:text-blue-400 bg-blue-50 text-blue-600 flex items-center gap-1">
                        <Clock size={10} />
                        {new Date(post.scheduled_for).toLocaleString()}
                      </span>
                    )}
                    <span className="text-[10px] dark:text-[#7A7A85]">{new Date(post.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => handleApprove(post.id)} disabled={publishing[post.id]}
                    className="flex items-center gap-2 px-4 py-2 rounded font-bold text-xs dark:bg-[#00FF88] dark:text-[#0A0A0F] bg-green-500 text-white disabled:opacity-50">
                    {publishing[post.id] ? <Loader2 className="animate-spin" size={14} /> : <Send size={14} />}
                    {publishing[post.id] ? 'Publishing...' : 'Approve & Publish'}
                  </button>
                  <button onClick={() => handleDeleteDraft(post.id)}
                    className="p-2 rounded dark:bg-red-500/20 dark:text-red-400 hover:dark:bg-red-500/30 transition-colors"><Trash2 size={14} /></button>
                </div>
              </div>
            </div>
          )) : (
            <p className="text-center py-12 text-[#7A7A85] font-mono italic">NO PENDING APPROVALS</p>
          )}
        </div>
      )}

      {activeTab === 'queue' && (
        <div className="space-y-4">
          {queue.length > 0 ? queue.map(post => (
            <div key={post.id} className="card p-4 border-l-4 border-blue-500">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <p className="text-sm dark:text-[#E0E0E6] mb-2 font-mono">{post.content?.substring(0, 200) || post.preview?.substring(0, 200) || 'No content'}...</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="bg-blue-500/20 text-blue-400 text-[10px] px-2 py-0.5 rounded font-bold uppercase">SCHEDULED</span>
                    {post.platform && (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 font-bold uppercase">{post.platform}</span>
                    )}
                    <span className="text-[10px] px-2 py-0.5 rounded dark:bg-blue-500/20 dark:text-blue-400 bg-blue-50 text-blue-600 flex items-center gap-1">
                      <Clock size={10} />
                      {new Date(post.scheduled_for).toLocaleString()}
                    </span>
                    <span className="text-[10px] dark:text-[#7A7A85]">{new Date(post.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
            </div>
          )) : (
            <p className="text-center py-12 text-[#7A7A85] font-mono italic">NO SCHEDULED POSTS</p>
          )}
        </div>
      )}

      {activeTab === 'history' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-xs">
            <span className="dark:text-[#7A7A85]">Show:</span>
            {['24h', '7d', '30d', 'All'].map(f => (
              <button key={f} onClick={() => setHistoryFilter(f)}
                className={`px-2 py-1 rounded font-bold transition-colors ${historyFilter === f ? 'dark:bg-[#00FF88] dark:text-[#0A0A0F] bg-blue-500 text-white' : 'dark:bg-[#1A1A24] dark:text-[#7A7A85] hover:dark:bg-[#2A2A3A]'}`}>
                {f === '24h' ? '24 Hours' : f === '7d' ? '7 Days' : f === '30d' ? '30 Days' : 'All Time'}
              </button>
            ))}
          </div>
          {filteredHistory.length > 0 ? filteredHistory.map(post => (
            <div key={post.id} className="card p-4 border-l-4 border-[#00FF88]">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <p className="text-sm dark:text-[#E0E0E6] mb-2">{post.preview?.substring(0, 150) || 'Post'}...</p>
                  <div className="flex items-center gap-4">
                    <span className="text-[10px] px-2 py-0.5 rounded bg-[#00FF88]/20 text-[#00FF88] font-bold uppercase">POSTED</span>
                    <span className="text-[10px] dark:text-[#7A7A85]">{new Date(post.date || post.createdAt).toLocaleDateString()}</span>
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

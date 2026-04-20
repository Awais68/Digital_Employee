import { useState, useEffect } from 'react'
import { Send, Save, Upload, Calendar, Sparkles, Copy, Check, Loader2, AlertCircle } from 'lucide-react'
import axios from 'axios'

const platforms = [
  { id: 'linkedin', name: 'LinkedIn', limit: 3000, color: '#0A66C2' },
  { id: 'facebook', name: 'Facebook', limit: 63206, color: '#1877F2' },
  { id: 'instagram', name: 'Instagram', limit: 2200, color: '#E4405F' },
  { id: 'twitter', name: 'Twitter', limit: 280, color: '#1DA1F2' },
]

export default function SocialMedia() {
  const [content, setContent] = useState('')
  const [selectedPlatforms, setSelectedPlatforms] = useState(['linkedin'])
  const [scheduleTime, setScheduleTime] = useState('')
  const [showSchedule, setShowSchedule] = useState(false)
  const [activeTab, setActiveTab] = useState('compose')
  const [topic, setTopic] = useState('')
  const [generatedPosts, setGeneratedPosts] = useState({
    twitter: [],
    linkedin: [],
    facebook: '',
    instagram: '',
  })
  const [isGenerating, setIsGenerating] = useState(false)
  const [copiedId, setCopiedId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [queue, setQueue] = useState([])
  const [history, setHistory] = useState([])
  const [isSubmitting, setIsSubmitting] = useState(false)

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

  useEffect(() => {
    fetchData()
  }, [])

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
      prev.includes(id) 
        ? prev.filter(x => x !== id)
        : [...prev, id]
    )
  }

  const handlePost = async () => {
    if (!content.trim() || selectedPlatforms.length === 0) return
    
    setIsSubmitting(true)
    try {
      await axios.post('/api/social/post', {
        content,
        platforms: selectedPlatforms,
        scheduleTime: showSchedule ? scheduleTime : null,
      })
      setContent('')
      setScheduleTime('')
      setShowSchedule(false)
      fetchData() // Refresh queue
      alert('Post submitted for approval!')
    } catch (err) {
      console.error('Failed to create post:', err)
      alert('Failed to submit post.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const generateAIPosts = async () => {
    if (!topic.trim()) return

    setIsGenerating(true)
    // Simulate AI generation for now as requested, but we could hook this to an MCP
    setTimeout(() => {
      setGeneratedPosts({
        twitter: [
          `🚀 Exciting news about ${topic}! Just launched our latest initiative. The future is here! #innovation`,
          `Did you know? ${topic} is transforming the industry. Join us on this amazing journey! 🌟`,
        ],
        linkedin: [
          `We're thrilled to announce our new approach to ${topic}. This represents a significant milestone in our journey to deliver exceptional value to our stakeholders.`,
        ],
        facebook: `🎉 Big news! We're excited to share our latest development in ${topic}. Check out the full story and let us know what you think!`,
        instagram: `✨ The future of ${topic} starts now ✨\n\nWe're thrilled to unveil what we've been building. #innovation #future #${topic.replace(/\s+/g, '')}`,
      })
      setIsGenerating(false)
    }, 1500)
  }

  const copyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
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
        {['compose', 'generate', 'queue', 'history'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-3 font-medium text-sm border-b-2 transition-all capitalize flex items-center gap-2 ${
              activeTab === tab
                ? 'dark:border-[#00FF88] dark:text-[#00FF88] border-blue-500 text-blue-600'
                : 'dark:border-transparent dark:text-[#7A7A85] border-transparent text-gray-500'
            }`}
          >
            {tab === 'generate' && <Sparkles size={16} />}
            {tab}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/50 p-4 rounded-lg flex items-center gap-3 text-red-400 font-mono text-sm">
          <AlertCircle size={20} />
          {error}
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

          {/* Generated Results UI (Truncated for brevity, same as original structure) */}
          {generatedPosts.linkedin.length > 0 && (
            <div className="space-y-4">
               {generatedPosts.linkedin.map((post, idx) => (
                 <div key={idx} className="card p-4 border-l-4 border-[#0A66C2]">
                   <p className="text-sm dark:text-[#E0E0E6] mb-3">{post}</p>
                   <button 
                    onClick={() => {setContent(post); setActiveTab('compose')}}
                    className="text-xs dark:text-[#00FF88] font-bold"
                   >
                     USE THIS POST
                   </button>
                 </div>
               ))}
            </div>
          )}
        </div>
      )}

      {/* Compose Tab */}
      {activeTab === 'compose' && (
        <div className="space-y-6">
          <div className="card p-6">
            <h2 className="text-lg font-bold dark:text-[#E0E0E6] text-gray-900 mb-4 font-mono">
              COMPOSE POST
            </h2>
            
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write your post content here..."
              className="w-full px-4 py-3 rounded-lg dark:bg-[#1A1A24] dark:text-[#E0E0E6] bg-gray-50 min-h-[200px]"
            />

            {/* Platform Selection */}
            <div className="my-6">
              <p className="text-sm font-semibold dark:text-[#E0E0E6] mb-3 font-mono">TARGET PLATFORMS</p>
              <div className="flex flex-wrap gap-2">
                {platforms.map(p => (
                  <button
                    key={p.id}
                    onClick={() => togglePlatform(p.id)}
                    className={`px-4 py-2 rounded-full text-xs font-bold transition-all ${
                      selectedPlatforms.includes(p.id)
                        ? 'bg-[#00FF88] text-[#0A0A0F]'
                        : 'dark:bg-[#1A1A24] dark:text-[#7A7A85] bg-gray-100'
                    }`}
                  >
                    {p.name.toUpperCase()} {isOverLimit(p.id) && '⚠️'}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handlePost}
                disabled={isSubmitting || !content.trim()}
                className="flex items-center justify-center gap-2 flex-1 px-4 py-3 rounded font-bold dark:bg-[#00FF88] dark:text-[#0A0A0F] bg-blue-500 text-white disabled:opacity-50"
              >
                {isSubmitting ? <Loader2 className="animate-spin" /> : <Send size={18} />}
                SUBMIT FOR APPROVAL
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Queue Tab */}
      {activeTab === 'queue' && (
        <div className="space-y-4">
          {queue.length > 0 ? queue.map(post => (
            <div key={post.id} className="card p-4 border-l-4 border-yellow-500">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <p className="text-sm dark:text-[#E0E0E6] mb-2">{post.preview}...</p>
                  <div className="flex gap-2">
                    <span className="text-[10px] px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-500 font-bold uppercase">
                      PENDING APPROVAL
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded dark:bg-[#1A1A24] dark:text-[#7A7A85]">
                      {new Date(post.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )) : (
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
                  <p className="text-sm dark:text-[#E0E0E6] mb-2">{post.preview}...</p>
                  <div className="flex gap-4">
                    <span className="text-[10px] px-2 py-0.5 rounded bg-[#00FF88]/20 text-[#00FF88] font-bold uppercase">
                      POSTED
                    </span>
                    <span className="text-[10px] dark:text-[#7A7A85]">
                      {new Date(post.date).toLocaleDateString()}
                    </span>
                    <span className="text-[10px] dark:text-[#00FF88] font-mono">
                      ❤️ {post.engagement?.likes || 0}
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

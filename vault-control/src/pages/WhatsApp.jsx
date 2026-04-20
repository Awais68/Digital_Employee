import { useState, useEffect } from 'react'
import { Send, Zap, SkipBack, Edit3 } from 'lucide-react'

export default function WhatsApp() {
  const [conversations, setConversations] = useState([
    { id: 'wa-1', name: 'John Doe', preview: 'Hey, did you see the latest updates?', time: '10m ago', unread: true },
    { id: 'wa-2', name: 'Sarah', preview: 'Can we schedule a meeting for tomorrow?', time: '1h ago', unread: false },
    { id: 'wa-3', name: 'Team Group', preview: 'New project kickoff scheduled for next week', time: '3h ago', unread: false },
  ])
  const [selectedConversation, setSelectedConversation] = useState(null)
  const [draftReply, setDraftReply] = useState('')

  useEffect(() => {
    if (conversations.length > 0) {
      setSelectedConversation(conversations[0])
    }
  }, [])

  const stats = {
    unread: conversations.filter(c => c.unread).length,
    replied: 8,
    pending: 3,
  }

  const mockMessages = [
    { id: 1, sender: 'John', text: 'Hey, did you see the latest updates?', time: '10m ago' },
    { id: 2, sender: 'Me', text: 'No, what updates?', time: '9m ago' },
    { id: 3, sender: 'John', text: 'The new feature release is out!', time: '8m ago' },
  ]

  return (
    <div className="grid grid-cols-3 gap-4 h-full">
      {/* Left: Conversation List */}
      <div className="col-span-1 card flex flex-col">
        <div className="p-4 border-b dark:border-[#1A1A24] border-gray-200">
          <h2 className="font-bold dark:text-[#E0E0E6] text-gray-900 font-mono mb-4">
            CONVERSATIONS
          </h2>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="dark:text-[#7A7A85] text-gray-500">Unread</span>
              <span className="font-bold text-red-500">{stats.unread}</span>
            </div>
            <div className="flex justify-between">
              <span className="dark:text-[#7A7A85] text-gray-500">Replied Today</span>
              <span className="font-bold">{stats.replied}</span>
            </div>
            <div className="flex justify-between">
              <span className="dark:text-[#7A7A85] text-gray-500">Pending</span>
              <span className="font-bold text-orange-500">{stats.pending}</span>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {conversations.map(conv => (
            <div
              key={conv.id}
              onClick={() => setSelectedConversation(conv)}
              className={`
                px-4 py-3 border-b dark:border-[#1A1A24] border-gray-100 cursor-pointer transition-colors
                ${selectedConversation?.id === conv.id
                  ? 'dark:bg-[#00FF88]/10 bg-blue-50'
                  : 'hover:dark:bg-[#1A1A24] hover:bg-gray-50'
                }
              `}
            >
              <div className="flex justify-between items-start gap-2 mb-1">
                <p className={`font-semibold text-sm truncate ${conv.unread ? 'dark:text-[#E0E0E6] text-gray-900' : 'dark:text-[#7A7A85] text-gray-600'}`}>
                  {conv.name}
                </p>
                {conv.unread && <div className="w-2 h-2 rounded-full bg-red-500 mt-1 flex-shrink-0" />}
              </div>
              <p className="text-xs dark:text-[#7A7A85] text-gray-600 truncate">
                {conv.preview}
              </p>
              <p className="text-xs dark:text-[#7A7A85] text-gray-500 mt-1">
                {conv.time}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Right: Chat View */}
      <div className="col-span-2 card flex flex-col">
        {selectedConversation ? (
          <>
            {/* Header */}
            <div className="p-4 border-b dark:border-[#1A1A24] border-gray-200">
              <h3 className="font-bold dark:text-[#E0E0E6] text-gray-900 text-lg">
                {selectedConversation.name}
              </h3>
              <p className="text-xs dark:text-[#7A7A85] text-gray-500 mt-1">
                Last message {selectedConversation.time}
              </p>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {mockMessages.map(msg => (
                <div key={msg.id} className={`flex ${msg.sender === 'Me' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`
                    max-w-xs px-4 py-2 rounded-lg
                    ${msg.sender === 'Me'
                      ? 'dark:bg-[#00FF88] dark:text-[#0A0A0F] bg-blue-500 text-white'
                      : 'dark:bg-[#1A1A24] dark:text-[#E0E0E6] bg-gray-100 text-gray-900'
                    }
                  `}>
                    <p className="text-sm">{msg.text}</p>
                    <p className={`text-xs mt-1 ${msg.sender === 'Me' ? 'dark:text-[#0A0A0F]/60' : 'dark:text-[#7A7A85]'}`}>
                      {msg.time}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Draft Reply */}
            <div className="p-4 border-t dark:border-[#1A1A24] border-gray-200 space-y-3">
              <textarea
                value={draftReply}
                onChange={(e) => setDraftReply(e.target.value)}
                placeholder="Type draft reply..."
                className="w-full px-3 py-2 rounded-lg dark:bg-[#1A1A24] dark:text-[#E0E0E6] bg-gray-50 text-gray-900 resize-none"
                rows={3}
              />
              
              <div className="flex gap-2">
                <button className="flex items-center gap-2 flex-1 px-3 py-2 rounded font-medium text-sm dark:bg-green-500/20 dark:text-green-400 bg-green-50 text-green-700 hover:dark:bg-green-500/30">
                  <Send size={16} />
                  Approve & Send
                </button>
                <button className="flex items-center gap-2 px-3 py-2 rounded font-medium text-sm dark:bg-blue-500/20 dark:text-blue-400 bg-blue-50 text-blue-700">
                  <Edit3 size={16} />
                </button>
                <button className="flex items-center gap-2 px-3 py-2 rounded font-medium text-sm dark:bg-gray-500/20 dark:text-gray-400 bg-gray-50 text-gray-700">
                  <SkipBack size={16} />
                </button>
                <button className="flex items-center gap-2 px-3 py-2 rounded font-medium text-sm dark:bg-orange-500/20 dark:text-orange-400 bg-orange-50 text-orange-700">
                  <Zap size={16} />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="dark:text-[#7A7A85] text-gray-500">Select a conversation</p>
          </div>
        )}
      </div>
    </div>
  )
}

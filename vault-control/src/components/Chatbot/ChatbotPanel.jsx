import { useState, useRef, useEffect, useCallback } from 'react';

const INITIAL_MESSAGE = {
  role: 'assistant',
  content: 'Hey! I\'m your FTE assistant. Batao kya karna hai — posts, emails, todos, WhatsApp — main sab kar sakta hoon.',
};

function MessageBubble({ msg, isStreaming }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      {!isUser && (
        <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold mr-2 mt-1 shrink-0">
          FTE
        </div>
      )}
      <div
        className={`max-w-[78%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? 'bg-indigo-600 text-white rounded-br-sm'
            : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-bl-sm'
        }`}
      >
        {msg.content}
        {isStreaming && (
          <span className="inline-block w-1.5 h-4 bg-indigo-500 ml-1 animate-pulse rounded-sm" />
        )}
      </div>
    </div>
  );
}

function ActionBadge({ action }) {
  if (!action) return null;
  const labels = {
    ADD_TODO: '✅ Todo added',
    CREATE_DRAFT: '📝 Draft created',
    SEND_WHATSAPP: '💬 WhatsApp sent',
    APPROVE_DRAFT: '🚀 Draft approved',
    CHECK_EMAILS: '📧 Checking emails...',
  };
  return (
    <div className="mx-3 mb-2 px-3 py-1.5 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-lg text-xs text-green-700 dark:text-green-300">
      {labels[action.type] || `⚡ Action: ${action.type}`}
    </div>
  );
}

function ThinkingIndicator() {
  return (
    <div className="flex justify-start mb-3">
      <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold mr-2 mt-1 shrink-0">
        FTE
      </div>
      <div className="bg-gray-100 dark:bg-gray-800 rounded-2xl rounded-bl-sm px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex space-x-1">
            <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
          <span className="text-xs text-gray-500 dark:text-gray-400">Thinking...</span>
        </div>
      </div>
    </div>
  );
}

export default function ChatbotPanel({ isOpen, onClose }) {
  const [messages, setMessages] = useState([INITIAL_MESSAGE]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [lastAction, setLastAction] = useState(null);
  const [streamingText, setStreamingText] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText, isThinking]);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg = { role: 'user', content: text };
    const historyForApi = [
      ...messages.filter((m) => m.role !== 'system'),
      userMsg,
    ].map(({ role, content }) => ({ role, content }));

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);
    setIsThinking(true);
    setStreamingText('');
    setLastAction(null);

    let accumulated = '';

    try {
      const controller = new AbortController();
      abortRef.current = controller;

      const res = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: historyForApi }),
        signal: controller.signal,
      });

      if (!res.ok) throw new Error(`Server error: ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const raw = decoder.decode(value, { stream: true });
        const lines = raw.split('\n');

        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          try {
            const parsed = JSON.parse(line.slice(5).trim());
            if (parsed.type === 'thinking') {
              // Show thinking indicator
              setIsThinking(true);
            } else if (parsed.type === 'chunk') {
              setIsThinking(false);
              accumulated += parsed.text;
              // Strip <ACTION> block from display
              const displayText = accumulated.replace(/<ACTION>[\s\S]*?<\/ACTION>/g, '').trim();
              setStreamingText(displayText);
            } else if (parsed.type === 'action') {
              setLastAction(parsed.action);
            } else if (parsed.type === 'email_status') {
              // Handle email status response
              if (parsed.data && parsed.data.summary) {
                accumulated += '\n\n' + parsed.data.summary;
                const displayText = accumulated.replace(/<ACTION>[\s\S]*?<\/ACTION>/g, '').trim();
                setStreamingText(displayText);
              }
            } else if (parsed.type === 'done') {
              const finalText = accumulated.replace(/<ACTION>[\s\S]*?<\/ACTION>/g, '').trim();
              setMessages((prev) => [
                ...prev,
                { role: 'assistant', content: finalText },
              ]);
              setStreamingText('');
              setIsThinking(false);
            } else if (parsed.type === 'error') {
              throw new Error(parsed.message);
            }
          } catch {
            // partial/malformed SSE line — ignore, next read completes it
          }
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `Error: ${err.message}. Dobara try karein.`,
          },
        ]);
        setStreamingText('');
        setIsThinking(false);
      }
    } finally {
      setIsLoading(false);
      setIsThinking(false);
      inputRef.current?.focus();
    }
  }, [input, isLoading, messages]);

  const handleKeyDown = useCallback((e) => {
    // Enter key se message send ho (Shift+Enter for new line)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }, [sendMessage]);

  const clearChat = () => {
    setMessages([INITIAL_MESSAGE]);
    setLastAction(null);
    setStreamingText('');
    setIsThinking(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col w-96 h-[580px] bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-indigo-600 text-white shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-sm font-bold">
            FTE
          </div>
          <div>
            <p className="text-sm font-semibold leading-none">FTE Assistant</p>
            <p className="text-xs text-indigo-200 mt-0.5 flex items-center gap-1">
              {isLoading ? (
                <><span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" /></>
              ) : 'Online'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={clearChat}
            className="text-indigo-200 hover:text-white text-xs px-2 py-1 rounded hover:bg-white/10 transition-colors"
          >
            Clear
          </button>
          <button
            onClick={onClose}
            className="text-indigo-200 hover:text-white w-7 h-7 flex items-center justify-center rounded hover:bg-white/10 transition-colors text-lg leading-none"
          >
            ×
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
        {messages.map((msg, i) => (
          <MessageBubble key={i} msg={msg} isStreaming={false} />
        ))}
        {isThinking && <ThinkingIndicator />}
        {streamingText && (
          <MessageBubble
            msg={{ role: 'assistant', content: streamingText }}
            isStreaming={true}
          />
        )}
        <div ref={bottomRef} />
      </div>

      {/* Action badge */}
      <ActionBadge action={lastAction} />

      {/* Input */}
      <div className="px-3 pb-3 shrink-0">
        <div className="flex items-end gap-2 bg-gray-100 dark:bg-gray-800 rounded-xl px-3 py-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Kuch bhi poochein ya kaam batayein..."
            rows={1}
            className="flex-1 bg-transparent resize-none outline-none text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 max-h-24 overflow-y-auto"
            style={{ minHeight: '20px' }}
          />
          <button
            onClick={sendMessage}
            disabled={isLoading || !input.trim()}
            className="w-8 h-8 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 text-white flex items-center justify-center transition-colors shrink-0"
          >
            {isLoading ? (
              <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            )}
          </button>
        </div>
        <p className="text-center text-xs text-gray-400 mt-1.5">
          Press Enter to send • Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}

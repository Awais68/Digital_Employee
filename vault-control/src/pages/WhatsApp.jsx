import { useState, useEffect, useRef } from "react";
import {
  Send,
  Zap,
  Edit3,
  Loader2,
  AlertCircle,
  ArrowLeft,
  Phone,
  Video,
  Activity,
  MessageSquare,
  Wifi,
  WifiOff,
} from "lucide-react";
import axios from "axios";
import { useToast } from "../context/ToastContext";
import { useApp } from "../context/AppContext";

export default function WhatsApp() {
  const [conversations, setConversations] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draftReply, setDraftReply] = useState("");
  const [loading, setLoading] = useState(true);
  const [conversationsLoading, setConversationsLoading] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);
  const [mobileView, setMobileView] = useState(false);
  const [systemStatus, setSystemStatus] = useState(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [showStatusPanel, setShowStatusPanel] = useState(false);
  const { waStatus, qrData } = useApp();
  const [searchQuery, setSearchQuery] = useState("");
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);
  const { success, error: toastError } = useToast();

  const filteredConversations = conversations.filter(c =>
    !searchQuery || c.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatTime = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    const now = new Date();
    const diff = now - d;
    if (diff < 86400000 && d.getDate() === now.getDate()) {
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    if (diff < 172800000 && d.getDate() === now.getDate() - 1) {
      return "Yesterday";
    }
    return d.toLocaleDateString([], { day: "numeric", month: "short" });
  };

  const getInitials = (name) => {
    if (!name) return "?";
    return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
  };

  const fetchSystemStatus = async () => {
    setStatusLoading(true);
    try {
      const [servicesRes, healthRes] = await Promise.all([
        axios.get("/api/system/services"),
        axios.get("/api/system/health"),
      ]);
      setSystemStatus({ services: servicesRes.data, health: healthRes.data });
    } catch (err) {
      console.error("Failed to fetch system status:", err);
      setSystemStatus(null);
    } finally {
      setStatusLoading(false);
    }
  };
  const fetchConversations = async () => {
    setConversationsLoading(true);
    setError(null);
    try {
      const res = await axios.get("/api/whatsapp/live-chats", { timeout: 10000 });
      const list = res.data.chats || [];
      setConversations(list);
      if (list.length > 0 && !selectedConversation) {
        setSelectedConversation(list[0]);
        fetchMessages(list[0].id);
      }
    } catch (err) {
      console.error("fetchConversations:", err);
      // Don't show error on initial load - just show empty state
      if (conversations.length > 0) {
        setError("Failed to refresh conversations.");
      }
    } finally {
      setLoading(false);
      setConversationsLoading(false);
    }
  };

  const fetchMessages = async (convId) => {
    setMessagesLoading(true);
    try {
      const encoded = encodeURIComponent(convId);
      const res = await axios.get(`/api/whatsapp/live-messages/${encoded}`, { timeout: 10000 });
      setMessages(res.data.messages || []);
    } catch (err) {
      console.error("fetchMessages:", err);
      setMessages([]);
    } finally {
      setMessagesLoading(false);
    }
  };

  // Safety: force loading off after 8s no matter what
  useEffect(() => {
    const t = setTimeout(() => {
      setLoading(false);
      setConversationsLoading(false);
    }, 8000);
    return () => clearTimeout(t);
  }, []);

  // Load conversations on mount and when WA connects
  useEffect(() => {
    fetchConversations();
  }, [waStatus]);

  const handleSelectConversation = (conv) => {
    setSelectedConversation(conv);
    fetchMessages(conv.id);
    if (mobileView) {
      setMobileView(false);
    }
  };

  const handleBackToList = () => {
    setSelectedConversation(null);
  };

  const handleSendReply = async () => {
    if (!draftReply.trim() || !selectedConversation) return;

    setSending(true);
    try {
      const to = selectedConversation.id; // use full _serialized ID (e.g. "227581844562009@lid")
      const res = await axios.post("/api/whatsapp/send", {
        to,
        message: draftReply,
      });
      if (res.data.success) {
        success("Message sent via WhatsApp");
        setDraftReply("");
        fetchMessages(selectedConversation.id);
      } else {
        const fallbackId = selectedConversation.phone || selectedConversation.name;
        await axios.post("/api/whatsapp/reply", {
          to: fallbackId,
          content: draftReply,
        });
        success("Reply submitted for approval (offline mode)");
        setDraftReply("");
      }
    } catch {
      try {
        const fallbackId = selectedConversation.phone || selectedConversation.name;
        await axios.post("/api/whatsapp/reply", {
          to: fallbackId,
          content: draftReply,
        });
        success("Reply saved for approval (whatsapp offline)");
        setDraftReply("");
      } catch {
        toastError("Failed to send message");
      }
    } finally {
      setSending(false);
    }
  };

  const stats = {
    unread: conversations.reduce((sum, c) => sum + (c.unread || 0), 0),
    total: conversations.length,
    pending: conversations.filter((c) => c.pending).length,
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <Loader2 className="w-8 h-8 animate-spin text-[#00FF88]" />
        <p className="text-[#7A7A85] font-mono">LOADING WHATSAPP...</p>
      </div>
    );
  }

  // Mobile view: show either list or conversation
  if (mobileView) {
    if (selectedConversation) {
      return (
        <div className="flex flex-col h-[calc(100vh-140px)]">
          {/* Header */}
          <div className="p-4 border-b dark:border-[#1A1A24] border-gray-200 flex items-center gap-3">
            <button onClick={handleBackToList} className="p-1">
              <ArrowLeft
                size={20}
                className="dark:text-[#00FF88] text-blue-500"
              />
            </button>
            <div>
              <h3 className="font-bold dark:text-[#E0E0E6] text-gray-900">
                {selectedConversation.name}
              </h3>
              <p className="text-xs dark:text-[#7A7A85] text-gray-500">
                {selectedConversation.messageCount} message(s)
              </p>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#0B1929]">
            {messagesLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="animate-spin text-[#00FF88]" />
              </div>
            ) : messages.length > 0 ? (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.sender === "Me" || msg.type === "outgoing" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`
                    max-w-[85%] px-4 py-2 rounded-lg
                    ${
                      msg.sender === "Me" || msg.type === "outgoing"
                        ? "bg-[#005C4B] text-white"
                        : "dark:bg-[#202C33] dark:text-[#E0E0E6] bg-gray-100 text-gray-900"
                    }
                  `}
                  >
                    <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                    <p
                      className={`text-[10px] mt-1 text-right ${msg.sender === "Me" || msg.type === "outgoing" ? "text-white/60" : "dark:text-[#8696A0]"}`}
                    >
                      {new Date(msg.time).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="flex items-center justify-center h-full text-[#8696A0] text-sm">
                No messages
              </div>
            )}
          </div>

          {/* Reply Box */}
          <div className="p-3 border-t dark:border-[#1A1A24] border-gray-200 bg-[#0F1A2E]">
            <div className="flex gap-2">
              <input
                type="text"
                value={draftReply}
                onChange={(e) => setDraftReply(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleSendReply()}
                placeholder="Type a reply..."
                className="flex-1 px-4 py-2 rounded-full dark:bg-[#1A1A24] dark:text-[#E0E0E6] bg-gray-100 text-sm"
              />
              <button
                onClick={handleSendReply}
                disabled={sending || !draftReply.trim()}
                className="p-2 rounded-full bg-[#00FF88] text-[#0F1A2E] disabled:opacity-50"
              >
                {sending ? (
                  <Loader2 size={20} className="animate-spin" />
                ) : (
                  <Send size={20} />
                )}
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-col h-[calc(100vh-140px)]">
        {/* Header */}
        <div className="p-4 border-b dark:border-[#1A1A24] border-gray-200">
          <h2 className="font-bold dark:text-[#E0E0E6] text-gray-900 font-mono">
            WHATSAPP
          </h2>
          <div className="flex gap-4 mt-2 text-xs">
            <span className="text-red-500 font-bold">
              Unread: {stats.unread}
            </span>
            <span className="dark:text-[#7A7A85]">Total: {stats.total}</span>
          </div>
        </div>

        {/* Conversations */}
        <div className="flex-1 overflow-y-auto">
          {conversations.length > 0 ? (
            conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => handleSelectConversation(conv)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ")
                    handleSelectConversation(conv);
                }}
                className="w-full text-left px-4 py-3 border-b dark:border-[#1A1A24] border-gray-100 cursor-pointer hover:dark:bg-[#1A1A24] transition-colors"
              >
                <div className="flex justify-between items-start gap-2">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#25D366]/20 flex items-center justify-center">
                      <Phone size={18} className="text-[#25D366]" />
                    </div>
                    <div>
                      <p
                        className={`font-semibold text-sm ${conv.unread > 0 ? "dark:text-[#E0E0E6] text-gray-900" : "dark:text-[#7A7A85] text-gray-600"}`}
                      >
                        {conv.name}
                      </p>
                      <p className="text-xs dark:text-[#7A7A85] text-gray-600 truncate max-w-[200px]">
                        {conv.preview}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-xs dark:text-[#7A7A85] text-gray-500">
                      {new Date(conv.time).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    {conv.unread > 0 && (
                      <span className="w-5 h-5 rounded-full bg-[#00FF88] text-[#0F1A2E] text-[10px] font-bold flex items-center justify-center">
                        {conv.unread}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))
          ) : (
            <div className="p-8 text-center text-[#7A7A85] font-mono italic text-sm">
              NO CONVERSATIONS FOUND
            </div>
          )}
        </div>
      </div>
    );
  }

  // Desktop view
  return (
    <div className="space-y-4">
      {/* WhatsApp Connection Status Bar */}
      <div
        className={`flex items-center justify-between p-3 rounded-lg border ${
          waStatus === "connected"
            ? "dark:border-green-500/30 dark:bg-green-500/5 bg-green-50 border-green-200"
            : waStatus === "qr_pending"
              ? "dark:border-yellow-500/30 dark:bg-yellow-500/5 bg-yellow-50 border-yellow-200"
              : "dark:border-red-500/30 dark:bg-red-500/5 bg-red-50 border-red-200"
        }`}
      >
        <div className="flex items-center gap-3">
          <div
            className={`w-2.5 h-2.5 rounded-full ${
              waStatus === "connected"
                ? "bg-green-500 animate-pulse"
                : waStatus === "qr_pending"
                  ? "bg-yellow-500 animate-pulse"
                  : "bg-red-500"
            }`}
          />
          <span className="text-sm font-semibold dark:text-[#E0E0E6] text-gray-900">
            WhatsApp{" "}
            {waStatus === "connected"
              ? "Connected"
              : waStatus === "qr_pending"
                ? "QR Scan Required"
                : "Disconnected"}
          </span>
        </div>
        <button
          onClick={fetchConversations}
          className="text-xs dark:text-[#7A7A85] underline"
        >
          Refresh
        </button>
      </div>

      {/* QR Code Scanner Panel */}
      {qrData && waStatus === "qr_pending" && (
        <div className="card p-6 text-center border-2 border-yellow-500/30">
          <h3 className="text-sm font-bold dark:text-[#E0E0E6] text-gray-900 mb-4 font-mono">
            SCAN QR CODE
          </h3>
          <p className="text-xs dark:text-[#7A7A85] mb-4">
            Open WhatsApp on your phone → Linked Devices → Link a Device
          </p>
          <img
            src={qrData}
            alt="WhatsApp QR Code"
            className="mx-auto w-48 h-48 rounded-lg"
          />
          <p className="text-[10px] dark:text-[#7A7A85] mt-4 animate-pulse">
            Waiting for scan...
          </p>
        </div>
      )}

      {/* Status Report Panel */}
      {showStatusPanel && (
        <div className="card p-6 border-[#25D366]/30">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold dark:text-[#E0E0E6] text-gray-900 font-mono flex items-center gap-2">
              <Activity size={18} className="text-[#25D366]" />
              WHATSAPP SYSTEM STATUS
            </h2>
            <button
              onClick={() => setShowStatusPanel(false)}
              className="p-1.5 rounded dark:bg-[#1A1A24] hover:dark:bg-[#2A2A3A] transition-colors"
            >
              <ArrowLeft size={14} className="dark:text-[#7A7A85]" />
            </button>
          </div>

          {/* Overall Health */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="p-3 rounded-lg dark:bg-[#1A1A24] bg-gray-50">
              <p className="text-xs dark:text-[#7A7A85] text-gray-500 font-mono">
                CONVERSATIONS
              </p>
              <p className="text-2xl font-bold dark:text-[#25D366] text-green-600">
                {stats.total}
              </p>
            </div>
            <div className="p-3 rounded-lg dark:bg-[#1A1A24] bg-gray-50">
              <p className="text-xs dark:text-[#7A7A85] text-gray-500 font-mono">
                UNREAD
              </p>
              <p className="text-2xl font-bold text-red-500">{stats.unread}</p>
            </div>
            <div className="p-3 rounded-lg dark:bg-[#1A1A24] bg-gray-50">
              <p className="text-xs dark:text-[#7A7A85] text-gray-500 font-mono">
                MESSAGES
              </p>
              <p className="text-2xl font-bold dark:text-[#00FF88] text-blue-600">
                {conversations.reduce(
                  (sum, c) => sum + (c.messageCount || 0),
                  0,
                )}
              </p>
            </div>
            <div className="p-3 rounded-lg dark:bg-[#1A1A24] bg-gray-50">
              <p className="text-xs dark:text-[#7A7A85] text-gray-500 font-mono">
                PENDING REPLIES
              </p>
              <p className="text-2xl font-bold dark:text-[#FFB800] text-orange-600">
                {stats.pending}
              </p>
            </div>
          </div>

          {/* Service Status */}
          {statusLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="animate-spin text-[#25D366]" size={24} />
              <span className="text-xs dark:text-[#7A7A85] ml-2">
                Checking services...
              </span>
            </div>
          ) : systemStatus ? (
            <div className="space-y-3">
              <h3 className="text-sm font-bold dark:text-[#E0E0E6] text-gray-900 font-mono">
                SERVICE STATUS
              </h3>
              {systemStatus.services.map((svc) => (
                <div
                  key={svc.name}
                  className="flex items-center justify-between p-3 rounded-lg dark:bg-[#1A1A24] bg-gray-50"
                >
                  <div className="flex items-center gap-3">
                    {svc.status === "running" ? (
                      <Wifi size={16} className="text-[#25D366]" />
                    ) : (
                      <WifiOff size={16} className="text-red-500" />
                    )}
                    <span className="text-sm dark:text-[#E0E0E6] text-gray-900">
                      {svc.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span
                      className={`text-xs font-bold ${
                        svc.status === "running"
                          ? "text-[#25D366]"
                          : "text-red-500"
                      }`}
                    >
                      {svc.status}
                    </span>
                    <span className="text-xs dark:text-[#7A7A85] text-gray-500">
                      {svc.lastActivity}
                    </span>
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between mt-4 p-3 rounded-lg dark:bg-[#1A1A24] bg-gray-50">
                <span className="text-sm font-bold dark:text-[#E0E0E6] text-gray-900">
                  Overall Health
                </span>
                <span
                  className={`text-sm font-bold ${
                    systemStatus.health.overall === "ok"
                      ? "text-[#25D366]"
                      : systemStatus.health.overall === "warning"
                        ? "text-yellow-500"
                        : "text-red-500"
                  }`}
                >
                  {systemStatus.health.overall.toUpperCase()}
                </span>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <AlertCircle size={24} className="mx-auto mb-2 text-red-500" />
              <p className="text-xs dark:text-[#7A7A85]">
                Unable to fetch system status
              </p>
            </div>
          )}

          {/* Quick Actions */}
          <div className="flex gap-2 mt-4">
            <button
              onClick={fetchSystemStatus}
              disabled={statusLoading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium dark:bg-[#25D366]/20 dark:text-[#25D366] hover:dark:bg-[#25D366]/30 disabled:opacity-50 transition-colors"
            >
              <Zap size={14} />
              Refresh Status
            </button>
            <button
              onClick={fetchConversations}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium dark:bg-[#1A1A24] dark:text-[#E0E0E6] hover:dark:bg-[#2A2A3A] transition-colors"
            >
              <MessageSquare size={14} />
              Refresh Conversations
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4 h-[calc(100vh-140px)]">
        {/* Left: Conversation List */}
        <div className="col-span-1 card flex flex-col border-r dark:border-[#1A1A24] border-gray-200 overflow-hidden">
          {/* Header */}
          <div className="p-4 border-b dark:border-[#1A1A24] border-gray-200 bg-[#0F1A2E] space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-bold dark:text-[#E0E0E6] text-gray-900 font-mono flex items-center gap-2">
                <Phone size={18} className="text-[#25D366]" />
                WHATSAPP
              </h2>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setShowStatusPanel(!showStatusPanel)}
                  className={`p-1.5 rounded transition-colors ${showStatusPanel ? "dark:bg-[#25D366]/20" : "dark:bg-[#1A1A24] hover:dark:bg-[#2A3E5F]"}`}
                >
                  <Activity size={14} className="text-[#25D366]" />
                </button>
                <button
                  onClick={fetchConversations}
                  className="p-1.5 rounded dark:bg-[#1A1A24] hover:dark:bg-[#2A3E5F] transition-colors"
                >
                  <Loader2 size={14} className={`dark:text-[#00FF88] ${conversationsLoading ? "animate-spin" : ""}`} />
                </button>
              </div>
            </div>
            <div className="flex gap-4 text-xs">
              <span className="dark:text-[#7A7A85]">
                Total:{" "}
                <span className="font-bold dark:text-[#E0E0E6]">
                  {stats.total}
                </span>
              </span>
              <span className="text-red-500 font-bold">
                Unread: {stats.unread}
              </span>
            </div>
            {/* Search */}
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search conversations..."
                className="w-full px-3 py-1.5 rounded text-xs dark:bg-[#1A1A24] dark:text-[#E0E0E6] bg-gray-100 dark:placeholder-[#5A5A6A] outline-none"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[#7A7A85] text-xs"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Conversations */}
          <div className="flex-1 overflow-y-auto">
            {conversationsLoading && (
              <div className="p-2 text-center">
                <Loader2 size={14} className="animate-spin text-[#00FF88] mx-auto" />
              </div>
            )}

            {error && (
              <div className="p-6 text-center text-red-400 text-xs font-mono">
                <AlertCircle size={20} className="mx-auto mb-2" />
                <p className="mb-2">{error}</p>
                <button
                  onClick={fetchConversations}
                  className="px-3 py-1 rounded text-[10px] bg-[#1A1A24] hover:bg-[#2A3E5F] text-[#00FF88] transition-colors"
                >
                  RETRY
                </button>
              </div>
            )}

            {(searchQuery ? filteredConversations : conversations).length > 0 ? (
              (searchQuery ? filteredConversations : conversations).map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => handleSelectConversation(conv)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ")
                      handleSelectConversation(conv);
                  }}
                  className={`
                  w-full text-left px-4 py-3 border-b dark:border-[#1A1A24] border-gray-100 cursor-pointer transition-colors
                  ${
                    selectedConversation?.id === conv.id
                      ? "dark:bg-[#00FF88]/10 bg-blue-50"
                      : "hover:dark:bg-[#1A1A24] hover:bg-gray-50"
                  }
                `}
                >
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-xs font-bold"
                        style={{ backgroundColor: `hsl(${conv.name?.length * 40 || 0}, 60%, 30%)` }}>
                        <span className="text-white">{getInitials(conv.name)}</span>
                      </div>
                      <div className="min-w-0">
                        <p
                          className={`font-semibold text-sm ${conv.unread > 0 ? "dark:text-[#E0E0E6] text-gray-900" : "dark:text-[#7A7A85] text-gray-600"}`}
                        >
                          {conv.name}
                        </p>
                        <p className="text-xs dark:text-[#7A7A85] text-gray-600 truncate max-w-[150px]">
                          {conv.preview || "No messages yet"}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-[10px] dark:text-[#7A7A85] text-gray-500 whitespace-nowrap">
                        {formatTime(conv.time)}
                      </span>
                      {conv.unread > 0 && (
                        <span className="min-w-[18px] h-[18px] rounded-full bg-[#00FF88] text-[#0F1A2E] text-[10px] font-bold flex items-center justify-center px-1">
                          {conv.unread}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))
            ) : searchQuery ? (
              <div className="p-12 text-center text-[#7A7A85] font-mono italic text-xs">
                NO MATCHING CONVERSATIONS
              </div>
            ) : !error ? (
              <div className="p-8 text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[#25D366]/10 flex items-center justify-center">
                  <MessageSquare size={28} className="text-[#25D366]/50" />
                </div>
                <p className="text-sm font-bold dark:text-[#E0E0E6] text-gray-900 mb-2 font-mono">
                  {waStatus === 'error' ? 'WHATSAPP UNAVAILABLE' : waStatus === 'disconnected' ? 'WHATSAPP NOT CONNECTED' : 'NO CONVERSATIONS'}
                </p>
                {waStatus !== 'connected' ? (
                  <div className="text-xs dark:text-[#7A7A85] text-gray-500 space-y-1">
                    <p>WhatsApp client is not connected.</p>
                    <p className="mt-2">To set up WhatsApp:</p>
                    <ol className="list-decimal list-inside mt-1 space-y-0.5">
                      <li>Set <code className="dark:bg-[#1A1A24] bg-gray-200 px-1 rounded">WHATSAPP_SESSION_PATH</code> in .env</li>
                      <li>Restart the server to generate a QR code</li>
                      <li>Scan QR with WhatsApp → Linked Devices</li>
                    </ol>
                  </div>
                ) : (
                  <p className="text-xs dark:text-[#7A7A85] text-gray-500">
                    No WhatsApp conversations found. Messages will appear here when received.
                  </p>
                )}
                <button
                  onClick={fetchConversations}
                  className="mt-4 px-4 py-2 rounded-lg text-xs font-medium dark:bg-[#1A1A24] dark:text-[#00FF88] bg-gray-100 text-blue-600 hover:dark:bg-[#2A3E5F] transition-colors"
                >
                  Retry
                </button>
              </div>
            ) : null}
          </div>
        </div>

        {/* Right: Chat View */}
        <div className="col-span-2 card flex flex-col bg-[#0B1929] overflow-hidden">
          {selectedConversation ? (
            <>
              {/* Header */}
              <div className="p-4 border-b dark:border-[#1A1A24] border-gray-200 bg-[#0F1A2E] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#25D366]/20 flex items-center justify-center">
                    <Phone size={18} className="text-[#25D366]" />
                  </div>
                  <div>
                    <h3 className="font-bold dark:text-[#E0E0E6] text-gray-900">
                      {selectedConversation.name}
                    </h3>
                    <p className="text-xs dark:text-[#8696A0] text-gray-500">
                      {selectedConversation.messageCount} message(s)
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button className="p-2 rounded-full dark:bg-[#1A1A24] hover:dark:bg-[#2A3E5F] transition-colors">
                    <Video size={18} className="dark:text-[#00FF88]" />
                  </button>
                  <button className="p-2 rounded-full dark:bg-[#1A1A24] hover:dark:bg-[#2A3E5F] transition-colors">
                    <Phone size={18} className="dark:text-[#00FF88]" />
                  </button>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#0B1929]">
                {messagesLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="animate-spin text-[#00FF88]" />
                  </div>
                ) : messages.length > 0 ? (
                  messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.sender === "Me" || msg.type === "outgoing" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`
                      max-w-md px-4 py-2 rounded-lg
                      ${
                        msg.sender === "Me" || msg.type === "outgoing"
                          ? "bg-[#005C4B] text-white"
                          : "dark:bg-[#202C33] dark:text-[#E0E0E6] bg-gray-100 text-gray-900"
                      }
                    `}
                      >
                        <p className="text-sm whitespace-pre-wrap">
                          {msg.text}
                        </p>
                        <p
                          className={`text-[10px] mt-1 text-right ${msg.sender === "Me" || msg.type === "outgoing" ? "text-white/60" : "dark:text-[#8696A0]"}`}
                        >
                          {new Date(msg.time).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center text-[#8696A0]">
                      <Phone size={48} className="mx-auto mb-4 opacity-30" />
                      <p className="text-sm">No messages to display</p>
                      <p className="text-xs mt-1">Messages will appear here</p>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Reply Box */}
              <div className="p-3 border-t dark:border-[#1A1A24] border-gray-200 bg-[#0F1A2E]">
                <div className="flex gap-2">
                  <button className="p-2 rounded-full dark:bg-[#1A1A24] hover:dark:bg-[#2A3E5F] transition-colors">
                    <Edit3 size={18} className="dark:text-[#00FF88]" />
                  </button>
                  <input
                    type="text"
                    value={draftReply}
                    onChange={(e) => setDraftReply(e.target.value)}
                    onKeyPress={(e) => e.key === "Enter" && handleSendReply()}
                    placeholder="Type a reply..."
                    className="flex-1 px-4 py-2 rounded-full dark:bg-[#1A1A24] dark:text-[#E0E0E6] bg-gray-100 text-sm"
                  />
                  <button
                    onClick={handleSendReply}
                    disabled={sending || !draftReply.trim()}
                    className="p-2 rounded-full bg-[#00FF88] text-[#0F1A2E] disabled:opacity-50 hover:opacity-90 transition-opacity"
                  >
                    {sending ? (
                      <Loader2 size={20} className="animate-spin" />
                    ) : (
                      <Send size={20} />
                    )}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-[#8696A0]">
              <Phone size={64} className="mb-4 opacity-20" />
              <p className="text-lg font-semibold mb-2">WhatsApp Dashboard</p>
              <p className="text-sm">Select a conversation to view messages</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

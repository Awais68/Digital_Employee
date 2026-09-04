import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import axios from "axios";

const AppCtx = createContext(null);

export function AppProvider({ children }) {
  const [waStatus, setWaStatus] = useState("disconnected");
  const [qrData, setQrData] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef(null);
  const reconnectRef = useRef(null);

  const addNotification = useCallback((raw) => {
    // Defensive: a malformed WS frame must never throw inside a state updater.
    // An uncaught throw here unmounts the whole React root (blank screen), because
    // AppProvider sits above every ErrorBoundary.
    if (!raw || typeof raw !== "object") return;
    const notif = {
      id: raw.id ?? `n_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      title: raw.title ?? "Notification",
      message: raw.message ?? "",
      category: raw.category ?? "info",
      read: raw.read ?? false,
      timestamp: raw.timestamp ?? new Date().toISOString(),
      ...raw,
    };
    setNotifications((prev) => {
      if (prev.some((n) => n.id === notif.id)) return prev;
      const updated = [notif, ...prev].slice(0, 100);
      setUnreadCount(updated.filter((n) => !n.read).length);
      try {
        if (
          typeof Notification !== "undefined" &&
          Notification.permission === "granted" &&
          !document.hasFocus()
        ) {
          new Notification(notif.title, {
            body: notif.message,
            icon: "/favicon.ico",
            tag: notif.id,
          });
        }
      } catch {
        /* browser notification is best-effort */
      }
      return updated;
    });
  }, []);

  const wsReconnectDelay = useRef(1000);

  const connectWS = useCallback(() => {
    const envUrl = import.meta.env.VITE_WS_URL;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(
      envUrl ? `${envUrl}/ws` : `${protocol}//${location.host}/ws`,
    );
    wsRef.current = ws;

    ws.onopen = () => {
      setWsConnected(true);
      wsReconnectDelay.current = 1000;
      console.log("[AppContext] WebSocket connected");
      clearTimeout(reconnectRef.current);
    };

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        switch (data.type) {
          case "whatsapp:status":
            setWaStatus(data.status);
            if (data.status === "connected") setQrData(null);
            break;
          case "whatsapp:qr":
            setQrData(data.qr);
            setWaStatus("qr_pending");
            break;
          case "notification":
            // Accept both shapes: { notification: {...} } and a flat payload.
            addNotification(data.notification ?? data);
            break;
          case "todo:new":
            window.dispatchEvent(new CustomEvent("todo:refresh"));
            break;
          case "approval:new":
            window.dispatchEvent(new CustomEvent("approval:refresh"));
            break;
        }
      } catch {}
    };

    ws.onclose = () => {
      setWsConnected(false);
      const delay = Math.min(wsReconnectDelay.current, 15000);
      reconnectRef.current = setTimeout(connectWS, delay);
      wsReconnectDelay.current = delay * 1.5;
    };

    ws.onerror = () => ws.close();
  }, [addNotification]);

  useEffect(() => {
    const apiTimeout = { current: null };

    const fetchNotifications = () => {
      axios
        .get("/api/notifications", { timeout: 8000 })
        .then((r) => {
          setNotifications(r.data || []);
          setUnreadCount((r.data || []).filter((n) => !n.read).length);
        })
        .catch(() => {});
    };

    const fetchWhatsAppStatus = () => {
      axios
        .get("/api/whatsapp/status", { timeout: 8000 })
        .then((r) => {
          setWaStatus(r.data.status);
          if (r.data.qr) setQrData(r.data.qr);
        })
        .catch(() => {});
    };

    fetchNotifications();
    fetchWhatsAppStatus();

    if (Notification.permission === "default") {
      Notification.requestPermission();
    }

    connectWS();

    return () => {
      wsRef.current?.close();
      clearTimeout(reconnectRef.current);
      clearTimeout(apiTimeout.current);
    };
  }, [connectWS]);

  const markAllRead = useCallback(() => {
    axios.post("/api/notifications/read-all").catch(() => {});
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
  }, []);

  return (
    <AppCtx.Provider
      value={{
        waStatus,
        qrData,
        notifications,
        unreadCount,
        addNotification,
        markAllRead,
        wsConnected,
      }}
    >
      {children}
    </AppCtx.Provider>
  );
}

export const useApp = () => useContext(AppCtx);

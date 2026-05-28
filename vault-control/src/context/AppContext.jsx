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

  const addNotification = useCallback((notif) => {
    setNotifications((prev) => {
      if (prev.find((n) => n.id === notif.id)) return prev;
      const updated = [notif, ...prev].slice(0, 100);
      setUnreadCount(updated.filter((n) => !n.read).length);
      if (Notification.permission === "granted" && !document.hasFocus()) {
        new Notification(notif.title, {
          body: notif.message,
          icon: "/favicon.ico",
          tag: notif.id,
        });
      }
      return updated;
    });
  }, []);

  const connectWS = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsConnected(true);
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
            addNotification(data.notification);
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
      reconnectRef.current = setTimeout(connectWS, 3000);
    };

    ws.onerror = () => ws.close();
  }, [addNotification]);

  useEffect(() => {
    axios
      .get("/api/notifications")
      .then((r) => {
        setNotifications(r.data || []);
        setUnreadCount((r.data || []).filter((n) => !n.read).length);
      })
      .catch(() => {});

    axios
      .get("/api/whatsapp/status")
      .then((r) => {
        setWaStatus(r.data.status);
        if (r.data.qr) setQrData(r.data.qr);
      })
      .catch(() => {});

    if (Notification.permission === "default") {
      Notification.requestPermission();
    }

    connectWS();

    return () => {
      wsRef.current?.close();
      clearTimeout(reconnectRef.current);
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

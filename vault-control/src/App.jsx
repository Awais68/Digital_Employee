import { useState, useEffect, lazy, Suspense } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ToastProvider, useToast } from "./context/ToastContext";
import { AppProvider } from "./context/AppContext";
import { ErrorBoundary } from "./components/ErrorBoundary";
import Sidebar from "./components/Sidebar";
import TopBar from "./components/TopBar";
import ChatbotPanel from "./components/Chatbot/ChatbotPanel";
import ChatbotButton from "./components/Chatbot/ChatbotButton";
import { Loader2, Lock, AlertCircle } from "lucide-react";
import { usePageRoute } from "./hooks/usePageRoute";

// Lazy load page components to reduce initial bundle size (bundle-dynamic-imports)
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Approvals = lazy(() => import("./pages/Approvals"));
const Emails = lazy(() => import("./pages/Emails"));
const WhatsApp = lazy(() => import("./pages/WhatsApp"));
const Todos = lazy(() => import("./pages/Todos"));
const SocialMedia = lazy(() => import("./pages/SocialMedia"));
const Accounting = lazy(() => import("./pages/Accounting"));
const OracleCloud = lazy(() => import("./pages/OracleCloud"));
const Logs = lazy(() => import("./pages/Logs"));
const VaultEditor = lazy(() => import("./pages/VaultEditor"));
const AdminPanel = lazy(() => import("./pages/AdminPanel"));

// Loading fallback for lazy-loaded pages
const PageLoader = () => (
  <div className="flex items-center justify-center h-64">
    <Loader2 className="w-8 h-8 animate-spin text-[#00FF88]" />
  </div>
);

function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [errorType, setErrorType] = useState(null);
  const { login, register } = useAuth();
  useToast();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setErrorType(null);

    try {
      if (isRegister) {
        if (!email) {
          setError("Email is required");
          return;
        }
        await register(username, email, password);
      } else {
        await login(username, password);
      }
    } catch (err) {
      const message = err.message || "Authentication failed";
      const isRetryable = message.toLowerCase().includes('try again') || message.toLowerCase().includes('unavailable') || message.toLowerCase().includes('too many');
      setError(message);
      setErrorType(isRetryable ? 'retryable' : 'auth');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen dark:bg-[#0F1A2E] bg-[#F9FAFB] flex items-center justify-center">
      <div className="w-full max-w-md p-8">
        <div className="card p-8">
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-full dark:bg-[#00FF88]/10 bg-blue-50 flex items-center justify-center mx-auto mb-4">
              <Lock size={32} className="dark:text-[#00FF88] text-blue-500" />
            </div>
            <h1 className="text-2xl font-bold dark:text-[#E0E0E6] text-gray-900">
              Digital FTE 24/7
            </h1>
            <p className="text-sm dark:text-[#7A7A85] text-gray-600 mt-2">
              {isRegister ? "Create your account" : "Sign in to continue"}
            </p>
          </div>

          {error && (
            <div className={`mb-4 p-3 rounded-lg text-sm flex items-start gap-2 ${
              errorType === 'retryable'
                ? 'bg-yellow-500/10 border border-yellow-500/50 text-yellow-400'
                : 'bg-red-500/10 border border-red-500/50 text-red-400'
            }`}>
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="username-input" className="block text-xs dark:text-[#7A7A85] text-gray-600 mb-1 font-semibold">
                USERNAME
              </label>
              <input
                id="username-input"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-3 rounded-lg dark:bg-[#1A1A24] dark:text-[#E0E0E6] bg-gray-50 text-gray-900"
                placeholder="Enter username"
                required
              />
            </div>

            {isRegister && (
              <div>
                <label htmlFor="email-input" className="block text-xs dark:text-[#7A7A85] text-gray-600 mb-1 font-semibold">
                  EMAIL
                </label>
                <input
                  id="email-input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg dark:bg-[#1A1A24] dark:text-[#E0E0E6] bg-gray-50 text-gray-900"
                  placeholder="Enter email"
                  required
                />
              </div>
            )}

            <div>
              <label htmlFor="password-input" className="block text-xs dark:text-[#7A7A85] text-gray-600 mb-1 font-semibold">
                PASSWORD
              </label>
              <input
                id="password-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-lg dark:bg-[#1A1A24] dark:text-[#E0E0E6] bg-gray-50 text-gray-900"
                placeholder="Enter password"
                required
                minLength={6}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-lg font-bold dark:bg-[#00FF88] dark:text-[#0A0A0F] bg-blue-500 text-white disabled:opacity-50 transition-all"
            >
              {loading ? (
                <Loader2 className="animate-spin mx-auto" size={20} />
              ) : isRegister ? (
                "CREATE ACCOUNT"
              ) : (
                "SIGN IN"
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={() => {
                setIsRegister(!isRegister);
                setError("");
              }}
              className="text-sm dark:text-[#00FF88] text-blue-500 hover:underline"
            >
              {isRegister
                ? "Already have an account? Sign in"
                : "Don't have an account? Register"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AppContent() {
  // URL-backed, so the page survives a refresh, the Back button works, and a
  // link to a specific page can be shared. See hooks/usePageRoute.js.
  const [currentPage, setCurrentPage] = usePageRoute();
  const [chatOpen, setChatOpen] = useState(false);
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem("theme");
    if (saved) return saved === "dark";
    if (typeof window !== "undefined") {
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
    return true;
  });
  const { isAuthenticated, loading: authLoading } = useAuth();
  const isAuthEnabled = import.meta.env.VITE_ENABLE_AUTH === "true";

  // Request notification permission
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }, [isDark]);

  if (authLoading) {
    return (
      <div className="min-h-screen dark:bg-[#0F1A2E] bg-[#F9FAFB] flex items-center justify-center">
        <Loader2 className="w-12 h-12 animate-spin text-[#00FF88]" />
      </div>
    );
  }

  if (!isAuthEnabled) {
    // Dev mode: bypass login screen
  } else if (!isAuthenticated) {
    return <LoginPage />;
  }

  const renderPage = () => {
    switch (currentPage) {
      case "dashboard":
        return <ErrorBoundary fallbackTitle="Dashboard Error"><Dashboard setCurrentPage={setCurrentPage} /></ErrorBoundary>;
      case "approvals":
        return <ErrorBoundary fallbackTitle="Approvals Error"><Approvals /></ErrorBoundary>;
      case "emails":
        return <ErrorBoundary fallbackTitle="Emails Error"><Emails /></ErrorBoundary>;
      case "whatsapp":
        return <ErrorBoundary fallbackTitle="WhatsApp Error"><WhatsApp /></ErrorBoundary>;
      case "todos":
        return <ErrorBoundary fallbackTitle="Todos Error"><Todos /></ErrorBoundary>;
      case "social":
        return <ErrorBoundary fallbackTitle="Social Media Error"><SocialMedia /></ErrorBoundary>;
      case "accounting":
        return <ErrorBoundary fallbackTitle="Accounting Error"><Accounting /></ErrorBoundary>;
      case "oracle":
        return <ErrorBoundary fallbackTitle="Oracle Cloud Error"><OracleCloud /></ErrorBoundary>;
      case "logs":
        return <ErrorBoundary fallbackTitle="Logs Error"><Logs /></ErrorBoundary>;
      case "vault":
        return <ErrorBoundary fallbackTitle="Vault Editor Error"><VaultEditor /></ErrorBoundary>;
      case "admin":
        return <ErrorBoundary fallbackTitle="Admin Panel Error"><AdminPanel /></ErrorBoundary>;
      default:
        return <ErrorBoundary fallbackTitle="Dashboard Error"><Dashboard setCurrentPage={setCurrentPage} /></ErrorBoundary>;
    }
  };

  return (
    <div
      className={`min-h-screen transition-colors duration-300 ${isDark ? "dark bg-[#0F1A2E]" : "bg-[#F9FAFB]"}`}
    >
      <div className="flex h-screen">
        <Sidebar currentPage={currentPage} setCurrentPage={setCurrentPage} />

        <div className="flex-1 flex flex-col overflow-hidden">
          <TopBar
            isDark={isDark}
            setIsDark={setIsDark}
            currentPage={currentPage}
            setCurrentPage={setCurrentPage}
          />

          <main className="flex-1 overflow-auto">
            <div className="p-3 md:p-6">
              <Suspense fallback={<PageLoader />}>
                {renderPage()}
              </Suspense>
            </div>
          </main>
        </div>
      </div>

      <ChatbotButton onClick={() => setChatOpen(!chatOpen)} isOpen={chatOpen} />
      <ChatbotPanel isOpen={chatOpen} onClose={() => setChatOpen(false)} />
    </div>
  );
}

export default function App() {
  return (
    // Root-level boundary: without it, a throw inside any provider unmounts the
    // entire React tree and the user sees a blank screen with no way to recover.
    <ErrorBoundary fallbackTitle="Application Error">
      <AuthProvider>
        <ToastProvider>
          <AppProvider>
            <AppContent />
          </AppProvider>
        </ToastProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

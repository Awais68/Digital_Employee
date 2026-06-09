export default function ChatbotButton({ onClick, isOpen }) {
  return (
    <button
      onClick={onClick}
      className="fixed bottom-4 right-4 z-40 w-14 h-14 rounded-full bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white shadow-lg shadow-indigo-500/40 flex items-center justify-center transition-all duration-200"
      aria-label="FTE Assistant"
    >
      {isOpen ? (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      ) : (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
        </svg>
      )}
    </button>
  );
}

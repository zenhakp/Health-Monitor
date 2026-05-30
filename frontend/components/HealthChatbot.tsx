"use client";
import { useState, useRef, useEffect } from "react";
import { api } from "@/lib/api";
import { Spinner } from "@/components/ui/Spinner";
import { MessageCircle, X, Send, Bot, User, Minimize2 } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  isError?: boolean;
}

const QUICK_QUESTIONS = [
  "What does my heart rate mean?",
  "Is my SpO₂ level normal?",
  "When should I call my doctor?",
  "What should I do if I feel chest pain?",
];

export default function HealthChatbot({
  latestVitals,
}: {
  latestVitals?: any;
}) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Hi! I'm your VitalWatch health assistant. I can help you understand your vitals, answer health questions, and guide you on when to seek care. How can I help you today?",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [botStatus, setBotStatus] = useState<"online" | "checking" | "offline">("checking");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
  // Check if chatbot is available
    api.post("/api/v1/chatbot/chat", { message: "ping", vitals_context: {} })
      .then(() => setBotStatus("online"))
      .catch(err => {
        if (err.response?.status === 503) setBotStatus("offline");
        else setBotStatus("online"); // other errors mean it's reachable
      });
  }, []);


  const sendMessage = async (text?: string) => {
    const messageText = text || input.trim();
    if (!messageText || loading) return;

    const userMsg: Message = {
      role: "user",
      content: messageText,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await api.post("/api/v1/chatbot/chat", {
        message: messageText,
        vitals_context: latestVitals || {},
      });
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: res.data.response,
          timestamp: new Date(),
        },
      ]);
      setBotStatus("online");
    } catch (err: any) {
      const status = err.response?.status;
      const detail = err.response?.data?.detail || "";

      let message = "";

      if (status === 503 || detail.includes("Groq")) {
        message = "The AI health assistant is temporarily offline. For medical questions or concerns, please message your doctor directly using the messaging feature, or contact your care team.";
      } else if (status === 401) {
        message = "Your session has expired. Please sign in again to continue.";
      } else if (status === 429) {
        message = "The assistant is experiencing high demand. Please wait 30 seconds before trying again.";
      } else {
        message = "The health assistant couldn't process your request right now. If you have an urgent health concern, please contact your doctor through the messaging feature or call emergency services.";
      }

      setMessages(prev => [...prev, {
        role: "assistant",
        content: message,
        timestamp: new Date(),
        isError: true,
      }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Chatbot floating button — bottom right, blue */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 w-14 h-14 bg-blue-600 hover:bg-blue-700 rounded-full shadow-xl flex items-center justify-center transition-all hover:scale-105 z-40 group"
          title="Health Assistant"
        >
          <Bot className="w-6 h-6 text-white" />
          <span className="absolute -top-8 right-0 bg-dark-900 text-white text-xs px-2 py-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap border border-dark-600">
            Health Assistant
          </span>
          <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-dark-950" />
        </button>
      )}

      {/* Chat window */}
      {open && (
        <div className="fixed bottom-6 right-6 w-96 h-[500px] bg-dark-900 border border-dark-600 rounded-2xl shadow-2xl flex flex-col z-40 animate-slide-in-up">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-dark-600">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-500/10 rounded-xl flex items-center justify-center">
                <Bot className="w-4 h-4 text-blue-400" />
              </div>
              <div>
                <div className="text-sm font-medium text-white">
                  Health Assistant
                </div>
                <div className={`text-xs flex items-center gap-1 ${
                  botStatus === "online" ? "text-green-400" :
                  botStatus === "offline" ? "text-orange-400" : "text-gray-400"
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    botStatus === "online" ? "bg-green-400" :
                    botStatus === "offline" ? "bg-orange-400" : "bg-gray-400 animate-pulse"
                  }`} />
                  {botStatus === "online" ? "Online" : botStatus === "offline" ? "Unavailable" : "Connecting..."}
                </div>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-gray-500 hover:text-gray-300 p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
              >
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                    msg.role === "assistant"
                      ? "bg-blue-500/10"
                      : "bg-gray-500/10"
                  }`}
                >
                  {msg.role === "assistant" ? (
                    <Bot className="w-3 h-3 text-blue-400" />
                  ) : (
                    <User className="w-3 h-3 text-gray-400" />
                  )}
                </div>
                <div className={`px-3 py-2 rounded-2xl text-xs leading-relaxed ${
                  msg.role === "user"
                    ? "bg-blue-600 text-white rounded-tr-sm"
                    : msg.isError
                    ? "bg-orange-500/10 text-orange-300 border border-orange-500/20 rounded-tl-sm"
                    : "bg-dark-800 text-gray-200 rounded-tl-sm"
                }`}>
                  {msg.isError && <span className="block text-orange-400 font-medium mb-1 text-xs">ℹ Assistant Unavailable</span>}
                  {msg.content}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex gap-2">
                <div className="w-6 h-6 bg-blue-500/10 rounded-full flex items-center justify-center">
                  <Bot className="w-3 h-3 text-blue-400" />
                </div>
                <div className="bg-dark-800 rounded-2xl rounded-tl-sm px-3 py-2">
                  <div className="flex gap-1">
                    <span
                      className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce"
                      style={{ animationDelay: "0ms" }}
                    />
                    <span
                      className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce"
                      style={{ animationDelay: "150ms" }}
                    />
                    <span
                      className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce"
                      style={{ animationDelay: "300ms" }}
                    />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick questions */}
          {messages.length === 1 && (
            <div className="px-4 pb-2">
              <div className="text-xs text-gray-600 mb-2">
                Suggested questions
              </div>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    onClick={() => sendMessage(q)}
                    className="text-xs bg-dark-800 hover:bg-dark-700 text-gray-400 hover:text-white border border-dark-600 px-2.5 py-1 rounded-full transition-all"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input */}
          <div className="p-3 border-t border-dark-600">
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) =>
                  e.key === "Enter" && !e.shiftKey && sendMessage()
                }
                placeholder="Ask about your health..."
                className="flex-1 bg-dark-800 border border-dark-600 rounded-xl px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-all"
              />
              <button
                onClick={() => sendMessage()}
                disabled={loading || !input.trim()}
                className="w-8 h-8 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl flex items-center justify-center transition-all flex-shrink-0"
              >
                <Send className="w-3.5 h-3.5 text-white" />
              </button>
            </div>
            <div className="text-xs text-gray-700 mt-1.5 text-center">
              Not medical advice — always consult your doctor
            </div>
          </div>
        </div>
      )}
    </>
  );
}

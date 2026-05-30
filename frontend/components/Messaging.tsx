"use client";
import { useState, useEffect, useRef } from "react";
import { api } from "@/lib/api";
import { getStoredUser } from "@/lib/auth";
import { Spinner } from "@/components/ui/Spinner";
import toast from "react-hot-toast";
import { formatTime, parseDate } from "@/lib/utils";
import { MessageCircle, Send, X, ChevronLeft } from "lucide-react";
import Cookies from "js-cookie";

interface Contact {
  id: string;
  full_name: string;
  email: string;
  role: string;
  last_seen: string | null;
  avatar_url: string;
  unread_count: number;
}

interface Message {
  id: string;
  sender_id: string;
  sender_name: string;
  content: string;
  is_read: boolean;
  created_at: string;
}

function parseLastSeen(lastSeen: string | null) {
  if (!lastSeen) return NaN;
  try {
    return parseDate(lastSeen).getTime();
  } catch {
    return NaN;
  }
}

function getOnlineStatus(
  lastSeen: string | null,
): "online" | "idle" | "offline" {
  const timestamp = parseLastSeen(lastSeen);
  if (!Number.isFinite(timestamp)) return "offline";
  const diff = (Date.now() - timestamp) / 1000 / 60;
  if (diff < 10) return "online";
  if (diff < 30) return "idle";
  return "offline";
}

const STATUS_COLORS = {
  online: "bg-green-500",
  idle: "bg-yellow-500",
  offline: "bg-gray-600",
};

const STATUS_LABELS = {
  online: "Online",
  idle: "Away",
  offline: "Offline",
};

export default function Messaging() {
  const user = getStoredUser();
  const [open, setOpen] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [totalUnread, setTotalUnread] = useState(0);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!user) return;
    loadContacts();

    // SSE for incoming messages
    const es = new EventSource(
      `${process.env.NEXT_PUBLIC_API_URL}/api/v1/messages/stream`,
    );
    esRef.current = es;
    es.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "message") {
        setContacts((prev) =>
          prev.map((c) =>
            c.id === data.sender_id
              ? { ...c, unread_count: c.unread_count + 1 }
              : c,
          ),
        );
        setTotalUnread((n) => n + 1);
        if (selectedContact?.id === data.sender_id) {
          setMessages((prev) => [...prev, data]);
        } else {
          toast(`💬 ${data.sender_name}: ${data.content.slice(0, 40)}...`);
        }
      }
    };

    // Refresh contacts every 30s for status updates
    const interval = setInterval(loadContacts, 30000);
    return () => {
      es.close();
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const total = contacts.reduce((sum, c) => sum + c.unread_count, 0);
    setTotalUnread(total);
  }, [contacts]);

  const loadContacts = async () => {
    try {
      const res = await api.get("/api/v1/messages/contacts");
      setContacts(res.data);
    } catch {}
  };

  const selectContact = async (contact: Contact) => {
    setSelectedContact(contact);
    setLoadingMessages(true);
    // Reset unread for this contact
    setContacts((prev) =>
      prev.map((c) => (c.id === contact.id ? { ...c, unread_count: 0 } : c)),
    );
    try {
      const res = await api.get(`/api/v1/messages/conversation/${contact.id}`);
      setMessages(res.data);
    } catch {
      toast.error("Failed to load conversation");
    } finally {
      setLoadingMessages(false);
    }
  };

  const sendMessage = async () => {
    if (!selectedContact || !input.trim() || sending) return;
    const content = input.trim();
    setSending(true);
    setInput("");
    try {
      const res = await api.post("/api/v1/messages/send", {
        receiver_id: selectedContact.id,
        content,
      });
      setMessages((prev) => [...prev, res.data]);
    } catch {
      toast.error("Failed to send message");
      setInput(content);
    } finally {
      setSending(false);
    }
  };

  const initials = (name: string) =>
    name
      .split(" ")
      .filter((n) => n !== "Dr.")
      .map((n) => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-24 right-6 w-12 h-12 bg-dark-800 hover:bg-dark-700 border border-dark-500 hover:border-blue-500/40 rounded-2xl shadow-lg flex items-center justify-center transition-all z-40 group"
          title="Messages"
        >
          <MessageCircle className="w-5 h-5 text-gray-300" />
          <span className="absolute -top-8 right-0 bg-dark-900 text-white text-xs px-2 py-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap border border-dark-600">
            Messages
          </span>
          {totalUnread > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-medium px-1">
              {totalUnread > 9 ? "9+" : totalUnread}
            </span>
          )}
        </button>
      )}

      {open && (
        <div className="fixed bottom-6 right-20 w-80 h-[500px] bg-dark-900 border border-dark-600 rounded-2xl shadow-2xl flex flex-col z-40 animate-slide-in-up">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-dark-600 flex-shrink-0">
            <div className="flex items-center gap-2">
              {selectedContact && (
                <button
                  onClick={() => setSelectedContact(null)}
                  className="text-gray-500 hover:text-gray-300 p-1 -ml-1"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              )}
              <MessageCircle className="w-4 h-4 text-blue-400" />
              <div>
                <div className="text-sm font-medium text-white">
                  {selectedContact ? selectedContact.full_name : "Messages"}
                </div>
                {selectedContact && (
                  <div
                    className={`text-xs flex items-center gap-1 ${
                      getOnlineStatus(selectedContact.last_seen) === "online"
                        ? "text-green-400"
                        : getOnlineStatus(selectedContact.last_seen) === "idle"
                          ? "text-yellow-400"
                          : "text-gray-500"
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${STATUS_COLORS[getOnlineStatus(selectedContact.last_seen)]}`}
                    />
                    {STATUS_LABELS[getOnlineStatus(selectedContact.last_seen)]}
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-gray-500 hover:text-gray-300 p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {!selectedContact ? (
            /* Contact list */
            <div className="flex-1 overflow-y-auto p-2">
              {contacts.length === 0 ? (
                <div className="text-center py-8 text-xs text-gray-600 px-4">
                  No {user?.role === "patient" ? "doctors" : "patients"}{" "}
                  registered yet
                </div>
              ) : (
                contacts.map((contact) => {
                  const status = getOnlineStatus(contact.last_seen);
                  return (
                    <button
                      key={contact.id}
                      onClick={() => selectContact(contact)}
                      className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-dark-800 transition-colors text-left"
                    >
                      <div className="relative flex-shrink-0">
                        {contact.avatar_url ? (
                          <img
                            src={contact.avatar_url}
                            alt={contact.full_name}
                            className="w-10 h-10 rounded-full object-cover"
                          />
                        ) : (
                          <div
                            className={`w-10 h-10 rounded-full flex items-center justify-center ${
                              contact.role === "doctor"
                                ? "bg-blue-500/10"
                                : "bg-green-500/10"
                            }`}
                          >
                            <span
                              className={`text-xs font-semibold ${
                                contact.role === "doctor"
                                  ? "text-blue-400"
                                  : "text-green-400"
                              }`}
                            >
                              {initials(contact.full_name)}
                            </span>
                          </div>
                        )}
                        <span
                          className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-dark-900 ${STATUS_COLORS[status]}`}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-white truncate font-medium">
                            {contact.full_name}
                          </span>
                          {contact.unread_count > 0 && (
                            <span className="ml-2 min-w-5 h-5 bg-blue-600 text-white text-xs rounded-full flex items-center justify-center font-medium px-1 flex-shrink-0">
                              {contact.unread_count > 9
                                ? "9+"
                                : contact.unread_count}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 capitalize">
                          {contact.role}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          ) : (
            <>
              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {loadingMessages ? (
                  <div className="flex justify-center py-8">
                    <Spinner />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="text-center py-8 text-xs text-gray-600">
                    No messages yet — say hello!
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isMe = msg.sender_id === user?.id;
                    return (
                      <div
                        key={msg.id}
                        className={`flex ${isMe ? "flex-row-reverse" : ""} gap-2 items-end`}
                      >
                        {!isMe && (
                          <div className="w-6 h-6 bg-dark-700 rounded-full flex items-center justify-center flex-shrink-0">
                            <span className="text-xs text-gray-400">
                              {initials(msg.sender_name)}
                            </span>
                          </div>
                        )}
                        <div
                          className={`max-w-[78%] flex flex-col ${isMe ? "items-end" : "items-start"}`}
                        >
                          <div
                            className={`px-3 py-2 rounded-2xl text-xs leading-relaxed break-words ${
                              isMe
                                ? "bg-blue-600 text-white rounded-tr-sm"
                                : "bg-dark-800 text-gray-200 rounded-tl-sm"
                            }`}
                          >
                            {msg.content}
                          </div>
                          <span className="text-xs text-gray-700 mt-0.5 px-1">
                            {formatTime(msg.created_at)}
                            {isMe && (
                              <span className="ml-1 text-gray-600">
                                {msg.is_read ? "✓✓" : "✓"}
                              </span>
                            )}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="p-3 border-t border-dark-600 flex-shrink-0">
                <div className="flex gap-2">
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                      }
                    }}
                    placeholder="Type a message..."
                    className="flex-1 bg-dark-800 border border-dark-600 rounded-xl px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-all"
                  />
                  <button
                    onClick={sendMessage}
                    disabled={sending || !input.trim()}
                    className="w-8 h-8 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 rounded-xl flex items-center justify-center transition-all flex-shrink-0"
                  >
                    {sending ? (
                      <Spinner size="sm" />
                    ) : (
                      <Send className="w-3.5 h-3.5 text-white" />
                    )}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}

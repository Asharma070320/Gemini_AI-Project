import React, { useEffect, useRef, useState } from "react";
import { Send, LogOut, User, Bot, MessageSquare, Trash2, Plus, Image, Sparkles, Clock, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { GEMINI_API_KEY } from "../config";
import { ThreeDot } from "react-loading-indicators";
import { auth, database } from "../auth/firebase";
import { FiMessageSquare } from "react-icons/fi";
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  deleteDoc,
  getDocs, 
} from "firebase/firestore";

const Home = () => {
  const [text, setText] = useState("");
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [user, setUser] = useState(null);
  const navigate = useNavigate();
  const chatRef = useRef();

  const [threads, setThreads] = useState([]);
  const [threadId, setThreadId] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);

  // ------------ user name first letter ---------------
  useEffect(() => {
    const unsubs = auth.onAuthStateChanged((currentUser) => {
      setUser(currentUser?.displayName?.slice(0, 1));
      setCurrentUser(currentUser);
    });
    return () => unsubs();
  }, []);

  // ---------- Scroll bottom every time we send message ---------------------
  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  // ----------------- log out ------------------------
  const logoutBtn = () => {
    localStorage.removeItem("token");
    navigate("/login");
  };

  // ----------------------- gemini api calling ----------------------
  const queryGemini = async (prompt) => {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
          }),
        }
      );
      const data = await res.json();
      const responseText =
        data?.candidates?.[0]?.content?.parts?.[0]?.text ||
        "I couldn't understand that.";
      return responseText;
    } catch (err) {
      return "Something went wrong while contacting Gemini.";
    }
  };

  // -------------------- generate chat title ---------------------
  const generateChatTitle = async (firstMessage, assistantResponse) => {
    try {
      const titlePrompt = `Based on this conversation, generate a short, descriptive title (3-5 words maximum) that captures the main topic or question. Be concise and clear.

User: ${firstMessage}
Assistant: ${assistantResponse.slice(0, 200)}...

Generate only the title, nothing else:`;

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: titlePrompt }] }],
          }),
        }
      );

      const data = await res.json();
      const title =
        data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ||
        firstMessage.slice(0, 40) + (firstMessage.length > 40 ? "..." : "");

      return title.replace(/['"]/g, "").trim();
    } catch (err) {
      return generateSimpleTitle(firstMessage);
    }
  };

  // ----------------- generate simple title ----------------------
  const generateSimpleTitle = (message) => {
    const cleanMessage = message
      .replace(
        /^(how|what|why|when|where|who|can|could|would|should|is|are|do|does|did|will|please|help|explain|tell|show)\s+/i,
        ""
      )
      .replace(/[?!.]/g, "")
      .trim();

    const words = cleanMessage.split(" ").slice(0, 4);
    let title = words.join(" ");

    if (cleanMessage.split(" ").length > 4) {
      title += "...";
    }

    return title.charAt(0).toUpperCase() + title.slice(1);
  };

  // ------------------------ send message -----------------------
  const sendMessage = async () => {
    if (!text.trim() && !imageUrl) return;

    const userMessage = {
      sender: "user",
      text,
      image: imageUrl || null,
      timestamp: serverTimestamp(),
    };

    // If no thread is selected, create a new one
    let currentThreadId = threadId;
    let isNewThread = false;

    if (!currentThreadId) {
      const docRef = await addDoc(collection(database, "chats"), {
        title: "New Chat",
        timestamp: serverTimestamp(),
        userId: currentUser?.uid,
      });
      currentThreadId = docRef.id;
      setThreadId(currentThreadId);
      isNewThread = true;
    }

    // Store the original message for title generation
    const originalMessage = text;

    // Add user message to Firestore
    await addDoc(
      collection(database, "chats", currentThreadId, "messages"),
      userMessage
    );

    setText("");
    setIsLoading(true);

    try {
      let prompt = text;
      if (imageUrl) {
        prompt += "\n[User has sent an image]";
      }

      const response = await queryGemini(prompt);

      // Add assistant response to Firestore
      await addDoc(collection(database, "chats", currentThreadId, "messages"), {
        sender: "assistant",
        text: response,
        timestamp: serverTimestamp(),
      });

      // Generate smart title for new threads
      if (isNewThread) {
        try {
          const smartTitle = await generateChatTitle(originalMessage, response);
          await updateDoc(doc(database, "chats", currentThreadId), {
            title: smartTitle,
          });
        } catch (error) {
          console.error("Error generating title:", error);
          // Fallback to simple title
          const fallbackTitle = generateSimpleTitle(originalMessage);
          await updateDoc(doc(database, "chats", currentThreadId), {
            title: fallbackTitle,
          });
        }
      }
    } catch (error) {
      // Add error message to Firestore
      await addDoc(collection(database, "chats", currentThreadId, "messages"), {
        sender: "assistant",
        text: "Something went wrong getting the response.",
        timestamp: serverTimestamp(),
      });
    } finally {
      setIsLoading(false);
      setImageUrl("");
    }
  };

  // ------------------- enter key -------------------------
  const enterBtn = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendMessage();
    }
  };

  // ------------------- Listen to messages for current thread ------------------------
  useEffect(() => {
    if (!threadId) return;
    const msgsRef = collection(database, "chats", threadId, "messages");
    const q = query(msgsRef, orderBy("timestamp", "asc"));
    const unsubs = onSnapshot(q, (snap) =>
      setMessages(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })))
    );
    return () => unsubs();
  }, [threadId]);

  // ------------------------- Listen to all threads --------------------------
  useEffect(() => {
    if (!currentUser) return;
    const q = query(
      collection(database, "chats"),
      orderBy("timestamp", "desc")
    );
    const unsubs = onSnapshot(q, (snap) =>
      setThreads(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })))
    );
    return () => unsubs();
  }, [currentUser]);

  // ------------------ new chat ----------------------
  const newChatBtn = async () => {
    setThreadId(null);
    setMessages([]);
  };

  // ---------------- select thread id -----------------
  const selectThread = (thread) => {
    setThreadId(thread.id);
  };

  // ------------------- fixed deleteThread function -------------------
  const deleteThread = async (threadIdToDelete, e) => {
    e.stopPropagation();
    try {
      // First, delete all messages in the thread
      const messagesRef = collection(
        database,
        "chats",
        threadIdToDelete,
        "messages"
      );
      const messagesSnapshot = await getDocs(messagesRef);

      // Delete all messages
      const deletePromises = messagesSnapshot.docs.map((doc) =>
        deleteDoc(doc.ref)
      );
      await Promise.all(deletePromises);

      // Then delete the main thread document
      await deleteDoc(doc(database, "chats", threadIdToDelete));

      // If this was the current thread, reset the UI
      if (threadIdToDelete === threadId) {
        setThreadId(null);
        setMessages([]);
      }
    } catch (error) {
      console.error("Error deleting thread:", error);
    }
  };


  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Header */}
      <header className="absolute top-0 left-0 right-0 h-16 bg-white/80 backdrop-blur-md border-b border-white/20 px-6 flex justify-between items-center z-10 shadow-sm">
        <div className="flex items-center space-x-4">
          <div className="relative">
            <div className="w-10 h-10 bg-gradient-to-r from-blue-600 via-purple-600 to-blue-800 rounded-xl flex items-center justify-center shadow-lg">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-400 rounded-full border-2 border-white animate-pulse"></div>
          </div>
          <div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent">
              AI Assistant
            </h1>
            <p className="text-xs text-gray-500">Powered by Gemini</p>
          </div>
        </div>
        <div className="flex items-center space-x-4">
          <div className="relative">
            <div className="w-10 h-10 rounded-full flex justify-center items-center text-lg font-bold text-white bg-gradient-to-r from-indigo-500 to-purple-600 border-2 border-white shadow-lg select-none cursor-default">
              {user}
            </div>
            <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-400 rounded-full border-2 border-white"></div>
          </div>
          <button
            onClick={logoutBtn}
            className="flex items-center space-x-2 px-4 py-2 text-gray-600 hover:text-gray-800 hover:bg-white/60 rounded-xl transition-all duration-200 backdrop-blur-sm cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span className="text-sm font-medium">Logout</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex flex-1 pt-16 overflow-hidden">
        {/* Left Panel - Chat History */}
        <div className="w-80 bg-white/70 backdrop-blur-md border-r border-white/30 flex flex-col shadow-lg">
          {/* New Chat Button */}
          <div className="p-4 border-b border-white/20 cursor-pointer">
            <button
              onClick={newChatBtn}
              className="w-full flex items-center gap-3 p-4 rounded-xl bg-gradient-to-r from-blue-500 to-purple-600 text-white hover:from-blue-600 hover:to-purple-700 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105"
            >
              <Plus className="w-5 h-5" />
              <span className="font-medium">New Conversation</span>
            </button>
          </div>

          {/* Chat History */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {threads.length === 0 ? (
              <div className="text-center text-gray-500 py-12">
                <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
                  <MessageSquare className="w-8 h-8 opacity-50" />
                </div>
                <p className="text-sm font-medium">No conversations yet</p>
                <p className="text-xs text-gray-400 mt-1">Start a new chat to begin</p>
              </div>
            ) : (
              threads.map((thread) => (
                <div
                  key={thread.id}
                  onClick={() => selectThread(thread)}
                  className={`group flex items-center justify-between p-4 rounded-xl cursor-pointer transition-all duration-200 hover:bg-white/60 hover:shadow-md ${
                    threadId === thread.id
                      ? "bg-white/80 shadow-md border-l-4 border-blue-500"
                      : "bg-white/40"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-6 h-6 bg-gradient-to-r from-blue-400 to-purple-500 rounded-lg flex items-center justify-center flex-shrink-0">
                        <MessageSquare className="w-4 h-4 text-white" />
                      </div>
                      <h3 className="text-sm font-semibold text-gray-800 truncate">
                        {thread.title}
                      </h3>
                    </div>
                  </div>
                  <button
                    onClick={(e) => deleteThread(thread.id, e)}
                    className="opacity-0 group-hover:opacity-100 p-2 hover:bg-red-100 rounded-lg transition-all duration-200"
                    title="Delete chat"
                  >
                    <Trash2 className="w-4 h-4 text-gray-400 hover:text-red-500" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Panel - Chat Section */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Chat Messages */}
          <div
            ref={chatRef}
            className="flex-1 overflow-y-auto px-6 py-8 space-y-6"
            style={{ scrollbarWidth: "none" }}
          >
            {messages.length === 0 && (
              <div className="w-full h-full flex flex-col justify-center items-center">
                <div className="text-center max-w-md">
                  <div className="relative mb-8">
                    <div className="w-20 h-20 bg-gradient-to-r from-blue-500 via-purple-500 to-indigo-600 rounded-full flex items-center justify-center mx-auto shadow-2xl">
                      <Sparkles className="w-10 h-10 text-white" />
                    </div>
                    <div className="absolute inset-0 w-20 h-20 bg-gradient-to-r from-blue-400 to-purple-400 rounded-full mx-auto animate-ping opacity-20"></div>
                  </div>
                  <h2 className="text-3xl font-bold bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent mb-4">
                    Ready to assist you
                  </h2>
                  <p className="text-gray-600 text-lg leading-relaxed">
                    Ask me anything! I can help with questions, creative tasks, analysis, and more.
                  </p>
                </div>
              </div>
            )}

            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex ${
                  msg.sender === "user" ? "justify-end" : "justify-start"
                } animate-fadeIn`}
              >
                <div className={`flex items-start space-x-3 max-w-4xl ${
                  msg.sender === "user" ? "flex-row-reverse space-x-reverse" : ""
                }`}>
                  {/* Avatar */}
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 shadow-lg ${
                    msg.sender === "assistant"
                      ? "bg-gradient-to-r from-blue-500 to-purple-600"
                      : "bg-gradient-to-r from-indigo-500 to-purple-600"
                  }`}>
                    {msg.sender === "assistant" ? (
                      <Bot className="w-5 h-5 text-white" />
                    ) : (
                      <User className="w-5 h-5 text-white" />
                    )}
                  </div>

                  {/* Message Bubble */}
                  <div className={`relative max-w-3xl ${
                    msg.sender === "user"
                      ? "bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-3xl rounded-tr-lg shadow-lg"
                      : "bg-white/80 backdrop-blur-sm border border-white/30 text-gray-800 rounded-3xl rounded-tl-lg shadow-lg"
                  } px-6 py-4 whitespace-pre-line text-sm leading-relaxed`}>
                    {msg.text}
                    {msg.image && (
                      <img
                        src={msg.image}
                        alt="User upload"
                        className="mt-4 rounded-xl max-w-sm shadow-md border border-white/20"
                      />
                    )}
                  </div>
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {isLoading && (
              <div className="flex justify-start animate-fadeIn">
                <div className="flex items-start space-x-3 max-w-4xl">
                  <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center flex-shrink-0 shadow-lg">
                    <Bot className="w-5 h-5 text-white" />
                  </div>
                  <div className="px-6 py-4 bg-white/80 backdrop-blur-sm border border-white/30 text-gray-800 rounded-3xl rounded-tl-lg shadow-lg">
                    <ThreeDot color="#6b7280" size="small" />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Image Preview */}
          {imageUrl && (
            <div className="px-6 pb-4">
              <div className="inline-block relative bg-white/80 backdrop-blur-sm rounded-2xl p-2 shadow-lg">
                <img
                  className="rounded-xl max-w-[200px] shadow-md"
                  src={imageUrl}
                  alt="Preview"
                />
                <button
                  onClick={() => setImageUrl("")}
                  className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center text-xs transition-colors"
                >
                  ×
                </button>
              </div>
            </div>
          )}

          {/* Input Section */}
          <div className="p-6 bg-white/50 backdrop-blur-md border-t border-white/30">
            <div className="flex items-end space-x-4 max-w-4xl mx-auto">
              {/* Image Upload Button */}
              <div className="relative">
                <input
                  type="file"
                  accept="image/*"
                  id="fileInput"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const file = e.target.files[0];
                    if (file) {
                      setImageUrl(URL.createObjectURL(file));
                    }
                  }}
                />
                <button
                  onClick={() => document.getElementById("fileInput").click()}
                  className="w-12 h-12 bg-white/80 backdrop-blur-sm hover:bg-white border border-white/30 text-gray-600 hover:text-gray-800 rounded-xl flex items-center justify-center transition-all duration-200 shadow-lg hover:shadow-xl"
                  title="Upload Image"
                >
                  <Image className="w-5 h-5" />
                </button>
              </div>

              {/* Text Input */}
              <div className="flex-1 relative">
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={enterBtn}
                  className="w-full bg-white/80 backdrop-blur-sm border border-white/30 rounded-2xl px-6 py-4 pr-14 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 shadow-lg text-gray-800 placeholder-gray-500"
                  type="text"
                  placeholder="Type your message here..."
                />
                
                {/* Send Button */}
                <button
                  onClick={sendMessage}
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 rounded-xl flex items-center justify-center transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105"
                >
                  <Send className="w-5 h-5 text-white" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Custom Styles */}
      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out;
        }
        
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  );
};

export default Home;
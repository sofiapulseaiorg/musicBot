/* eslint-disable */

"use client";

import { useState, useEffect } from "react";
import { Send, Mic, MicOff } from "lucide-react";
import axios from "axios";

type Message = {
  text: string | string[];
  sender: "user" | "bot";
  spotifyLink?: { song: string; link: string; iframe?: string }[];
};

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

interface SpeechRecognition {
  start: () => void;
  stop: () => void;
  onstart?: () => void;
  onend?: () => void;
  onresult?: (event: any) => void;
  continuous: boolean;
  interimResults: boolean;
  lang: string;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([
    { text: "Hello! How can I assist you today?", sender: "bot" }
  ]);
  const [input, setInput] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [recognition, setRecognition] = useState<SpeechRecognition | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recog = new SpeechRecognition();
        recog.continuous = false;
        recog.interimResults = false;
        recog.lang = "en-US";

        recog.onstart = () => setIsListening(true);
        recog.onend = () => setIsListening(false);
        recog.onresult = (event: any) => {
          const transcript = event.results[0][0].transcript;
          setInput(transcript);
          sendMessage(transcript);
        };

        setRecognition(recog);
      }
    }
  }, []);

  const startListening = () => {
    if (recognition) {
      recognition.start();
    }
  };

  const sendMessage = async (messageText?: string) => {
    const textToSend = messageText || input;
    if (!textToSend.trim()) return;
    const userMessage: Message = { text: textToSend, sender: "user" };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");

    try {
      const botResponses = await fetchBotResponse(textToSend);
      setMessages((prev) => [...prev, ...botResponses]);
    } catch (error) {
    }
  };

  const fetchBotResponse = async (userInput: string): Promise<Message[]> => {
    try {
        const response = await axios.post("/api/chat", { userMessage: userInput });
        const { content, spotifyLinks } = response.data;

        let botMessages: Message[] = [];

        if (Array.isArray(content)) {
            botMessages = content.map((song: { title: string, artist: string }) => ({
                text: `${song.title} - ${song.artist}`,
                sender: "bot",
                spotifyLink: spotifyLinks || []
            }));
        } else {
            botMessages = [
                {
                    text: content,
                    sender: "bot",
                    spotifyLink: spotifyLinks || []
                }
            ];
        }

        return botMessages;
    } catch (error) {
        return [{ text: "Sorry, I am having trouble responding right now.", sender: "bot" }];
    }
};


  return (
    <div className="flex flex-col h-screen bg-gradient-to-b from-purple-100 to-purple-300 text-gray-900 p-4">
      <div className=" overflow-y-auto p-4 rounded-lg relative h-[84vh]">
        {messages.map((msg, index) => (
          <div
            key={index}
            className={`p-3 my-2 rounded-xl w-fit max-w-xs ${
              msg.sender === "user"
                ? "bg-white text-black self-end ml-auto shadow-md"
                : "bg-purple-500 text-white shadow-md"
            }`}
          >
            {typeof msg.text === "string" && msg.text.includes("1.") ? (
              <>
                <p>{msg.text.split("\n")[0]}</p>
                <ul className="list-disc list-inside">
                  {msg.text
                    .split("\n")
                    .slice(1)
                    .map((line, idx) => (
                      <li key={idx}>{line.replace(/^\d+\.\s*/, "")}</li>
                    ))}
                </ul>
              </>
            ) : Array.isArray(msg.text) ? (
              msg.text.map((line, idx) => <p key={idx}>{line}</p>)
            ) : (
              <p>{msg.text}</p>
            )}
{msg.spotifyLink && msg.spotifyLink.length > 0 && (
  <div className="mt-2">
   {msg.spotifyLink && msg.spotifyLink.length > 0 && (
  <div className="mt-2">
    {msg.spotifyLink.map((song, idx) => (
      <div key={idx} className="mb-2">
        <p>{song.song}</p>
        {song.iframe && <div dangerouslySetInnerHTML={{ __html: song.iframe }} />}
      </div>
    ))}
  </div>
)}

  </div>
)}
          </div>
        ))}
      </div>

      <div className="flex fixed bottom-[4%] left-[5%] w-[90vw] items-center gap-2 p-3 rounded-full bg-white shadow-lg">
        <button
          onClick={startListening}
          className={`p-3 rounded-full ${isListening ? "bg-red-500" : "bg-purple-500"}`}
        >
          {isListening ? <MicOff size={24} color="white" /> : <Mic size={24} color="white" />}
        </button>
        <input
          type="text"
          className="flex-1 p-3 border-none bg-transparent text-black outline-none"
          placeholder="Tap icon to talk or simply text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
        />
        <button className="p-3 bg-purple-500 rounded-full text-white" onClick={() => sendMessage()}>
          <Send size={24} />
        </button>
      </div>
    </div>
  );
}

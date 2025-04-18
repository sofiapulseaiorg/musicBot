/* eslint-disable */

export const runtime = 'edge';
import OpenAI from "openai";

// Constants
const GPT = process.env.AI as string;
const openai = new OpenAI({ apiKey: GPT });

// Types
type ChatMessage = {
    role: "user" | "assistant";
    content: string;
};

type SpotifyTrack = {
    song: string;
    link: string | null;
    iframe: string | null;
};

// Global state
let chatHistory: ChatMessage[] = [];

export async function POST(request: Request) {
    try {
        console.log("Starting function with OpenAI integration");
        
        // Parse request
        const requestData = await request.json();
        const userMessage = requestData.userMessage || "";
        
        console.log("Received message:", userMessage);
        
        // Add to chat history
        chatHistory = [...chatHistory, { role: "user", content: userMessage }];
        
        // Call OpenAI API
        let assistantResponse;
        try {
            console.log("Calling OpenAI API");
            const chatResponse = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [
                    { role: "system", content: "You are a Music Bot. Respond briefly." },
                    ...chatHistory
                ],
                temperature: 0.7,
            });
            
            assistantResponse = chatResponse.choices[0]?.message?.content || "I'm sorry, I couldn't process that.";
            console.log("OpenAI API call successful");
        } catch (aiError) {
            console.error("OpenAI API error:", aiError);
            assistantResponse = "I'm sorry, I'm having trouble right now.";
        }
        
        // Add to chat history
        chatHistory = [...chatHistory, { role: "assistant", content: assistantResponse }];
        chatHistory = chatHistory.slice(-10);
        
        // Prepare response
        const responseData = {
            role: "assistant",
            content: assistantResponse,
            userMessage: userMessage,
            spotifyLinks: [] // No Spotify integration yet
        };
        
        console.log("Sending response");
        
        // Use standard Response
        return new Response(
            JSON.stringify(responseData),
            {
                headers: {
                    "Content-Type": "application/json"
                }
            }
        );
    } catch (error) {
        console.error("Error in function:", error);
        
        return new Response(
            JSON.stringify({ error: "An error occurred" }),
            { 
                status: 500,
                headers: { "Content-Type": "application/json" }
            }
        );
    }
}
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

export async function POST(request: Request) {
    try {
        console.log("Starting minimal function with OpenAI");
        
        // Parse request
        const requestData = await request.json();
        const userMessage = requestData.userMessage || "";
        
        console.log("Received message:", userMessage);
        
        // Call OpenAI API
        let assistantResponse;
        try {
            console.log("Calling OpenAI API");
            const chatResponse = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [
                    { role: "system", content: "You are a Music Bot. Respond briefly." },
                    { role: "user", content: userMessage }
                ],
                temperature: 0.7,
            });
            
            assistantResponse = chatResponse.choices[0]?.message?.content || "I'm sorry, I couldn't process that.";
            console.log("OpenAI API call successful");
        } catch (aiError) {
            console.error("OpenAI API error:", aiError);
            assistantResponse = "I'm sorry, I'm having trouble right now.";
        }
        
        // Super basic response structure
        const simpleResponse = {
            text: assistantResponse
        };
        
        console.log("Sending response");
        
        // Create response in a different way
        const responseText = JSON.stringify(simpleResponse);
        const headers = new Headers();
        headers.append("Content-Type", "application/json");
        
        return new Response(responseText, {
            status: 200,
            headers
        });
    } catch (error) {
        console.error("Error in function:", error);
        
        const errorText = JSON.stringify({ error: "An error occurred" });
        const headers = new Headers();
        headers.append("Content-Type", "application/json");
        
        return new Response(errorText, { 
            status: 500,
            headers
        });
    }
}
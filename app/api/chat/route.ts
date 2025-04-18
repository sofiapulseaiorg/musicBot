/* eslint-disable */

export const runtime = 'edge';

// Types
type ChatMessage = {
    role: "user" | "assistant";
    content: string;
};

// Direct fetch to OpenAI API instead of using the client
async function callOpenAI(messages: any[]) {
    const GPT = process.env.AI as string;
    
    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${GPT}`
            },
            body: JSON.stringify({
                model: 'gpt-4o',
                messages: messages,
                temperature: 0.7
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`OpenAI API error: ${response.status} - ${JSON.stringify(errorData)}`);
        }
        
        const data = await response.json();
        return data.choices[0]?.message?.content || "I'm sorry, I couldn't process that.";
    } catch (error) {
        console.error("Error calling OpenAI API:", error);
        return "I'm sorry, I'm having trouble right now.";
    }
}

export async function POST(request: Request) {
    try {
        console.log("Starting function with direct OpenAI fetch");
        
        // Parse request
        const requestData = await request.json();
        const userMessage = requestData.userMessage || "";
        
        console.log("Received message:", userMessage);
        
        // Call OpenAI directly without client
        const messages = [
            { role: "system", content: "You are a Music Bot. Respond briefly." },
            { role: "user", content: userMessage }
        ];
        
        console.log("Calling OpenAI API directly");
        const assistantResponse = await callOpenAI(messages);
        console.log("OpenAI API call completed");
        
        // Prepare response
        const responseData = {
            role: "assistant",
            content: assistantResponse,
            userMessage: userMessage
        };
        
        console.log("Preparing response");
        const responseText = JSON.stringify(responseData);
        
        console.log("Sending response");
        return new Response(responseText, {
            status: 200,
            headers: {
                "Content-Type": "application/json"
            }
        });
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
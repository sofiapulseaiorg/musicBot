export const runtime = 'edge';

// Minimal type definitions
type ChatMessage = {
    role: "user" | "assistant";
    content: string;
};

type SpotifyTrack = {
    song: string;
    link: string | null;
    iframe: string | null;
};

// Simplified version with no dependencies
export async function POST(request: Request) {
    try {
        console.log("Starting minimal function");
        
        // Parse request
        const requestData = await request.json();
        const userMessage = requestData.userMessage || "";
        
        console.log("Received message:", userMessage);
        
        // Simple static response (no API calls)
        const responseData = {
            role: "assistant",
            content: "This is a test response without any external API calls.",
            userMessage: userMessage,
            spotifyLinks: []
        };
        
        console.log("Sending response");
        
        // Use the most basic response object possible
        return new Response(
            JSON.stringify(responseData),
            {
                headers: {
                    "Content-Type": "application/json"
                }
            }
        );
    } catch (error) {
        console.error("Error in minimal function:", error);
        
        return new Response(
            JSON.stringify({ error: "An error occurred" }),
            { 
                status: 500,
                headers: { "Content-Type": "application/json" }
            }
        );
    }
}
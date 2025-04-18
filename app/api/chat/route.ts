/* eslint-disable */
export const runtime = 'edge';

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

// Global state (note: this will reset whenever the function cold starts)
let chatHistory: ChatMessage[] = [];
let trackHistory: SpotifyTrack[] = [];

// Direct OpenAI API call function
async function callOpenAI(messages: any[]) {
    const GPT = process.env.AI as string;
    
    try {
        console.log("Sending request to OpenAI API");
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
            const errorText = await response.text();
            throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
        }
        
        const data = await response.json();
        console.log("Received response from OpenAI API");
        return data.choices[0]?.message?.content || "I'm sorry, I couldn't process that.";
    } catch (error) {
        console.error("Error calling OpenAI API:", error);
        return "I'm sorry, I'm having trouble connecting to my music knowledge right now. Please try again later.";
    }
}

// Get Spotify token using edge-compatible encoding
async function getSpotifyToken(): Promise<string> {
    const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID as string;
    const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET as string;
    
    console.log("Getting Spotify token");
    
    // Use btoa for base64 encoding instead of Buffer
    const credentials = `${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`;
    const base64Credentials = btoa(credentials);
    
    try {
        const response = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': `Basic ${base64Credentials}`
            },
            body: 'grant_type=client_credentials'
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Spotify token error: ${response.status}`, errorText);
            throw new Error(`Spotify API error: ${response.status}`);
        }
        
        const data = await response.json();
        console.log("Successfully acquired Spotify token");
        return data.access_token;
    } catch (error) {
        console.error("Error getting Spotify token:", error);
        throw error;
    }
}

// Search for tracks on Spotify
async function searchSpotifyTrack(songTitle: string, artist?: string): Promise<string | null> {
    console.log(`Searching for track: "${songTitle}" by "${artist || 'unknown'}"`);
    
    try {
        const token = await getSpotifyToken();
        const query = artist ? `${songTitle} artist:${artist}` : songTitle;
        
        const searchUrl = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=1`;
        console.log(`Making Spotify search request`);
        
        const response = await fetch(searchUrl, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Spotify search error: ${response.status}`, errorText);
            return null;
        }
        
        const data = await response.json();
        const trackId = data.tracks?.items?.length > 0 ? data.tracks.items[0].id : null;
        
        console.log(`Track search result: ${trackId ? `Found` : 'Not found'}`);
        return trackId;
    } catch (error) {
        console.error("Error in searchSpotifyTrack:", error);
        return null; // Return null on error so the app can continue
    }
}

export async function POST(request: Request) {
    console.log("=== API ROUTE START ===");
    
    try {
        console.log("Parsing request body");
        const body = await request.json();
        const { userMessage } = body;
        
        console.log(`Received message: "${userMessage}"`);
        console.log(`Current chat history length: ${chatHistory.length}`);
        
        // Add user message to history
        chatHistory = [...chatHistory, { role: "user", content: userMessage }];
        
        // Handle "previous song" request
        if (userMessage.toLowerCase().includes("play previous song") || userMessage.toLowerCase().includes("last song")) {
            console.log("Handling 'previous song' request");
            
            if (trackHistory.length > 0) {
                const lastSong = trackHistory[trackHistory.length - 1];
                console.log(`Found previous song: ${lastSong.song}`);
                
                return new Response(
                    JSON.stringify({
                        role: "assistant",
                        content: `Playing the last requested song: ${lastSong.song}`,
                        userMessage,
                        spotifyLinks: [lastSong]
                    }),
                    {
                        headers: {
                            'Content-Type': 'application/json'
                        }
                    }
                );
            } else {
                console.log("No song history found");
                
                return new Response(
                    JSON.stringify({
                        role: "assistant",
                        content: "No previous song found in history.",
                        userMessage,
                        spotifyLinks: []
                    }),
                    {
                        headers: {
                            'Content-Type': 'application/json'
                        }
                    }
                );
            }
        }
        
        // Determine system message based on user query
        let systemMessage = "You are a Music Bot. If the user asks for a song, return only the song title and artist in the format: 'Song Title - Artist'. However, if the user asks for details about a song, provide a brief description including its release year, genre, and any notable facts. be more conversational if the user dosen't ask for a song";
        
        if (userMessage.toLowerCase().includes("detail") || userMessage.toLowerCase().includes("info") || userMessage.toLowerCase().includes("tell me about")) {
            systemMessage = "You are a Music Bot. Provide a detailed description of the song, including its release year, genre, notable achievements, and any fun facts.";
        }
        
        // Prepare messages for OpenAI
        const messages = [
            { role: "system", content: systemMessage },
            ...chatHistory
        ];
        
        // Call OpenAI directly
        console.log("Calling OpenAI");
        const assistantResponse = await callOpenAI(messages);
        console.log("Got response from OpenAI");
        
        // Add assistant response to chat history
        chatHistory = [...chatHistory, { role: "assistant", content: assistantResponse }];
        
        // Check if response contains a song
        let songOptions: string[] = [];
        let spotifyLinks: SpotifyTrack[] = [];
        
        const songMatch = assistantResponse.match(/^(.+?) - (.+)$/);
        if (songMatch) {
            const songTitle = songMatch[1];
            const artist = songMatch[2];
            console.log(`Song detected in response: "${songTitle}" by "${artist}"`);
            
            songOptions.push(`${songTitle} by ${artist}`);
        }
        
        // Look up Spotify links for songs
        if (songOptions.length > 0) {
            console.log(`Looking up ${songOptions.length} songs on Spotify`);
            
            // Process each song independently to avoid one failure affecting others
            for (const song of songOptions) {
                try {
                    const [title, artist] = song.split(" by ");
                    const trackId = await searchSpotifyTrack(title, artist);
                    
                    spotifyLinks.push({
                        song,
                        link: trackId ? `https://open.spotify.com/track/${trackId}` : null,
                        iframe: trackId ? `<iframe style="border-radius:12px" src="https://open.spotify.com/embed/track/${trackId}" width="300" height="80" frameBorder="0" allowtransparency="true" allow="encrypted-media"></iframe>` : null
                    });
                } catch (spotifyError) {
                    console.error(`Error processing song "${song}":`, spotifyError);
                    
                    // Add a placeholder with error info
                    spotifyLinks.push({
                        song,
                        link: null,
                        iframe: null
                    });
                }
            }
        }
        
        // Update track history
        if (spotifyLinks.length > 0 && spotifyLinks[0].link) {
            trackHistory = [...trackHistory, spotifyLinks[0]].slice(-10);
            console.log(`Updated track history, now contains ${trackHistory.length} tracks`);
        }
        
        // Limit chat history
        chatHistory = chatHistory.slice(-10);
        
        console.log("Preparing response");
        
        const responseData = {
            role: "assistant",
            content: assistantResponse,
            userMessage,
            spotifyLinks
        };
        
        console.log("=== API ROUTE END ===");
        
        // Use standard Response object
        return new Response(
            JSON.stringify(responseData),
            {
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        );
    } catch (error: any) {
        console.error("=== ERROR IN API ROUTE ===");
        console.error("Error type:", error.constructor?.name || "Unknown");
        console.error("Error message:", error.message || "No message");
        console.error("Error stack:", error.stack || "No stack trace");
        
        return new Response(
            JSON.stringify({
                error: error.message || "An unknown error occurred",
                errorType: error.constructor?.name || "Error"
            }),
            { 
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            }
        );
    }
}
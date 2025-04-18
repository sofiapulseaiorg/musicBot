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

// Global state
let chatHistory: ChatMessage[] = [];
let trackHistory: SpotifyTrack[] = [];

// Direct OpenAI API call without using the client library
async function callOpenAI(messages: any[]): Promise<string> {
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
            const errorData = await response.json();
            throw new Error(`OpenAI API error: ${response.status}`);
        }
        
        const data = await response.json();
        console.log("Received response from OpenAI API");
        return data.choices[0]?.message?.content || "I'm sorry, I couldn't process that.";
    } catch (error) {
        console.error("Error calling OpenAI API:", error);
        return "I'm sorry, I'm having trouble connecting to my knowledge base right now.";
    }
}

// Modified to use btoa instead of Buffer
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
        
        console.log(`Track search result: ${trackId ? `Found ID: ${trackId}` : 'Not found'}`);
        return trackId;
    } catch (error) {
        console.error("Error in searchSpotifyTrack:", error);
        return null;
    }
}

export async function POST(request: Request) {
    try {
        console.log("Starting API route handler");
        const body = await request.json();
        const { userMessage } = body;
        
        console.log(`Received user message: "${userMessage}"`);

        chatHistory.push({ role: "user", content: userMessage });

        let assistantResponse = "";

        if (userMessage.toLowerCase().includes("play previous song") || userMessage.toLowerCase().includes("last song")) {
            console.log("Handling 'previous song' request");
            if (trackHistory.length > 0) {
                const lastSong = trackHistory[trackHistory.length - 1];
                console.log(`Found previous song: ${lastSong.song}`);
                return new Response(JSON.stringify({
                    role: "assistant",
                    content: `Playing the last requested song: ${lastSong.song}`,
                    userMessage,
                    spotifyLinks: [lastSong]
                }), {
                    headers: { 'Content-Type': 'application/json' }
                });
            } else {
                console.log("No previous songs in history");
                return new Response(JSON.stringify({
                    role: "assistant",
                    content: "No previous song found in history.",
                    userMessage,
                    spotifyLinks: []
                }), {
                    headers: { 'Content-Type': 'application/json' }
                });
            }
        }

        let systemMessage = "You are a Music Bot. If the user asks for a song, return only the song title and artist in the format: 'Song Title - Artist'. However, if the user asks for details about a song, provide a brief description including its release year, genre, and any notable facts. be more conversational if the user dosen't ask for a song";

        if (userMessage.toLowerCase().includes("detail") || userMessage.toLowerCase().includes("info") || userMessage.toLowerCase().includes("tell me about")) {
            systemMessage = "You are a Music Bot. Provide a detailed description of the song, including its release year, genre, notable achievements, and any fun facts.";
        }

        // Prepare messages for OpenAI
        const messages = [
            { role: "system", content: systemMessage },
            ...chatHistory,
            { role: "user", content: userMessage }
        ];
        
        // Call OpenAI API directly
        assistantResponse = await callOpenAI(messages);
        console.log(`AI response: "${assistantResponse.substring(0, 100)}..."`);
        
        chatHistory.push({ role: "assistant", content: assistantResponse });

        let songOptions: string[] = [];
        let spotifyLinks: SpotifyTrack[] = [];

        // Try multiple regex patterns to detect songs
        // 1. Exact format at beginning of response: "Title - Artist"
        const exactMatch = assistantResponse.match(/^(.+?) - (.+)$/);
        
        // 2. More relaxed pattern that can find a song anywhere in the response
        const relaxedMatch = !exactMatch && assistantResponse.match(/["']?([^"'\n-]+)["']?\s*-\s*["']?([^"'\n,\.]+)["']?/);
        
        console.log("Exact match result:", exactMatch ? `Found: ${exactMatch[1]} - ${exactMatch[2]}` : "Not found");
        console.log("Relaxed match result:", relaxedMatch ? `Found: ${relaxedMatch[1]} - ${relaxedMatch[2]}` : "Not found");

        if (exactMatch) {
            const songTitle = exactMatch[1].trim();
            const artist = exactMatch[2].trim();
            console.log(`Detected song in exact format: "${songTitle}" by "${artist}"`);
            songOptions.push(`${songTitle} by ${artist}`);
        } else if (relaxedMatch) {
            const songTitle = relaxedMatch[1].trim();
            const artist = relaxedMatch[2].trim();
            console.log(`Detected song with relaxed pattern: "${songTitle}" by "${artist}"`);
            songOptions.push(`${songTitle} by ${artist}`);
        }
        
        console.log("Song options after detection:", songOptions);

        if (songOptions.length > 0) {
            console.log(`Looking up ${songOptions.length} songs on Spotify`);
            
            spotifyLinks = await Promise.all(songOptions.map(async (song) => {
                console.log(`Processing song: "${song}"`);
                
                try {
                    const parts = song.split(" by ");
                    if (parts.length !== 2) {
                        console.log(`Invalid song format: "${song}"`);
                        return { song, link: null, iframe: null };
                    }
                    
                    const [title, artist] = parts;
                    console.log(`Will search Spotify for: "${title}" by "${artist}"`);
                    
                    const trackId = await searchSpotifyTrack(title, artist);
                    console.log(`Spotify search result for "${title}": ${trackId ? `Found` : 'Not found'}`);
                    
                    if (trackId) {
                        const spotifyLink = `https://open.spotify.com/track/${trackId}`;
                        const iframe = `<iframe style="border-radius:12px" src="https://open.spotify.com/embed/track/${trackId}" width="300" height="80" frameBorder="0" allowtransparency="true" allow="encrypted-media"></iframe>`;
                        
                        console.log(`Created Spotify link: ${spotifyLink}`);
                        console.log(`Created iframe HTML for track`);
                        
                        return {
                            song,
                            link: spotifyLink,
                            iframe: iframe
                        };
                    } else {
                        console.log(`No track found for "${song}"`);
                        return {
                            song,
                            link: null,
                            iframe: null
                        };
                    }
                } catch (error) {
                    console.error(`Error processing song "${song}":`, error);
                    return {
                        song,
                        link: null,
                        iframe: null
                    };
                }
            }));
            
            console.log(`Final spotifyLinks array (${spotifyLinks.length} items):`, spotifyLinks);
        } else {
            console.log("No songs detected in AI response");
        }

        if (spotifyLinks.length > 0 && spotifyLinks[0].link) {
            console.log(`Adding song to track history: ${spotifyLinks[0].song}`);
            trackHistory.push(spotifyLinks[0]);
            trackHistory = trackHistory.slice(-10);
        }

        chatHistory = chatHistory.slice(-10);
        
        console.log("Preparing final response");
        
        const responseData = {
            role: "assistant",
            content: assistantResponse,
            userMessage,
            spotifyLinks
        };
        
        console.log(`Response will include ${spotifyLinks.length} Spotify links`);

        return new Response(JSON.stringify(responseData), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error: any) {
        console.error("Error processing request:", error);
        console.error("Error stack:", error.stack);
        
        return new Response(JSON.stringify({ 
            error: "Internal Server Error",
            details: error.message
        }), { 
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
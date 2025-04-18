/* eslint-disable */

import { NextResponse } from 'next/server';
import OpenAI from "openai";

export const runtime = 'edge';

const GPT = process.env.AI as string;
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID as string;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET as string;
const openai = new OpenAI({ apiKey: GPT });

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

// Modified to use btoa instead of Buffer for base64 encoding
async function getSpotifyToken(): Promise<string> {
    console.log("Getting Spotify token...");
    
    // Use btoa which is available in edge environments
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
        console.error("Error in getSpotifyToken:", error);
        throw error;
    }
}

async function searchSpotifyTrack(songTitle: string, artist?: string): Promise<string | null> {
    console.log(`Searching for track: "${songTitle}" by "${artist || 'unknown'}"`);
    
    try {
        const token = await getSpotifyToken();
        const query = artist ? `${songTitle} artist:${artist}` : songTitle;
        
        const searchUrl = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=1`;
        console.log(`Making Spotify search request to: ${searchUrl}`);
        
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
        
        console.log(`Track search result: ${trackId ? `Found (ID: ${trackId})` : 'Not found'}`);
        return trackId;
    } catch (error) {
        console.error("Error in searchSpotifyTrack:", error);
        return null; // Return null on error so the app can continue
    }
}

export async function POST(request: Request) {
    console.log("=== API ROUTE START ===");
    console.trace("Function call trace");
    
    try {
        console.log("Parsing request body...");
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
                
                return NextResponse.json({
                    role: "assistant",
                    content: `Playing the last requested song: ${lastSong.song}`,
                    userMessage,
                    spotifyLinks: [lastSong]
                });
            } else {
                console.log("No song history found");
                
                return NextResponse.json({
                    role: "assistant",
                    content: "No previous song found in history.",
                    userMessage,
                    spotifyLinks: []
                });
            }
        }
        
        // Determine system message based on user query
        let systemMessage = "You are a Music Bot. If the user asks for a song, return only the song title and artist in the format: 'Song Title - Artist'. However, if the user asks for details about a song, provide a brief description including its release year, genre, and any notable facts. be more conversational if the user dosen't ask for a song";
        
        if (userMessage.toLowerCase().includes("detail") || userMessage.toLowerCase().includes("info") || userMessage.toLowerCase().includes("tell me about")) {
            systemMessage = "You are a Music Bot. Provide a detailed description of the song, including its release year, genre, notable achievements, and any fun facts.";
        }
        
        console.log("Making OpenAI API request...");
        
        // Call OpenAI API
        let assistantResponse = "";
        try {
            const chatResponse = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [
                    { role: "system", content: systemMessage },
                    ...chatHistory,
                    { role: "user", content: userMessage }
                ],
                temperature: 0.7,
            });
            
            assistantResponse = chatResponse.choices[0]?.message?.content || "I'm sorry, I couldn't process that.";
            console.log(`OpenAI response: "${assistantResponse.substring(0, 50)}..."`);
        } catch (aiError) {
            console.error("OpenAI API error:", aiError);
            assistantResponse = "I'm sorry, I'm having trouble connecting to my knowledge base right now. Please try again later.";
        }
        
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
        
        console.log("Preparing response...");
        
        const response = {
            role: "assistant",
            content: assistantResponse,
            userMessage,
            spotifyLinks
        };
        
        console.log("=== API ROUTE END ===");
        
        return NextResponse.json(response);
    } catch (error: any) {
        console.error("=== ERROR IN API ROUTE ===");
        console.error("Error type:", error.constructor.name);
        console.error("Error message:", error.message);
        console.error("Error stack:", error.stack);
        
        try {
            // Safely log additional error properties
            const errorProps = Object.getOwnPropertyNames(error).filter(
                prop => !['name', 'message', 'stack'].includes(prop)
            );
            
            if (errorProps.length > 0) {
                console.error("Additional error properties:");
                errorProps.forEach(prop => {
                    try {
                        console.error(`- ${prop}:`, JSON.stringify(error[prop]));
                    } catch (e) {
                        console.error(`- ${prop}: [Could not stringify]`);
                    }
                });
            }
        } catch (loggingError) {
            console.error("Error while logging error details:", loggingError);
        }
        
        return new Response(JSON.stringify({
            error: error.message || "An unknown error occurred",
            errorType: error.constructor.name
        }), { 
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
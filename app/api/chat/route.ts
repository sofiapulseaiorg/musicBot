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

let chatHistory: ChatMessage[] = [];
let trackHistory: SpotifyTrack[] = [];

async function getSpotifyToken(): Promise<string> {
    const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64')}`
        },
        body: 'grant_type=client_credentials'
    });
    const data = await response.json();
    return data.access_token;
}

async function searchSpotifyTrack(songTitle: string, artist?: string): Promise<string | null> {
    const token = await getSpotifyToken();
    const query = artist ? `${songTitle} artist:${artist}` : songTitle;
    
    const response = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=1`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
    });

    const data = await response.json();

    return data.tracks?.items?.length > 0 ? data.tracks.items[0].id : null;
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { userMessage } = body;

        chatHistory.push({ role: "user", content: userMessage });

        let assistantResponse = "";

        console.log(chatHistory)

        if (userMessage.toLowerCase().includes("play previous song") || userMessage.toLowerCase().includes("last song")) {
            if (trackHistory.length > 0) {
                const lastSong = trackHistory[trackHistory.length - 1];
                return NextResponse.json({
                    role: "assistant",
                    content: `Playing the last requested song: ${lastSong.song}`,
                    userMessage,
                    spotifyLinks: [lastSong]
                });
            } else {
                return NextResponse.json({
                    role: "assistant",
                    content: "No previous song found in history.",
                    userMessage,
                    spotifyLinks: []
                });
            }
        }

        let systemMessage = "You are a Music Bot. If the user asks for a song, return only the song title and artist in the format: 'Song Title - Artist'. However, if the user asks for details about a song, provide a brief description including its release year, genre, and any notable facts. be more conversational if the user dosen't ask for a song";

        if (userMessage.toLowerCase().includes("detail") || userMessage.toLowerCase().includes("info") || userMessage.toLowerCase().includes("tell me about")) {
            systemMessage = "You are a Music Bot. Provide a detailed description of the song, including its release year, genre, notable achievements, and any fun facts.";
        }

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
        chatHistory.push({ role: "assistant", content: assistantResponse });

        let songOptions: string[] = [];
        let spotifyLinks: SpotifyTrack[] = [];

        const songMatch = assistantResponse.match(/^(.+?) - (.+)$/);
        if (songMatch) {
            songOptions.push(`${songMatch[1]} by ${songMatch[2]}`);
        }

        if (songOptions.length > 0) {
            spotifyLinks = await Promise.all(songOptions.map(async (song) => {
                const [title, artist] = song.split(" by ");
                const trackId = await searchSpotifyTrack(title, artist);
                return {
                    song,
                    link: trackId ? `https://open.spotify.com/track/${trackId}` : null,
                    iframe: trackId ? `<iframe style="border-radius:12px" src="https://open.spotify.com/embed/track/${trackId}" width="300" height="80" frameBorder="0" allowtransparency="true" allow="encrypted-media"></iframe>` : null
                };
            }));
        }

        if (spotifyLinks.length > 0) {
            trackHistory.push(spotifyLinks[0]);
            trackHistory = trackHistory.slice(-10);
        }

        chatHistory = chatHistory.slice(-10);

        return NextResponse.json({
            role: "assistant",
            content: assistantResponse,
            userMessage,
            spotifyLinks
        });
    } catch (error) {
        console.error("Error processing request:", error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}

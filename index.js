const { Client, GatewayIntentBits } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, NoSubscriberBehavior } = require('@discordjs/voice');
const play = require('play-dl');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates
    ]
});

const YOUTUBE_URL = process.env.YOUTUBE_URL || 'https://youtube.com/playlist?list=PLOi4TJ4YyqM4&si=kCAz-6rFC6GhItU7';

// Global tracking for the playlist queue
let songQueue = [];
let currentSongIndex = 0;

async function updateChannelStatus(channelId, title) {
    try {
        const channel = await client.channels.fetch(channelId);
        if (channel && typeof channel.setVoiceStatus === 'function') {
            const statusText = `🎵 ${title} - Playing Now`.substring(0, 100);
            await channel.setVoiceStatus(statusText);
            console.log(`Updated channel status to: ${statusText}`);
        }
    } catch (error) {
        console.error("Failed to update voice channel status:", error);
    }
}

async function loadPlaylist() {
    try {
        console.log("Parsing YouTube URL...");
        // Check if it's a playlist link
        if (YOUTUBE_URL.includes('list=')) {
            const playlistInfo = await play.playlist_info(YOUTUBE_URL, { incomplete: true });
            const videos = await playlistInfo.all_videos();
            songQueue = videos.map(video => ({ title: video.title, url: video.url }));
            console.log(`Successfully loaded playlist: "${playlistInfo.title}" with ${songQueue.length} tracks.`);
        } else {
            // Fallback for single videos
            const videoInfo = await play.video_info(YOUTUBE_URL);
            songQueue = [{ title: videoInfo.video_details.title, url: videoInfo.video_details.url }];
            console.log(`Loaded single video track.`);
        }
    } catch (error) {
        console.error("Error parsing YouTube playlist/video:", error);
    }
}

async function startPlaying(connection, player, channelId) {
    if (songQueue.length === 0) {
        console.log("Queue is empty. Reloading source...");
        await loadPlaylist();
        currentSongIndex = 0;
        if (songQueue.length === 0) return; // Safeguard if it still fails
    }

    const currentTrack = songQueue[currentSongIndex];
    console.log(`Preparing track [${currentSongIndex + 1}/${songQueue.length}]: ${currentTrack.title}`);

    try {
        const stream = await play.stream(currentTrack.url, { quality: 2 });
        const resource = createAudioResource(stream.stream, { inputType: stream.type });

        await updateChannelStatus(channelId, currentTrack.title);
        player.play(resource);
        connection.subscribe(player);
    } catch (error) {
        console.error(`Error streaming track "${currentTrack.title}":`, error);
        // Advance to next song if this one fails
        advanceQueue(connection, player, channelId);
    }
}

function advanceQueue(connection, player, channelId) {
    currentSongIndex++;
    // Loop back to the start of the playlist if it finishes
    if (currentSongIndex >= songQueue.length) {
        console.log("Reached the end of the playlist. Looping back to the beginning...");
        currentSongIndex = 0;
    }
    startPlaying(connection, player, channelId);
}

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    
    const channelId = process.env.CHANNEL_ID;
    const guildId = process.env.GUILD_ID;

    // Load up the video list first before joining voice
    await loadPlaylist();

    try {
        const connection = joinVoiceChannel({
            channelId: channelId,
            guildId: guildId,
            adapterCreator: client.guilds.cache.get(guildId).voiceAdapterCreator,
            selfMute: false,
            selfDeaf: true,
        });

        const player = createAudioPlayer({
            behaviors: { noSubscriber: NoSubscriberBehavior.Play }
        });

        startPlaying(connection, player, channelId);

        // When a song ends natively, jump to the next one
        player.on(AudioPlayerStatus.Idle, () => {
            console.log("Track finished.");
            advanceQueue(connection, player, channelId);
        });

        player.on('error', error => {
            console.error(`Audio Player Error: ${error.message}`);
            advanceQueue(connection, player, channelId);
        });

    } catch (error) {
        console.error("Error joining voice channel:", error);
    }
});

client.login(process.env.DISCORD_TOKEN);

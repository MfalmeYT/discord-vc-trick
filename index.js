const { Client, GatewayIntentBits } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, NoSubscriberBehavior, StreamType } = require('@discordjs/voice');
const ytdl = require('youtube-dl-exec');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates
    ]
});

const YOUTUBE_URL = process.env.YOUTUBE_URL || 'https://youtube.com/playlist?list=PLOi4TJ4YyqM4&si=kCAz-6rFC6GhItU7';
let songQueue = [];
let currentSongIndex = 0;

async function updateChannelStatus(channelId, title) {
    try {
        const channel = await client.channels.fetch(channelId);
        if (channel && typeof channel.setVoiceStatus === 'function') {
            const statusText = `🎵 ${title} - Playing Now`.substring(0, 100);
            await channel.setVoiceStatus(statusText);
        }
    } catch (error) {
        console.error("Failed to update status:", error);
    }
}

async function loadPlaylist() {
    try {
        console.log("Fetching playlist data via yt-dlp...");
        // This extracts the titles and direct video URLs from the playlist
        const data = await ytdl(YOUTUBE_URL, {
            dumpSingleJson: true,
            flatPlaylist: true,
            noWarnings: true,
        });

        if (data && data.entries) {
            songQueue = data.entries.map(entry => ({
                title: entry.title || "Unknown Track",
                url: `https://www.youtube.com/watch?v=${entry.id}`
            }));
            console.log(`Loaded ${songQueue.length} tracks from playlist.`);
        } else {
            songQueue = [{ title: data.title || "Single Video", url: YOUTUBE_URL }];
        }
    } catch (error) {
        console.error("Error loading tracks via yt-dlp:", error);
    }
}

async function startPlaying(connection, player, channelId) {
    if (songQueue.length === 0) {
        await loadPlaylist();
        currentSongIndex = 0;
        if (songQueue.length === 0) return;
    }

    const track = songQueue[currentSongIndex];
    console.log(`Playing [${currentSongIndex + 1}/${songQueue.length}]: ${track.title}`);

    try {
        // Query the direct, high-quality audio stream URL using yt-dlp
        const output = await ytdl(track.url, {
            getUrl: true,
            format: 'bestaudio'
        });

        const streamUrl = output.trim();
        const resource = createAudioResource(streamUrl, {
            inputType: StreamType.Arbitrary
        });

        await updateChannelStatus(channelId, track.title);
        player.play(resource);
        connection.subscribe(player);
    } catch (error) {
        console.error(`Stream error on "${track.title}":`, error);
        advanceQueue(connection, player, channelId);
    }
}

function advanceQueue(connection, player, channelId) {
    currentSongIndex++;
    if (currentSongIndex >= songQueue.length) {
        currentSongIndex = 0;
    }
    startPlaying(connection, player, channelId);
}

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    const channelId = process.env.CHANNEL_ID;
    const guildId = process.env.GUILD_ID;

    await loadPlaylist();

    try {
        const connection = joinVoiceChannel({
            channelId,
            guildId,
            adapterCreator: client.guilds.cache.get(guildId).voiceAdapterCreator,
            selfMute: false,
            selfDeaf: true,
        });

        const player = createAudioPlayer({
            behaviors: { noSubscriber: NoSubscriberBehavior.Play }
        });

        startPlaying(connection, player, channelId);

        player.on(AudioPlayerStatus.Idle, () => {
            advanceQueue(connection, player, channelId);
        });

        player.on('error', error => {
            console.error(`Audio player error: ${error.message}`);
            advanceQueue(connection, player, channelId);
        });

    } catch (error) {
        console.error("Connection error:", error);
    }
});

client.login(process.env.DISCORD_TOKEN);

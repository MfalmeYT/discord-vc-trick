const { Client, GatewayIntentBits } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, NoSubscriberBehavior } = require('@discordjs/voice');
const play = require('play-dl');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates
    ]
});

const YOUTUBE_URL = process.env.YOUTUBE_URL || 'https://youtube.com/playlist?list=PLOi4TJ4YyqM4&si=gFxXNm04iRhkFJX-';

async function updateChannelStatus(channelId, title) {
    try {
        const channel = await client.channels.fetch(channelId);
        if (channel && typeof channel.setVoiceStatus === 'function') {
            // Limits status text to 100 characters max per Discord limits
            const statusText = `🎵 ${title} - Playing Now`.substring(0, 100);
            await channel.setVoiceStatus(statusText);
            console.log(`Updated channel status to: ${statusText}`);
        }
    } catch (error) {
        console.error("Failed to update voice channel status:", error);
    }
}

async function startPlaying(connection, player, channelId) {
    try {
        // Fetch stream and video info from YouTube
        const videoInfo = await play.video_info(YOUTUBE_URL);
        const title = videoInfo.video_details.title || "YouTube Stream";
        
        const stream = await play.stream_from_info(videoInfo, {
            quality: 2
        });

        const resource = createAudioResource(stream.stream, {
            inputType: stream.type
        });

        // Update the Voice Channel status with the track title
        await updateChannelStatus(channelId, title);

        player.play(resource);
        connection.subscribe(player);
        console.log(`Now streaming: ${title}`);
    } catch (error) {
        console.error("Error setting up YouTube stream:", error);
        setTimeout(() => startPlaying(connection, player, channelId), 5000);
    }
}

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
    
    const channelId = process.env.CHANNEL_ID;
    const guildId = process.env.GUILD_ID;

    try {
        const connection = joinVoiceChannel({
            channelId: channelId,
            guildId: guildId,
            adapterCreator: client.guilds.cache.get(guildId).voiceAdapterCreator,
            selfMute: false,
            selfDeaf: true,
        });

        const player = createAudioPlayer({
            behaviors: {
                noSubscriber: NoSubscriberBehavior.Play
            }
        });

        startPlaying(connection, player, channelId);

        player.on(AudioPlayerStatus.Idle, () => {
            console.log("Track finished. Restarting loop...");
            startPlaying(connection, player, channelId);
        });

        player.on('error', error => {
            console.error(`Audio Player Error: ${error.message}`);
            startPlaying(connection, player, channelId);
        });

    } catch (error) {
        console.error("Error joining voice channel:", error);
    }
});

client.login(process.env.DISCORD_TOKEN);

const { Client, GatewayIntentBits } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, NoSubscriberBehavior, StreamType } = require('@discordjs/voice');
const ytdl = require('ytdl-core');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates
    ]
});

const YOUTUBE_URL = process.env.YOUTUBE_URL;

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

async function startPlaying(connection, player, channelId) {
    try {
        console.log("Fetching stream from your playlist/video...");
        
        // Options optimize the stream for high-quality live audio chunking
        const stream = ytdl(YOUTUBE_URL, {
            filter: 'audioonly',
            highWaterMark: 1 << 25, // 32MB buffer to stop random dropping
            quality: 'highestaudio'
        });

        const resource = createAudioResource(stream, {
            inputType: StreamType.Arbitrary
        });

        // Grabs info to display the name on the channel status
        ytdl.getBasicInfo(YOUTUBE_URL).then(info => {
            updateChannelStatus(channelId, info.videoDetails.title || "Your Soundtrack");
        }).catch(() => {
            updateChannelStatus(channelId, "Your Soundtrack");
        });

        player.play(resource);
        connection.subscribe(player);
        console.log("Audio pipeline successfully established!");
    } catch (error) {
        console.error("Stream compilation failed. Re-attempting pipeline...", error);
        setTimeout(() => startPlaying(connection, player, channelId), 5000);
    }
}

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
    const channelId = process.env.CHANNEL_ID;
    const guildId = process.env.GUILD_ID;

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

        // Continuous Loop: When it hits idle, restart the soundtrack immediately
        player.on(AudioPlayerStatus.Idle, () => {
            console.log("Soundtrack finished. Restarting loop...");
            startPlaying(connection, player, channelId);
        });

        player.on('error', error => {
            console.error(`Audio pipeline error: ${error.message}`);
            startPlaying(connection, player, channelId);
        });

    } catch (error) {
        console.error("Voice connection failed:", error);
    }
});

client.login(process.env.DISCORD_TOKEN);

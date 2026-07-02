const { Client, GatewayIntentBits } = require('discord.js');
const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    NoSubscriberBehavior,
    StreamType
} = require('@discordjs/voice');
const ytdl = require('@distube/ytdl-core');
const ytpl = require('@distube/ytpl');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates
    ]
});

const YOUTUBE_URL = process.env.YOUTUBE_URL;

let tracks = [];
let currentIndex = 0;

async function updateChannelStatus(channelId, title) {
    try {
        const channel = await client.channels.fetch(channelId);
        if (channel && typeof channel.setVoiceStatus === 'function') {
            const statusText = `🎵 ${title} - Playing Now`.substring(0, 100);
            await channel.setVoiceStatus(statusText);
        }
    } catch (error) {
        console.error('Failed to update status:', error);
    }
}

// Fallback: manually scrape the playlist page for video IDs when ytpl's
// ID validator rejects an otherwise-valid playlist URL.
async function loadPlaylistManually(url) {
    console.log('Falling back to manual playlist scrape...');
    const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const html = await res.text();

    const idMatches = [...html.matchAll(/"videoId":"([a-zA-Z0-9_-]{11})"/g)];
    const uniqueIds = [...new Set(idMatches.map(m => m[1]))];

    if (uniqueIds.length === 0) {
        throw new Error('Manual scrape found 0 video IDs — playlist may be private or the page structure changed.');
    }

    // Titles get fetched lazily per-track via ytdl.getBasicInfo when played
    return uniqueIds.map(id => ({
        url: `https://www.youtube.com/watch?v=${id}`,
        title: null
    }));
}

async function loadPlaylist() {
    console.log('Fetching playlist...');
    try {
        const playlist = await ytpl(YOUTUBE_URL, { limit: Infinity });
        tracks = playlist.items.map(item => ({
            url: item.shortUrl || item.url,
            title: item.title
        }));
        console.log(`Loaded ${tracks.length} tracks via ytpl from "${playlist.title}"`);
    } catch (err) {
        console.warn('ytpl failed:', err.message);
        tracks = await loadPlaylistManually(YOUTUBE_URL);
        console.log(`Loaded ${tracks.length} tracks via manual scrape`);
    }

    if (tracks.length === 0) {
        throw new Error('Playlist resolved but contained 0 tracks.');
    }
}

function playTrack(connection, player, channelId, index) {
    const track = tracks[index];
    console.log(`Now playing [${index + 1}/${tracks.length}]: ${track.title || track.url}`);

    const stream = ytdl(track.url, {
        filter: 'audioonly',
        highWaterMark: 1 << 25,
        quality: 'highestaudio'
    });

    stream.on('error', err => {
        console.error(`Stream error on "${track.url}":`, err.message);
        advance(connection, player, channelId);
    });

    const resource = createAudioResource(stream, {
        inputType: StreamType.Arbitrary
    });

    player.play(resource);
    connection.subscribe(player);

    if (track.title) {
        updateChannelStatus(channelId, track.title);
    } else {
        ytdl.getBasicInfo(track.url)
            .then(info => updateChannelStatus(channelId, info.videoDetails.title || 'Your Soundtrack'))
            .catch(() => updateChannelStatus(channelId, 'Your Soundtrack'));
    }
}

function advance(connection, player, channelId) {
    currentIndex = (currentIndex + 1) % tracks.length;
    playTrack(connection, player, channelId, currentIndex);
}

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    const channelId = process.env.CHANNEL_ID;
    const guildId = process.env.GUILD_ID;

    try {
        await loadPlaylist();

        const guild = client.guilds.cache.get(guildId);
        if (!guild) throw new Error(`Bot is not in guild ${guildId}`);

        const connection = joinVoiceChannel({
            channelId,
            guildId,
            adapterCreator: guild.voiceAdapterCreator,
            selfMute: false,
            selfDeaf: true
        });

        connection.on('error', err => console.error('Voice connection error:', err));

        const player = createAudioPlayer({
            behaviors: { noSubscriber: NoSubscriberBehavior.Play }
        });

        player.on(AudioPlayerStatus.Idle, () => {
            console.log('Track finished, advancing...');
            advance(connection, player, channelId);
        });

        player.on('error', error => {
            console.error(`Player error: ${error.message}`);
            advance(connection, player, channelId);
        });

        playTrack(connection, player, channelId, currentIndex);
    } catch (error) {
        console.error('Startup failed:', error);
    }
});

client.login(process.env.DISCORD_TOKEN);

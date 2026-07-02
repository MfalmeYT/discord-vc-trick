const { Client, GatewayIntentBits } = require('discord.js');
const { joinVoiceChannel } = require('@discordjs/voice');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates
    ]
});

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
    
    try {
        joinVoiceChannel({
            channelId: process.env.CHANNEL_ID,
            guildId: process.env.GUILD_ID,
            adapterCreator: client.guilds.cache.get(process.env.GUILD_ID).voiceAdapterCreator,
            selfMute: true,
            selfDeaf: true,
        });
        console.log("Successfully anchored to the voice channel!");
    } catch (error) {
        console.error("Error joining voice channel:", error);
    }
});

client.login(process.env.DISCORD_TOKEN);

import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle } from 'discord.js'
import { config } from 'dotenv'; import { fileURLToPath } from 'url'; import { dirname, join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'
const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: join(__dirname, '.env') })

const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN
const API_TOKEN = process.env.BOT_TOKEN || 'discord-bot-secret-2024'
const API_URL = process.env.API_URL || 'http://localhost:3001'
const NEWS_CHANNEL_ID = process.env.NEWS_CHANNEL_ID || ''

if (!BOT_TOKEN) { console.error('Missing DISCORD_BOT_TOKEN env'); process.exit(1) }

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildPresences, GatewayIntentBits.GuildMembers] })

client.once('ready', async () => {
  console.log(`[Discord Bot] Logged in as ${client.user.tag}`)

  const commands = [
    new SlashCommandBuilder()
      .setName('news')
      .setDescription('Manage launcher news')
      .addSubcommand(sub => sub
        .setName('post')
        .setDescription('Open a modal to post news'),
      )
      .addSubcommand(sub => sub
        .setName('list')
        .setDescription('List recent news entries'),
      )
      .addSubcommand(sub => sub
        .setName('delete')
        .setDescription('Delete a news entry')
        .addStringOption(opt => opt.setName('id').setDescription('News ID to delete').setRequired(true)),
      ),
  ]

  try {
    const rest = new REST({ version: '10' }).setToken(BOT_TOKEN)
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands })
    console.log('[Discord Bot] Slash commands registered')
  } catch (e) { console.error('Failed to register commands:', e) }

  // Lanyard: fetch initial presences only for the configured admin guild
  console.log('[Lanyard] Fetching initial presences...')
  const data = loadPresence()
  let total = 0
  const guildId = process.env.ADMIN_DISCORD_GUILD_ID || process.env.LANYARD_GUILD_ID
  for (const guild of client.guilds.cache.values()) {
    if (guildId && guild.id !== guildId) continue
    try {
      await guild.members.fetch()
      for (const [, member] of guild.members.cache) {
        if (member.presence) {
          data[member.id] = formatPresence(member.presence, member.user)
          total++
        }
      }
    } catch (e) { console.error('[Lanyard] fetch error', e.message) }
  }
  savePresence(data)
  console.log(`[Lanyard] Initial presence data saved for ${total} members`)
})

const ALLOWED_ROLE_IDS = [
  '1525047958553366600',
  '1524856161697005598',
  '1506634520017764493',
  '1506634289381380328',
]

function canManageNews(member) {
  if (!member) return false
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true
  return member.roles.cache.some(r => ALLOWED_ROLE_IDS.includes(r.id))
}

client.on('interactionCreate', async interaction => {
  // ── Modal submit ──
  if (interaction.isModalSubmit() && interaction.customId === 'news_post_modal') {
    await interaction.deferReply({ ephemeral: true })
    const title = interaction.fields.getTextInputValue('title')
    const text = interaction.fields.getTextInputValue('text')
    const image = interaction.fields.getTextInputValue('image') || ''
    const tag = interaction.fields.getTextInputValue('tag') || 'Update'
    const link = interaction.fields.getTextInputValue('link') || ''

    try {
      const r = await fetch(`${API_URL}/api/news`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: API_TOKEN, title, text, image, tag, link })
      })
      if (!r.ok) { await interaction.editReply(`API failed (HTTP ${r.status})`); return }
      const data = await r.json()
      await interaction.editReply(`Posted news \`${data.id}\`: **${title}**`)

      // Auto-post to configured news channel
      if (NEWS_CHANNEL_ID) {
        const channel = await client.channels.fetch(NEWS_CHANNEL_ID).catch(() => null)
        if (channel?.isTextBased()) {
          const desc = link ? `${text}\n\n🔗 **[Open Link](${link})**` : text
          const embed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(desc)
            .setColor(0xffffff)
            .addFields({ name: 'Tag', value: tag, inline: true })
            .setTimestamp(new Date(data.createdAt))
          if (image) embed.setImage(image)

          await channel.send({ embeds: [embed] })
        }
      }
    } catch (e) {
      await interaction.editReply(`Error: ${e.message}`)
    }
    return
  }

  if (!interaction.isChatInputCommand() || interaction.commandName !== 'news') return

  const sub = interaction.options.getSubcommand()

  if (sub === 'post') {
    if (!canManageNews(interaction.member)) {
      await interaction.reply({ content: 'You need the **Admin** role or Administrator permission to post news.', ephemeral: true })
      return
    }
    const modal = new ModalBuilder()
      .setCustomId('news_post_modal')
      .setTitle('Post News')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('title').setLabel('Title').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('text').setLabel('Text').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(2000),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('image').setLabel('Image URL (optional)').setStyle(TextInputStyle.Short).setRequired(false),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('tag').setLabel('Tag (optional, default: Update)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(30),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('link').setLabel('Link URL (optional)').setStyle(TextInputStyle.Short).setRequired(false),
        ),
      )
    await interaction.showModal(modal)
  }

  if (sub === 'list') {
    await interaction.deferReply({ ephemeral: true })
    try {
      const r = await fetch(`${API_URL}/api/news`)
      const data = await r.json()
      if (!Array.isArray(data) || data.length === 0) {
        await interaction.editReply('No news entries.')
        return
      }
      const lines = data.slice(0, 10).map(n => `\`${n.id}\` — **${n.title}** (${n.tag})`)
      await interaction.editReply(`**Latest News:**\n${lines.join('\n')}`)
    } catch (e) {
      await interaction.editReply(`Error: ${e.message}`)
    }
  }

  if (sub === 'delete') {
    if (!canManageNews(interaction.member)) {
      await interaction.reply({ content: 'You need the **Admin** role or Administrator permission to delete news.', ephemeral: true })
      return
    }
    await interaction.deferReply({ ephemeral: true })
    const id = interaction.options.getString('id', true)
    try {
      const r = await fetch(`${API_URL}/api/news`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: API_TOKEN, id })
      })
      if (!r.ok) { await interaction.editReply(`Failed (HTTP ${r.status})`); return }
      await interaction.editReply(`Deleted news \`${id}\``)
    } catch (e) {
      await interaction.editReply(`Error: ${e.message}`)
    }
  }
})

// ── Lanyard Presence Tracking ──
const PRESENCE_PATH = join(__dirname, 'presence.json')

function loadPresence() {
  if (!existsSync(PRESENCE_PATH)) return {}
  try { return JSON.parse(readFileSync(PRESENCE_PATH, 'utf8')) } catch { return {} }
}
function savePresence(p) { writeFileSync(PRESENCE_PATH, JSON.stringify(p, null, 2), 'utf8') }

function formatPresence(presence, user) {
  if (!presence) return null
  const spotifyActivity = presence.activities?.find(a => a.name === 'Spotify' && a.type === 2)
  return {
    discord_user: user ? {
      id: user.id,
      username: user.username,
      global_name: user.globalName || null,
      discriminator: user.discriminator || '0',
      avatar: user.avatar,
      public_flags: user.publicFlags ?? 0,
      bot: user.bot ?? false,
    } : null,
    discord_status: presence.status || 'offline',
    activities: (presence.activities || []).map(a => ({
      id: a.id,
      name: a.name,
      type: a.type,
      state: a.state || null,
      details: a.details || null,
      timestamps: a.timestamps || null,
      assets: a.assets ? {
        large_image: a.assets.largeImageURL?.() || `mp:${a.assets.largeImage}` || null,
        large_text: a.assets.largeText || null,
        small_image: a.assets.smallImageURL?.() || `mp:${a.assets.smallImage}` || null,
        small_text: a.assets.smallText || null,
      } : null,
      party: a.party || null,
      emoji: a.emoji ? { id: a.emoji.id, name: a.emoji.name, animated: a.emoji.animated } : null,
      sync_id: a.syncId || null,
      session_id: a.sessionId || null,
      flags: a.flags || 0,
      created_at: a.createdAt || null,
      application_id: a.applicationId || null,
    })),
    spotify: spotifyActivity ? {
      track_id: spotifyActivity.syncId || null,
      timestamps: spotifyActivity.timestamps || null,
      song: spotifyActivity.details || null,
      artist: spotifyActivity.state || null,
      album_art_url: spotifyActivity.assets?.largeImageURL?.() || null,
      album: spotifyActivity.assets?.largeText || null,
    } : null,
    listening_to_spotify: !!spotifyActivity,
    kv: {},
    active_on_discord_web: presence.clientStatus?.web === 'online',
    active_on_discord_desktop: presence.clientStatus?.desktop === 'online',
    active_on_discord_mobile: presence.clientStatus?.mobile === 'online',
  }
}

client.on('presenceUpdate', (oldPresence, newPresence) => {
  if (!newPresence) return
  const data = loadPresence()
  const user = newPresence.member?.user || newPresence.user || null
  data[newPresence.userId] = formatPresence(newPresence, user)
  savePresence(data)
})

client.login(BOT_TOKEN)

# WhatsApp Downloader Bot

A simple WhatsApp bot for downloading media from Instagram, Facebook, Twitter, and TikTok.

## Group Chat Behavior

- By default, the bot responds to everyone in group chats (no mention required).
- Set `groupMentionOnly: true` in `config.js` to make the bot only respond when explicitly mentioned (e.g., `@botname download this video`).
- The whitelist feature only applies to personal chats, not group chats.

## Setup

```sh
# Clone the repository
git clone https://github.com/krepowo/whatsapp-downloader-bot.git
cd whatsapp-downloader-bot

# Install dependencies
npm install

# Rename config.js.example to config.js and edit it to your needs
cp config.js.example config.js
nano config.js

# Start the bot
npm start
```

## Development

```sh
npm run lint        # check code formatting
npm run lint:fix    # auto-fix formatting issues
```

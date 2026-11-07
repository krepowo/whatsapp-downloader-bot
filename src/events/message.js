import config from "../../config.js";
import { downloadMediaMessage, normalizeMessageContent } from "@whiskeysockets/baileys";
import { imageToSticker } from "../utils/sticker.js";
import { download } from "../utils/downloader.js";
import log from "../utils/logger.js";

const isGroupMsg = (remoteJid) => {
    return remoteJid?.endsWith("@g.us");
};

export const messageUpsert = {
    event: "messages.upsert",
    handler: async function ({ messages, type }) {
        // Use the dynamically-bound socket (bound via .bind(sock) in index.js)
        const socket = this;
        try {
            if (type !== "notify") return;

            const m = messages?.[0];
            if (!m?.message) return;

            const remoteJid = m.key?.remoteJid;
            const isGroup = isGroupMsg(remoteJid);
            const sender = m.key?.participant?.replace(/@s\.whatsapp\.net/g, "") || remoteJid?.replace(/@s\.whatsapp\.net|@g\.us/g, "");

            // Whitelist — only applies to personal chats
            if (config.enableWhitelist && !isGroup) {
                if (!sender || !config.whitelist.includes(sender)) {
                    log.info(`Blocked message from ${sender} due to not in whitelist`);
                    return;
                }
            }

            // In group chats, only respond to mentions (the bot's own number)
            if (isGroup && config.groupMentionOnly !== false) {
                const botNumber = socket?.user?.id?.replace(/:.*@/s, "") || "";
                const mentionedJids = m.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
                if (!mentionedJids.some((jid) => jid.includes(botNumber))) {
                    return;
                }
            }

            // Mark as read
            try {
                await socket.readMessages([m.key]);
                log.info(`Marked message as read for JID: ${remoteJid}`);
            } catch (err) {
                log.warn(`Failed to mark message as read: ${err?.message || err}`);
            }

            // Resolve content explicitly — never via Object.keys()[0]: in groups, keys[0] is often
            // messageContextInfo / senderKeyDistributionMessage, not the actual message type
            const mContent = normalizeMessageContent(m.message);
            const hasImage = !!mContent.imageMessage;
            const messageText =
                mContent.conversation || mContent.imageMessage?.caption || mContent.extendedTextMessage?.text || mContent.videoMessage?.caption || "";

            // Ping
            if (messageText.trim() === "!ping") {
                try {
                    await socket.sendMessage(remoteJid, { text: "pong" }, { quoted: m });
                    log.info(`Sent pong to ${remoteJid}`);
                } catch (err) {
                    log.warn(`Failed to send pong: ${err?.message || err}`);
                }
                return;
            }

            // ".s" without image — hint
            if (!hasImage && messageText.trim() === ".s") {
                try {
                    await socket.sendMessage(remoteJid, { text: "Kirim gambar dengan caption .s" }, { quoted: m });
                } catch (err) {
                    log.warn(`Failed to send .s hint: ${err?.message || err}`);
                }
                return;
            }

            // Sticker flow: image -> sticker
            // Group: requires ".s" caption; private chat: any image converts automatically
            // (works with or without a caption in private chat)
            const hasUrl = messageText.includes("https://") || messageText.includes("http://");
            const wantsSticker = hasImage && !hasUrl && (isGroup ? messageText.trim().startsWith(".s") : true);

            if (wantsSticker) {
                try {
                    const buffer = await downloadMediaMessage(m, "buffer", {}, { logger: log, reuploadRequest: socket.updateMediaMessage });
                    if (!buffer) throw new Error("Failed to download media");

                    const sticker = await imageToSticker(buffer);

                    await socket.sendMessage(remoteJid, { sticker }, { quoted: m });
                    log.info(`Sent sticker to ${remoteJid}`);
                } catch (err) {
                    log.error(`Sticker conversion failed: ${err?.message || err}`);
                    try {
                        await socket.sendMessage(remoteJid, { text: "❌ Gagal membuat sticker" }, { quoted: m });
                    } catch (sendErr) {
                        log.warn(`Failed to send sticker error notice: ${sendErr?.message || sendErr}`);
                    }
                }
                return;
            }

            // Downloader flow
            if (messageText.includes("https://") || messageText.includes("http://")) {
                let processingMsg;
                try {
                    processingMsg = await socket.sendMessage(remoteJid, { text: "⌛ Memproses link..." }, { quoted: m });
                    log.info(`Sent processing status to ${remoteJid}`);
                } catch (err) {
                    log.warn(`Failed to send processing status: ${err?.message || err}`);
                }

                try {
                    const result = await download(messageText);

                    if (!result?.success) {
                        await socket.sendMessage(remoteJid, { text: `❌ Gagal: ${result?.message || "Terjadi kesalahan"}` }, { quoted: processingMsg || m });
                        log.info(`Download failed for ${remoteJid}: ${result?.message || "Unknown error"}`);
                        return;
                    }

                    const media = result?.data?.media?.[0];
                    if (!media) {
                        await socket.sendMessage(remoteJid, { text: "❌ Gagal: Media tidak ditemukan" }, { quoted: processingMsg || m });
                        log.info(`No media found in download result for ${remoteJid}`);
                        return;
                    }

                    const type = media.type;
                    const url = media.url;

                    if (type === "video") {
                        await socket.sendMessage(remoteJid, { video: { url }, caption: "✅ Selesai!" }, { quoted: processingMsg || m });
                        log.info(`Successfully sent video to ${remoteJid}`);
                    } else if (type === "image") {
                        await socket.sendMessage(remoteJid, { image: { url }, caption: "✅ Selesai!" }, { quoted: processingMsg || m });
                        log.info(`Successfully sent image to ${remoteJid}`);
                    } else {
                        await socket.sendMessage(
                            remoteJid,
                            { document: { url }, fileName: `file.${media.extension}`, caption: "✅ Selesai!" },
                            { quoted: processingMsg || m },
                        );
                        log.info(`Successfully sent document (${media.extension}) to ${remoteJid}`);
                    }
                } catch (err) {
                    log.error(`Error during download/send flow: ${err?.message || err}`);
                    try {
                        await socket.sendMessage(remoteJid, { text: "❌ Gagal: Terjadi kesalahan saat memproses link" }, { quoted: processingMsg || m });
                    } catch (sendErr) {
                        log.warn(`Failed to send failure notice: ${sendErr?.message || sendErr}`);
                    }
                }
            }
        } catch (err) {
            log.error(`Unhandled error in messages.upsert handler: ${err?.message || err}`);
        }
    },
};

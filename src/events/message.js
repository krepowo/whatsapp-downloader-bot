import config from "../../config.js";
import { sock } from "../index.js";
import { download } from "../utils/downloader.js";
import log from "../utils/logger.js";

export const messageUpsert = {
    event: "messages.upsert",
    handler: async ({ messages, type }) => {
        try {
            if (type !== "notify") return;

            const m = messages?.[0];
            if (!m?.message) return;

            // Whitelist
            if (config.enableWhitelist) {
                const sender = m.key?.remoteJid?.replace(/@s\.whatsapp.net|@g\.us/g, "");
                if (!sender || !config.whitelist.includes(sender)) {
                    log.info(`Blocked message from ${sender} due to not in whitelist`);
                    return;
                }
            }

            // Mark as read
            try {
                await sock.readMessages([m.key]);
                log.info(`Marked message as read for JID: ${m.key?.remoteJid}`);
            } catch (err) {
                log.warn(`Failed to mark message as read: ${err?.message || err}`);
            }

            const messageType = Object.keys(m.message)[0];
            const messageText = m.message.conversation || m.message[messageType]?.caption || m.message[messageType]?.text || "";
            const remoteJid = m.key?.remoteJid;

            if (!remoteJid) {
                log.warn("Missing remoteJid; skipping message handling");
                return;
            }

            // Ping
            if (messageText.trim() === "!ping") {
                try {
                    await sock.sendMessage(remoteJid, { text: "pong" }, { quoted: m });
                    log.info(`Sent pong to ${remoteJid}`);
                } catch (err) {
                    log.warn(`Failed to send pong: ${err?.message || err}`);
                }
                return;
            }

            // Downloader flow
            if (messageText.includes("https://") || messageText.includes("http://")) {
                let processingMsg;
                try {
                    processingMsg = await sock.sendMessage(remoteJid, { text: "⌛ Memproses link..." }, { quoted: m });
                    log.info(`Sent processing status to ${remoteJid}`);
                } catch (err) {
                    log.warn(`Failed to send processing status: ${err?.message || err}`);
                }

                try {
                    const result = await download(messageText);

                    if (!result?.success) {
                        await sock.sendMessage(remoteJid, { text: `❌ Gagal: ${result?.message || "Terjadi kesalahan"}` }, { quoted: processingMsg || m });
                        log.info(`Download failed for ${remoteJid}: ${result?.message || "Unknown error"}`);
                        return;
                    }

                    const media = result?.data?.media?.[0];
                    if (!media) {
                        await sock.sendMessage(remoteJid, { text: "❌ Gagal: Media tidak ditemukan" }, { quoted: processingMsg || m });
                        log.info(`No media found in download result for ${remoteJid}`);
                        return;
                    }

                    const type = media.type;
                    const url = media.url;

                    if (type === "video") {
                        await sock.sendMessage(remoteJid, { video: { url }, caption: `✅ Selesai!` }, { quoted: processingMsg || m });
                        log.info(`Successfully sent video to ${remoteJid}`);
                    } else if (type === "image") {
                        await sock.sendMessage(remoteJid, { image: { url }, caption: `✅ Selesai!` }, { quoted: processingMsg || m });
                        log.info(`Successfully sent image to ${remoteJid}`);
                    } else {
                        await sock.sendMessage(
                            remoteJid,
                            { document: { url }, fileName: `file.${media.extension}`, caption: `✅ Selesai!` },
                            { quoted: processingMsg || m }
                        );
                        log.info(`Successfully sent document (${media.extension}) to ${remoteJid}`);
                    }
                } catch (err) {
                    log.error(`Error during download/send flow: ${err?.message || err}`);
                    try {
                        await sock.sendMessage(remoteJid, { text: `❌ Gagal: Terjadi kesalahan saat memproses link` }, { quoted: processingMsg || m });
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

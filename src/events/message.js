import config from "../../config.js";
import { sock } from "../index.js";
import { download } from "../utils/downloader.js";
import log from "../utils/logger.js";

export const messageUpsert = {
    event: "messages.upsert",
    handler: async ({ messages, type }) => {
        if (type === "notify") {
            const m = messages[0];
            if (!m.message) return;

            if (config.enableWhitelist) {
                if (!config.whitelist.includes(m.key.remoteJid.split("@")[0])) {
                    log.info(`Received message from unwhitelisted jid: ${m.key.remoteJid}`);
                    return;
                }
            }

            await sock.readMessages([m.key]);

            const messageType = Object.keys(m.message)[0];
            const messageText = m.message.conversation || m.message[messageType]?.caption || m.message[messageType]?.text;
            const remoteJid = m.key.remoteJid;

            if (messageText === "!ping") {
                await sock.sendMessage(remoteJid, { text: "pong" }, { quoted: m });
            }

            if (messageText.includes("https://") || messageText.includes("http://")) {
                const p = await sock.sendMessage(remoteJid, { text: "⌛ Memproses link..." }, { quoted: m });

                const result = await download(messageText);
                if (!result.success) {
                    await sock.sendMessage(remoteJid, { text: `❌ Gagal: ${result.message}` }, { quoted: p });
                } else {
                    const media = result.data.media[0];
                    const type = media.type;

                    if (type === "video") {
                        await sock.sendMessage(
                            remoteJid,
                            {
                                video: { url: media.url },
                                caption: `✅ Selesai!`,
                            },
                            { quoted: p }
                        );
                    } else if (type === "image") {
                        await sock.sendMessage(
                            remoteJid,
                            {
                                image: { url: media.url },
                                caption: `✅ Selesai!`,
                            },
                            { quoted: p }
                        );
                    } else {
                        await sock.sendMessage(
                            remoteJid,
                            {
                                document: { url: media.url },
                                fileName: `file.${media.extension}`,
                                caption: `✅ Selesai!`,
                            },
                            { quoted: p }
                        );
                    }
                }
            }
        }
    },
};

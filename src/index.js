import { fetchLatestBaileysVersion, makeWASocket, useMultiFileAuthState } from "@whiskeysockets/baileys";
import log from "./utils/logger.js";

import { connectionUpdate } from "./events/connection.js";
import { messageUpsert } from "./events/message.js";

export const connectToWhatsApp = async () => {
    const { state, saveCreds } = await useMultiFileAuthState("auth_info_baileys");

    const waversion = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        auth: state,
        logger: log,
        syncFullHistory: false,
        keepAliveIntervalMs: 10000,
        version: waversion.version,
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on(connectionUpdate.event, connectionUpdate.handler.bind(sock));
    sock.ev.on(messageUpsert.event, messageUpsert.handler.bind(sock));

    return sock;
};

export const sock = await connectToWhatsApp();

// Handle graceful shutdown
const gracefulShutdown = () => {
    log.info("Shutting down gracefully...");
    sock.end();
    process.exit(0);
};

process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);

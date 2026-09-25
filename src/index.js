import { fetchLatestBaileysVersion, makeWASocket, useMultiFileAuthState, DisconnectReason } from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import log from "./utils/logger.js";

import { connectionUpdate } from "./events/connection.js";
import { messageUpsert } from "./events/message.js";

// Global socket reference, updated on every (re)connect so message handlers use the live socket
export let sock;

// Avoid rapid reconnect loops
let reconnectTimeout = null;

export const connectToWhatsApp = async () => {
    const { state, saveCreds } = await useMultiFileAuthState("auth_info_baileys");

    const waversion = await fetchLatestBaileysVersion();

    const newSock = makeWASocket({
        auth: state,
        logger: log,
        syncFullHistory: false,
        keepAliveIntervalMs: 10000,
        version: waversion.version,
        // Increase timeout and retry settings to handle unstable connections
        connectTimeoutMs: 60000,
        qrTimeout: 60000,
    });

    sock = newSock;

    sock.ev.on("creds.update", saveCreds);

    // Bind handlers with the live socket
    sock.ev.on(connectionUpdate.event, connectionUpdate.handler.bind(sock));
    sock.ev.on(messageUpsert.event, messageUpsert.handler.bind(sock));

    return sock;
};

// Initial connection
await connectToWhatsApp();

// Graceful shutdown
const gracefulShutdown = () => {
    log.info("Shutting down gracefully...");
    if (reconnectTimeout) clearTimeout(reconnectTimeout);
    sock.end();
    process.exit(0);
};

process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);

// Watch for connection drops and reconnect with backoff
sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === "close") {
        const statusCode = (lastDisconnect?.error instanceof Boom)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        log.info(`Connection closed (status: ${statusCode}), reconnecting: ${shouldReconnect}`);

        if (shouldReconnect && !reconnectTimeout) {
            reconnectTimeout = setTimeout(() => {
                reconnectTimeout = null;
                log.info("Attempting to reconnect...");
                connectToWhatsApp().catch((err) => {
                    log.error(`Reconnect failed: ${err?.message || err}`);
                });
            }, 5000);
        }
    }
});

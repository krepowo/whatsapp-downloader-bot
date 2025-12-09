import { makeWASocket, useMultiFileAuthState } from "@whiskeysockets/baileys";
import log from "./utils/logger.js";

import { connectionUpdate } from "./events/connection.js";
import { messageUpsert } from "./events/message.js";

export const connectToWhatsApp = async () => {
    const { state, saveCreds } = await useMultiFileAuthState("auth_info_baileys");

    const sock = makeWASocket({
        auth: state,
        logger: log,
    });
    sock.ev.on("creds.update", saveCreds);

    connectionUpdate.handler = connectionUpdate.handler.bind(sock);
    sock.ev.on(connectionUpdate.event, connectionUpdate.handler);

    messageUpsert.handler = messageUpsert.handler.bind(sock);
    sock.ev.on(messageUpsert.event, messageUpsert.handler);

    return sock;
};

export const sock = await connectToWhatsApp();

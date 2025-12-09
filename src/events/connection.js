import { connectToWhatsApp, sock } from "../index.js";
import { Boom } from "@hapi/boom";
import qrcode from "qrcode-terminal";
import log from "../utils/logger.js";

// sock.ev.on("connection.update", (update) => {
//
// });

export const connectionUpdate = {
    event: "connection.update",
    handler: (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            qrcode.generate(qr, { small: true });
        }

        if (connection === "close") {
            const shouldReconnect = (lastDisconnect?.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            log.info("Connection closed due to ", lastDisconnect.error, ", reconnecting ", shouldReconnect);

            if (shouldReconnect) {
                connectToWhatsApp();
            }
        } else if (connection === "open") {
            log.info("Opened connection");
        }
    },
};

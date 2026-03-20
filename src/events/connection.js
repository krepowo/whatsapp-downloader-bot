import { connectToWhatsApp, sock } from "../index.js";
import { Boom } from "@hapi/boom";
import qrcode from "qrcode-terminal";
import log from "../utils/logger.js";
import { DisconnectReason } from "@ryuu-reinzz/baileys";
import config from "../../config.js";

// sock.ev.on("connection.update", (update) => {
//
// });

export const connectionUpdate = {
    event: "connection.update",
    handler: async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            if (config.loginMethod === "qrcode") {
                qrcode.generate(qr, { small: true });
            } else {
                const phoneNumber = config.botPhoneNumber;
                if (!phoneNumber) {
                    log.error("Bot phone number is not set in config, cannot generate QR code for pairing");
                    return;
                }
                const code = await sock.requestPairingCode(phoneNumber);
                log.info(`Pairing code for ${phoneNumber}: ${code}`);
            }
        }

        if (connection === "close") {
            const shouldReconnect = (lastDisconnect?.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            log.info(`Connection closed due to ${lastDisconnect?.error}, reconnecting ${shouldReconnect}`);

            if (shouldReconnect) {
                connectToWhatsApp();
            }
        }

        if (connection === "close" && (lastDisconnect?.error instanceof Boom)?.output?.statusCode === DisconnectReason.restartRequired) {
            connectToWhatsApp();
        }

        if (connection === "open") {
            log.info("Opened connection");
        }
    },
};

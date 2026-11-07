import sharp from "sharp";

// WhatsApp rejects stickers that are too large; aim for <100KB
const MAX_STICKER_BYTES = 100 * 1024;
const QUALITY_LADDER = [80, 60, 40, 25, 10];

export const imageToSticker = async (input) => {
    const base = sharp(input).resize(512, 512, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
    });

    let last;
    for (const quality of QUALITY_LADDER) {
        last = await base.clone().webp({ quality }).toBuffer();
        if (last.length <= MAX_STICKER_BYTES) return last;
    }
    return last;
};

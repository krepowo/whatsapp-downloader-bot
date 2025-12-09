import { snapsave } from "snapsave-media-downloader";

const checkLink = (url) => {
    const socials = ["facebook.com", "instagram.com", "x.com", "tiktok.com"];
    for (let social of socials) {
        if (url.includes(social)) {
            return true;
        }
    }
    return false;
};

export const download = async (url) => {
    if (!checkLink(url)) {
        return { success: false, message: "Unsupported link" };
    }

    const result = await snapsave(url);
    return result;
};

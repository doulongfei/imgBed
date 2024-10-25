import { errorHandling, telemetryData } from "./utils/middleware";

function UnauthorizedException(reason) {
    return new Response(reason, {
        status: 401,
        headers: {
            "Content-Type": "text/plain;charset=UTF-8",
            "Cache-Control": "no-store",
            "Content-Length": reason.length,
        },
    });
}

function isValidAuthCode(envAuthCode, authCode) {
    return authCode && authCode === envAuthCode;
}

function getIpAddress(request) {
    const headers = ["cf-connecting-ip", "x-real-ip", "x-forwarded-for", "x-client-ip", "x-originating-ip"];
    return headers.map(header => request.headers.get(header)).find(ip => ip);
}

function getAuthCode(request) {
    const url = new URL(request.url);
    let authCode = url.searchParams.get("authCode") ||
                   request.headers.get("Referer")?.split("authCode=")[1]?.split("&")[0] ||
                   request.headers.get("authCode") ||
                   getCookieValue(request.headers.get("Cookie"), "authCode");
    return authCode?.trim() || null;
}

function getCookieValue(cookies, name) {
    const match = cookies?.match(new RegExp(`(?:^| )${name}=([^;]*)`));
    return match ? decodeURIComponent(match[1]) : null;
}

function isExtValid(ext) {
    const validExts = ["jpeg", "jpg", "png", "gif", "webp", "mp4", "mp3", "pdf", "txt"];
    return validExts.includes(ext.toLowerCase());
}

function mapFileType(fileType) {
    const map = {
        "image/": { url: "sendPhoto", type: "photo" },
        "video/": { url: "sendVideo", type: "video" },
        "audio/": { url: "sendAudio", type: "audio" },
        "application/pdf": { url: "sendDocument", type: "document" }
    };
    return map[Object.keys(map).find(key => fileType.startsWith(key))] || { url: "sendDocument", type: "document" };
}

export async function onRequestPost(context) {
    const { request, env } = context;
    const uploadIp = getIpAddress(request);
    const authCode = getAuthCode(request);

    if (isValidAuthCode(env.AUTH_CODE, authCode)) {
        return UnauthorizedException("Unauthorized access");
    }

    // await errorHandling(context);
    // telemetryData(context);

    if (!env.img_url) return new Response('Error: Please configure KV database', { status: 500 });

    const formData = await request.clone().formData();
    const file = formData.get("file");
    let fileExt = file.name.split('.').pop() || file.type.split('/').pop();

    if (!isExtValid(fileExt)) fileExt = "unknown";

    // 特殊后缀处理
    if (["gif", "webp"].includes(fileExt)) {
        const newFile = new File([file], file.name.replace(/\.(gif|webp)$/, ".jpeg"), { type: file.type });
        formData.set("file", newFile);
    }

    const sendFunction = mapFileType(file.type);
    const targetUrl = new URL(`https://api.telegram.org/bot${env.TG_BOT_TOKEN}/${sendFunction.url}`);
    targetUrl.searchParams.set("chat_id", env.TG_CHAT_ID);

    try {
        const response = await fetch(targetUrl.href, {
            method: "POST",
            headers: { "User-Agent": "Mozilla/5.0" },
            body: formData,
        });

        if (!response.ok) {
            throw new Error('Upload failed');
        }

        const fileInfo = await response.json();
        const fileId = fileInfo.result?.file_id;
        const filePath = await getFilePath(env, fileId);
        const uniqueId = `${Date.now()}_${Math.floor(Math.random() * 10000)}`;

        return new Response(JSON.stringify([{ src: `/file/${uniqueId}` }]), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    } catch (error) {
        console.error("Error uploading file:", error);
        return new Response("Upload failed. Check environment parameters!", { status: 400 });
    }
}

async function getFilePath(env, file_id) {
    try {
        const url = `https://api.telegram.org/bot${env.TG_BOT_TOKEN}/getFile?file_id=${file_id}`;
        const res = await fetch(url, { method: "GET", headers: { "User-Agent": "Mozilla/5.0" } });
        const data = await res.json();
        return data.result?.file_path || null;
    } catch (error) {
        console.error("Failed to get file path:", error);
        return null;
    }
}

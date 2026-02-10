/**
 * AI 智能命名模块
 * 调用本地 AI API 根据图片内容生成语义化文件名
 * 使用 @jsquash (MozJPEG WASM) 对大图片压缩后再发送
 */
import { decode as decodeJpeg, encode as encodeJpeg } from '@jsquash/jpeg';
import { decode as decodePng } from '@jsquash/png';
import { decode as decodeWebp } from '@jsquash/webp';
import resize from '@jsquash/resize';

// AI 命名用的缩略图参数：512px 最大边 + 质量 40（只需看懂内容即可）
const AI_THUMBNAIL_MAX_SIZE = 512;
const AI_THUMBNAIL_QUALITY = 40;

/**
 * 将 ArrayBuffer 转为 base64 字符串（分块处理，避免栈溢出）
 */
function arrayBufferToBase64(buffer) {
    const uint8Array = new Uint8Array(buffer);
    let binaryStr = '';
    const chunkSize = 8192;
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
        binaryStr += String.fromCharCode(...uint8Array.slice(i, i + chunkSize));
    }
    return btoa(binaryStr);
}

/**
 * 解码图片为 ImageData（支持 JPEG/PNG/WebP）
 * @param {ArrayBuffer} buffer - 图片二进制数据
 * @param {string} mimeType - MIME 类型
 * @returns {Promise<ImageData|null>}
 */
async function decodeImage(buffer, mimeType) {
    try {
        if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') {
            return await decodeJpeg(buffer);
        } else if (mimeType === 'image/png') {
            return await decodePng(buffer);
        } else if (mimeType === 'image/webp') {
            return await decodeWebp(buffer);
        }
        // GIF 等不支持的格式，尝试按 JPEG 解码
        return await decodeJpeg(buffer);
    } catch (error) {
        console.error(`[AI Naming] Failed to decode ${mimeType}:`, error.message);
        return null;
    }
}

/**
 * 将任意图片压缩为 AI 命名用的小缩略图
 * 策略：缩小到 512px + MozJPEG quality=40，通常只有几十 KB
 * @param {ArrayBuffer} imageBuffer - 原始图片
 * @param {string} fileType - MIME 类型
 * @returns {Promise<{buffer: ArrayBuffer, mimeType: string}|null>}
 */
async function compressForAI(imageBuffer, fileType) {
    try {
        // 1. 解码为像素数据
        const imageData = await decodeImage(imageBuffer, fileType);
        if (!imageData) return null;

        console.log(`[AI Naming] Decoded: ${imageData.width}x${imageData.height}`);

        // 2. 计算缩放尺寸（最大边不超过 AI_THUMBNAIL_MAX_SIZE）
        let targetWidth = imageData.width;
        let targetHeight = imageData.height;
        const maxDim = Math.max(targetWidth, targetHeight);

        if (maxDim > AI_THUMBNAIL_MAX_SIZE) {
            const scale = AI_THUMBNAIL_MAX_SIZE / maxDim;
            targetWidth = Math.round(targetWidth * scale);
            targetHeight = Math.round(targetHeight * scale);
        }

        // 3. 缩放
        const resized = await resize(imageData, { width: targetWidth, height: targetHeight });
        console.log(`[AI Naming] Resized: ${targetWidth}x${targetHeight}`);

        // 4. MozJPEG 编码（低质量，追求小体积）
        const encoded = await encodeJpeg(resized, { quality: AI_THUMBNAIL_QUALITY });
        console.log(`[AI Naming] Encoded: ${(encoded.byteLength / 1024).toFixed(1)}KB (quality=${AI_THUMBNAIL_QUALITY})`);

        return { buffer: encoded, mimeType: 'image/jpeg' };
    } catch (error) {
        console.error('[AI Naming] Compression error:', error.message);
        return null;
    }
}

/**
 * 调用 AI API 生成文件名
 * @param {ArrayBuffer} imageBuffer - 图片 ArrayBuffer
 * @param {string} fileType - 文件 MIME 类型
 * @param {Object} env - 环境变量
 * @param {Object} config - AI 命名配置
 * @returns {Promise<string|null>} AI 生成的文件名（不含扩展名）
 */
export async function generateAIFilename(imageBuffer, fileType, env, config) {
    try {
        console.log('[AI Naming] Starting, API URL:', config.apiUrl);
        console.log('[AI Naming] Original image size:', imageBuffer.byteLength, 'bytes');

        // 1. 压缩图片为 AI 命名专用缩略图（所有图片统一压缩，节省传输和 token）
        let finalBuffer = imageBuffer;
        let finalMimeType = fileType;

        const compressed = await compressForAI(imageBuffer, fileType);
        if (compressed) {
            finalBuffer = compressed.buffer;
            finalMimeType = compressed.mimeType;
            console.log(`[AI Naming] Compressed: ${(imageBuffer.byteLength / 1024).toFixed(0)}KB -> ${(finalBuffer.byteLength / 1024).toFixed(1)}KB`);
        } else {
            console.log('[AI Naming] Compression failed, using original image');
        }

        // 2. 转换图片为 base64
        const base64Image = arrayBufferToBase64(finalBuffer);
        const dataUrl = `data:${finalMimeType};base64,${base64Image}`;

        console.log('[AI Naming] Base64 length:', base64Image.length);

        // 3. 构建 API 请求（使用 detail:low 减少 token 消耗）
        const requestBody = {
            model: config.model,
            messages: [{
                role: 'user',
                content: [
                    { type: 'text', text: config.prompt },
                    { type: 'image_url', image_url: { url: dataUrl, detail: 'low' } }
                ]
            }],
            max_tokens: 50
        };

        console.log('[AI Naming] Request body size:', JSON.stringify(requestBody).length, 'bytes');

        // 4. 添加超时控制
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), config.timeout);

        // 5. 调用 AI API
        console.log('[AI Naming] Calling API...');
        const response = await fetch(config.apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.apiKey}`
            },
            body: JSON.stringify(requestBody),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        console.log('[AI Naming] Response status:', response.status);

        if (!response.ok) {
            const errorText = await response.text();
            console.log('[AI Naming] Error response:', errorText);
            throw new Error(`AI API error: ${response.status} - ${errorText}`);
        }

        // 6. 解析响应
        const data = await response.json();
        const aiName = data.choices?.[0]?.message?.content?.trim();

        if (!aiName) {
            throw new Error('AI API returned empty response');
        }

        // 7. 文件名清洗（移除非法字符）
        return sanitizeAIFilename(aiName);

    } catch (error) {
        if (error.name === 'AbortError') {
            console.error('[AI Naming] Request timeout');
        } else {
            console.error('[AI Naming] Error:', error.message);
        }
        return null;
    }
}

/**
 * 清洗 AI 生成的文件名
 * @param {string} aiName - AI 生成的原始文件名
 * @returns {string} 清洗后的文件名
 */
function sanitizeAIFilename(aiName) {
    // 移除引号、空格、特殊字符
    return aiName
        .replace(/['"]/g, '')           // 移除引号
        .replace(/\s+/g, '-')           // 空格转连字符
        .replace(/[^\w\-]/g, '')        // 移除非字母数字和连字符
        .replace(/^-+|-+$/g, '')        // 移除首尾连字符
        .replace(/-{2,}/g, '-')         // 多个连字符合并为一个
        .toLowerCase()                  // 转小写
        .slice(0, 30);                  // 限制长度
}

/**
 * 带重试的 AI 命名调用
 * @param {ArrayBuffer} imageBuffer - 图片 ArrayBuffer
 * @param {string} fileType - 文件 MIME 类型
 * @param {Object} env - 环境变量
 * @param {Object} config - AI 命名配置
 * @returns {Promise<string|null>} AI 生成的文件名
 */
export async function generateAIFilenameWithRetry(imageBuffer, fileType, env, config) {
    const maxRetries = config.maxRetries || 2;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        console.log(`[AI Naming] Attempt ${attempt}/${maxRetries}`);

        const result = await generateAIFilename(imageBuffer, fileType, env, config);

        if (result) {
            console.log(`[AI Naming] Success on attempt ${attempt}: ${result}`);
            return result;
        }

        if (attempt < maxRetries) {
            // 指数退避：第一次重试等待 1 秒，第二次等待 2 秒
            const waitTime = 1000 * attempt;
            console.log(`[AI Naming] Retry after ${waitTime}ms`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
    }

    console.log(`[AI Naming] Failed after ${maxRetries} attempts`);
    return null;
}

/**
 * AI 智能命名模块
 * 调用本地 AI API 根据图片内容生成语义化文件名
 */
import jpeg from 'jpeg-js';

// AI API 请求体大小上限（base64 编码后约为原始大小的 1.37 倍，加上 JSON 开销）
const MAX_REQUEST_BODY_SIZE = 4 * 1024 * 1024; // 4MB（对应原始图片约 3MB）

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
 * 压缩 JPEG 图片到指定大小以内
 * @param {ArrayBuffer} imageBuffer - 原始图片
 * @param {number} maxSize - 目标最大大小（字节）
 * @returns {{buffer: ArrayBuffer, mimeType: string}|null} 压缩后的图片，或 null 表示无法压缩
 */
function compressJpegToFit(imageBuffer, maxSize) {
    try {
        const rawData = jpeg.decode(new Uint8Array(imageBuffer), { useTArray: true, formatAsRGBA: true });
        console.log(`[AI Naming] JPEG decoded: ${rawData.width}x${rawData.height}`);

        // 逐步降低质量直到满足大小要求
        for (let quality = 60; quality >= 10; quality -= 10) {
            const encoded = jpeg.encode(rawData, quality);
            console.log(`[AI Naming] JPEG re-encoded quality=${quality}: ${(encoded.data.length / 1024).toFixed(0)}KB`);
            if (encoded.data.length <= maxSize) {
                return { buffer: encoded.data.buffer, mimeType: 'image/jpeg' };
            }
        }

        // 最低质量仍然超限
        console.log('[AI Naming] JPEG compression failed: still too large at quality=10');
        return null;
    } catch (error) {
        console.error('[AI Naming] JPEG compression error:', error.message);
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
        console.log('[AI Naming] Image size:', imageBuffer.byteLength, 'bytes');

        // 1. 大图片压缩处理（避免 413 Request Entity Too Large）
        const maxImageSize = config.maxImageSize || MAX_REQUEST_BODY_SIZE;
        let finalBuffer = imageBuffer;
        let finalMimeType = fileType;

        if (imageBuffer.byteLength > maxImageSize) {
            console.log(`[AI Naming] Image too large (${(imageBuffer.byteLength / 1024 / 1024).toFixed(2)}MB), compressing...`);

            if (fileType === 'image/jpeg' || fileType === 'image/jpg') {
                // JPEG: 降低质量重新编码
                const compressed = compressJpegToFit(imageBuffer, maxImageSize);
                if (!compressed) {
                    console.log('[AI Naming] Compression failed, skipping');
                    return null;
                }
                finalBuffer = compressed.buffer;
                finalMimeType = compressed.mimeType;
                console.log(`[AI Naming] Compressed: ${(imageBuffer.byteLength / 1024).toFixed(0)}KB -> ${(finalBuffer.byteLength / 1024).toFixed(0)}KB`);
            } else {
                // PNG/WebP/GIF 等非 JPEG 格式：尝试按 JPEG 解码压缩（PNG 可解码为像素数据后编码为 JPEG）
                console.log(`[AI Naming] Non-JPEG format (${fileType}), attempting JPEG re-encode...`);
                const compressed = compressJpegToFit(imageBuffer, maxImageSize);
                if (compressed) {
                    finalBuffer = compressed.buffer;
                    finalMimeType = compressed.mimeType;
                    console.log(`[AI Naming] Re-encoded as JPEG: ${(imageBuffer.byteLength / 1024).toFixed(0)}KB -> ${(finalBuffer.byteLength / 1024).toFixed(0)}KB`);
                } else {
                    console.log(`[AI Naming] Cannot compress ${fileType}, skipping`);
                    return null;
                }
            }
        }

        // 2. 转换图片为 base64
        const base64Image = arrayBufferToBase64(finalBuffer);
        const dataUrl = `data:${finalMimeType};base64,${base64Image}`;

        console.log('[AI Naming] Base64 length:', base64Image.length);

        // 3. 构建 API 请求（使用 detail:low 减少 token 消耗，AI 命名不需要高分辨率）
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

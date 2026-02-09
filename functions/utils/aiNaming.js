/**
 * AI 智能命名模块
 * 调用本地 AI API 根据图片内容生成语义化文件名
 */

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
        // 1. 转换图片为 base64
        const uint8Array = new Uint8Array(imageBuffer);
        const base64Image = btoa(String.fromCharCode(...uint8Array));
        const dataUrl = `data:${fileType};base64,${base64Image}`;

        // 2. 构建 API 请求
        const requestBody = {
            model: config.model,
            messages: [{
                role: 'user',
                content: [
                    { type: 'text', text: config.prompt },
                    { type: 'image_url', image_url: { url: dataUrl } }
                ]
            }],
            max_tokens: 50
        };

        // 3. 添加超时控制
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), config.timeout);

        // 4. 调用 AI API
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

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`AI API error: ${response.status} - ${errorText}`);
        }

        // 5. 解析响应
        const data = await response.json();
        const aiName = data.choices?.[0]?.message?.content?.trim();

        if (!aiName) {
            throw new Error('AI API returned empty response');
        }

        // 6. 文件名清洗（移除非法字符）
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

import { getDatabase } from '../../../utils/databaseAdapter.js';

export async function onRequest(context) {
    // 其他设置相关，GET方法读取设置，POST方法保存设置
    const {
      request, // same as existing Worker API
      env, // same as existing Worker API
      params, // if filename includes [id] or [[path]]
      waitUntil, // same as ctx.waitUntil in existing Worker API
      next, // used for middleware or to fetch assets
      data, // arbitrary space for passing data between middlewares
    } = context;

    const db = getDatabase(env);

    // GET读取设置
    if (request.method === 'GET') {
        const settings = await getOthersConfig(db, env)

        return new Response(JSON.stringify(settings), {
            headers: {
                'content-type': 'application/json',
            },
        })
    }

    // POST保存设置
    if (request.method === 'POST') {
        const body = await request.json()
        const settings = body

        // 写入数据库
        await db.put('manage@sysConfig@others', JSON.stringify(settings))

        return new Response(JSON.stringify(settings), {
            headers: {
                'content-type': 'application/json',
            },
        })
    }

}

export async function getOthersConfig(db, env) {
    const settings = {}
    // 读取数据库中的设置
    const settingsStr = await db.get('manage@sysConfig@others')
    const settingsKV = settingsStr ? JSON.parse(settingsStr) : {}

    // 远端遥测
    const kvTelemetry = settingsKV.telemetry || {}
    settings.telemetry = {
        enabled: kvTelemetry.enabled ?? !(env.disable_telemetry === 'true'),
        fixed: false,
    }

    // 随机图API
    const kvRandomImageAPI = settingsKV.randomImageAPI || {}
    settings.randomImageAPI = {
        enabled: kvRandomImageAPI.enabled ?? env.AllowRandom === 'true',
        allowedDir: kvRandomImageAPI.allowedDir ?? '',
        fixed: false,
    }

    // CloudFlare API Token
    const kvCloudflareApiToken = settingsKV.cloudflareApiToken || {}
    settings.cloudflareApiToken = {
        CF_ZONE_ID: kvCloudflareApiToken.CF_ZONE_ID || env.CF_ZONE_ID,
        CF_EMAIL: kvCloudflareApiToken.CF_EMAIL || env.CF_EMAIL,
        CF_API_KEY: kvCloudflareApiToken.CF_API_KEY || env.CF_API_KEY,
        fixed: false,
    }

    // WebDAV
    const kvWebDAV = settingsKV.webDAV || {}
    settings.webDAV = {
        enabled: kvWebDAV.enabled ?? false,
        username: kvWebDAV.username || '',
        password: kvWebDAV.password || '',
        uploadChannel: kvWebDAV.uploadChannel || '',
        channelName: kvWebDAV.channelName || '',
        fixed: false,
    }

    // 公开浏览
    const kvPublicBrowse = settingsKV.publicBrowse || {}
    settings.publicBrowse = {
        enabled: kvPublicBrowse.enabled ?? false,
        allowedDir: kvPublicBrowse.allowedDir || '',
        fixed: false,
    }

    // AI 智能命名
    const kvAINaming = settingsKV.aiNaming || {}
    settings.aiNaming = {
        enabled: kvAINaming.enabled ?? (env.AI_NAMING_ENABLED === 'true'),
        apiUrl: kvAINaming.apiUrl || env.AI_NAMING_API_URL || '',
        apiKey: kvAINaming.apiKey || env.AI_NAMING_API_KEY || '',
        model: kvAINaming.model || env.AI_NAMING_MODEL || 'gpt-4o',
        prompt: kvAINaming.prompt || env.AI_NAMING_PROMPT ||
            'Please give this image a concise, descriptive filename (without extension, max 30 characters, use hyphens instead of spaces). Only return the filename, nothing else.',
        timeout: kvAINaming.timeout || parseInt(env.AI_NAMING_TIMEOUT) || 10000,
        maxRetries: kvAINaming.maxRetries || parseInt(env.AI_NAMING_MAX_RETRIES) || 2,
        fallbackNameType: kvAINaming.fallbackNameType || env.AI_NAMING_FALLBACK || 'default',
        fixed: false,
    }

    return settings;
}
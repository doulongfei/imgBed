import { getDatabase } from '../../../utils/databaseAdapter.js';

export async function onRequest(context) {
    // 页面设置相关，GET方法读取设置，POST方法保存设置
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
        const settings = await getPageConfig(db, env)

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
        await db.put('manage@sysConfig@page', JSON.stringify(settings))

        return new Response(JSON.stringify(settings), {
            headers: {
                'content-type': 'application/json',
            },
        })
    }

}

export async function getPageConfig(db, env) {
    const settings = {}
    // 读取数据库中的设置
    const settingsStr = await db.get('manage@sysConfig@page')
    const settingsKV = settingsStr ? JSON.parse(settingsStr) : {}

    const config = []
    settings.config = config
    config.push(
        // 全局设置
        {
            id: 'siteTitle',
            label: '网站标题',
            placeholder: 'Sanyue ImgHub',
            category: '全局设置',
        },
        {
            id: 'siteIcon',
            label: '网站图标',
            category: '全局设置',
        },
        {
            id: 'ownerName',
            label: '图床名称',
            placeholder: 'Sanyue ImgHub',
            category: '全局设置',
        },
        {
            id: 'logoUrl',
            label: '图床Logo',
            category: '全局设置',
        },
        {
            id: 'logoLink',
            label: 'Logo跳转链接',
            placeholder: 'https://github.com/MarSeventh/CloudFlare-ImgBed',
            tooltip: '点击Logo时跳转的链接，留空则使用默认GitHub链接',
            category: '全局设置',
        },
        {
            id: 'bkInterval',
            label: '背景切换间隔',
            placeholder: '3000',
            tooltip: '单位：毫秒 ms',
            category: '全局设置',
        },
        {
            id: 'bkOpacity',
            label: '背景图透明度',
            placeholder: '1',
            tooltip: '0-1 之间的小数',
            category: '全局设置',
        },
        {
            id: 'urlPrefix',
            label: '默认URL前缀',
            tooltip: '自定义URL前缀，如：https://img.a.com/file/，留空则使用当前域名 <br/> 设置后将应用于客户端和管理端',
            category: '全局设置',
        },
        // 客户端设置
        {
            id: 'announcement',
            label: '公告',
            tooltip: '支持HTML标签',
            category: '客户端设置',
        },
        {
            id: 'defaultUploadChannel',
            label: '默认渠道类型',
            type: 'select',
            options: [
                { label: 'Telegram', value: 'telegram' },
                { label: 'Cloudflare R2', value: 'cfr2' },
                { label: 'S3', value: 's3' },
                { label: 'Discord', value: 'discord' },
                { label: 'HuggingFace', value: 'huggingface' },
            ],
            placeholder: 'telegram',
            category: '客户端设置',
        },
        {
            id: 'defaultChannelName',
            label: '默认渠道名称',
            type: 'channelName',
            tooltip: '指定默认使用的渠道名称，需先选择上传渠道',
            category: '客户端设置',
        },
        {
            id: 'defaultUploadFolder',
            label: '默认上传目录',
            placeholder: '/ 开头的合法目录，不能包含特殊字符， 默认为根目录',
            category: '客户端设置',
        },
        {
            id: 'defaultUploadNameType',
            label: '默认命名方式',
            type: 'select',
            options: [
                { label: '默认', value: 'default' },
                { label: '仅前缀', value: 'index' },
                { label: '仅原名', value: 'origin' },
                { label: '短链接', value: 'short' },
                { label: 'AI智能', value: 'ai' },
            ],
            placeholder: 'default',
            category: '客户端设置',
        },
        {
            id: 'defaultConvertToWebp',
            label: '默认转换WebP',
            type: 'boolean',
            default: false,
            tooltip: '上传前将图片转换为WebP格式，可有效减小文件体积',
            category: '客户端设置',
        },
        {
            id: 'defaultCustomerCompress',
            label: '默认开启压缩',
            type: 'boolean',
            default: true,
            tooltip: '上传前在本地进行压缩，仅对图片文件生效',
            category: '客户端设置',
        },
        {
            id: 'defaultCompressBar',
            label: '默认压缩阈值',
            placeholder: '5',
            tooltip: '图片大小超过此值将自动压缩，单位MB，范围1-20',
            category: '客户端设置',
        },
        {
            id: 'defaultCompressQuality',
            label: '默认期望大小',
            placeholder: '4',
            tooltip: '压缩后图片大小期望值，单位MB，范围0.5-压缩阈值',
            category: '客户端设置',
        },
        {
            id: 'loginBkImg',
            label: '登录页背景图',
            tooltip: '1.填写 bing 使用必应壁纸轮播 <br/> 2.填写 ["url1","url2"] 使用多张图片轮播 <br/> 3.填写 ["url"] 使用单张图片',
            category: '客户端设置',
        },
        {
            id: 'uploadBkImg',
            label: '上传页背景图',
            tooltip: '1.填写 bing 使用必应壁纸轮播 <br/> 2.填写 ["url1","url2"] 使用多张图片轮播 <br/> 3.填写 ["url"] 使用单张图片',
            category: '客户端设置',
        },
        {
            id: 'footerLink',
            label: '页脚传送门链接',
            category: '客户端设置',
        },
        {
            id: 'disableFooter',
            label: '隐藏页脚',
            type: 'boolean',
            default: false,
            category: '客户端设置',
        },
        // 管理端设置
        {
            id: 'adminLoginBkImg',
            label: '登录页背景图',
            tooltip: '1.填写 bing 使用必应壁纸轮播 <br/> 2.填写 ["url1","url2"] 使用多张图片轮播 <br/> 3.填写 ["url"] 使用单张图片',
            category: '管理端设置',
        },
        {
            id: 'adminBkImg',
            label: '管理页背景图',
            tooltip: '1.填写 bing 使用必应壁纸轮播 <br/> 2.填写 ["url1","url2"] 使用多张图片轮播 <br/> 3.填写 ["url"] 使用单张图片',
            category: '管理端设置',
        },
        // AI智能命名设置
        {
            id: 'aiNamingEnabled',
            label: '启用AI命名',
            type: 'boolean',
            default: false,
            tooltip: '开启后可使用AI根据图片内容生成语义化文件名<br/>需要配置AI服务地址和密钥',
            category: 'AI智能命名',
        },
        {
            id: 'aiNamingApiUrl',
            label: 'API地址',
            placeholder: 'http://localhost:8066/v1/chat/completions',
            tooltip: '兼容OpenAI格式的聊天API地址',
            category: 'AI智能命名',
        },
        {
            id: 'aiNamingApiKey',
            label: 'API密钥',
            placeholder: '请输入API密钥',
            tooltip: 'AI服务的访问密钥',
            category: 'AI智能命名',
        },
        {
            id: 'aiNamingModel',
            label: '模型名称',
            placeholder: 'gpt-4o',
            tooltip: '使用的AI模型，如：gpt-4o、gemini-3-flash等',
            category: 'AI智能命名',
        },
        {
            id: 'aiNamingPrompt',
            label: '提示词模板',
            type: 'textarea',
            placeholder: 'Please give this image a concise, descriptive filename (without extension, max 30 characters, use hyphens instead of spaces). Only return the filename, nothing else.',
            tooltip: '用于指导AI生成文件名的提示词<br/>可自定义以调整命名风格',
            category: 'AI智能命名',
        },
        {
            id: 'aiNamingTimeout',
            label: '超时时间(毫秒)',
            placeholder: '10000',
            tooltip: 'AI请求超时时间，默认10000毫秒(10秒)<br/>超时后将自动降级到默认命名',
            category: 'AI智能命名',
        },
        {
            id: 'aiNamingMaxRetries',
            label: '最大重试次数',
            placeholder: '2',
            tooltip: 'AI请求失败后的重试次数，默认2次<br/>使用指数退避策略',
            category: 'AI智能命名',
        },
        {
            id: 'aiNamingFallbackNameType',
            label: '降级命名方式',
            type: 'select',
            options: [
                { label: '默认', value: 'default' },
                { label: '仅前缀', value: 'index' },
                { label: '仅原名', value: 'origin' },
                { label: '短链接', value: 'short' },
            ],
            placeholder: 'default',
            tooltip: 'AI命名失败后使用的备用命名方式',
            category: 'AI智能命名',
        }
    )

    const userConfig = env.USER_CONFIG
    if (userConfig) {
        try {
            const parsedConfig = JSON.parse(userConfig)
            if (typeof parsedConfig === 'object' && parsedConfig !== null) {
                // 搜索config中的id，如果存在则更新
                for (let i = 0; i < config.length; i++) {
                    if (parsedConfig[config[i].id]) {
                        config[i].value = parsedConfig[config[i].id]
                    }
                }
            }
        } catch (error) {
            // do nothing
        }
    }

    // 用KV中的设置覆盖默认设置
    for (let i = 0; i < settingsKV.config?.length; i++) {
        const item = settingsKV.config[i]
        const index = config.findIndex(x => x.id === item.id)
        if (index !== -1) {
            config[index].value = item.value
        }
    }

    return settings
}
export async function onRequest(context) {
	// Contents of context object
	const {
		request, // same as existing Worker API
		env, // same as existing Worker API
		params, // if filename includes [id] or [[path]]
		waitUntil, // same as ctx.waitUntil in existing Worker API
		next, // used for middleware or to fetch assets
		data // arbitrary space for passing data between middlewares
	} = context;

	const url = new URL(request.url);
	let sub = url.searchParams.get('sub');
	const type = url.searchParams.get('type');
	console.log('请求参数sub:' + sub + ' type:' + type);
	if (sub == null) {
		sub = '0';
	}
	const info = await fetchYaml(sub, type);
	return new Response(info);
}

function getTodayUrl(num, type) {
	const today = new Date();
	const year = today.getFullYear();
	const month = String(today.getMonth() + 1).padStart(2, '0'); // 月份从0开始，所以加1
	const day = String(today.getDate()).padStart(2, '0'); // 补零到两位
	const suffix = type === 'v2ray' ? 'txt' : 'yaml';
	return `https://clash-meta.github.io/uploads/${year}/${month}/${num}-2024${month}${day}.${suffix}`;
}

async function fetchYaml(num, type) {
	try {
		const url = getTodayUrl(num, type); // 假设 getTodayUrl 函数在这里定义并返回 URL
		const response = await fetch(url);
		if (!response.ok) {
			return ''
		}
		return await response.text();
	} catch (error) {
		console.error('There has been a problem with your fetch operation:', error);
		return ''
	}
}



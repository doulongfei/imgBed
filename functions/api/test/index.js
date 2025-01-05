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
	let name = url.searchParams.get('n');
	let pwd = url.searchParams.get('p');
	const dou = url.searchParams.get('dou');
	if (dou == null) {
		name = env.CPOLAR_NAME;
		pwd = env.CPOLAR_PWD;
	}
	const info = await getTunnelInfo(name, pwd);
	return new Response(info);
}

// 定义接口
async function getTunnelInfo(username, password) {
	const loginUrl = 'https://dashboard.cpolar.com/login';  // 登录接口
	const infoUrl = 'https://dashboard.cpolar.com/status';  // 隧道信息接口

	// 设定请求头信息，模拟浏览器请求
	const headers = {
		'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
		'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
		'Accept-Encoding': 'gzip, deflate, br',
		'Accept-Language': 'en-US,en;q=0.9',
		'Connection': 'keep-alive',
		'Upgrade-Insecure-Requests': '1',
		'Cache-Control': 'max-age=0'
	};

	try {
		// 1. 获取登录页面，提取 CSRF token
		const loginPageResponse = await fetch(loginUrl, {
			method: 'GET',
			headers: headers
		});

		const loginPageText = await loginPageResponse.text();
		const csrfToken = extractCsrfToken(loginPageText); // 提取 CSRF token

		if (!csrfToken) {
			throw new Error('无法获取 CSRF token');
		}

		// 2. 使用用户名、密码和 CSRF token 进行登录
		const loginResponse = await fetch(loginUrl, {
			method: 'POST',
			headers: {
				...headers,
				'Content-Type': 'application/x-www-form-urlencoded'
			},
			body: new URLSearchParams({
				login: username,
				password: password,
				csrf_token: csrfToken  // CSRF token
			})
		});

		// 检查登录是否成功
		if (loginResponse.url === loginUrl) {
			throw new Error('登录失败，检查用户名和密码');
		}

		console.log('登录成功');

		// 3. 获取隧道信息页面
		const infoResponse = await fetch(infoUrl, {
			method: 'GET',
			headers: headers,
			credentials: 'same-origin'  // 保持会话状态
		});

		if (!infoResponse.ok) {
			throw new Error('无法获取隧道信息');
		}

		const infoText = await infoResponse.text();
		const tunnelInfo = parseTunnelData(infoText); // 提取隧道信息
		return tunnelInfo;
	} catch (error) {
		console.error(error);
		return null;
	}
}

// 提取 CSRF token 的函数
function extractCsrfToken(pageText) {
	const csrfTokenMatch = pageText.match(/name="csrf_token" value="([^"]+)"/);
	return csrfTokenMatch ? csrfTokenMatch[1] : null;
}

function parseTunnelData(htmlString) {
	// 创建一个 DOMParser 实例
	const parser = new DOMParser();

	// 解析 HTML 字符串为文档对象
	const doc = parser.parseFromString(htmlString, 'text/html');

	// 获取表格中的每一行
	const rows = doc.querySelectorAll('table tbody tr');

	// 存储隧道信息的数组
	const tunnels = [];

	// 遍历每一行并提取信息
	for (const row of rows) {
		const cells = row.querySelectorAll('td');
		const tunnel = {
			name: cells[0].textContent.trim(),    // 隧道名称
			region: cells[1].textContent.trim(),  // 地区
			localAddress: cells[2].textContent.trim(), // 本地地址
			createdAt: cells[3].textContent.trim()  // 创建时间
		};
		tunnel.url = row.querySelectorAll('a')[0].textContent;
		tunnels.push(tunnel);
	}
	return tunnels;
}



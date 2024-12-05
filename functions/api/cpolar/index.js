import puppeteer from 'puppeteer';

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
	console.log('urlInfo' + url.searchParams);
	console.log('urlInfo' + JSON.stringify(url.searchParams));
	let name = url.searchParams.get('n');
	let pwd = url.searchParams.get('p');
	const dou = url.searchParams.get('dou');
	if (dou === 'dou') {
		name = env.CPOLAR_NAME;
		pwd = env.CPOLAR_PWD;
	}
	console.log('请求参数name:' + name + ' pwd:' + pwd);
	// return new Response('Hello World!');
	const info = await getTunnelInfo(name, pwd);
	return new Response(info);
}


// 定义接口
async function getTunnelInfo(username, password) {
	const loginUrl = 'https://dashboard.cpolar.com/login';  // 登录接口
	const infoUrl = 'https://dashboard.cpolar.com/status';  // 隧道信息接口

	const browser = await puppeteer.launch({ headless: true });  // 启动浏览器
	const page = await browser.newPage();

	try {
		// 1. 获取登录页面，提取 CSRF token
		await page.goto(loginUrl, { waitUntil: 'domcontentloaded' });
		const csrfToken = await page.evaluate(() => {
			const tokenElement = document.querySelector('input[name="csrf_token"]');
			return tokenElement ? tokenElement.value : null;
		});

		if (!csrfToken) {
			throw new Error('无法获取 CSRF token');
		}

		// 2. 使用用户名、密码和 CSRF token 进行登录
		await page.type('input[name="login"]', username);  // 填充用户名
		await page.type('input[name="password"]', password);  // 填充密码
		await page.type('input[name="csrf_token"]', csrfToken);  // 填充 CSRF token

		await Promise.all([
			page.click('button[type="submit"]'),  // 提交表单
			page.waitForNavigation({ waitUntil: 'domcontentloaded' })  // 等待导航
		]);

		const loginUrlAfterLogin = page.url();
		console.log('loginResponse:', loginUrlAfterLogin);

		// 检查登录是否成功
		if (loginUrlAfterLogin === loginUrl) {
			throw new Error('登录失败，检查用户名和密码');
		}

		console.log('登录成功');

		// 3. 获取隧道信息页面
		await page.goto(infoUrl, { waitUntil: 'domcontentloaded' });

		// 获取隧道信息
		const tunnelInfo = await page.evaluate(() => {
			const rows = document.querySelectorAll('table tbody tr');
			const tunnels = [];

			rows.forEach(row => {
				const cells = row.querySelectorAll('td');
				const tunnel = {
					name: cells[0].textContent.trim(),
					region: cells[1].textContent.trim(),
					localAddress: cells[2].textContent.trim(),
					createdAt: cells[3].textContent.trim(),
					url: row.querySelector('a') ? row.querySelector('a').textContent : ''
				};
				tunnels.push(tunnel);
			});
			return tunnels;
		});

		return tunnelInfo;
	} catch (error) {
		console.error(error);
		return null;
	} finally {
		await browser.close();  // 关闭浏览器
	}
}

//
// // 调用接口
// getTunnelInfo('your_username', 'your_password').then(tunnelInfo => {
//   console.log(tunnelInfo);
// });

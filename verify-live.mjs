import { chromium } from 'playwright-core';
const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const dir = '/tmp/claude-0/-home-user-Buddhabrot/462212e8-c2d3-5260-b38c-31608c7f6a95/scratchpad/';
const url = 'https://raw.githack.com/4vmp5pkwz4-pixel/Buddhabrot/main/buddhabrot.html';
const browser = await chromium.launch({
  executablePath: exe, headless: true,
  proxy: { server: process.env.HTTPS_PROXY },
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox','--ignore-certificate-errors'],
});
const page = await browser.newPage({ viewport: { width: 1000, height: 820 }, ignoreHTTPSErrors: true });
const errs = [];
page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
const resp = await page.goto(url, { waitUntil: 'load', timeout: 45000 });
console.log('HTTP', resp.status(), resp.headers()['content-type']);
const diag = await page.evaluate(() => ({ panel: !!document.querySelector('.panel'), fatal: !!document.querySelector('.fatal'), title: document.title }));
console.log('DIAG', JSON.stringify(diag));
// speed up frames so it converges under software GL
await page.evaluate(() => { const a = window.buddhabrot; if(a){ a.cfg.camera.autoRotate=false; document.body.classList.add('panel-hidden'); a.cfg.render.rayMarchSteps=70; a.renderer.applyRender(a.cfg.render);} });
await page.waitForTimeout(14000);
await page.evaluate(() => { const a = window.buddhabrot; if(a){ a.cfg.render.rayMarchSteps=300; a.renderer.applyRender(a.cfg.render);} });
await page.waitForTimeout(700);
await page.screenshot({ path: dir + 'live.png', timeout: 60000 });
console.log('ERRORS', errs.length ? errs.slice(0,8).join('\n') : 'none');
await browser.close();

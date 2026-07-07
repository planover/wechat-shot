'use strict';
/**
 * test/ssrf-policy.test.js — wechat-shot 浏览器侧 SSRF 防护独立验证
 *
 * 纯 Node，无需测试框架、无需浏览器/Puppeteer。
 *   (A) 直接 require('../lib/ssrf')，断言 isBlockedHostname 矩阵。
 *   (B) require('../index') 取出真实 decideImageRequest，跑三种模式：
 *         - 默认模式（allowlist:null，注入假 resolveDns 返回公网地址）
 *         - DNS 重绑定模拟（同一主机名解析到不同内网地址 → 应 abort）
 *         - 严格白名单模式（allowlist:Set(['images.unsplash.com'])）
 *
 * 末尾打印 PASS x / FAIL y；任一 FAIL 则 process.exit(1)。
 */

const { isBlockedHostname } = require('../lib/ssrf');
const { decideImageRequest } = require('../index');

let pass = 0;
let fail = 0;
const failures = [];

function check(name, cond) {
  if (cond) {
    pass++;
  } else {
    fail++;
    failures.push(name);
  }
}

// 假 DNS 解析器工厂：host→address 映射；未命中时回退公网 93.184.216.34
function fakeResolver(map) {
  return async (host) => {
    const addr = Object.prototype.hasOwnProperty.call(map, host) ? map[host] : '93.184.216.34';
    return [{ address: addr, family: 4 }];
  };
}

async function main() {
  // ═══════════════════════════════════════════
  // (A) isBlockedHostname 矩阵
  // ═══════════════════════════════════════════
  const blockedHosts = [
    '127.0.0.1',            // 环回
    '10.1.2.3',             // 10.0.0.0/8
    '172.16.5.5',           // 172.16.0.0/12
    '192.168.0.1',          // 192.168.0.0/16
    '169.254.169.254',      // 链路本地 / 云元数据
    '0.0.0.0',              // 0.0.0.0/8
    'localhost',            // 主机名
    'a.local',              // .local
    'metadata',             // 裸 metadata
    'x.metadata',           // .metadata
    'x.internal',           // .internal
    '::1',                  // IPv6 环回
    '::',                   // 未指定 IPv6
    'fe80::1',              // IPv6 链路本地
    '::ffff:10.0.0.5',      // IPv4-mapped IPv6（十进制）
    '::ffff:169.254.169.254', // IPv4-mapped IPv6（十进制，云元数据）
    '::ffff:a9fe:a9fe',     // IPv4-mapped IPv6（十六进制，云元数据）
  ];
  const allowedHosts = [
    '8.8.8.8',
    '93.184.216.34',
    'example.com',
    'openai.com',
  ];
  for (const h of blockedHosts) {
    check('isBlockedHostname 应拦: ' + h, isBlockedHostname(h) === true);
  }
  for (const h of allowedHosts) {
    check('isBlockedHostname 应放行: ' + h, isBlockedHostname(h) === false);
  }

  // ═══════════════════════════════════════════
  // (B) decideImageRequest 三种模式
  // ═══════════════════════════════════════════
  const DATA_URLS = [
    'data:image/png;base64,iVBORw0KGgoAAAANS',
    'blob:http://localhost/uuid-1234',
  ];
  const FIXED_CDN_URLS = [
    'https://cdn.jsdelivr.net/gh/twitter/twemoji@latest/assets/svg/1f600.svg',
    'https://picsum.photos/400/300?random=1',
    'https://gaopengbin.github.io/wechat-dialog-generator/',
    'https://esm.sh/html-to-image@1.11.13',
  ];
  const UNSPLASH = 'https://images.unsplash.com/photo-1506744038136-46273834b3fb';

  // ---- 默认模式：allowlist:null，假 DNS 一律返回公网地址 ----
  const defaultOpts = { allowlist: null, resolveDns: fakeResolver({ 'images.unsplash.com': '93.184.216.34' }) };
  for (const u of DATA_URLS) {
    check('默认模式 应 continue (data/blob): ' + u.slice(0, 40), (await decideImageRequest(u, defaultOpts)) === 'continue');
  }
  for (const u of FIXED_CDN_URLS) {
    check('默认模式 应 continue (固定CDN): ' + u, (await decideImageRequest(u, defaultOpts)) === 'continue');
  }
  check('默认模式 应 continue (公网图 unsplash): ' + UNSPLASH, (await decideImageRequest(UNSPLASH, defaultOpts)) === 'continue');

  const defaultAbort = [
    'http://169.254.169.254/latest/meta-data/',
    'http://127.0.0.1:9000/admin',
    'http://10.0.0.5:8080/x',
    'http://192.168.1.1/',
    'http://[::ffff:10.0.0.5]/',
    'http://localhost:3000/x',
    'http://metadata.internal/',
    'http://[fe80::1]/',
    'file:///etc/passwd',
    'ftp://example.com/x',
    'gopher://127.0.0.1:11211/',
    'http://0.0.0.0:1234/',
  ];
  for (const u of defaultAbort) {
    check('默认模式 应 abort: ' + u, (await decideImageRequest(u, defaultOpts)) === 'abort');
  }

  // ---- DNS 重绑定模拟：同一主机名解析到不同地址 ----
  const rebindHost = 'https://innocent-cdn.example.com/x';
  check('DNS重绑定 应 abort (解析到 169.254.169.254)',
    (await decideImageRequest(rebindHost, { allowlist: null, resolveDns: fakeResolver({ 'innocent-cdn.example.com': '169.254.169.254' }) })) === 'abort');
  check('DNS重绑定 应 abort (解析到 10.0.0.5)',
    (await decideImageRequest(rebindHost, { allowlist: null, resolveDns: fakeResolver({ 'innocent-cdn.example.com': '10.0.0.5' }) })) === 'abort');
  check('DNS重绑定 应 continue (解析到 93.184.216.34)',
    (await decideImageRequest(rebindHost, { allowlist: null, resolveDns: fakeResolver({ 'innocent-cdn.example.com': '93.184.216.34' }) })) === 'continue');

  // ---- 严格白名单模式：allowlist = { images.unsplash.com } ----
  const strictOpts = { allowlist: new Set(['images.unsplash.com']) };
  check('严格白名单 应 continue (白名单内 unsplash): ' + UNSPLASH, (await decideImageRequest(UNSPLASH, strictOpts)) === 'continue');
  for (const u of FIXED_CDN_URLS) {
    check('严格白名单 应 continue (固定CDN 始终放行): ' + u, (await decideImageRequest(u, strictOpts)) === 'continue');
  }
  check('严格白名单 应 abort (evil.com)', (await decideImageRequest('https://evil.com/x', strictOpts)) === 'abort');
  check('严格白名单 应 abort (example.com)', (await decideImageRequest('https://example.com/y', strictOpts)) === 'abort');
  check('严格白名单 应 abort (169.254.169.254)', (await decideImageRequest('http://169.254.169.254/z', strictOpts)) === 'abort');
}

main()
  .then(() => {
    console.log('PASS ' + pass + ' / FAIL ' + fail);
    if (fail > 0) {
      console.log('FAILURES:\n - ' + failures.join('\n - '));
      process.exit(1);
    }
  })
  .catch((e) => {
    console.error('TEST ERROR:', e && e.stack ? e.stack : e);
    process.exit(1);
  });

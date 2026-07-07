'use strict';
/**
 * lib/ssrf.js — 共享 SSRF 防护 (v4.2)
 *
 * 提供 isBlockedHostname / assertSafeBaseUrl，供：
 *   - lib/llm.js    （LLM_BASE_URL 校验，Node 侧 fetch 前）
 *   - index.js      （Puppeteer 浏览器侧图片请求拦截）
 * 复用，避免两份实现出现防护不一致。
 *
 * 覆盖：IPv4 全私网段 / 环回 / 链路本地(含云元数据 169.254.x) / IPv6 链路本地与环回 /
 *       localhost/.local/metadata/internal 主机名 / IPv4-mapped IPv6（十进制与十六进制两种形态）。
 */

const net = require('net');

// ── SSRF 防护：拒绝内网 / 环回 / 链路本地地址（含 IPv4-mapped IPv6）──
function isPrivateIPv4(a, b, c, d) {
  if (a === 127) return true;                        // 127.0.0.0/8 环回
  if (a === 10) return true;                         // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true;  // 172.16.0.0/12
  if (a === 192 && b === 168) return true;           // 192.168.0.0/16
  if (a === 169 && b === 254) return true;           // 169.254.0.0/16 链路本地(云元数据)
  if (a === 0) return true;                          // 0.0.0.0/8
  return false;
}

function isBlockedHostname(host) {
  let h = String(host || '').toLowerCase().trim();
  // IPv6 字面量形如 [::1] / [fe80::1]，URL 解析后 hostname 仍带方括号，需先去掉
  if (h.startsWith('[') && h.endsWith(']')) h = h.slice(1, -1);

  // 主机名类（非数字 IP）：localhost / .local / metadata / internal 等
  if (h === 'localhost' || h.endsWith('.localhost') ||
      h === 'metadata' || h.endsWith('.metadata') ||
      h === 'internal' || h.endsWith('.internal') || h.endsWith('.local')) return true;

  // IPv4-mapped IPv6：::ffff:A.B.C.D —— 含 ::ffff:169.254.169.254 (云元数据) 绕过。
  // 注意：Node 的 new URL() 会把内嵌 IPv4 规范化为十六进制（::ffff:a9fe:a9fe），
  // 故点分十进制与十六进制两种形态都需解码，否则真实入口会漏拦。
  const mappedDec = h.match(/^::ffff:(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/i);
  if (mappedDec && isPrivateIPv4(Number(mappedDec[1]), Number(mappedDec[2]), Number(mappedDec[3]), Number(mappedDec[4]))) return true;
  const mappedHex = h.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (mappedHex) {
    const oct = [mappedHex[1], mappedHex[2]].flatMap(g => { const n = parseInt(g, 16); return [(n >> 8) & 0xff, n & 0xff]; });
    if (isPrivateIPv4(oct[0], oct[1], oct[2], oct[3])) return true;
  }

  const fam = net.isIP(h);
  if (fam === 4) {
    const [a, b, c, d] = h.split('.').map(Number);
    return isPrivateIPv4(a, b, c, d);
  }
  if (fam === 6) {
    if (h === '::1' || h === '::' || h === '0:0:0:0:0:0:0:1' || h === '0:0:0:0:0:0:0:0') return true;
    if (h.startsWith('fe80:')) return true;          // fe80::/10 IPv6 链路本地
    return false;
  }
  return false; // 非 IP 主机名：放行（依赖运行时 DNS，且请求限定 https）
}

function assertSafeBaseUrl(baseUrl) {
  let u;
  try {
    u = new URL(baseUrl);
  } catch {
    throw new Error(`LLM_BASE_URL 非法: ${baseUrl}`);
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') {
    throw new Error(`LLM_BASE_URL 仅支持 http/https: ${baseUrl}`);
  }
  if (isBlockedHostname(u.hostname)) {
    throw new Error(`LLM_BASE_URL 指向受限内网地址，已拒绝 (SSRF 防护): ${u.hostname}`);
  }
  return u;
}

module.exports = { isBlockedHostname, assertSafeBaseUrl };

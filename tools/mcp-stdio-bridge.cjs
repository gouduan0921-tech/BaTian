#!/usr/bin/env node
'use strict';
/**
 * 把 MCP 标准 stdio（每行一条 JSON-RPC）转发到 Funplay Cocos MCP 的 HTTP 端点。
 * 用法：node mcp-stdio-bridge.cjs --url http://127.0.0.1:26735/
 * 扩展自带的 bin 使用 Content-Length 分帧，Claude 桌面端不兼容，所以用这个。
 */
const readline = require('readline');

const argUrl = (() => { const i = process.argv.indexOf('--url'); return i > 0 ? process.argv[i + 1] : null; })();
const URL_ = argUrl || process.env.FUNPLAY_COCOS_MCP_URL || 'http://127.0.0.1:26735/';
let sessionId = '';
let chain = Promise.resolve();

function out(obj) { process.stdout.write(JSON.stringify(obj) + '\n'); }
const LOG = require('path').join(__dirname, 'mcp-bridge.log');
function log(...a) {
  const line = `[cocos-bridge ${new Date().toISOString()}] ${a.join(' ')}\n`;
  process.stderr.write(line);
  try { require('fs').appendFileSync(LOG, line); } catch {}
}

function parseSse(text) {
  const msgs = [];
  for (const block of text.split(/\r?\n\r?\n/)) {
    const data = block.split(/\r?\n/).filter(l => l.startsWith('data:')).map(l => l.slice(5).trimStart()).join('\n');
    if (data) { try { msgs.push(JSON.parse(data)); } catch (e) { log('bad sse data', e.message); } }
  }
  return msgs;
}

async function forward(line) {
  let msg;
  try { msg = JSON.parse(line); } catch { log('non-json line', line.slice(0, 80)); return; }
  log('->', msg.method || 'response', msg.id ?? '');
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
  if (sessionId) headers['Mcp-Session-Id'] = sessionId;
  try {
    const res = await fetch(URL_, { method: 'POST', headers, body: JSON.stringify(msg) });
    const sid = res.headers.get('mcp-session-id');
    if (sid) sessionId = sid;
    const text = await res.text();
    if (!text.trim()) {
      if (msg.id !== undefined && res.status >= 400) out({ jsonrpc: '2.0', id: msg.id, error: { code: -32000, message: `HTTP ${res.status}` } });
      return;
    }
    const type = res.headers.get('content-type') || '';
    const msgs = type.includes('text/event-stream') ? parseSse(text) : [JSON.parse(text)];
    for (const m of msgs.flat()) out(m);
  } catch (e) {
    log('request failed:', e.message);
    if (msg.id !== undefined) out({ jsonrpc: '2.0', id: msg.id, error: { code: -32000, message: `Cocos MCP 不可达（${URL_}）：${e.message}。请确认 Cocos Creator 已打开并启动 Funplay MCP。` } });
  }
}

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', line => { if (line.trim()) chain = chain.then(() => forward(line)); });
rl.on('close', () => chain.then(() => process.exit(0)));
log('bridging stdio ->', URL_);

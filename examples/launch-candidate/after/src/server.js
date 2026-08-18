import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { serviceToken } from './config.js';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));

async function sendHtml(response, fileName) {
  const body = await readFile(join(projectRoot, fileName), 'utf8');
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  response.end(body);
}

async function handleRequest(request, response) {
  if (request.method === 'GET' && request.url === '/') {
    await sendHtml(response, 'index.html');
    return;
  }

  if (request.method === 'GET' && request.url === '/privacy') {
    await sendHtml(response, 'privacy.html');
    return;
  }

  if (request.method === 'POST' && request.url === '/register') {
    let body = '';
    for await (const chunk of request) body += chunk;
    const form = new URLSearchParams(body);
    const name = form.get('name');
    const email = form.get('email');

    if (!name || !email) {
      response.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Name and email are required.');
      return;
    }

    response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    response.end(serviceToken ? 'Registration received.' : 'Registration received; notifications are not configured.');
    return;
  }

  response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  response.end('Not found.');
}

export function startServer({
  host = process.env.EXAMPLE_HOST ?? '127.0.0.1',
  port = Number(process.env.PORT ?? 3000),
} = {}) {
  const server = createServer(handleRequest);
  server.listen(port, host, () => {
    const address = server.address();
    const listeningPort = typeof address === 'object' && address ? address.port : port;
    console.log(`Launch candidate listening on http://${host}:${listeningPort}`);
  });
  return server;
}

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) startServer();

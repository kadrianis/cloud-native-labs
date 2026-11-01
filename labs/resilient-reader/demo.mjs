import { createServer } from 'node:http';
import { once } from 'node:events';
import { read } from './reader.mjs';

let calls = 0;
const server = createServer((_request, response) => {
  calls++;
  response.writeHead(calls === 1 ? 503 : 200, {
    'content-type': 'application/json', 'retry-after': '0',
  });
  response.end(JSON.stringify(calls === 1 ? { error: 'busy' } : { status: 'ok', jobs: [] }));
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
try {
  console.log(await read(`http://127.0.0.1:${server.address().port}/jobs`));
} finally {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}

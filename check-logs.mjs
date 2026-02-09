import WebSocket from 'ws';

const ws = new WebSocket('ws://localhost:9223/devtools/page/9D13F8991BFAA2EF4FC49A61D2E7BDDA');

ws.on('open', () => {
  console.log('Connected to DevTools\n');

  // Enable domains
  ws.send(JSON.stringify({ id: 1, method: 'Runtime.enable' }));
  ws.send(JSON.stringify({ id: 2, method: 'Log.enable' }));
  ws.send(JSON.stringify({ id: 3, method: 'Console.enable' }));

  setTimeout(() => {
    ws.close();
  }, 3000);
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());

  // Console messages
  if (msg.method === 'Runtime.consoleAPICalled') {
    const args = msg.params.args.map(arg => arg.value || arg.description || '').join(' ');
    console.log(`[Console ${msg.params.type}] ${args}`);

    if (args.toLowerCase().includes('compact') || args.toLowerCase().includes('session')) {
      console.log(`*** RELEVANT LOG FOUND ***`);
    }
  }

  // Exceptions
  if (msg.method === 'Runtime.exceptionThrown') {
    const ex = msg.params.exceptionDetails;
    const desc = ex.exception?.description || ex.exception?.value || ex.text;
    console.log(`[Exception] ${ex.text}`);
    console.log(`  Details: ${desc}`);

    if (desc.toLowerCase().includes('compact') || desc.toLowerCase().includes('session')) {
      console.log(`*** RELEVANT ERROR FOUND ***`);
    }
  }

  // Log entries
  if (msg.method === 'Log.entryAdded') {
    const entry = msg.params.entry;
    console.log(`[${entry.level}] ${entry.text}`);

    if (entry.text.toLowerCase().includes('compact') || entry.text.toLowerCase().includes('session')) {
      console.log(`*** RELEVANT LOG FOUND ***`);
    }
  }
});

ws.on('error', (err) => {
  console.error('Error:', err.message);
  process.exit(1);
});

ws.on('close', () => {
  console.log('\nConnection closed');
  process.exit(0);
});

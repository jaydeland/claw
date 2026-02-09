import WebSocket from 'ws';

const ws = new WebSocket('ws://localhost:9223/devtools/page/9D13F8991BFAA2EF4FC49A61D2E7BDDA');

let messageCount = 0;
const relevantLogs = [];

ws.on('open', () => {
  console.log('Connected to DevTools - monitoring for SDK errors...\n');

  // Enable domains
  ws.send(JSON.stringify({ id: 1, method: 'Runtime.enable' }));
  ws.send(JSON.stringify({ id: 2, method: 'Log.enable' }));
  ws.send(JSON.stringify({ id: 3, method: 'Console.enable' }));

  // Keep connection open for 10 seconds
  setTimeout(() => {
    console.log('\n=== Summary of Relevant Findings ===');
    if (relevantLogs.length === 0) {
      console.log('No SDK errors related to compacting found during monitoring period.');
    } else {
      console.log(`Found ${relevantLogs.length} relevant log entries:\n`);
      relevantLogs.forEach((log, idx) => {
        console.log(`${idx + 1}. ${log}\n`);
      });
    }
    ws.close();
  }, 10000);
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  messageCount++;

  // Console messages
  if (msg.method === 'Runtime.consoleAPICalled') {
    const args = msg.params.args.map(arg => arg.value || arg.description || '').join(' ');
    const text = `[Console ${msg.params.type}] ${args}`;

    // Look for SDK, session, compact, or error-related messages
    const lowerText = text.toLowerCase();
    if (lowerText.includes('sdk') ||
        lowerText.includes('compact') ||
        (lowerText.includes('session') && (lowerText.includes('error') || lowerText.includes('fail'))) ||
        lowerText.includes('[sd]') ||
        lowerText.includes('claude')) {
      console.log(text);
      relevantLogs.push(text);
    }
  }

  // Exceptions - always log these
  if (msg.method === 'Runtime.exceptionThrown') {
    const ex = msg.params.exceptionDetails;
    const desc = ex.exception?.description || ex.exception?.value || ex.text;
    const exceptionText = `[Exception] ${ex.text}\n  Details: ${desc}`;
    console.log(exceptionText);
    relevantLogs.push(exceptionText);
  }

  // Log entries
  if (msg.method === 'Log.entryAdded') {
    const entry = msg.params.entry;
    const logText = `[${entry.level}] ${entry.text}`;

    const lowerText = logText.toLowerCase();
    if (lowerText.includes('sdk') ||
        lowerText.includes('compact') ||
        lowerText.includes('session') ||
        lowerText.includes('claude') ||
        entry.level === 'error') {
      console.log(logText);
      relevantLogs.push(logText);
    }
  }
});

ws.on('error', (err) => {
  console.error('WebSocket error:', err.message);
  process.exit(1);
});

ws.on('close', () => {
  console.log(`\nConnection closed. Processed ${messageCount} messages.`);
  process.exit(0);
});

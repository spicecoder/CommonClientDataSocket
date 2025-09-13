// test-client.js
const WebSocketDataClient = require('./websocket_data_client');

async function testClient() {
  const client = new WebSocketDataClient({
    serverUrl: 'ws://localhost:8081'
  });
  
  try {
    console.log('🔄 Connecting to server...');
    await client.connect();
    console.log('✅ Client connected successfully!');
    
    // Test basic operations
    console.log('📤 Setting test data...');
    await client.set('test', 'hello', { message: 'world', timestamp: Date.now() });
    
    console.log('📥 Getting test data...');
    const result = await client.get('test', 'hello');
    console.log('📦 Retrieved:', result);
    
    console.log('🏓 Testing ping...');
    const ping = await client.ping();
    console.log(`⚡ Ping: ${ping}ms`);
    
    console.log('🎯 All tests passed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testClient();
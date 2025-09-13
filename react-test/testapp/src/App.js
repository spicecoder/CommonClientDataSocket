// TestComponent.jsx
import React, { useState, useEffect } from 'react';
import { WebSocketDataProvider, useWebSocketData, useCartData } from './use_websocket_data_hook';

function TestDataComponent() {
  const { getData, setData, isReady, loading, error } = useWebSocketData();
  const [testResult, setTestResult] = useState(null);

  const runTest = async () => {
    if (!isReady) return;
    
    try {
      // Test basic operations
      await setData('test', 'react-test', { 
        message: 'Hello from React!', 
        timestamp: Date.now() 
      });
      
      const result = await getData('test', 'react-test');
      setTestResult(result);
    } catch (err) {
      console.error('Test failed:', err);
    }
  };

  return (
    <div>
      <h3>WebSocket Data Test</h3>
      <p>Status: {isReady ? '✅ Ready' : '🔄 Connecting...'}</p>
      <button onClick={runTest} disabled={!isReady || loading}>
        Run Test
      </button>
      {testResult && (
        <pre>{JSON.stringify(testResult, null, 2)}</pre>
      )}
      {error && <p style={{color: 'red'}}>Error: {error.message}</p>}
    </div>
  );
}

// Main App Component
function App() {
  return (
    <WebSocketDataProvider serverUrl="ws://localhost:8081">
      <TestDataComponent />
    </WebSocketDataProvider>
  );
}

export default App;
# CommonClientDataSocket
Why This Strategy is Good:

Platform Agnostic: Same API works for browser, React Native (iOS/Android), and Node.js

Storage Abstraction: Automatically uses the right storage (localStorage, AsyncStorage, SQLite, etc.)

Real-time Sync: Built-in subscriptions for live data updates across all clients

Performance: Local WebSocket server eliminates network latency

Intention Space Ready: Perfect for your CPUX pulse coordination

Automatically detects client platform

Routes to appropriate storage adapter

Provides platform-specific capabilities

// Same message format across all platforms:
{
  type: 'SET',
  payload: {
    collection: 'cart',
    key: 'user123',
    value: { items: [...], total: 42.07 }
  }
}

Key Features:

Platform Auto-Detection: Automatically detects browser, React Native, or Node.js

Unified API: Same methods work everywhere (get(), set(), delete(), query())

Auto-Reconnection: Handles connection drops gracefully

Real-time Subscriptions: Live data updates across all connected clients

Convenience Methods: Ready-to-use for cart, sessions, chat messages

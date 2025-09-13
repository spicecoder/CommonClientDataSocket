// WebSocketDataServer.js - Unified Data Access Layer
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

class WebSocketDataServer {
  constructor(options = {}) {
    this.port = options.port || 8081;
    this.storageAdapters = new Map();
    this.activeConnections = new Set();
    this.messageHandlers = new Map();
    
    // Initialize platform-specific storage adapters
    this.initializeStorageAdapters();
    this.setupMessageHandlers();
  }

  initializeStorageAdapters() {
    // Browser Storage Adapter (IndexedDB/localStorage)
    this.storageAdapters.set('browser', new BrowserStorageAdapter());
    
    // React Native Storage Adapter (AsyncStorage/SQLite)
    this.storageAdapters.set('react-native', new ReactNativeStorageAdapter());
    
    // Node.js Storage Adapter (File system/SQLite)
    this.storageAdapters.set('nodejs', new NodeJSStorageAdapter());
  }

  setupMessageHandlers() {
    this.messageHandlers.set('GET', this.handleGet.bind(this));
    this.messageHandlers.set('SET', this.handleSet.bind(this));
    this.messageHandlers.set('DELETE', this.handleDelete.bind(this));
    this.messageHandlers.set('QUERY', this.handleQuery.bind(this));
    this.messageHandlers.set('BATCH', this.handleBatch.bind(this));
    this.messageHandlers.set('PING', this.handlePing.bind(this));
    this.messageHandlers.set('SUBSCRIBE', this.handleSubscribe.bind(this));
    this.messageHandlers.set('UNSUBSCRIBE', this.handleUnsubscribe.bind(this));
  }

  start() {
    this.server = new WebSocket.Server({ 
      port: this.port,
      perMessageDeflate: false 
    });

    this.server.on('connection', (ws, req) => {
      console.log(`📱 New client connected from ${req.connection.remoteAddress}`);
      
      // Detect client platform
      const userAgent = req.headers['user-agent'] || '';
      const platform = this.detectPlatform(userAgent, req.headers);
      
      ws.platform = platform;
      ws.clientId = this.generateClientId();
      ws.subscriptions = new Set();
      ws.isAlive = true;
      
      this.activeConnections.add(ws);

      // Set up connection handlers
      ws.on('message', (data) => this.handleMessage(ws, data));
      ws.on('close', () => this.handleDisconnect(ws));
      ws.on('error', (error) => this.handleError(ws, error));
      ws.on('pong', () => { ws.isAlive = true; });

      // Send welcome message with platform info
      this.sendMessage(ws, {
        type: 'CONNECTION_ESTABLISHED',
        clientId: ws.clientId,
        platform: platform,
        capabilities: this.getPlatformCapabilities(platform)
      });
    });

    // Keep-alive ping
    setInterval(() => {
      this.server.clients.forEach(ws => {
        if (!ws.isAlive) {
          console.log(`🔌 Terminating dead connection: ${ws.clientId}`);
          return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
      });
    }, 30000);

    console.log(`🚀 WebSocket Data Repository Server running on port ${this.port}`);
    console.log(`📊 Supported platforms: browser, react-native, nodejs`);
  }

  detectPlatform(userAgent, headers) {
    if (headers['x-platform']) {
      return headers['x-platform'];
    }
    
    if (userAgent.includes('React Native')) {
      return 'react-native';
    } else if (userAgent.includes('Mozilla') || userAgent.includes('Chrome')) {
      return 'browser';
    } else {
      return 'nodejs';
    }
  }

  generateClientId() {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  getPlatformCapabilities(platform) {
    const capabilities = {
      browser: ['localStorage', 'indexedDB', 'sessionStorage'],
      'react-native': ['asyncStorage', 'sqlite', 'secureStorage'],
      nodejs: ['filesystem', 'sqlite', 'memory']
    };
    
    return capabilities[platform] || ['memory'];
  }

  async handleMessage(ws, data) {
    try {
      const message = JSON.parse(data);
      const { type, requestId, payload } = message;

      console.log(`📨 Received ${type} from ${ws.platform} client: ${ws.clientId}`);

      // Get appropriate message handler
      const handler = this.messageHandlers.get(type);
      if (!handler) {
        throw new Error(`Unknown message type: ${type}`);
      }

      // Execute handler with platform-specific storage adapter
      const storageAdapter = this.storageAdapters.get(ws.platform);
      const result = await handler(payload, storageAdapter, ws);

      // Send response back to client
      this.sendMessage(ws, {
        type: `${type}_RESPONSE`,
        requestId,
        success: true,
        data: result,
        timestamp: Date.now()
      });

    } catch (error) {
      console.error(`❌ Error handling message:`, error);
      
      this.sendMessage(ws, {
        type: 'ERROR',
        requestId: JSON.parse(data).requestId,
        success: false,
        error: error.message,
        timestamp: Date.now()
      });
    }
  }

  async handleGet(payload, storageAdapter, ws) {
    const { collection, key, options = {} } = payload;
    return await storageAdapter.get(collection, key, options);
  }

  async handleSet(payload, storageAdapter, ws) {
    const { collection, key, value, options = {} } = payload;
    const result = await storageAdapter.set(collection, key, value, options);
    
    // Notify subscribers
    this.notifySubscribers(collection, key, 'SET', value, ws.clientId);
    
    return result;
  }

  async handleDelete(payload, storageAdapter, ws) {
    const { collection, key, options = {} } = payload;
    const result = await storageAdapter.delete(collection, key, options);
    
    // Notify subscribers
    this.notifySubscribers(collection, key, 'DELETE', null, ws.clientId);
    
    return result;
  }

  async handleQuery(payload, storageAdapter, ws) {
    const { collection, query, options = {} } = payload;
    return await storageAdapter.query(collection, query, options);
  }

  async handleBatch(payload, storageAdapter, ws) {
    const { operations } = payload;
    const results = [];
    
    for (const operation of operations) {
      const handler = this.messageHandlers.get(operation.type);
      if (handler) {
        const result = await handler(operation.payload, storageAdapter, ws);
        results.push({ operation: operation.id, result });
      }
    }
    
    return results;
  }

  async handlePing(payload, storageAdapter, ws) {
    return { pong: true, timestamp: Date.now() };
  }

  async handleSubscribe(payload, storageAdapter, ws) {
    const { collection, pattern } = payload;
    const subscriptionKey = `${collection}:${pattern}`;
    
    ws.subscriptions.add(subscriptionKey);
    console.log(`🔔 Client ${ws.clientId} subscribed to: ${subscriptionKey}`);
    
    return { subscribed: subscriptionKey };
  }

  async handleUnsubscribe(payload, storageAdapter, ws) {
    const { collection, pattern } = payload;
    const subscriptionKey = `${collection}:${pattern}`;
    
    ws.subscriptions.delete(subscriptionKey);
    console.log(`🔕 Client ${ws.clientId} unsubscribed from: ${subscriptionKey}`);
    
    return { unsubscribed: subscriptionKey };
  }

  notifySubscribers(collection, key, operation, value, originClientId) {
    const subscriptionKey = `${collection}:${key}`;
    const wildcardKey = `${collection}:*`;
    
    this.activeConnections.forEach(ws => {
      // Don't notify the client that made the change
      if (ws.clientId === originClientId) return;
      
      if (ws.subscriptions.has(subscriptionKey) || ws.subscriptions.has(wildcardKey)) {
        this.sendMessage(ws, {
          type: 'SUBSCRIPTION_UPDATE',
          collection,
          key,
          operation,
          value,
          timestamp: Date.now()
        });
      }
    });
  }

  sendMessage(ws, message) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  handleDisconnect(ws) {
    console.log(`👋 Client disconnected: ${ws.clientId}`);
    this.activeConnections.delete(ws);
  }

  handleError(ws, error) {
    console.error(`💥 WebSocket error for client ${ws.clientId}:`, error);
  }

  stop() {
    if (this.server) {
      this.server.close();
      console.log('🛑 WebSocket Data Repository Server stopped');
    }
  }
}

// Base Storage Adapter Interface
class StorageAdapter {
  async get(collection, key, options) {
    throw new Error('get() must be implemented by storage adapter');
  }

  async set(collection, key, value, options) {
    throw new Error('set() must be implemented by storage adapter');
  }

  async delete(collection, key, options) {
    throw new Error('delete() must be implemented by storage adapter');
  }

  async query(collection, query, options) {
    throw new Error('query() must be implemented by storage adapter');
  }
}

// Browser Storage Adapter (IndexedDB/localStorage)
class BrowserStorageAdapter extends StorageAdapter {
  constructor() {
    super();
    this.localStorage = new Map(); // Simulated localStorage
    this.indexedDB = new Map(); // Simulated IndexedDB
  }

  async get(collection, key, options) {
    const storage = options.useIndexedDB ? this.indexedDB : this.localStorage;
    const collectionData = storage.get(collection) || {};
    return collectionData[key] || null;
  }

  async set(collection, key, value, options) {
    const storage = options.useIndexedDB ? this.indexedDB : this.localStorage;
    
    if (!storage.has(collection)) {
      storage.set(collection, {});
    }
    
    const collectionData = storage.get(collection);
    collectionData[key] = value;
    
    return { success: true, key, timestamp: Date.now() };
  }

  async delete(collection, key, options) {
    const storage = options.useIndexedDB ? this.indexedDB : this.localStorage;
    const collectionData = storage.get(collection) || {};
    
    delete collectionData[key];
    return { success: true, deleted: key };
  }

  async query(collection, query, options) {
    const storage = options.useIndexedDB ? this.indexedDB : this.localStorage;
    const collectionData = storage.get(collection) || {};
    
    // Simple query implementation
    const results = Object.entries(collectionData).filter(([key, value]) => {
      return Object.entries(query).every(([queryKey, queryValue]) => {
        return value[queryKey] === queryValue;
      });
    });
    
    return results.map(([key, value]) => ({ key, ...value }));
  }
}

// React Native Storage Adapter (AsyncStorage/SQLite)
class ReactNativeStorageAdapter extends StorageAdapter {
  constructor() {
    super();
    this.storage = new Map(); // Simulated AsyncStorage
  }

  async get(collection, key, options) {
    const fullKey = `${collection}:${key}`;
    const value = this.storage.get(fullKey);
    return value ? JSON.parse(value) : null;
  }

  async set(collection, key, value, options) {
    const fullKey = `${collection}:${key}`;
    this.storage.set(fullKey, JSON.stringify(value));
    return { success: true, key: fullKey, timestamp: Date.now() };
  }

  async delete(collection, key, options) {
    const fullKey = `${collection}:${key}`;
    this.storage.delete(fullKey);
    return { success: true, deleted: fullKey };
  }

  async query(collection, query, options) {
    const results = [];
    const prefix = `${collection}:`;
    
    this.storage.forEach((value, key) => {
      if (key.startsWith(prefix)) {
        const parsedValue = JSON.parse(value);
        const matches = Object.entries(query).every(([queryKey, queryValue]) => {
          return parsedValue[queryKey] === queryValue;
        });
        
        if (matches) {
          results.push({ key: key.replace(prefix, ''), ...parsedValue });
        }
      }
    });
    
    return results;
  }
}

// Node.js Storage Adapter (File system)
class NodeJSStorageAdapter extends StorageAdapter {
  constructor() {
    super();
    this.dataDir = path.join(__dirname, 'data');
    this.ensureDataDirectory();
  }

  ensureDataDirectory() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  getFilePath(collection, key) {
    return path.join(this.dataDir, `${collection}_${key}.json`);
  }

  async get(collection, key, options) {
    try {
      const filePath = this.getFilePath(collection, key);
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data);
      }
      return null;
    } catch (error) {
      console.error('Error reading file:', error);
      return null;
    }
  }

  async set(collection, key, value, options) {
    try {
      const filePath = this.getFilePath(collection, key);
      fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
      return { success: true, key, filePath, timestamp: Date.now() };
    } catch (error) {
      throw new Error(`Failed to save data: ${error.message}`);
    }
  }

  async delete(collection, key, options) {
    try {
      const filePath = this.getFilePath(collection, key);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      return { success: true, deleted: key };
    } catch (error) {
      throw new Error(`Failed to delete data: ${error.message}`);
    }
  }

  async query(collection, query, options) {
    const results = [];
    const files = fs.readdirSync(this.dataDir);
    const collectionFiles = files.filter(f => f.startsWith(`${collection}_`));
    
    for (const file of collectionFiles) {
      try {
        const filePath = path.join(this.dataDir, file);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        
        const matches = Object.entries(query).every(([queryKey, queryValue]) => {
          return data[queryKey] === queryValue;
        });
        
        if (matches) {
          const key = file.replace(`${collection}_`, '').replace('.json', '');
          results.push({ key, ...data });
        }
      } catch (error) {
        console.error(`Error reading file ${file}:`, error);
      }
    }
    
    return results;
  }
}

// Export for use
module.exports = WebSocketDataServer;

// Example usage:
if (require.main === module) {
  const server = new WebSocketDataServer({ port: 8081 });
  server.start();
  
  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down WebSocket Data Repository Server...');
    server.stop();
    process.exit(0);
  });
}
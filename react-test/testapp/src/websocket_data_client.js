// WebSocketDataClient.js - Universal Data Access Client
class WebSocketDataClient {
  constructor(options = {}) {
    this.serverUrl = options.serverUrl || 'ws://localhost:8081';
    this.platform = options.platform || this.detectPlatform();
    this.reconnectInterval = options.reconnectInterval || 5000;
    this.maxReconnectAttempts = options.maxReconnectAttempts || 10;
    
    this.ws = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.pendingRequests = new Map();
    this.subscriptions = new Map();
    this.eventListeners = new Map();
    this.requestId = 0;
    
    // Platform-specific WebSocket implementation
    this.WebSocketImpl = this.getWebSocketImplementation();
    
    console.log(`🔌 WebSocket Data Client initialized for platform: ${this.platform}`);
  }

  detectPlatform() {
    // React Native detection
    if (typeof navigator !== 'undefined' && navigator.product === 'ReactNative') {
      return 'react-native';
    }
    
    // Browser detection
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      return 'browser';
    }
    
    // Node.js detection
    return 'nodejs';
  }

  getWebSocketImplementation() {
    switch (this.platform) {
      case 'react-native':
        // React Native has built-in WebSocket
        return WebSocket;
      
      case 'browser':
        // Browser native WebSocket
        return WebSocket;
      
      case 'nodejs':
        // Node.js requires ws package
        try {
          return require('ws');
        } catch (error) {
          throw new Error('WebSocket package not found. Install with: npm install ws');
        }
      
      default:
        throw new Error(`Unsupported platform: ${this.platform}`);
    }
  }

  async connect() {
    return new Promise((resolve, reject) => {
      try {
        console.log(`🔄 Connecting to WebSocket server: ${this.serverUrl}`);
        
        const headers = {
          'x-platform': this.platform,
          'User-Agent': this.getUserAgent()
        };

        this.ws = new this.WebSocketImpl(this.serverUrl, [], { headers });

        const connectTimeout = setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, 10000);

        this.ws.onopen = (event) => {
          clearTimeout(connectTimeout);
          this.isConnected = true;
          this.reconnectAttempts = 0;
          console.log('✅ Connected to WebSocket Data Server');
          
          this.emit('connected', { platform: this.platform });
          resolve(true);
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };

        this.ws.onclose = (event) => {
          this.isConnected = false;
          console.log(`🔌 WebSocket connection closed: ${event.code} - ${event.reason}`);
          
          this.emit('disconnected', { code: event.code, reason: event.reason });
          
          // Auto-reconnect if not intentional close
          if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.attemptReconnect();
          }
        };

        this.ws.onerror = (error) => {
          clearTimeout(connectTimeout);
          console.error('❌ WebSocket error:', error);
          this.emit('error', error);
          reject(error);
        };

      } catch (error) {
        console.error('💥 Failed to create WebSocket connection:', error);
        reject(error);
      }
    });
  }

  getUserAgent() {
    switch (this.platform) {
      case 'react-native':
        return 'React Native WebSocket Data Client/1.0';
      case 'browser':
        return navigator.userAgent + ' WebSocketDataClient/1.0';
      case 'nodejs':
        return 'Node.js WebSocket Data Client/1.0';
      default:
        return 'WebSocket Data Client/1.0';
    }
  }

  attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('💀 Max reconnection attempts reached');
      this.emit('maxReconnectAttemptsReached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectInterval * Math.pow(1.5, this.reconnectAttempts - 1);
    
    console.log(`🔄 Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    
    setTimeout(() => {
      this.connect().catch(error => {
        console.error('Reconnection failed:', error);
      });
    }, delay);
  }

  handleMessage(data) {
    try {
      const message = JSON.parse(data);
      const { type, requestId, success, data: responseData, error } = message;

      switch (type) {
        case 'CONNECTION_ESTABLISHED':
          this.handleConnectionEstablished(message);
          break;

        case 'SUBSCRIPTION_UPDATE':
          this.handleSubscriptionUpdate(message);
          break;

        case 'ERROR':
          this.handleError(requestId, error);
          break;

        default:
          // Handle response to a pending request
          if (requestId && this.pendingRequests.has(requestId)) {
            const { resolve, reject } = this.pendingRequests.get(requestId);
            this.pendingRequests.delete(requestId);

            if (success) {
              resolve(responseData);
            } else {
              reject(new Error(error || 'Request failed'));
            }
          }
          break;
      }
    } catch (error) {
      console.error('📨 Error parsing WebSocket message:', error);
    }
  }

  handleConnectionEstablished(message) {
    console.log('🎉 Connection established:', message);
    this.clientId = message.clientId;
    this.platformCapabilities = message.capabilities;
    this.emit('ready', message);
  }

  handleSubscriptionUpdate(message) {
    const { collection, key, operation, value } = message;
    const subscriptionKey = `${collection}:${key}`;
    const wildcardKey = `${collection}:*`;

    // Notify specific subscription
    if (this.subscriptions.has(subscriptionKey)) {
      const callback = this.subscriptions.get(subscriptionKey);
      callback({ collection, key, operation, value, type: 'specific' });
    }

    // Notify wildcard subscription
    if (this.subscriptions.has(wildcardKey)) {
      const callback = this.subscriptions.get(wildcardKey);
      callback({ collection, key, operation, value, type: 'wildcard' });
    }

    this.emit('dataUpdate', { collection, key, operation, value });
  }

  handleError(requestId, error) {
    if (requestId && this.pendingRequests.has(requestId)) {
      const { reject } = this.pendingRequests.get(requestId);
      this.pendingRequests.delete(requestId);
      reject(new Error(error));
    } else {
      console.error('🚨 WebSocket error:', error);
      this.emit('error', new Error(error));
    }
  }

  sendMessage(type, payload) {
    return new Promise((resolve, reject) => {
      if (!this.isConnected) {
        reject(new Error('WebSocket not connected'));
        return;
      }

      const requestId = ++this.requestId;
      const message = {
        type,
        requestId,
        payload,
        timestamp: Date.now()
      };

      // Store pending request
      this.pendingRequests.set(requestId, { resolve, reject });

      // Set timeout for request
      setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          reject(new Error('Request timeout'));
        }
      }, 30000);

      try {
        this.ws.send(JSON.stringify(message));
      } catch (error) {
        this.pendingRequests.delete(requestId);
        reject(error);
      }
    });
  }

  // ===============================
  // PUBLIC API METHODS
  // ===============================

  /**
   * Get data from storage
   * @param {string} collection - Collection name
   * @param {string} key - Data key
   * @param {object} options - Storage options
   */
  async get(collection, key, options = {}) {
    return this.sendMessage('GET', { collection, key, options });
  }

  /**
   * Set data in storage
   * @param {string} collection - Collection name
   * @param {string} key - Data key
   * @param {any} value - Data value
   * @param {object} options - Storage options
   */
  async set(collection, key, value, options = {}) {
    return this.sendMessage('SET', { collection, key, value, options });
  }

  /**
   * Delete data from storage
   * @param {string} collection - Collection name
   * @param {string} key - Data key
   * @param {object} options - Storage options
   */
  async delete(collection, key, options = {}) {
    return this.sendMessage('DELETE', { collection, key, options });
  }

  /**
   * Query data from storage
   * @param {string} collection - Collection name
   * @param {object} query - Query object
   * @param {object} options - Query options
   */
  async query(collection, query, options = {}) {
    return this.sendMessage('QUERY', { collection, query, options });
  }

  /**
   * Execute batch operations
   * @param {Array} operations - Array of operations
   */
  async batch(operations) {
    return this.sendMessage('BATCH', { operations });
  }

  /**
   * Subscribe to data changes
   * @param {string} collection - Collection name
   * @param {string} pattern - Key pattern (* for all)
   * @param {function} callback - Callback function
   */
  async subscribe(collection, pattern, callback) {
    const subscriptionKey = `${collection}:${pattern}`;
    
    if (this.subscriptions.has(subscriptionKey)) {
      throw new Error(`Already subscribed to ${subscriptionKey}`);
    }

    this.subscriptions.set(subscriptionKey, callback);
    
    try {
      await this.sendMessage('SUBSCRIBE', { collection, pattern });
      console.log(`🔔 Subscribed to: ${subscriptionKey}`);
      return subscriptionKey;
    } catch (error) {
      this.subscriptions.delete(subscriptionKey);
      throw error;
    }
  }

  /**
   * Unsubscribe from data changes
   * @param {string} collection - Collection name
   * @param {string} pattern - Key pattern
   */
  async unsubscribe(collection, pattern) {
    const subscriptionKey = `${collection}:${pattern}`;
    
    if (!this.subscriptions.has(subscriptionKey)) {
      throw new Error(`Not subscribed to ${subscriptionKey}`);
    }

    this.subscriptions.delete(subscriptionKey);
    
    try {
      await this.sendMessage('UNSUBSCRIBE', { collection, pattern });
      console.log(`🔕 Unsubscribed from: ${subscriptionKey}`);
      return true;
    } catch (error) {
      // Re-add subscription if unsubscribe failed
      this.subscriptions.set(subscriptionKey, () => {});
      throw error;
    }
  }

  /**
   * Ping server
   */
  async ping() {
    const start = Date.now();
    await this.sendMessage('PING', {});
    const end = Date.now();
    return end - start; // Return latency in milliseconds
  }

  // ===============================
  // CONVENIENCE METHODS
  // ===============================

  /**
   * Store cart data (convenience method)
   */
  async saveCart(userId, cartData) {
    return this.set('cart', userId, cartData, { 
      useIndexedDB: this.platform === 'browser' 
    });
  }

  /**
   * Load cart data (convenience method)
   */
  async loadCart(userId) {
    return this.get('cart', userId, { 
      useIndexedDB: this.platform === 'browser' 
    });
  }

  /**
   * Store user session (convenience method)
   */
  async saveUserSession(userId, sessionData) {
    return this.set('sessions', userId, sessionData);
  }

  /**
   * Load user session (convenience method)
   */
  async loadUserSession(userId) {
    return this.get('sessions', userId);
  }

  /**
   * Store chat messages (convenience method)
   */
  async saveChatMessages(roomId, messages) {
    return this.set('chats', roomId, messages, {
      useIndexedDB: this.platform === 'browser',
      useSQLite: this.platform === 'react-native'
    });
  }

  /**
   * Load chat messages (convenience method)
   */
  async loadChatMessages(roomId) {
    return this.get('chats', roomId, {
      useIndexedDB: this.platform === 'browser',
      useSQLite: this.platform === 'react-native'
    });
  }

  // ===============================
  // EVENT HANDLING
  // ===============================

  on(event, listener) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(listener);
  }

  off(event, listener) {
    if (this.eventListeners.has(event)) {
      const listeners = this.eventListeners.get(event);
      const index = listeners.indexOf(listener);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  emit(event, data) {
    if (this.eventListeners.has(event)) {
      this.eventListeners.get(event).forEach(listener => {
        try {
          listener(data);
        } catch (error) {
          console.error(`Error in event listener for ${event}:`, error);
        }
      });
    }
  }

  // ===============================
  // LIFECYCLE METHODS
  // ===============================

  disconnect() {
    if (this.ws) {
      this.isConnected = false;
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
      console.log('👋 Disconnected from WebSocket Data Server');
    }
  }

  isReady() {
    return this.isConnected && this.clientId;
  }

  getStatus() {
    return {
      connected: this.isConnected,
      clientId: this.clientId,
      platform: this.platform,
      capabilities: this.platformCapabilities,
      subscriptions: Array.from(this.subscriptions.keys()),
      pendingRequests: this.pendingRequests.size
    };
  }
}

// ===============================
// PLATFORM-SPECIFIC EXPORTS
// ===============================

// Node.js/React Native CommonJS export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = WebSocketDataClient;
}

// Browser global (when included via script tag)
if (typeof window !== 'undefined') {
  window.WebSocketDataClient = WebSocketDataClient;
}

// Note: For React Native/ES6 projects, you can use:
// const WebSocketDataClient = require('./websocket_data_client');
// For browser, include via script tag or use the browser-specific version
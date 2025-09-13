// websocket-client-browser.js - Browser-ready WebSocket Data Client
(function(global) {
  'use strict';

  class WebSocketDataClient {
    constructor(options = {}) {
      this.serverUrl = options.serverUrl || 'ws://localhost:8081';
      this.platform = 'browser';
      this.reconnectInterval = options.reconnectInterval || 5000;
      this.maxReconnectAttempts = options.maxReconnectAttempts || 10;
      
      this.ws = null;
      this.isConnected = false;
      this.reconnectAttempts = 0;
      this.pendingRequests = new Map();
      this.subscriptions = new Map();
      this.eventListeners = new Map();
      this.requestId = 0;
      
      console.log(`🔌 WebSocket Data Client initialized for browser`);
    }

    async connect() {
      return new Promise((resolve, reject) => {
        try {
          console.log(`🔄 Connecting to WebSocket server: ${this.serverUrl}`);
          
          this.ws = new WebSocket(this.serverUrl);

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

    async get(collection, key, options = {}) {
      return this.sendMessage('GET', { collection, key, options });
    }

    async set(collection, key, value, options = {}) {
      return this.sendMessage('SET', { collection, key, value, options });
    }

    async delete(collection, key, options = {}) {
      return this.sendMessage('DELETE', { collection, key, options });
    }

    async query(collection, query, options = {}) {
      return this.sendMessage('QUERY', { collection, query, options });
    }

    async batch(operations) {
      return this.sendMessage('BATCH', { operations });
    }

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

    async ping() {
      const start = Date.now();
      await this.sendMessage('PING', {});
      const end = Date.now();
      return end - start;
    }

    // ===============================
    // CONVENIENCE METHODS
    // ===============================

    async saveCart(userId, cartData) {
      return this.set('cart', userId, cartData, { useIndexedDB: true });
    }

    async loadCart(userId) {
      return this.get('cart', userId, { useIndexedDB: true });
    }

    async saveUserSession(userId, sessionData) {
      return this.set('sessions', userId, sessionData);
    }

    async loadUserSession(userId) {
      return this.get('sessions', userId);
    }

    async saveChatMessages(roomId, messages) {
      return this.set('chats', roomId, messages, { useIndexedDB: true });
    }

    async loadChatMessages(roomId) {
      return this.get('chats', roomId, { useIndexedDB: true });
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

  // Make available globally in browser
  global.WebSocketDataClient = WebSocketDataClient;

  console.log('📦 WebSocketDataClient loaded for browser environment');

})(typeof window !== 'undefined' ? window : this);
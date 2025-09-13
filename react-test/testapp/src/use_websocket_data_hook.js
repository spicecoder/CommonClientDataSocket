// useWebSocketData.js - React Hook for WebSocket Data Client
import { useState, useEffect, useRef, useCallback, useContext, createContext } from 'react';

// Create WebSocket Data Context
const WebSocketDataContext = createContext(null);

// WebSocket Data Provider Component
export function WebSocketDataProvider({ children, serverUrl, options = {} }) {
  const clientRef = useRef(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState(null);
  const [clientInfo, setClientInfo] = useState(null);

  useEffect(() => {
    let WebSocketDataClient;

    // Dynamic import based on platform
    const initializeClient = async () => {
      try {
        // For React Native, you'll import directly
        if (typeof navigator !== 'undefined' && navigator.product === 'ReactNative') {
          // In React Native, you would import like this:
          // WebSocketDataClient = require('./WebSocketDataClient');
          console.log('React Native environment detected');
        } else if (typeof window !== 'undefined') {
          // Browser environment
          WebSocketDataClient = window.WebSocketDataClient;
          if (!WebSocketDataClient) {
            throw new Error('WebSocketDataClient not found. Please include the script.');
          }
        } else {
          // Node.js environment (for testing)
          WebSocketDataClient = require('./websocket_data_client');
        }

        // Initialize client
        clientRef.current = new WebSocketDataClient({
          serverUrl: serverUrl || 'ws://localhost:8081',
          ...options
        });

        // Set up event listeners
        clientRef.current.on('connected', () => {
          console.log('🔌 WebSocket Data Provider connected');
          setIsConnected(true);
          setError(null);
        });

        clientRef.current.on('ready', (info) => {
          console.log('✅ WebSocket Data Provider ready');
          setIsReady(true);
          setClientInfo(info);
        });

        clientRef.current.on('disconnected', (info) => {
          console.log('🔌 WebSocket Data Provider disconnected');
          setIsConnected(false);
          setIsReady(false);
          setError(new Error(`Disconnected: ${info.reason}`));
        });

        clientRef.current.on('error', (err) => {
          console.error('❌ WebSocket Data Provider error:', err);
          setError(err);
        });

        clientRef.current.on('maxReconnectAttemptsReached', () => {
          setError(new Error('Failed to reconnect to server'));
        });

        // Connect to server
        await clientRef.current.connect();

      } catch (err) {
        console.error('💥 Failed to initialize WebSocket Data Client:', err);
        setError(err);
      }
    };

    initializeClient();

    // Cleanup on unmount
    return () => {
      if (clientRef.current) {
        clientRef.current.disconnect();
      }
    };
  }, [serverUrl]);

  const contextValue = {
    client: clientRef.current,
    isConnected,
    isReady,
    error,
    clientInfo
  };

  return (
    <WebSocketDataContext.Provider value={contextValue}>
      {children}
    </WebSocketDataContext.Provider>
  );
}

// Main Hook for using WebSocket Data
export function useWebSocketData() {
  const context = useContext(WebSocketDataContext);
  
  if (!context) {
    throw new Error('useWebSocketData must be used within a WebSocketDataProvider');
  }

  const { client, isConnected, isReady, error } = context;

  // State for loading operations
  const [loading, setLoading] = useState(false);
  const [lastError, setLastError] = useState(null);

  // Generic operation wrapper with error handling and loading state
  const executeOperation = useCallback(async (operation) => {
    if (!client || !isReady) {
      throw new Error('WebSocket client not ready');
    }

    setLoading(true);
    setLastError(null);

    try {
      const result = await operation(client);
      return result;
    } catch (err) {
      setLastError(err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [client, isReady]);

  // Get data
  const getData = useCallback(async (collection, key, options = {}) => {
    return executeOperation(async (client) => {
      return await client.get(collection, key, options);
    });
  }, [executeOperation]);

  // Set data
  const setData = useCallback(async (collection, key, value, options = {}) => {
    return executeOperation(async (client) => {
      return await client.set(collection, key, value, options);
    });
  }, [executeOperation]);

  // Delete data
  const deleteData = useCallback(async (collection, key, options = {}) => {
    return executeOperation(async (client) => {
      return await client.delete(collection, key, options);
    });
  }, [executeOperation]);

  // Query data
  const queryData = useCallback(async (collection, query, options = {}) => {
    return executeOperation(async (client) => {
      return await client.query(collection, query, options);
    });
  }, [executeOperation]);

  // Batch operations
  const batchOperations = useCallback(async (operations) => {
    return executeOperation(async (client) => {
      return await client.batch(operations);
    });
  }, [executeOperation]);

  // Subscribe to data changes
  const subscribe = useCallback(async (collection, pattern, callback) => {
    if (!client || !isReady) {
      throw new Error('WebSocket client not ready');
    }
    return await client.subscribe(collection, pattern, callback);
  }, [client, isReady]);

  // Unsubscribe from data changes
  const unsubscribe = useCallback(async (collection, pattern) => {
    if (!client || !isReady) {
      throw new Error('WebSocket client not ready');
    }
    return await client.unsubscribe(collection, pattern);
  }, [client, isReady]);

  return {
    // Connection status
    isConnected,
    isReady,
    error: error || lastError,
    loading,
    client,
    
    // Data operations
    getData,
    setData,
    deleteData,
    queryData,
    batchOperations,
    
    // Real-time subscriptions
    subscribe,
    unsubscribe
  };
}

// Specialized Hook for Cart Data
export function useCartData(userId) {
  const { getData, setData, deleteData, subscribe, unsubscribe, isReady } = useWebSocketData();
  const [cart, setCart] = useState(null);
  const [cartLoading, setCartLoading] = useState(false);
  const [cartError, setCartError] = useState(null);

  // Load cart on mount
  useEffect(() => {
    if (isReady && userId) {
      loadCart();
    }
  }, [isReady, userId]);

  // Subscribe to cart changes
  useEffect(() => {
    if (isReady && userId) {
      const handleCartUpdate = (update) => {
        if (update.key === userId && update.operation === 'SET') {
          setCart(update.value);
          console.log('🛒 Cart updated via subscription:', update.value);
        }
      };

      subscribe('cart', userId, handleCartUpdate).catch(console.error);

      return () => {
        unsubscribe('cart', userId).catch(console.error);
      };
    }
  }, [isReady, userId, subscribe, unsubscribe]);

  const loadCart = useCallback(async () => {
    if (!userId) return;

    setCartLoading(true);
    setCartError(null);

    try {
      const cartData = await getData('cart', userId, { useIndexedDB: true });
      setCart(cartData || { items: [], total: 0 });
    } catch (error) {
      console.error('Failed to load cart:', error);
      setCartError(error);
      setCart({ items: [], total: 0 }); // Fallback empty cart
    } finally {
      setCartLoading(false);
    }
  }, [userId, getData]);

  const saveCart = useCallback(async (cartData) => {
    if (!userId) throw new Error('User ID required');

    setCartLoading(true);
    setCartError(null);

    try {
      await setData('cart', userId, cartData, { useIndexedDB: true });
      setCart(cartData);
      console.log('💾 Cart saved successfully');
    } catch (error) {
      console.error('Failed to save cart:', error);
      setCartError(error);
      throw error;
    } finally {
      setCartLoading(false);
    }
  }, [userId, setData]);

  const clearCart = useCallback(async () => {
    if (!userId) throw new Error('User ID required');

    const emptyCart = { items: [], total: 0 };
    await saveCart(emptyCart);
  }, [userId, saveCart]);

  const addToCart = useCallback(async (item) => {
    if (!cart) return;

    const existingItemIndex = cart.items.findIndex(cartItem => cartItem.id === item.id);
    let updatedItems;

    if (existingItemIndex >= 0) {
      // Update existing item
      updatedItems = [...cart.items];
      updatedItems[existingItemIndex] = {
        ...updatedItems[existingItemIndex],
        quantity: updatedItems[existingItemIndex].quantity + (item.quantity || 1)
      };
    } else {
      // Add new item
      updatedItems = [...cart.items, { ...item, quantity: item.quantity || 1 }];
    }

    const updatedCart = {
      ...cart,
      items: updatedItems,
      total: updatedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0)
    };

    await saveCart(updatedCart);
  }, [cart, saveCart]);

  const removeFromCart = useCallback(async (itemId) => {
    if (!cart) return;

    const updatedItems = cart.items.filter(item => item.id !== itemId);
    const updatedCart = {
      ...cart,
      items: updatedItems,
      total: updatedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0)
    };

    await saveCart(updatedCart);
  }, [cart, saveCart]);

  return {
    cart,
    loading: cartLoading,
    error: cartError,
    loadCart,
    saveCart,
    clearCart,
    addToCart,
    removeFromCart
  };
}

// Specialized Hook for User Session
export function useUserSession() {
  const { getData, setData, deleteData, isReady } = useWebSocketData();
  const [session, setSession] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionError, setSessionError] = useState(null);

  const loadSession = useCallback(async (userId) => {
    setSessionLoading(true);
    setSessionError(null);

    try {
      const sessionData = await getData('sessions', userId);
      setSession(sessionData);
      return sessionData;
    } catch (error) {
      console.error('Failed to load session:', error);
      setSessionError(error);
      return null;
    } finally {
      setSessionLoading(false);
    }
  }, [getData]);

  const saveSession = useCallback(async (userId, sessionData) => {
    setSessionLoading(true);
    setSessionError(null);

    try {
      await setData('sessions', userId, {
        ...sessionData,
        lastUpdated: Date.now()
      });
      setSession(sessionData);
      console.log('💾 Session saved successfully');
    } catch (error) {
      console.error('Failed to save session:', error);
      setSessionError(error);
      throw error;
    } finally {
      setSessionLoading(false);
    }
  }, [setData]);

  const clearSession = useCallback(async (userId) => {
    try {
      await deleteData('sessions', userId);
      setSession(null);
      console.log('🗑️ Session cleared successfully');
    } catch (error) {
      console.error('Failed to clear session:', error);
      throw error;
    }
  }, [deleteData]);

  return {
    session,
    loading: sessionLoading,
    error: sessionError,
    loadSession,
    saveSession,
    clearSession,
    isReady
  };
}

// Specialized Hook for Chat Messages
export function useChatData(roomId) {
  const { getData, setData, subscribe, unsubscribe, isReady } = useWebSocketData();
  const [messages, setMessages] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState(null);

  // Load messages on mount
  useEffect(() => {
    if (isReady && roomId) {
      loadMessages();
    }
  }, [isReady, roomId]);

  // Subscribe to new messages
  useEffect(() => {
    if (isReady && roomId) {
      const handleMessageUpdate = (update) => {
        if (update.key === roomId && update.operation === 'SET') {
          setMessages(update.value || []);
          console.log('💬 Messages updated via subscription');
        }
      };

      subscribe('chats', roomId, handleMessageUpdate).catch(console.error);

      return () => {
        unsubscribe('chats', roomId).catch(console.error);
      };
    }
  }, [isReady, roomId, subscribe, unsubscribe]);

  const loadMessages = useCallback(async () => {
    if (!roomId) return;

    setChatLoading(true);
    setChatError(null);

    try {
      const messageData = await getData('chats', roomId, {
        useIndexedDB: true,
        useSQLite: true
      });
      setMessages(messageData || []);
    } catch (error) {
      console.error('Failed to load messages:', error);
      setChatError(error);
      setMessages([]);
    } finally {
      setChatLoading(false);
    }
  }, [roomId, getData]);

  const sendMessage = useCallback(async (message) => {
    if (!roomId) throw new Error('Room ID required');

    const newMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      roomId,
      content: message.content,
      senderId: message.senderId,
      timestamp: Date.now(),
      type: message.type || 'text',
      ...message
    };

    const updatedMessages = [...messages, newMessage];

    try {
      await setData('chats', roomId, updatedMessages, {
        useIndexedDB: true,
        useSQLite: true
      });
      console.log('💬 Message sent successfully');
    } catch (error) {
      console.error('Failed to send message:', error);
      throw error;
    }
  }, [roomId, messages, setData]);

  return {
    messages,
    loading: chatLoading,
    error: chatError,
    loadMessages,
    sendMessage
  };
}

export default useWebSocketData;
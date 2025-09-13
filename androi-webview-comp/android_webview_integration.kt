// Android WebView Integration with WebSocket Data System

// ===============================
// 1. ANDROID ACTIVITY SETUP (MainActivity.kt)
// ===============================

/*
// MainActivity.kt - Android WebView with embedded WebSocket server
class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    private lateinit var webSocketServer: AndroidWebSocketServer
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        
        // Start WebSocket server first
        startWebSocketServer()
        
        // Setup WebView
        setupWebView()
        
        // Load React app
        loadReactApp()
    }
    
    private fun startWebSocketServer() {
        webSocketServer = AndroidWebSocketServer(8081, this)
        webSocketServer.start()
        Log.d("WebSocket", "Server started on port 8081")
    }
    
    private fun setupWebView() {
        webView = findViewById(R.id.webview)
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowContentAccess = true
            allowFileAccess = true
            allowFileAccessFromFileURLs = true
            allowUniversalAccessFromFileURLs = true
            
            // Enable debugging in debug builds
            if (BuildConfig.DEBUG) {
                WebView.setWebContentsDebuggingEnabled(true)
            }
        }
        
        webView.webViewClient = WebViewClient()
        webView.webChromeClient = WebChromeClient()
    }
    
    private fun loadReactApp() {
        // Load your React app (from assets or remote URL)
        webView.loadUrl("file:///android_asset/index.html")
        // OR load from development server:
        // webView.loadUrl("http://10.0.2.2:3000") // For emulator
    }
    
    override fun onDestroy() {
        super.onDestroy()
        webSocketServer.stop()
    }
}
*/

// ===============================
// 2. ANDROID WEBSOCKET SERVER (AndroidWebSocketServer.kt)  
// ===============================

/*
// AndroidWebSocketServer.kt - WebSocket server with SQLite integration
class AndroidWebSocketServer(port: Int, private val context: Context) : NanoWSD(port) {
    private val dbHelper = SQLiteHelper(context)
    
    override fun openWebSocket(handshake: IHTTPSession): WebSocket {
        return AndroidWebSocket(handshake, dbHelper)
    }
    
    class AndroidWebSocket(
        handshake: IHTTPSession,
        private val dbHelper: SQLiteHelper
    ) : WebSocket(handshake) {
        
        override fun onOpen() {
            Log.d("WebSocket", "Android client connected")
            
            // Send connection established message
            val response = JSONObject().apply {
                put("type", "CONNECTION_ESTABLISHED")
                put("clientId", "android_${System.currentTimeMillis()}")
                put("platform", "android")
                put("capabilities", JSONArray(listOf("sqlite", "localFileSystem")))
            }
            send(response.toString())
        }
        
        override fun onMessage(message: WebSocketFrame) {
            try {
                val data = JSONObject(message.textPayload)
                val type = data.getString("type")
                val requestId = data.getInt("requestId")
                val payload = data.getJSONObject("payload")
                
                val response = when (type) {
                    "GET" -> handleGet(payload)
                    "SET" -> handleSet(payload)
                    "DELETE" -> handleDelete(payload)
                    "QUERY" -> handleQuery(payload)
                    "BATCH" -> handleBatch(payload)
                    else -> JSONObject().put("error", "Unknown type")
                }
                
                val responseMessage = JSONObject().apply {
                    put("type", "${type}_RESPONSE")
                    put("requestId", requestId)
                    put("success", !response.has("error"))
                    put("data", response)
                    put("timestamp", System.currentTimeMillis())
                }
                
                send(responseMessage.toString())
                
            } catch (e: Exception) {
                Log.e("WebSocket", "Error handling message", e)
            }
        }
        
        private fun handleGet(payload: JSONObject): JSONObject {
            val collection = payload.getString("collection")
            val key = payload.getString("key")
            
            return try {
                val data = dbHelper.getData(collection, key)
                if (data != null) {
                    JSONObject(data)
                } else {
                    JSONObject().put("result", null)
                }
            } catch (e: Exception) {
                JSONObject().put("error", e.message)
            }
        }
        
        private fun handleSet(payload: JSONObject): JSONObject {
            val collection = payload.getString("collection")
            val key = payload.getString("key")
            val value = payload.getJSONObject("value")
            
            return try {
                dbHelper.setData(collection, key, value.toString())
                JSONObject().apply {
                    put("success", true)
                    put("key", key)
                    put("timestamp", System.currentTimeMillis())
                }
            } catch (e: Exception) {
                JSONObject().put("error", e.message)
            }
        }
        
        private fun handleQuery(payload: JSONObject): JSONObject {
            val collection = payload.getString("collection")
            val query = payload.getJSONObject("query")
            
            return try {
                val results = dbHelper.queryData(collection, query.toString())
                JSONObject().put("results", JSONArray(results))
            } catch (e: Exception) {
                JSONObject().put("error", e.message)
            }
        }
    }
}
*/

// ===============================
// 3. SQLITE HELPER (SQLiteHelper.kt)
// ===============================

/*
// SQLiteHelper.kt - SQLite database operations
class SQLiteHelper(context: Context) : SQLiteOpenHelper(
    context, DATABASE_NAME, null, DATABASE_VERSION
) {
    
    companion object {
        private const val DATABASE_NAME = "websocket_data.db"
        private const val DATABASE_VERSION = 1
        private const val TABLE_DATA = "data_table"
    }
    
    override fun onCreate(db: SQLiteDatabase) {
        val createTable = """
            CREATE TABLE $TABLE_DATA (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                collection TEXT NOT NULL,
                key TEXT NOT NULL,
                value TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                UNIQUE(collection, key)
            )
        """.trimIndent()
        
        db.execSQL(createTable)
        
        // Create indexes for better performance
        db.execSQL("CREATE INDEX idx_collection_key ON $TABLE_DATA(collection, key)")
        db.execSQL("CREATE INDEX idx_collection ON $TABLE_DATA(collection)")
    }
    
    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        db.execSQL("DROP TABLE IF EXISTS $TABLE_DATA")
        onCreate(db)
    }
    
    fun setData(collection: String, key: String, value: String): Boolean {
        val db = writableDatabase
        val contentValues = ContentValues().apply {
            put("collection", collection)
            put("key", key)
            put("value", value)
            put("created_at", System.currentTimeMillis())
            put("updated_at", System.currentTimeMillis())
        }
        
        val result = db.insertWithOnConflict(
            TABLE_DATA, null, contentValues, SQLiteDatabase.CONFLICT_REPLACE
        )
        
        return result != -1L
    }
    
    fun getData(collection: String, key: String): String? {
        val db = readableDatabase
        val cursor = db.query(
            TABLE_DATA,
            arrayOf("value"),
            "collection = ? AND key = ?",
            arrayOf(collection, key),
            null, null, null
        )
        
        return cursor.use {
            if (it.moveToFirst()) {
                it.getString(0)
            } else {
                null
            }
        }
    }
    
    fun queryData(collection: String, queryJson: String): List<String> {
        val db = readableDatabase
        val results = mutableListOf<String>()
        
        // Simple query implementation - can be enhanced based on needs
        val cursor = db.query(
            TABLE_DATA,
            arrayOf("key", "value"),
            "collection = ?",
            arrayOf(collection),
            null, null, "updated_at DESC"
        )
        
        cursor.use {
            while (it.moveToNext()) {
                val key = it.getString(0)
                val value = it.getString(1)
                results.add(JSONObject().apply {
                    put("key", key)
                    put("data", JSONObject(value))
                }.toString())
            }
        }
        
        return results
    }
    
    fun deleteData(collection: String, key: String): Boolean {
        val db = writableDatabase
        val result = db.delete(
            TABLE_DATA,
            "collection = ? AND key = ?",
            arrayOf(collection, key)
        )
        return result > 0
    }
}
*/

// ===============================
// 4. REACT COMPONENT INTEGRATION
// ===============================

// LandingPageWithWebSocket.jsx - Modified version of your landing page
import React, { useEffect, useState, useMemo } from 'react';
import { WebSocketDataProvider, useWebSocketData } from './useWebSocketData';
import DishGrid from '../dish/dish-grid';
import { DISH_STATUS } from '../../constants/Dish.constants';
import styled from 'styled-components';

// Keep all your existing styled components...
const SearchContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 20px 0;
  gap: 10px;
  @media screen and (max-width: 768px) {
    flex-direction: column;
    gap: 15px;
  }
`;

const SearchInput = styled.input`
  width: 400px;
  padding: 12px 16px;
  border: 2px solid #ddd;
  border-radius: 25px;
  font-size: 16px;
  outline: none;
  transition: all 0.3s ease;
  &:focus {
    border-color: #f09133;
    box-shadow: 0 0 0 3px rgba(240, 145, 51, 0.1);
  }
  @media screen and (max-width: 768px) {
    width: 90%;
  }
`;

const SearchButton = styled.button`
  padding: 12px 20px;
  background-color: #f09133;
  color: white;
  border: none;
  border-radius: 25px;
  font-size: 16px;
  cursor: pointer;
  transition: all 0.3s ease;
  &:hover {
    background-color: #e8822e;
    transform: translateY(-1px);
  }
`;

// WebSocket-enabled Landing Page Component
function LandingPageContent() {
  const { getData, setData, queryData, isReady, loading } = useWebSocketData();
  
  const [dishes, setDishes] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [userCountry, setUserCountry] = useState(null);
  const [cacheStatus, setCacheStatus] = useState({ fromCache: false });

  // Load user data from WebSocket storage
  useEffect(() => {
    const loadUserData = async () => {
      if (!isReady) return;
      
      try {
        console.log('📱 Loading user data from Android storage...');
        
        // Try to get user country from storage
        const savedCountry = await getData('user', 'country');
        if (savedCountry) {
          setUserCountry(savedCountry);
          console.log('🌍 Country loaded from storage:', savedCountry);
        } else {
          // Fallback to detecting country (you can implement this)
          setUserCountry('Unknown');
        }
      } catch (error) {
        console.error('Error loading user data:', error);
        setUserCountry('Unknown');
      }
    };

    loadUserData();
  }, [isReady, getData]);

  // Load dishes from WebSocket storage (SQLite on Android)
  const loadDishes = async (forceRefresh = false) => {
    if (!isReady || !userCountry) return;
    
    setIsLoading(true);
    
    try {
      console.log('🍽️ Loading dishes from Android SQLite...');
      
      if (!forceRefresh) {
        // Try to load from cache first
        const cachedDishes = await getData('dishes', userCountry);
        if (cachedDishes && cachedDishes.length > 0) {
          console.log('⚡ Loaded dishes from SQLite cache:', cachedDishes.length);
          setDishes(cachedDishes);
          setCacheStatus({ fromCache: true, timestamp: Date.now() });
          setIsLoading(false);
          return;
        }
      }
      
      // If no cache or force refresh, load fresh data
      console.log('🌐 Loading fresh dish data...');
      
      // Here you would typically make an API call to your backend
      // For now, we'll simulate loading data
      const freshDishes = await loadDishesFromAPI(userCountry);
      
      // Save to WebSocket storage (SQLite)
      await setData('dishes', userCountry, freshDishes);
      console.log('💾 Saved dishes to SQLite:', freshDishes.length);
      
      setDishes(freshDishes);
      setCacheStatus({ fromCache: false, timestamp: Date.now() });
      
    } catch (error) {
      console.error('Error loading dishes:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Simulate API call - replace with your actual API integration
  const loadDishesFromAPI = async (country) => {
    // This would be your actual API call
    // For demo purposes, we'll return some mock data
    await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate network delay
    
    return [
      {
        _id: '1',
        title: 'Sample Dish 1',
        status: DISH_STATUS.APPROVED,
        category: 'Veg',
        chef: { name: 'Chef Alice' },
        price: 15.99,
        image: '/assets/dish1.jpg'
      },
      {
        _id: '2',
        title: 'Sample Dish 2',
        status: DISH_STATUS.APPROVED,
        category: 'Non Veg',
        chef: { name: 'Chef Bob' },
        price: 22.99,
        image: '/assets/dish2.jpg'
      }
      // Add more mock dishes...
    ];
  };

  // Load dishes when component mounts
  useEffect(() => {
    loadDishes();
  }, [userCountry, isReady]);

  // Handle refresh
  const handleRefresh = () => {
    loadDishes(true);
  };

  // Filter dishes based on search and category
  const filteredDishes = useMemo(() => {
    let filtered = dishes;

    // Filter by search term
    if (searchTerm.trim()) {
      const normalizedTerm = searchTerm.toLowerCase().replace(/\s|-/g, '');
      filtered = filtered.filter(dish => {
        const normalizedTitle = (dish.title || '').toLowerCase().replace(/\s|-/g, '');
        const chef = dish.chef?.name?.toLowerCase() || '';
        return (
          normalizedTitle.includes(normalizedTerm) ||
          chef.includes(normalizedTerm)
        );
      });
    }

    // Filter by category
    if (selectedCategory) {
      filtered = filtered.filter(
        dish => dish.category?.toLowerCase() === selectedCategory.toLowerCase()
      );
    }

    return filtered;
  }, [dishes, searchTerm, selectedCategory]);

  return (
    <>
      {/* Search Interface */}
      <SearchContainer>
        <select
          value={selectedCategory}
          onChange={e => setSelectedCategory(e.target.value)}
          style={{
            padding: '12px 16px',
            border: '2px solid #ddd',
            borderRadius: '25px',
            fontSize: '16px'
          }}
        >
          <option value="">All Categories</option>
          <option value="Veg">Veg</option>
          <option value="Non Veg">Non Veg</option>
          <option value="Snacks">Snacks</option>
          <option value="Dessert">Dessert</option>
          <option value="Beverage">Beverage</option>
        </select>

        <SearchInput
          type="text"
          placeholder={`Search ${dishes.length} dishes...`}
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
        />

        <SearchButton onClick={handleRefresh} disabled={isLoading}>
          {isLoading ? '🔄' : '↻'} Refresh
        </SearchButton>
      </SearchContainer>

      {/* Status Indicator */}
      <div style={{
        textAlign: 'center',
        padding: '10px',
        backgroundColor: cacheStatus.fromCache ? '#e8f5e8' : '#e8f4ff',
        borderRadius: '8px',
        margin: '10px 0'
      }}>
        {cacheStatus.fromCache ? '💾 Loaded from SQLite cache' : '🌐 Fresh data loaded'}
        • {filteredDishes.length} dishes shown
        • Android WebView with WebSocket storage
      </div>

      {/* Loading State */}
      {isLoading && (
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <div style={{ fontSize: '18px' }}>Loading dishes...</div>
        </div>
      )}

      {/* Dish Grid */}
      <DishGrid dishes={filteredDishes} />

      {/* No Results */}
      {!isLoading && filteredDishes.length === 0 && dishes.length > 0 && (
        <div style={{
          textAlign: 'center',
          padding: '40px',
          backgroundColor: '#fff3cd',
          borderRadius: '8px',
          margin: '20px'
        }}>
          <h3>No dishes found</h3>
          <p>Try adjusting your search or category filter</p>
        </div>
      )}

      {/* Debug Info */}
      <div style={{
        position: 'fixed',
        bottom: '10px',
        right: '10px',
        background: 'rgba(0,0,0,0.8)',
        color: 'white',
        padding: '10px',
        borderRadius: '5px',
        fontSize: '12px',
        fontFamily: 'monospace'
      }}>
        📱 Android WebView<br/>
        🔌 WebSocket: {isReady ? 'Connected' : 'Connecting...'}<br/>
        💾 SQLite: {dishes.length} dishes<br/>
        🔍 Filtered: {filteredDishes.length} shown<br/>
        📍 Country: {userCountry}<br/>
        ⚡ Cache: {cacheStatus.fromCache ? 'HIT' : 'MISS'}
      </div>
    </>
  );
}

// Main App Component with WebSocket Provider
function LandingPageWithWebSocket() {
  return (
    <WebSocketDataProvider serverUrl="ws://localhost:8081">
      <LandingPageContent />
    </WebSocketDataProvider>
  );
}

export default LandingPageWithWebSocket;

// ===============================
// 5. ANDROID MANIFEST PERMISSIONS
// ===============================

/*
<!-- AndroidManifest.xml -->
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    
    <!-- WebSocket and Internet permissions -->
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    
    <!-- Storage permissions for SQLite -->
    <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" />
    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
    
    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:theme="@style/AppTheme"
        android:usesCleartextTraffic="true">
        
        <activity
            android:name=".MainActivity"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
*/

// ===============================
// 6. GRADLE DEPENDENCIES 
// ===============================

/*
// app/build.gradle
dependencies {
    implementation 'androidx.webkit:webkit:1.7.0'
    implementation 'org.nanohttpd:nanohttpd:2.3.1'
    implementation 'org.nanohttpd:nanohttpd-websocket:2.3.1'
    // ... your existing dependencies
}
*/
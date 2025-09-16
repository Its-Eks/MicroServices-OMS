import { Pool, PoolClient } from 'pg';
import { MongoClient, Db } from 'mongodb';
import Redis from 'ioredis';

export interface DatabaseConfig {
  postgres: {
    connectionString: string;
    ssl?: boolean | { rejectUnauthorized: boolean };
    max: number;
    idleTimeoutMillis: number;
    connectionTimeoutMillis: number;
  };
  mongodb: {
    uri: string;
    dbName: string;
  };
  redis: {
    url: string;
    retryDelayOnFailover: number;
    maxRetriesPerRequest: number;
  };
}

export class DatabaseService {
  private pgPool: Pool;
  private mongoClient: MongoClient;
  private mongoDb: Db | null = null;
  private redis: Redis;
  private isConnected = false;

  constructor() {
    const config: DatabaseConfig = {
      postgres: {
        connectionString: process.env.DATABASE_URL || 'postgresql://user:password@localhost:5432/oms_db',
        ssl: process.env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: false } : false,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      },
      mongodb: {
        uri: process.env.MONGODB_URI || 'mongodb://localhost:27017',
        dbName: process.env.MONGODB_DB_NAME || 'onboarding_db',
      },
      redis: {
        url: process.env.REDIS_URL || 'redis://localhost:6379',
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 3,
      }
    };

    // Initialize PostgreSQL
    this.pgPool = new Pool(config.postgres);

    // Initialize MongoDB
    this.mongoClient = new MongoClient(config.mongodb.uri);

    // Initialize Redis (support username for Redis 6 ACL; if only password present, default username)
    const rurl = new URL(config.redis.url);
    const rawUser = decodeURIComponent(rurl.username || '');
    const rawPass = decodeURIComponent(rurl.password || '');
    const username = rawUser || (rawPass ? 'default' : '');
    this.redis = new Redis(config.redis.url, {
      username: username || undefined,
      password: rawPass || undefined,
      retryDelayOnFailover: config.redis.retryDelayOnFailover,
      maxRetriesPerRequest: config.redis.maxRetriesPerRequest,
      tls: config.redis.url.startsWith('rediss://') ? {} : undefined,
    } as any);

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // PostgreSQL event handlers
    this.pgPool.on('error', (err) => {
      console.error('PostgreSQL pool error:', err);
    });

    this.pgPool.on('connect', () => {
      console.log('✅ PostgreSQL connection established');
    });

    // Redis event handlers
    this.redis.on('connect', () => {
      console.log('✅ Redis connection established');
    });

    this.redis.on('error', (err) => {
      console.error('Redis connection error:', err);
    });

    // MongoDB event handlers
    this.mongoClient.on('open', () => {
      console.log('✅ MongoDB connection established');
    });

    this.mongoClient.on('error', (err: any) => {
      console.error('MongoDB connection error:', err);
    });
  }

  async connect(): Promise<void> {
    try {
      console.log('🔌 Connecting to databases...');

      // Connect to PostgreSQL
      const pgClient = await this.pgPool.connect();
      await pgClient.query('SELECT 1');
      pgClient.release();

      // Connect to MongoDB
      await this.mongoClient.connect();
      this.mongoDb = this.mongoClient.db(process.env.MONGODB_DB_NAME || 'onboarding_db');

      // Test Redis connection
      await this.redis.ping();

      this.isConnected = true;
      console.log('✅ All database connections established');
    } catch (error) {
      console.error('❌ Database connection failed:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      console.log('🔌 Disconnecting from databases...');

      await Promise.allSettled([
        this.pgPool.end(),
        this.mongoClient.close(),
        this.redis.quit()
      ]);

      this.isConnected = false;
      console.log('✅ All database connections closed');
    } catch (error) {
      console.error('❌ Error during database disconnection:', error);
      throw error;
    }
  }

  // PostgreSQL methods
  async query(text: string, params?: any[]): Promise<any> {
    if (!this.isConnected) {
      throw new Error('Database not connected');
    }
    return await this.pgPool.query(text, params);
  }

  async getClient(): Promise<PoolClient> {
    if (!this.isConnected) {
      throw new Error('Database not connected');
    }
    return await this.pgPool.connect();
  }

  // MongoDB methods
  get mongo(): Db {
    if (!this.mongoDb) {
      throw new Error('MongoDB not connected');
    }
    return this.mongoDb;
  }

  // Redis methods
  get redisClient(): Redis {
    if (!this.isConnected) {
      throw new Error('Redis not connected');
    }
    return this.redis;
  }

  // Health check
  async healthCheck(): Promise<{ postgres: boolean; mongodb: boolean; redis: boolean }> {
    const health = {
      postgres: false,
      mongodb: false,
      redis: false
    };

    try {
      // Check PostgreSQL
      const pgClient = await this.pgPool.connect();
      await pgClient.query('SELECT 1');
      pgClient.release();
      health.postgres = true;
    } catch (error) {
      console.error('PostgreSQL health check failed:', error);
    }

    try {
      // Check MongoDB
      await this.mongoDb?.admin().ping();
      health.mongodb = true;
    } catch (error) {
      console.error('MongoDB health check failed:', error);
    }

    try {
      // Check Redis
      await this.redis.ping();
      health.redis = true;
    } catch (error) {
      console.error('Redis health check failed:', error);
    }

    return health;
  }
}

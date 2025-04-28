import Redis from 'ioredis';

// Get environment variables
const redisUrl = process.env.REDIS_URL;
const appEnv = process.env.APP_ENV || 'development';

// Configure Redis client based on environment
const getRedisClient = () => {
    // Default Redis configuration for local development
    let redisConfig = 'redis://localhost:6379';

    // Use REDIS_URL for Railway or other environments if available
    if (redisUrl) {
        redisConfig = redisUrl;
    }

    // Create and return Redis client
    const client = new Redis(redisConfig);

    // Log connection status based on environment
    client.on('error', (err) => {
        console.error(`Redis connection error (${appEnv}):`, err);
    });

    client.on('connect', () => {
        console.log(`Connected to Redis successfully (${appEnv})`);
    });

    return client;
};

// Export Redis client
const redis = getRedisClient();
export default redis;

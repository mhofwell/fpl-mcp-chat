import Redis from 'ioredis';

// Check if REDIS_URL is defined
if (!process.env.REDIS_URL) {
    console.warn(
        'REDIS_URL is not defined. Using default Redis configuration.'
    );
}

// Create Redis client
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

// Handle connection errors
redis.on('error', (err) => {
    console.error('Redis connection error:', err);
});

redis.on('connect', () => {
    console.log('Connected to Redis successfully');
});

export default redis;

import { createClient } from 'redis';

const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
});

redisClient.on('error', (err) => console.error('Redis Client Error', err));

let isConnected = false;

export async function connectRedis() {
  if (!isConnected) {
    await redisClient.connect();
    isConnected = true;
    console.log('✅ Redis connected');
  }
}

export interface Job {
  id: string;
  type: 'pdf_generation' | 'sheets_sync' | 'notification' | 'reminder';
  data: any;
  priority?: number;
  scheduledFor?: Date;
}

export async function enqueueJob(job: Job): Promise<void> {
  try {
    await connectRedis();
    
    const queueKey = `queue:${job.type}`;
    const jobData = JSON.stringify({
      ...job,
      enqueuedAt: new Date().toISOString(),
    });

    if (job.scheduledFor) {
      const score = job.scheduledFor.getTime();
      await redisClient.zAdd(`${queueKey}:scheduled`, {
        score,
        value: jobData,
      });
    } else {
      await redisClient.lPush(queueKey, jobData);
    }

    console.log(`📋 Enqueued job: ${job.type} (${job.id})`);
  } catch (error) {
    console.error('Enqueue job error:', error);
    throw error;
  }
}

export async function dequeueJob(jobType: string): Promise<Job | null> {
  try {
    await connectRedis();
    
    const queueKey = `queue:${jobType}`;
    const jobData = await redisClient.rPop(queueKey);

    if (!jobData) {
      return null;
    }

    return JSON.parse(jobData);
  } catch (error) {
    console.error('Dequeue job error:', error);
    return null;
  }
}

export async function cacheSet(key: string, value: any, expirySeconds?: number): Promise<void> {
  try {
    await connectRedis();
    
    const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
    
    if (expirySeconds) {
      await redisClient.setEx(key, expirySeconds, stringValue);
    } else {
      await redisClient.set(key, stringValue);
    }
  } catch (error) {
    console.error('Cache set error:', error);
  }
}

export async function cacheGet(key: string): Promise<any | null> {
  try {
    await connectRedis();
    
    const value = await redisClient.get(key);
    
    if (!value) {
      return null;
    }

    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  } catch (error) {
    console.error('Cache get error:', error);
    return null;
  }
}

export default redisClient;

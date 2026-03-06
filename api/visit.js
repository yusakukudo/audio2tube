import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

export default async function handler(req, res) {

  if (req.method === "POST") {
    const visits = await redis.incr("visits");
    return res.status(200).json({ visits });
  }

  const visits = await redis.get("visits") || 0;
  res.status(200).json({ visits });

}
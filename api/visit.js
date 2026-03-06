import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

export default async function handler(req, res) {

  const visits = await redis.incr("visits");

  res.status(200).json({ visits });

}
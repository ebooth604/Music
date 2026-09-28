import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { config } from "../config.js";

export const connection = new Redis(config.redisUrl, { maxRetriesPerRequest: null });

export type PlanJob = { projectId: string };
export type ShotJob = { projectId: string; shotIndex: number };
export type AssembleJob = { projectId: string };

export const planQueue = new Queue<PlanJob>("plan", { connection });
export const shotQueue = new Queue<ShotJob>("shot", { connection });
export const assembleQueue = new Queue<AssembleJob>("assemble", { connection });

/** Job ids are deterministic so re-enqueueing the same shot is idempotent (resume-safe). */
export const enqueuePlan = (projectId: string) => planQueue.add("plan", { projectId }, { jobId: `plan:${projectId}:${Date.now()}` });
export const enqueueShot = (projectId: string, shotIndex: number) =>
  shotQueue.add("shot", { projectId, shotIndex }, { jobId: `shot:${projectId}:${shotIndex}:${Date.now()}`, attempts: 1 });
export const enqueueAssemble = (projectId: string) => assembleQueue.add("assemble", { projectId }, { jobId: `assemble:${projectId}:${Date.now()}` });

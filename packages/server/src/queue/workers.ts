import { Worker } from "bullmq";
import { connection, type AssembleJob, type PlanJob, type ShotJob } from "./queues.js";
import { assembleProject, planProject, processShot } from "../pipeline/orchestrator.js";
import { requeueStaleBrowserJobs } from "../db/repo.js";

export function startWorkers(): Worker[] {
  const workers = [
    new Worker<PlanJob>("plan", async (job) => planProject(job.data.projectId), { connection, concurrency: 4 }),
    // Shots within a project are strictly sequential (continuity), but different projects run in parallel.
    new Worker<ShotJob>("shot", async (job) => processShot(job.data.projectId, job.data.shotIndex), { connection, concurrency: 8, lockDuration: 90 * 60_000 }),
    new Worker<AssembleJob>("assemble", async (job) => assembleProject(job.data.projectId), { connection, concurrency: 2, lockDuration: 60 * 60_000 }),
  ];
  for (const w of workers) {
    w.on("failed", (job, err) => console.error(`[${w.name}] job ${job?.id} failed:`, err.message));
    w.on("completed", (job) => console.log(`[${w.name}] job ${job.id} done`));
  }
  setInterval(() => requeueStaleBrowserJobs().then((n) => n && console.log(`requeued ${n} stale browser jobs`)).catch(console.error), 60_000).unref();
  return workers;
}

if (process.argv[1]?.endsWith("workers.ts") || process.argv[1]?.endsWith("workers.js")) {
  startWorkers();
  console.log("LongForm workers running");
}

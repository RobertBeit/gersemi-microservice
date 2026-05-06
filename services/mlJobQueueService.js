const { randomUUID } = require("crypto");

const { executeMlMethod } = require("./mlExecutionService");

const jobs = [];
let isProcessing = false;

const toPublicJob = (job) => ({
  id: job.id,
  service: job.service,
  method: job.method,
  metadata: job.metadata,
  status: job.status,
  createdAt: job.createdAt,
  startedAt: job.startedAt,
  finishedAt: job.finishedAt,
  error: job.error,
});

const processQueue = async () => {
  if (isProcessing) {
    return;
  }

  isProcessing = true;

  try {
    while (true) {
      const nextJob = jobs.find((job) => job.status === "queued");
      if (!nextJob) {
        break;
      }

      nextJob.status = "running";
      nextJob.startedAt = new Date().toISOString();

      try {
        const result = await executeMlMethod({
          service: nextJob.service,
          method: nextJob.method,
          args: nextJob.args,
        });

        nextJob.result = result;
        nextJob.status = "completed";
      } catch (error) {
        nextJob.status = "failed";
        nextJob.error = error.message || "Unknown ML execution error";
      } finally {
        nextJob.finishedAt = new Date().toISOString();
      }
    }
  } finally {
    isProcessing = false;
  }
};

const addJob = async ({ service, method, args = [], metadata = {} }) => {
  const job = {
    id: randomUUID(),
    service,
    method,
    args,
    metadata,
    status: "queued",
    result: null,
    error: null,
    createdAt: new Date().toISOString(),
    startedAt: null,
    finishedAt: null,
  };

  jobs.push(job);
  processQueue().catch((error) => {
    console.error("ML queue processing error:", error);
  });

  return toPublicJob(job);
};

const getAllJobs = () => jobs.map(toPublicJob).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

const getJobById = (id) => {
  const job = jobs.find((item) => item.id === id);
  return job ? toPublicJob(job) : null;
};

const getJobResultById = (id) => {
  const job = jobs.find((item) => item.id === id);
  if (!job) {
    return null;
  }

  return {
    job: toPublicJob(job),
    result: job.result,
    error: job.error,
  };
};

const cancelQueuedJob = (id) => {
  const job = jobs.find((item) => item.id === id);
  if (!job || job.status !== "queued") {
    return null;
  }

  job.status = "cancelled";
  job.finishedAt = new Date().toISOString();
  return toPublicJob(job);
};

module.exports = {
  addJob,
  getAllJobs,
  getJobById,
  getJobResultById,
  cancelQueuedJob,
};
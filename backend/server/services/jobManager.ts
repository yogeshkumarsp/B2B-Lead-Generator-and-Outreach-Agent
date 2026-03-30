
import crypto from 'crypto';

export type JobStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';

export interface DiscoveryJob {
    id: string;
    userId: string;
    status: JobStatus;
    results: any[];
    error?: string;
    createdAt: number;
    updatedAt: number;
}

class JobManager {
    private jobs: Map<string, DiscoveryJob> = new Map();

    createJob(userId: string): string {
        const jobId = crypto.randomUUID();
        const job: DiscoveryJob = {
            id: jobId,
            userId,
            status: 'PENDING',
            results: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };
        this.jobs.set(jobId, job);
        
        // Cleanup old jobs (older than 1 hour)
        this.cleanup();
        
        return jobId;
    }

    updateJob(jobId: string, updates: Partial<DiscoveryJob>) {
        const job = this.jobs.get(jobId);
        if (job) {
            Object.assign(job, updates, { updatedAt: Date.now() });
        }
    }

    getJob(jobId: string): DiscoveryJob | undefined {
        return this.jobs.get(jobId);
    }

    private cleanup() {
        const ONE_HOUR = 60 * 60 * 1000;
        const now = Date.now();
        for (const [id, job] of this.jobs.entries()) {
            if (now - job.createdAt > ONE_HOUR) {
                this.jobs.delete(id);
            }
        }
    }
}

export const jobManager = new JobManager();

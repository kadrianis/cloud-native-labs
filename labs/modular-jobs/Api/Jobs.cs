using System.Collections.Concurrent;

namespace ModularJobs;

public sealed record Job(Guid Id, string Title, string Status);
public sealed record CreateJob(string? Title);

public sealed class JobStore
{
    private readonly ConcurrentDictionary<Guid, Job> jobs = new();
    public Job Create(string? title)
    {
        var normalized = title?.Trim();
        if (string.IsNullOrEmpty(normalized) || normalized.Length > 120)
            throw new ArgumentException("Le titre doit contenir de 1 à 120 caractères.");
        // Bound memory for this disposable demonstration. Admission must be atomic.
        lock (jobs)
        {
            if (jobs.Count >= 1000) throw new InvalidOperationException("Capacité du lab atteinte.");
            var job = new Job(Guid.NewGuid(), normalized, "pending");
            jobs[job.Id] = job;
            return job;
        }
    }
    public Job? Find(Guid id) => jobs.GetValueOrDefault(id);
}

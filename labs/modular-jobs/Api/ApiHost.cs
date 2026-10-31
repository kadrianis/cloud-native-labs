namespace ModularJobs;

public static class ApiHost
{
    public static WebApplication Build(string[] args)
    {
        var builder = WebApplication.CreateBuilder(args);
        builder.WebHost.ConfigureKestrel(options => options.Limits.MaxRequestBodySize = 4096);
        builder.Services.AddSingleton<JobStore>();
        var app = builder.Build();
        app.MapGet("/health", () => Results.Ok(new { status = "ok" }));
        app.MapPost("/jobs", (CreateJob input, JobStore store) =>
        {
            try
            {
                var job = store.Create(input.Title);
                return Results.Created($"/jobs/{job.Id}", job);
            }
            catch (ArgumentException error)
            {
                return Results.Problem(statusCode: 400, title: error.Message);
            }
            catch (InvalidOperationException error)
            {
                return Results.Problem(statusCode: 503, title: error.Message);
            }
        });
        app.MapGet("/jobs/{id:guid}", (Guid id, JobStore store) =>
            store.Find(id) is { } job ? Results.Ok(job) : Results.NotFound());
        return app;
    }
}

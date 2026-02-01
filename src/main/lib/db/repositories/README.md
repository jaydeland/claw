# Conductor Repositories

This directory contains repository classes for managing conductor domain entities using Drizzle ORM.

## Available Repositories

### ConductorLogRepository

Manages agent execution logs with comprehensive CRUD operations, filtering, and batch support.

**Usage:**

```typescript
import { conductorLogRepository } from './repositories'

// Create a single log entry
const log = conductorLogRepository.create({
  jobId: 'job-123',
  timestamp: new Date(),
  level: 'info',
  message: 'Processing started',
  metadata: JSON.stringify({ taskId: 'task-456' })
})

// Create multiple logs in batch
const logs = conductorLogRepository.createMany([
  { jobId: 'job-123', timestamp: new Date(), level: 'info', message: 'Step 1' },
  { jobId: 'job-123', timestamp: new Date(), level: 'info', message: 'Step 2' }
])

// Find logs with pagination
const recentLogs = conductorLogRepository.findByJobId('job-123', { limit: 10, offset: 0 })

// Filter by log level
const errors = conductorLogRepository.findByLevel('job-123', 'error')

// Get log statistics
const errorCount = conductorLogRepository.countByLevel('job-123', 'error')
const uniqueLevels = conductorLogRepository.getUniqueLevels('job-123')

// Find logs in time range
const todayLogs = conductorLogRepository.findByTimeRange(
  'job-123',
  new Date('2024-01-01'),
  new Date('2024-01-02')
)

// Delete logs
conductorLogRepository.deleteByJobId('job-123')
```

## Patterns

All repositories follow these patterns:

1. **Singleton Pattern**: Exported as singleton instances for convenience
2. **Type Safety**: Full TypeScript types from Drizzle schema
3. **Error Handling**: Throws descriptive errors on failures
4. **Batch Operations**: Efficient bulk operations where applicable
5. **Pagination Support**: Optional limit/offset parameters
6. **Consistent Ordering**: Sensible default ordering (newest first for logs)

## Adding New Repositories

When creating new repositories:

1. Create a new file: `{EntityName}Repository.ts`
2. Follow the class-based pattern with singleton export
3. Add comprehensive JSDoc comments
4. Export from `index.ts`
5. Document usage in this README

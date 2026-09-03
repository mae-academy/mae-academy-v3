---
description: Best practices for implementing, optimizing, and securing server-side API storage backends, PDF pipelines, and database attachments for academic assets.
---

# API Storage Backend Skill

Use this skill when implementing or auditing server-side storage logic, PDF uploads, local filesystem fallback, or metadata schemas for Academic Courses and Research documents.

## 1. Architectural Conventions

- **Decoupled IO**: The API router layer must never perform direct IO operations. Delegate storage handling to dedicated service modules or repository abstractions.
- **Fail-Safe Fallbacks**: Provide an explicit local `FileSystemStorage` adapter for local development and testing environments, alongside cloud storage options (e.g., Supabase / S3).
- **Streaming Over Buffering**: Never load whole file uploads or binary arrays into RAM. Pipe incoming multipart streams directly to the target storage destination.
- **TypeScript First**: All backend storage adapters and schemas must be strictly typed using TypeScript.

## 2. Core Storage Patterns (TypeScript)

### Local Filesystem Target
Ensure path normalization prevents directory traversal and securely manages file writes:

```typescript
import { promises as fs } from 'fs';
import path from 'path';

export class LocalStorageBackend {
  private readonly rootPath: string;

  constructor(baseDir = './storage') {
    this.rootPath = path.resolve(baseDir);
  }

  async save(category: 'courses' | 'research', fileName: string, data: Buffer | Uint8Array): Promise<string> {
    const safeFileName = path.basename(fileName).replace(/[^a-zA-Z0-9._-]/g, '_');
    const targetDir = path.join(this.rootPath, category);
    const targetPath = path.join(targetDir, safeFileName);

    if (!targetPath.startsWith(this.rootPath)) {
      throw new Error('Directory traversal attempt detected.');
    }

    await fs.mkdir(targetDir, { recursive: true });
    await fs.writeFile(targetPath, data);
    return targetPath;
  }
}
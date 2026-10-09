import 'dotenv/config';
import dataSource from '../database/data-source';
import { AuthSession } from './auth-session.entity';

async function main(): Promise<void> {
  await dataSource.initialize();
  try {
    // The foreign key removes each session's refresh-token history as well.
    const result = await dataSource
      .createQueryBuilder()
      .delete()
      .from(AuthSession)
      .where('expires_at < :now', { now: new Date() })
      .execute();
    process.stdout.write(`Pruned ${result.affected ?? 0} expired sessions\n`);
  } finally {
    await dataSource.destroy();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `Session cleanup failed: ${error instanceof Error ? error.message : 'Unknown error'}\n`,
  );
  process.exitCode = 1;
});

import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import dataSource from './data-source';
import { User, UserRole } from '../users/user.entity';

const users: Array<{
  email: string;
  role: UserRole;
  passwordVariable: string;
}> = [
  {
    email: 'admin@example.test',
    role: UserRole.ADMIN,
    passwordVariable: 'SEED_ADMIN_PASSWORD',
  },
  {
    email: 'sales.a@example.test',
    role: UserRole.SALES,
    passwordVariable: 'SEED_SALES_A_PASSWORD',
  },
  {
    email: 'sales.b@example.test',
    role: UserRole.SALES,
    passwordVariable: 'SEED_SALES_B_PASSWORD',
  },
  {
    email: 'reviewer.a@example.test',
    role: UserRole.REVIEWER,
    passwordVariable: 'SEED_REVIEWER_A_PASSWORD',
  },
  {
    email: 'reviewer.b@example.test',
    role: UserRole.REVIEWER,
    passwordVariable: 'SEED_REVIEWER_B_PASSWORD',
  },
];

async function seed(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Development seed is disabled in production');
  }

  const passwords = users.map(({ passwordVariable }) => {
    const password = process.env[passwordVariable];
    if (
      !password ||
      password.startsWith('replace-with-') ||
      password.length < 12 ||
      Buffer.byteLength(password, 'utf8') > 72
    ) {
      throw new Error(
        `Set a local password of at least 12 characters and at most 72 UTF-8 bytes for ${passwordVariable}`,
      );
    }
    return password;
  });
  if (new Set(passwords).size !== passwords.length) {
    throw new Error('Use a different password for each seeded user');
  }

  await dataSource.initialize();
  try {
    const rows = await Promise.all(
      users.map(async ({ email, role }, index) => ({
        email,
        role,
        passwordHash: await bcrypt.hash(passwords[index], 12),
      })),
    );
    await dataSource.getRepository(User).upsert(rows, ['email']);
    process.stdout.write(
      `Seeded ${users.length} fictional development users.\n`,
    );
  } finally {
    await dataSource.destroy();
  }
}

void seed().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown seed error';
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});

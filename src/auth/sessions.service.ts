import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, MoreThan, Repository } from 'typeorm';
import { AuthSession } from './auth-session.entity';
import { RefreshToken } from './refresh-token.entity';

export interface IssuedSession {
  sessionId: string;
  userId: string;
  refreshToken: string;
  expiresAt: Date;
}

function newRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class SessionsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(AuthSession)
    private readonly sessions: Repository<AuthSession>,
  ) {}

  async create(
    userId: string,
    lifetimeSeconds: number,
  ): Promise<IssuedSession> {
    const sessionId = randomUUID();
    const refreshToken = newRefreshToken();
    const expiresAt = new Date(Date.now() + lifetimeSeconds * 1000);

    await this.dataSource.transaction(async (manager) => {
      await manager.insert(AuthSession, {
        id: sessionId,
        userId,
        expiresAt,
        revokedAt: null,
      });
      await manager.insert(RefreshToken, {
        sessionId,
        tokenHash: tokenHash(refreshToken),
        expiresAt,
        consumedAt: null,
      });
    });

    return { sessionId, userId, refreshToken, expiresAt };
  }

  async isActive(sessionId: string, userId: string): Promise<boolean> {
    const session = await this.sessions.findOneBy({
      id: sessionId,
      userId,
      revokedAt: IsNull(),
      expiresAt: MoreThan(new Date()),
    });
    return session !== null;
  }

  async rotate(rawToken: string): Promise<IssuedSession> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(rawToken)) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const result = await this.dataSource.transaction(async (manager) => {
      const tokens = manager.getRepository(RefreshToken);
      const sessions = manager.getRepository(AuthSession);
      const identified = await tokens.findOneBy({
        tokenHash: tokenHash(rawToken),
      });
      if (!identified) return { kind: 'invalid' } as const;

      const session = await sessions
        .createQueryBuilder('session')
        .setLock('pessimistic_write')
        .where('session.id = :id', { id: identified.sessionId })
        .getOne();
      if (!session) return { kind: 'invalid' } as const;

      // Read again after the session lock: another refresh may have consumed it.
      const current = await tokens.findOneBy({ id: identified.id });
      if (!current) return { kind: 'invalid' } as const;
      const now = new Date();
      if (
        session.revokedAt ||
        session.expiresAt <= now ||
        current.expiresAt <= now
      ) {
        return { kind: 'invalid' } as const;
      }
      if (current.consumedAt) {
        await sessions.update({ id: session.id }, { revokedAt: now });
        return { kind: 'replayed' } as const;
      }

      const update = await tokens
        .createQueryBuilder()
        .update(RefreshToken)
        .set({ consumedAt: now })
        .where('id = :id AND consumed_at IS NULL', { id: current.id })
        .execute();
      if (update.affected !== 1) {
        await sessions.update({ id: session.id }, { revokedAt: now });
        return { kind: 'replayed' } as const;
      }

      const refreshToken = newRefreshToken();
      await tokens.insert({
        sessionId: session.id,
        tokenHash: tokenHash(refreshToken),
        expiresAt: session.expiresAt,
        consumedAt: null,
      });
      return {
        kind: 'rotated',
        sessionId: session.id,
        userId: session.userId,
        refreshToken,
        expiresAt: session.expiresAt,
      } as const;
    });

    if (result.kind !== 'rotated') {
      throw new UnauthorizedException('Invalid refresh token');
    }
    return result;
  }

  async revokeByRefreshToken(rawToken: string): Promise<void> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(rawToken)) return;

    await this.dataSource.transaction(async (manager) => {
      const identified = await manager
        .getRepository(RefreshToken)
        .findOneBy({ tokenHash: tokenHash(rawToken) });
      if (!identified) return;

      const sessions = manager.getRepository(AuthSession);
      const session = await sessions
        .createQueryBuilder('session')
        .setLock('pessimistic_write')
        .where('session.id = :id', { id: identified.sessionId })
        .getOne();
      if (session && !session.revokedAt) {
        await sessions.update({ id: session.id }, { revokedAt: new Date() });
      }
    });
  }

  async revokeById(sessionId: string): Promise<void> {
    await this.sessions.update(
      { id: sessionId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }
}

import { EntityManager } from 'typeorm';
import { AuditAction } from './audit-event.entity';
import { AuditService } from './audit.service';

describe('AuditService', () => {
  it('rejects sensitive metadata before writing an event', async () => {
    const insert = jest.fn().mockResolvedValue(undefined);
    const manager = { insert } as unknown as EntityManager;
    const service = new AuditService();
    const base = {
      actorUserId: null,
      applicationId: 'a819d88a-9bde-4b54-a16c-e3d1d3a657dd',
      requestId: null,
      action: AuditAction.APPLICATION_UPDATED,
    };

    await expect(
      service.record(manager, {
        ...base,
        metadata: {
          fields: ['contactEmail'],
          contactEmail: 'owner@example.test',
        },
      }),
    ).rejects.toThrow('Invalid audit metadata');
    await expect(
      service.record(manager, {
        ...base,
        metadata: { fields: ['contactEmail', 'owner@example.test'] },
      }),
    ).rejects.toThrow('Invalid audit metadata');
    expect(insert).not.toHaveBeenCalled();

    await service.record(manager, {
      ...base,
      metadata: { fields: ['contactEmail'] },
    });
    expect(insert).toHaveBeenCalledTimes(1);
  });
});

import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { User, UserRole } from '../users/user.entity';
import {
  ApplicationStatus,
  MerchantApplication,
  RiskStatus,
} from './application.entity';
import { AssignReviewerDto } from './dto/assign-reviewer.dto';
import {
  ApplicationPageDto,
  ApplicationResponseDto,
  toApplicationResponse,
} from './dto/application-response.dto';
import { CreateApplicationDto } from './dto/create-application.dto';
import { ListApplicationsDto } from './dto/list-applications.dto';
import {
  RecordDecisionDto,
  toApplicationStatus,
} from './dto/record-decision.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';
import { ReviewDecision } from './review-decision.entity';

function visibleTo(
  query: SelectQueryBuilder<MerchantApplication>,
  actor: UserResponseDto,
): SelectQueryBuilder<MerchantApplication> {
  if (actor.role === UserRole.SALES) {
    return query.andWhere('application.created_by_id = :actorId', {
      actorId: actor.id,
    });
  }
  if (actor.role === UserRole.REVIEWER) {
    return query.andWhere('application.assigned_reviewer_id = :actorId', {
      actorId: actor.id,
    });
  }
  return query;
}

function editable(application: MerchantApplication): boolean {
  return (
    application.applicationStatus === ApplicationStatus.DRAFT ||
    application.applicationStatus === ApplicationStatus.INFO_REQUESTED
  );
}

function riskComplete(status: RiskStatus): boolean {
  return (
    status === RiskStatus.PASSED ||
    status === RiskStatus.FLAGGED ||
    status === RiskStatus.FAILED
  );
}

function canonicalMoney(value: string): string {
  const [whole, fractional = ''] = value.split('.');
  return `${whole}.${fractional.padEnd(2, '0')}`;
}

@Injectable()
export class ApplicationsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(MerchantApplication)
    private readonly applications: Repository<MerchantApplication>,
  ) {}

  async create(
    actor: UserResponseDto,
    input: CreateApplicationDto,
  ): Promise<ApplicationResponseDto> {
    this.requireOperator(actor);
    const application = await this.applications.save({
      id: randomUUID(),
      businessName: input.businessName.trim(),
      legalBusinessName: input.legalBusinessName.trim(),
      businessType: input.businessType.trim(),
      ownerName: input.ownerName.trim(),
      contactEmail: input.contactEmail,
      contactPhone: input.contactPhone.trim(),
      requestedMonthlyVolume: canonicalMoney(input.requestedMonthlyVolume),
      averageTransactionAmount: canonicalMoney(input.averageTransactionAmount),
      currency: input.currency,
      applicationStatus: ApplicationStatus.DRAFT,
      riskStatus: RiskStatus.NOT_STARTED,
      submissionVersion: 0,
      createdById: actor.id,
      assignedReviewerId: null,
      submittedAt: null,
      reviewedAt: null,
    });
    return toApplicationResponse(application);
  }

  async list(
    actor: UserResponseDto,
    query: ListApplicationsDto,
  ): Promise<ApplicationPageDto> {
    const builder = visibleTo(
      this.applications.createQueryBuilder('application'),
      actor,
    );
    if (query.status) {
      builder.andWhere('application.application_status = :status', {
        status: query.status,
      });
    }
    const [items, total] = await builder
      .orderBy('application.created_at', 'DESC')
      .addOrderBy('application.id', 'DESC')
      .skip((query.page - 1) * query.pageSize)
      .take(query.pageSize)
      .getManyAndCount();
    return {
      items: items.map(toApplicationResponse),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async get(
    actor: UserResponseDto,
    id: string,
  ): Promise<ApplicationResponseDto> {
    const application = await visibleTo(
      this.applications
        .createQueryBuilder('application')
        .where('application.id = :id', { id }),
      actor,
    ).getOne();
    if (!application) throw new NotFoundException('Application not found');
    return toApplicationResponse(application);
  }

  async update(
    actor: UserResponseDto,
    id: string,
    input: UpdateApplicationDto,
  ): Promise<ApplicationResponseDto> {
    this.requireOperator(actor);
    if (Object.keys(input).length === 0) {
      throw new BadRequestException('At least one field is required');
    }
    return this.dataSource.transaction(async (manager) => {
      const application = await this.lockForOperator(
        manager.getRepository(MerchantApplication),
        actor,
        id,
      );
      if (!editable(application)) {
        throw new ConflictException('Application is not editable');
      }
      if (input.businessName !== undefined)
        application.businessName = input.businessName.trim();
      if (input.legalBusinessName !== undefined)
        application.legalBusinessName = input.legalBusinessName.trim();
      if (input.businessType !== undefined)
        application.businessType = input.businessType.trim();
      if (input.ownerName !== undefined)
        application.ownerName = input.ownerName.trim();
      if (input.contactEmail !== undefined)
        application.contactEmail = input.contactEmail;
      if (input.contactPhone !== undefined)
        application.contactPhone = input.contactPhone.trim();
      if (input.requestedMonthlyVolume !== undefined) {
        application.requestedMonthlyVolume = canonicalMoney(
          input.requestedMonthlyVolume,
        );
      }
      if (input.averageTransactionAmount !== undefined) {
        application.averageTransactionAmount = canonicalMoney(
          input.averageTransactionAmount,
        );
      }
      if (input.currency !== undefined) application.currency = input.currency;
      return toApplicationResponse(await manager.save(application));
    });
  }

  async submit(
    actor: UserResponseDto,
    id: string,
  ): Promise<ApplicationResponseDto> {
    this.requireOperator(actor);
    return this.dataSource.transaction(async (manager) => {
      const application = await this.lockForOperator(
        manager.getRepository(MerchantApplication),
        actor,
        id,
      );
      if (
        !editable(application) ||
        application.submissionVersion >= 2147483647
      ) {
        throw new ConflictException('Application cannot be submitted');
      }
      application.submissionVersion += 1;
      application.applicationStatus = ApplicationStatus.SUBMITTED;
      application.riskStatus = RiskStatus.PENDING;
      application.submittedAt = new Date();
      application.reviewedAt = null;
      return toApplicationResponse(await manager.save(application));
    });
  }

  async assign(
    actor: UserResponseDto,
    id: string,
    input: AssignReviewerDto,
  ): Promise<ApplicationResponseDto> {
    if (actor.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only admins can assign reviewers');
    }
    return this.dataSource.transaction(async (manager) => {
      const application = await this.lockApplication(
        manager.getRepository(MerchantApplication),
        id,
      );
      if (
        application.applicationStatus === ApplicationStatus.APPROVED ||
        application.applicationStatus === ApplicationStatus.REJECTED
      ) {
        throw new ConflictException(
          'Completed applications cannot be reassigned',
        );
      }
      const reviewer = await manager
        .getRepository(User)
        .createQueryBuilder('user')
        .setLock('pessimistic_read')
        .where('user.id = :id', { id: input.reviewerId })
        .getOne();
      if (reviewer?.role !== UserRole.REVIEWER) {
        throw new BadRequestException('Reviewer ID must identify a reviewer');
      }
      application.assignedReviewerId = reviewer.id;
      if (
        application.applicationStatus === ApplicationStatus.SUBMITTED &&
        riskComplete(application.riskStatus)
      ) {
        application.applicationStatus = ApplicationStatus.UNDER_REVIEW;
      }
      return toApplicationResponse(await manager.save(application));
    });
  }

  async decide(
    actor: UserResponseDto,
    id: string,
    input: RecordDecisionDto,
  ): Promise<ApplicationResponseDto> {
    if (actor.role !== UserRole.REVIEWER) {
      throw new ForbiddenException('Only assigned reviewers can decide');
    }
    return this.dataSource.transaction(async (manager) => {
      const application = await manager
        .getRepository(MerchantApplication)
        .createQueryBuilder('application')
        .setLock('pessimistic_write')
        .where('application.id = :id', { id })
        .andWhere('application.assigned_reviewer_id = :actorId', {
          actorId: actor.id,
        })
        .getOne();
      if (!application) throw new NotFoundException('Application not found');
      if (application.applicationStatus !== ApplicationStatus.UNDER_REVIEW) {
        throw new ConflictException('Application is not under review');
      }
      await manager.insert(ReviewDecision, {
        applicationId: id,
        reviewerId: actor.id,
        decision: toApplicationStatus(input.decision),
        reason: input.reason.trim(),
        applicationVersion: application.submissionVersion,
      });
      application.applicationStatus = toApplicationStatus(input.decision);
      application.reviewedAt = new Date();
      return toApplicationResponse(await manager.save(application));
    });
  }

  private requireOperator(actor: UserResponseDto): void {
    if (actor.role !== UserRole.ADMIN && actor.role !== UserRole.SALES) {
      throw new ForbiddenException(
        'Only admins and sales users can manage applications',
      );
    }
  }

  private async lockForOperator(
    repository: Repository<MerchantApplication>,
    actor: UserResponseDto,
    id: string,
  ): Promise<MerchantApplication> {
    const application = await visibleTo(
      repository
        .createQueryBuilder('application')
        .setLock('pessimistic_write')
        .where('application.id = :id', { id }),
      actor,
    ).getOne();
    if (!application) throw new NotFoundException('Application not found');
    return application;
  }

  private async lockApplication(
    repository: Repository<MerchantApplication>,
    id: string,
  ): Promise<MerchantApplication> {
    const application = await repository
      .createQueryBuilder('application')
      .setLock('pessimistic_write')
      .where('application.id = :id', { id })
      .getOne();
    if (!application) throw new NotFoundException('Application not found');
    return application;
  }
}

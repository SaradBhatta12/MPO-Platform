import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestWithId } from '../common/request-id.interceptor';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { ApplicationsService } from './applications.service';
import { AssignReviewerDto } from './dto/assign-reviewer.dto';
import {
  ApplicationPageDto,
  ApplicationResponseDto,
} from './dto/application-response.dto';
import { CreateApplicationDto } from './dto/create-application.dto';
import { ListApplicationsDto } from './dto/list-applications.dto';
import { RecordDecisionDto } from './dto/record-decision.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';

@ApiTags('applications')
@ApiBearerAuth()
@ApiForbiddenResponse({ description: 'Role is not permitted' })
@ApiNotFoundResponse({ description: 'Application is missing or inaccessible' })
@ApiConflictResponse({ description: 'Invalid lifecycle transition' })
@UseGuards(JwtAuthGuard)
@Controller('applications')
export class ApplicationsController {
  constructor(private readonly applications: ApplicationsService) {}

  @Post()
  @Header('Cache-Control', 'no-store')
  @ApiCreatedResponse({ type: ApplicationResponseDto })
  create(
    @CurrentUser() actor: UserResponseDto,
    @Body() input: CreateApplicationDto,
    @Req() request: RequestWithId,
  ): Promise<ApplicationResponseDto> {
    return this.applications.create(actor, input, request.requestId ?? null);
  }

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: ApplicationPageDto })
  list(
    @CurrentUser() actor: UserResponseDto,
    @Query() query: ListApplicationsDto,
  ): Promise<ApplicationPageDto> {
    return this.applications.list(actor, query);
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: ApplicationResponseDto })
  get(
    @CurrentUser() actor: UserResponseDto,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<ApplicationResponseDto> {
    return this.applications.get(actor, id);
  }

  @Patch(':id')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: ApplicationResponseDto })
  update(
    @CurrentUser() actor: UserResponseDto,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() input: UpdateApplicationDto,
    @Req() request: RequestWithId,
  ): Promise<ApplicationResponseDto> {
    return this.applications.update(
      actor,
      id,
      input,
      request.requestId ?? null,
    );
  }

  @Post(':id/submit')
  @Header('Cache-Control', 'no-store')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: ApplicationResponseDto })
  submit(
    @CurrentUser() actor: UserResponseDto,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Req() request: RequestWithId,
  ): Promise<ApplicationResponseDto> {
    return this.applications.submit(actor, id, request.requestId ?? null);
  }

  @Patch(':id/assignment')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: ApplicationResponseDto })
  assign(
    @CurrentUser() actor: UserResponseDto,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() input: AssignReviewerDto,
    @Req() request: RequestWithId,
  ): Promise<ApplicationResponseDto> {
    return this.applications.assign(
      actor,
      id,
      input,
      request.requestId ?? null,
    );
  }

  @Post(':id/decision')
  @Header('Cache-Control', 'no-store')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: ApplicationResponseDto })
  decide(
    @CurrentUser() actor: UserResponseDto,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() input: RecordDecisionDto,
    @Req() request: RequestWithId,
  ): Promise<ApplicationResponseDto> {
    return this.applications.decide(
      actor,
      id,
      input,
      request.requestId ?? null,
    );
  }
}

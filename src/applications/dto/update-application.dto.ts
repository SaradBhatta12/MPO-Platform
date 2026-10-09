import { PartialType } from '@nestjs/swagger';
import { ApplicationFieldsDto } from './application-fields.dto';

export class UpdateApplicationDto extends PartialType(ApplicationFieldsDto) {}

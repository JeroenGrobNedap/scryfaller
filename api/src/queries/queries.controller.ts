import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import {
  CreateQueryInput,
  QueriesService,
  SavedQuery,
} from './queries.service';

@Controller('queries')
export class QueriesController {
  constructor(private readonly queries: QueriesService) {}

  @Get()
  list(): Promise<SavedQuery[]> {
    return this.queries.list();
  }

  @Post()
  create(@Body() body: Partial<CreateQueryInput>): Promise<SavedQuery> {
    if (typeof body?.name !== 'string' || !body.name.trim()) {
      throw new BadRequestException('name is required');
    }
    if (typeof body.query !== 'string') {
      throw new BadRequestException('query must be a string');
    }
    if (typeof body.state !== 'object' || body.state === null) {
      throw new BadRequestException('state must be an object');
    }
    return this.queries.create({
      name: body.name,
      query: body.query,
      state: body.state,
    });
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string): Promise<void> {
    return this.queries.remove(id);
  }
}

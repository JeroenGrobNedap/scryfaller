import { Module } from '@nestjs/common';
import { QueriesController } from './queries/queries.controller';
import { QueriesService } from './queries/queries.service';

@Module({
  controllers: [QueriesController],
  providers: [QueriesService],
})
export class AppModule {}

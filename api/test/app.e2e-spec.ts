import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('Saved queries API (e2e)', () => {
  let app: INestApplication<App>;
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'scryfaller-'));
    process.env.QUERIES_FILE = join(dir, 'queries.json');
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  });

  it('saves, lists and deletes a query', async () => {
    const server = app.getHttpServer();
    await request(server).get('/api/queries').expect(200).expect([]);

    const created = await request(server)
      .post('/api/queries')
      .send({
        name: 'Scry payoffs',
        query: 'id<=wu f:commander',
        state: { a: 1 },
      })
      .expect(201);
    const body = created.body as { id: string; name: string };
    expect(body.name).toBe('Scry payoffs');

    const list = await request(server).get('/api/queries').expect(200);
    expect(list.body).toHaveLength(1);

    await request(server).delete(`/api/queries/${body.id}`).expect(204);
    await request(server).get('/api/queries').expect(200).expect([]);
  });

  it('rejects a query without a name', async () => {
    await request(app.getHttpServer())
      .post('/api/queries')
      .send({ query: 'x', state: {} })
      .expect(400);
  });

  it('returns 404 when deleting an unknown id', async () => {
    await request(app.getHttpServer()).delete('/api/queries/nope').expect(404);
  });
});

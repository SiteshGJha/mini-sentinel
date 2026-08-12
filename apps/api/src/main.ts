import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: true,
    }),
  );

  // Enable CORS
  app.enableCors();

  // Setup Swagger OpenAPI
  const config = new DocumentBuilder()
    .setTitle('AI Decision Gateway')
    .setDescription('Deterministic compliance, PII masking, cryptographic audit logs, and human-in-the-loop review API specs.')
    .setVersion('1.0')
    .addTag('Gateway', 'Operations for intercepting agent requests and running classifications')
    .addTag('Admin', 'Operations for rule adjustments, audit validations, metrics, and review queue resolutions')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`AI Decision Gateway running on port ${port} (Fastify)`);
}
bootstrap();

import { Global, Module } from '@nestjs/common';
import { TcpClientService } from '../queue/tcp-client.service';

@Global()
@Module({
  providers: [TcpClientService],
  exports: [TcpClientService],
})
export class PiiClientModule {}

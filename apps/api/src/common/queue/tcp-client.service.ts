import { Injectable, Logger } from '@nestjs/common';
import * as net from 'net';

@Injectable()
export class TcpClientService {
  private readonly logger = new Logger(TcpClientService.name);
  private readonly host = process.env.PII_SERVICE_HOST || '127.0.0.1';
  private readonly port = parseInt(process.env.PII_SERVICE_PORT || '50051', 10);

  async send(payload: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const client = new net.Socket();
      let buffer = '';

      // Set connection/socket timeout of 3 seconds
      client.setTimeout(3000);

      client.connect(this.port, this.host, () => {
        client.write(JSON.stringify(payload) + '\n');
      });

      client.on('data', (data) => {
        buffer += data.toString();
        if (buffer.includes('\n')) {
          const lines = buffer.split('\n');
          const firstLine = lines[0];
          try {
            const parsed = JSON.parse(firstLine);
            client.destroy();
            resolve(parsed);
          } catch (err) {
            client.destroy();
            reject(new Error(`Failed to parse TCP response: ${err.message}`));
          }
        }
      });

      client.on('error', (err) => {
        client.destroy();
        reject(err);
      });

      client.on('timeout', () => {
        client.destroy();
        reject(new Error('PII Service TCP connection timeout'));
      });
    });
  }
}

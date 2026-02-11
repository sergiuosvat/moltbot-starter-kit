import axios from 'axios';
import {Logger} from './utils/logger';

export class McpBridge {
  private baseUrl: string;

  private logger = new Logger('McpBridge');

  constructor(url: string) {
    this.baseUrl = url;
  }

  async getAgentReputation(nonce: number): Promise<number> {
    try {
      const res = await axios.get(`${this.baseUrl}/agents/${nonce}/reputation`);
      return res.data.score;
    } catch {
      this.logger.warn('Failed to fetch reputation, returning default 50');
      return 50;
    }
  }

  async getGasPrice(): Promise<string> {
    try {
      const res = await axios.get(`${this.baseUrl}/network/economics`);
      return res.data.gasPrice;
    } catch {
      return '1000000000'; // Default
    }
  }
}

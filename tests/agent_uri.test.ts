import {resolveAgentUri} from '../src/utils/agent_uri';
import {CONFIG} from '../src/config';

describe('resolveAgentUri', () => {
  const originalEnv = process.env.AGENT_URI;
  const originalConfigUri = CONFIG.AGENT.URI;

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.AGENT_URI;
    else process.env.AGENT_URI = originalEnv;
    CONFIG.AGENT.URI = originalConfigUri;
  });

  it('prefers AGENT_URI over manifestUri', () => {
    process.env.AGENT_URI = 'https://agent.example.com';
    const uri = resolveAgentUri({
      agentName: 'x',
      manifestUri: 'ipfs://cid',
      metadata: [],
      services: [],
    });
    expect(uri).toBe('https://agent.example.com');
  });

  it('uses agentUri from config when env unset', () => {
    delete process.env.AGENT_URI;
    CONFIG.AGENT.URI = '';
    const uri = resolveAgentUri({
      agentName: 'x',
      agentUri: 'http://localhost:4000/',
      manifestUri: 'ipfs://cid',
      metadata: [],
      services: [],
    });
    expect(uri).toBe('http://localhost:4000');
  });
});

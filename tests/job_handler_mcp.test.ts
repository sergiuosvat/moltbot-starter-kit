/* eslint-disable @typescript-eslint/no-explicit-any */
import * as crypto from 'crypto';

import {JobHandler} from '../src/job_handler';
import {Validator} from '../src/validator';
import {JobProcessor} from '../src/processor';
import {McpBridge} from '../src/mcp_bridge';
import {CONFIG} from '../src/config';

jest.useFakeTimers();

describe('JobHandler MCP integration', () => {
  let validator: Validator;
  let processor: JobProcessor;
  let mcp: jest.Mocked<
    Pick<
      McpBridge,
      'getAgentReputation' | 'getGasPrice' | 'callTool' | 'formatToolResult'
    >
  >;
  let handler: JobHandler;
  const originalMinRep = CONFIG.MCP_MIN_REPUTATION;
  const originalAllowed = [...CONFIG.MCP_ALLOWED_TOOLS];

  beforeEach(() => {
    validator = new Validator();
    processor = new JobProcessor();
    mcp = {
      getAgentReputation: jest.fn(),
      getGasPrice: jest.fn().mockResolvedValue('1000000000'),
      callTool: jest.fn(),
      formatToolResult: jest.fn(),
    };
    handler = new JobHandler(validator, processor, mcp as unknown as McpBridge);
    CONFIG.MCP_MIN_REPUTATION = 0;
    CONFIG.MCP_ALLOWED_TOOLS = ['*'];
  });

  afterEach(() => {
    CONFIG.MCP_MIN_REPUTATION = originalMinRep;
    CONFIG.MCP_ALLOWED_TOOLS = originalAllowed;
  });

  it('uses MCP gas price when submitting proof', async () => {
    const payment = {
      amount: '1',
      token: 'EGLD',
      meta: {payload: 'data'},
    };

    jest.spyOn(processor, 'process').mockResolvedValue('hash123');
    const submitSpy = jest
      .spyOn(validator, 'submitProof')
      .mockResolvedValue('txHash');
    jest.spyOn(validator, 'getTxStatus').mockResolvedValue('success');

    const run = handler.handle('job-mcp-gas', payment as any);
    await jest.runAllTimersAsync();
    await run;

    expect(mcp.getGasPrice).toHaveBeenCalled();
    expect(submitSpy).toHaveBeenCalledWith('job-mcp-gas', 'hash123', {
      gasPrice: '1000000000',
    });
  });

  it('processes via MCP tool when meta.mcpTool is set', async () => {
    const payment = {
      amount: '1',
      token: 'EGLD',
      meta: {
        mcpTool: 'do_work',
        mcpArgs: {task: 'summarize'},
      },
    };

    mcp.callTool.mockResolvedValue({structuredContent: {ok: true}});
    mcp.formatToolResult.mockReturnValue('{"ok":true}');
    const processSpy = jest.spyOn(processor, 'process');
    jest.spyOn(validator, 'submitProof').mockResolvedValue('txHash');
    jest.spyOn(validator, 'getTxStatus').mockResolvedValue('success');

    const expectedHash = crypto
      .createHash('sha256')
      .update('{"ok":true}')
      .digest('hex');

    const run = handler.handle('job-mcp-tool', payment as any);
    await jest.runAllTimersAsync();
    await run;

    expect(mcp.callTool).toHaveBeenCalledWith('do_work', {task: 'summarize'});
    expect(processSpy).not.toHaveBeenCalled();
    expect(validator.submitProof).toHaveBeenCalledWith(
      'job-mcp-tool',
      expectedHash,
      {gasPrice: '1000000000'},
    );
  });

  it('rejects when reputation is below MCP_MIN_REPUTATION', async () => {
    CONFIG.MCP_MIN_REPUTATION = 50;
    mcp.getAgentReputation.mockResolvedValue(10);

    const payment = {
      amount: '1',
      token: 'EGLD',
      meta: {payload: 'data', agentNonce: 42},
    };

    const processSpy = jest.spyOn(processor, 'process');
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const run = handler.handle('job-low-rep', payment as any);
    await jest.runAllTimersAsync();
    await run;

    expect(mcp.getAgentReputation).toHaveBeenCalledWith(42);
    expect(processSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('rejects when agentNonce is missing and MCP_MIN_REPUTATION is set', async () => {
    CONFIG.MCP_MIN_REPUTATION = 50;

    const payment = {
      amount: '1',
      token: 'EGLD',
      meta: {payload: 'data'},
    };

    const processSpy = jest.spyOn(processor, 'process');
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const run = handler.handle('job-no-nonce', payment as any);
    await jest.runAllTimersAsync();
    await run;

    expect(mcp.getAgentReputation).not.toHaveBeenCalled();
    expect(processSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('allows job when reputation meets MCP_MIN_REPUTATION', async () => {
    CONFIG.MCP_MIN_REPUTATION = 50;
    mcp.getAgentReputation.mockResolvedValue(80);

    const payment = {
      amount: '1',
      token: 'EGLD',
      meta: {payload: 'data', agentNonce: 7},
    };

    jest.spyOn(processor, 'process').mockResolvedValue('hash-ok');
    jest.spyOn(validator, 'submitProof').mockResolvedValue('txHash');
    jest.spyOn(validator, 'getTxStatus').mockResolvedValue('success');

    const run = handler.handle('job-ok-rep', payment as any);
    await jest.runAllTimersAsync();
    await run;

    expect(mcp.getAgentReputation).toHaveBeenCalledWith(7);
    expect(processor.process).toHaveBeenCalled();
  });

  it('skips MCP path entirely when bridge is null', async () => {
    handler = new JobHandler(validator, processor, null);
    CONFIG.MCP_MIN_REPUTATION = 99;

    const payment = {
      amount: '1',
      token: 'EGLD',
      meta: {payload: 'data', agentNonce: 1, mcpTool: 'ignored'},
    };

    jest.spyOn(processor, 'process').mockResolvedValue('hash-local');
    const submitSpy = jest
      .spyOn(validator, 'submitProof')
      .mockResolvedValue('txHash');
    jest.spyOn(validator, 'getTxStatus').mockResolvedValue('success');

    const run = handler.handle('job-no-mcp', payment as any);
    await jest.runAllTimersAsync();
    await run;

    expect(processor.process).toHaveBeenCalled();
    expect(submitSpy).toHaveBeenCalledWith('job-no-mcp', 'hash-local', {
      gasPrice: undefined,
    });
  });
});

import {Address, SmartContractController} from '@multiversx/sdk-core';
import {CONFIG} from './config';
import * as identityAbiJson from './abis/identity-registry.abi.json';
import {createEntrypoint} from './utils/entrypoint';
import {createPatchedAbi} from './utils/abi';

export interface AgentDetails {
  name: string;
  uri: string;
  public_key: string;
  owner: Address;
  metadata: Array<{key: string; value: string}>;
}

export class BlockchainService {
  private identityController: SmartContractController;

  constructor() {
    const entrypoint = createEntrypoint();
    const abi = createPatchedAbi(identityAbiJson);
    this.identityController = entrypoint.createSmartContractController(abi);
  }

  async getAgentDetails(nonce: number): Promise<AgentDetails> {
    const results = await this.identityController.query({
      contract: Address.newFromBech32(CONFIG.ADDRESSES.IDENTITY_REGISTRY),
      function: 'get_agent',
      arguments: [nonce],
    });

    if (!results[0]) {
      throw new Error(`Agent with nonce ${nonce} not found`);
    }
    return results[0] as AgentDetails;
  }

  async getAgentServicePrice(
    nonce: number,
    serviceId: string,
  ): Promise<bigint> {
    const results = await this.identityController.query({
      contract: Address.newFromBech32(CONFIG.ADDRESSES.IDENTITY_REGISTRY),
      function: 'get_agent_service_price',
      arguments: [nonce, Buffer.from(serviceId)],
    });

    const price = results[0];
    if (price === undefined || price === null) {
      return 0n; // Default: free service
    }
    return BigInt(price.toString());
  }
}

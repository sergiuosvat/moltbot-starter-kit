import {Facilitator} from '../src/facilitator';
import {Validator} from '../src/validator';

describe('Moltbot Starter Job Flow', () => {
  let facilitator: Facilitator;
  let validator: Validator;

  beforeEach(() => {
    facilitator = new Facilitator('http://mock-facilitator');
    validator = new Validator();
  });

  it('should process a payment event and submit proof', async () => {
    const payment = {
      amount: '100',
      token: 'EGLD',
      meta: {},
    };

    const submitProofSpy = jest
      .spyOn(validator, 'submitProof')
      .mockResolvedValue('0xhash');

    await new Promise<void>(resolve => {
      facilitator.onPayment(async p => {
        expect(p.amount).toBe('100');
        await validator.submitProof('job-1', 'hash');
        resolve();
      });

      facilitator.emit(payment);
    });

    expect(submitProofSpy).toHaveBeenCalled();
  });
});

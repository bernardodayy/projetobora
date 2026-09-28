import { driverCanReceive, driverReceivesFilter } from '../src/common/payment';

describe('who can receive which payment (the passenger pays the driver directly)', () => {
  const nothing = { pixKey: null, hasCardMachine: false };
  const both = { pixKey: 'motorista@pix.com', hasCardMachine: true };

  it('card rides need a card machine in the car', () => {
    for (const method of ['CREDIT_CARD', 'DEBIT_CARD']) {
      expect(driverCanReceive(method, both)).toBe(true);
      expect(driverCanReceive(method, nothing)).toBe(false);
      expect(driverCanReceive(method, { pixKey: 'x', hasCardMachine: false })).toBe(false);
    }
  });

  it('Pix rides need a registered Pix key (a blank key does not count)', () => {
    expect(driverCanReceive('PIX', both)).toBe(true);
    expect(driverCanReceive('PIX', nothing)).toBe(false);
    expect(driverCanReceive('PIX', { pixKey: '   ', hasCardMachine: true })).toBe(false);
  });

  it('cash, wallet and "not informed" restrict nobody', () => {
    for (const method of ['CASH', 'WALLET', null, undefined]) expect(driverCanReceive(method, nothing)).toBe(true);
  });

  it('the dispatch filter is the same rule as a query', () => {
    expect(driverReceivesFilter('CREDIT_CARD')).toEqual({ hasCardMachine: true });
    expect(driverReceivesFilter('DEBIT_CARD')).toEqual({ hasCardMachine: true });
    expect(driverReceivesFilter('PIX')).toEqual({ pixKey: { not: null } });
    expect(driverReceivesFilter('CASH')).toEqual({});
    expect(driverReceivesFilter(undefined)).toEqual({});
  });
});

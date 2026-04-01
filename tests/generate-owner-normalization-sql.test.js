'use strict';

const {
  expandGrantRoles,
  parseArgs,
} = require('../scripts/generate-owner-normalization-sql');

describe('generate-owner-normalization-sql', () => {
  test('parseArgs keeps explicit grant roles unique', () => {
    expect(
      parseArgs(['--grant-role', 'tenant_vutler_service', '--grant-role', 'tenant_vutler_service'])
    ).toEqual({
      schema: 'tenant_vutler',
      targetOwner: 'tenant_vutler_owner',
      grantRoles: ['tenant_vutler', 'tenant_vutler_service'],
    });
  });

  test('expandGrantRoles includes derived dotted roles', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce({
        rows: [
          { rolname: 'tenant_vutler' },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          { rolname: 'tenant_vutler_service' },
          { rolname: 'tenant_vutler_service.vaultbrix-prod' },
        ],
      });

    const roles = await expandGrantRoles({ query }, ['tenant_vutler', 'tenant_vutler_service']);

    expect(query).toHaveBeenCalledTimes(2);
    expect(roles).toEqual([
      'tenant_vutler',
      'tenant_vutler_service',
      'tenant_vutler_service.vaultbrix-prod',
    ]);
  });
});

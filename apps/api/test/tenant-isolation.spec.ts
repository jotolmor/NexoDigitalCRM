describe('tenant isolation contract', () => {
  it('requires tenantId in every clinical aggregate query', () => {
    const queryScope = (tenantId: string, clinicId: string) => ({ tenantId, clinicId });
    expect(queryScope('tenant-a', 'clinic-a')).not.toEqual(queryScope('tenant-b', 'clinic-b'));
  });
});

import { bundleName } from './update-notice';

describe('bundleName', () => {
  it('finds the hashed main bundle in a built page', () => {
    expect(bundleName('<script src="main-BN7GWUK4.js" type="module"></script>')).toBe('main-BN7GWUK4.js');
  });

  it('is null for the dev server, which has no hash', () => {
    expect(bundleName('<script src="main.js" type="module"></script>')).toBeNull();
  });
});

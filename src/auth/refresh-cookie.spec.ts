import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import {
  clearRefreshCookie,
  refreshCookieName,
  setRefreshCookie,
} from './refresh-cookie';

describe('production refresh cookie', () => {
  it('uses a host-only Secure, HttpOnly, SameSite cookie', () => {
    const config = {
      getOrThrow: (key: string) => {
        if (key === 'NODE_ENV') return 'production';
        throw new Error('Unexpected configuration key');
      },
    } as ConfigService;
    const setCookie = jest.fn();
    const clearCookie = jest.fn();
    const response = { cookie: setCookie, clearCookie } as unknown as Response;
    const token = 'a'.repeat(43);

    setRefreshCookie(response, config, token, new Date(Date.now() + 60000));
    expect(refreshCookieName(config)).toBe('__Host-merchant_refresh');
    expect(setCookie).toHaveBeenCalledWith(
      '__Host-merchant_refresh',
      token,
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        path: '/',
      }),
    );

    clearRefreshCookie(response, config);
    expect(clearCookie).toHaveBeenCalledWith(
      '__Host-merchant_refresh',
      expect.objectContaining({ secure: true, path: '/' }),
    );
  });
});

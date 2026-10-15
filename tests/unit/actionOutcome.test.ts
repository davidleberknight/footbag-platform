/**
 * How a state-changing action's ending reaches the member: the actor's own
 * repeat reads as the first submit's success, a state found already in place
 * reads as informational, a refusal as a refusal, and every ending redirects
 * 303 carrying its message in the flash cookie.
 */
import { describe, it, expect, vi } from 'vitest';
import type { Request, Response } from 'express';
import { redirectWithOutcome, toneForEnding } from '../../src/lib/actionOutcome';
import { FLASH_COOKIE, FLASH_KIND } from '../../src/lib/flashCookie';
import { outcomeNotice } from '../../src/lib/outcomeNotice';

function fakeExchange() {
  const req = { secure: false, headers: {} } as unknown as Request;
  const cookie = vi.fn();
  const redirect = vi.fn();
  const res = { cookie, redirect } as unknown as Response;
  return { req, res, cookie, redirect };
}

describe('toneForEnding', () => {
  it('gives the actor’s own repeat the same success tone as the first submit', () => {
    expect(toneForEnding('own_repeat')).toBe(toneForEnding('advance'));
    expect(toneForEnding('advance')).toBe('ok');
  });

  it('reads a state that already held from another act as informational, never success', () => {
    expect(toneForEnding('already_held')).toBe('info');
  });

  it('reads a refusal as a refusal', () => {
    expect(toneForEnding('refused')).toBe('no');
  });
});

describe('redirectWithOutcome', () => {
  it('redirects 303 to the given page and flashes the message in the ending’s tone', () => {
    const { req, res, cookie, redirect } = fakeExchange();
    redirectWithOutcome(req, res, {
      flash: FLASH_KIND.CLUB_ACTION,
      to: '/clubs/club_x',
      ending: 'already_held',
      text: 'This club is already inactive.',
    });

    expect(redirect).toHaveBeenCalledWith(303, '/clubs/club_x');
    expect(cookie).toHaveBeenCalledTimes(1);
    const [name, value] = cookie.mock.calls[0];
    expect(name).toBe(FLASH_COOKIE);
    const payload = String(value).slice(`${FLASH_KIND.CLUB_ACTION}:`.length);
    expect(outcomeNotice(payload)).toEqual({ text: 'This club is already inactive.', tone: 'info' });
  });

  it('carries the success tone for the actor’s own repeat', () => {
    const { req, res, cookie } = fakeExchange();
    redirectWithOutcome(req, res, {
      flash: FLASH_KIND.CLUB_ACTION,
      to: '/clubs/club_x',
      ending: 'own_repeat',
      text: 'Club marked inactive.',
    });
    const payload = String(cookie.mock.calls[0][1]).slice(`${FLASH_KIND.CLUB_ACTION}:`.length);
    expect(outcomeNotice(payload)).toEqual({ text: 'Club marked inactive.', tone: 'ok' });
  });
});

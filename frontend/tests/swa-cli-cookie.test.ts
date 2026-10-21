import { describe, expect, it } from 'vitest'
import {
  CookiesManager,
  decodeCookie,
  serializeCookie,
  validateCookie
} from '../../node_modules/@azure/static-web-apps-cli/dist/core/utils/cookie.js'

// Exercise the CLI's local emulator cookie path in-process, without starting
// the emulator, making HTTP requests, or involving Azure credentials.
describe('Static Web Apps CLI development cookie characterization', () => {
  const principal = { userId: 'user-1', userRoles: ['anonymous', 'authenticated'] }
  const encoded = Buffer.from(JSON.stringify(principal)).toString('base64')

  it('serializes the auth cookie as a Set-Cookie header with the current flags and encoding', () => {
    expect(serializeCookie('StaticWebAppsAuthCookie', encoded, {
      path: '/', httpOnly: true, sameSite: 'lax'
    })).toBe(
      `StaticWebAppsAuthCookie=${encodeURIComponent(encoded)}; Path=/; HttpOnly; SameSite=Lax`
    )
  })

  it('recognizes and decodes auth cookies from a request header, including chunks', () => {
    expect(validateCookie('unrelated=value')).toBe(false)
    expect(decodeCookie('unrelated=value')).toBeNull()
    expect(validateCookie(`unrelated=value; StaticWebAppsAuthCookie=${encoded}`)).toBe(true)
    expect(decodeCookie(`unrelated=value; StaticWebAppsAuthCookie=${encoded}`)).toEqual(principal)
    const midpoint = Math.floor(encoded.length / 2)
    const chunked = `StaticWebAppsAuthCookie_0=${encoded.slice(0, midpoint)}; StaticWebAppsAuthCookie_1=${encoded.slice(midpoint)}`
    expect(validateCookie(chunked)).toBe(true)
    expect(decodeCookie(chunked)).toEqual(principal)
  })

  it('expires an existing auth cookie and its chunks on logout', () => {
    const cookies = new CookiesManager(
      'StaticWebAppsAuthCookie=old; StaticWebAppsAuthCookie_0=oldchunk'
    )
    cookies.addCookieToDelete('StaticWebAppsAuthCookie')
    expect(cookies.getCookies()).toEqual([
      {
        name: 'StaticWebAppsAuthCookie', value: 'deleted', path: '/',
        httpOnly: false, expires: 'Thu, 01 Jan 1970 00:00:00 GMT'
      },
      {
        name: 'StaticWebAppsAuthCookie_0', value: 'deleted', path: '/',
        httpOnly: false, expires: 'Thu, 01 Jan 1970 00:00:00 GMT'
      }
    ])
  })
})

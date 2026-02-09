import type { JWTPayloadInput, JWTIdentity, JWTAppClaims } from '../jwt/jwt.service';

/** User info from Entra/Google (idp) */
export interface IdpUserInfo {
  objectId: string;
  email: string;
  name: string;
  roles: string[];
  groups: string[];
}

/** Optional claims from your backend API or DB */
export interface ApiUserClaims {
  personId?: string;
  status?: string;
  personUuid?: string;
  apps?: Record<string, JWTAppClaims>;
  /** Per-user audience (e.g. from DB app_slug); when set, used as JWT aud */
  aud?: string[];
}

/**
 * Build the JWT payload (sub, identity, apps) from IdP user info and optional API claims.
 * Use this in the callback (and later when refreshing from API) so all token issuance
 * goes through one place. Replace mock values with API response when ready.
 */
export function buildUserClaims(
  idpUser: IdpUserInfo,
  _apiClaims?: ApiUserClaims | null
): JWTPayloadInput {
  console.log('[CLAIMS] Building JWT claims for email:', idpUser.email, _apiClaims ? '(using API/DB claims)' : '(using default/mock claims)');
  const entraUuid = idpUser.objectId;
  const personId = _apiClaims?.personId ?? entraUuid;
  const status = _apiClaims?.status ?? 'Active';
  // Person_uuid: from DB p.person_id when apiClaims present, else default
  const personUuid = _apiClaims?.personUuid ?? '8b3d3f9d-03d4-4d0a-8e15-482b35c3850f';

  const identity: JWTIdentity = {
    email: idpUser.email,
    status,
    entra_uuid: entraUuid,
    Person_uuid: personUuid,
  };

  // Apps: from API when available; until then use mock data
  const apps: Record<string, JWTAppClaims> =
    _apiClaims?.apps ??
    ({
      pulse: { uid: 'PULSE_99', roles: ['PRODUCER'] },
      key: { uid: 'KEY_UUID_1', roles: ['ARTIST'] },
    } as Record<string, JWTAppClaims>);

  const aud = _apiClaims?.aud && _apiClaims.aud.length > 0 ? _apiClaims.aud : undefined;
  const result = {
    sub: personId,
    identity,
    apps,
    ...(aud ? { aud } : {}),
  } as JWTPayloadInput;
  const claimsLog = {
    sub: result.sub,
    identity: { email: result.identity.email, status: result.identity.status, entra_uuid: result.identity.entra_uuid, Person_uuid: result.identity.Person_uuid },
    aud: aud ?? '(default from config)',
    appSlugs: Object.keys(result.apps),
    appsDetail: Object.fromEntries(Object.entries(result.apps).map(([k, v]) => [k, { uid: v.uid, roles: v.roles }])),
  };
  console.log('[CLAIMS] JWT claims set:', JSON.stringify(claimsLog, null, 2));
  return result;
}

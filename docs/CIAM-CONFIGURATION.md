# CIAM (Customer Identity and Access Management) Configuration

## Overview

The Central Auth Service now supports **CIAM (Customer Identity and Access Management)** authority format in addition to the standard Microsoft Entra ID format.

## Authority URL Formats

### Standard Entra ID (Default)
```
https://login.microsoftonline.com/{tenant-id}
```

### CIAM Format
```
https://{tenant-name}.ciamlogin.com/{tenant-id}
```

## Configuration

### Option 1: Standard Entra ID (Default)

If you're using standard Microsoft Entra ID, no changes needed:

```env
TENANT_ID=87cf83c8-a5e2-4162-b4c8-e661eb92362a
CLIENT_ID=763f00e6-98b8-4305-95b6-c70c74362b5a
CLIENT_SECRET=your-client-secret
```

**Authority used**: `https://login.microsoftonline.com/87cf83c8-a5e2-4162-b4c8-e661eb92362a`

### Option 2: CIAM Format

To use CIAM format, add `ENTRA_TENANT_NAME` to your `.env`:

```env
TENANT_ID=87cf83c8-a5e2-4162-b4c8-e661eb92362a
ENTRA_TENANT_NAME=yourtenant
CLIENT_ID=763f00e6-98b8-4305-95b6-c70c74362b5a
CLIENT_SECRET=your-client-secret
```

**Authority used**: `https://yourtenant.ciamlogin.com/87cf83c8-a5e2-4162-b4c8-e661eb92362a`

## How It Works

The service automatically detects which format to use:

1. **If `ENTRA_TENANT_NAME` is set**: Uses CIAM format
   ```typescript
   authority = `https://${config.tenantName}.ciamlogin.com/${config.tenantId}`
   ```

2. **If `ENTRA_TENANT_NAME` is NOT set**: Uses standard format
   ```typescript
   authority = `https://login.microsoftonline.com/${config.tenantId}`
   ```

## Example Configuration

### For CIAM:

```env
# Microsoft Entra ID Configuration (CIAM)
TENANT_ID=your-tenant-id
ENTRA_TENANT_NAME=yourtenant
CLIENT_ID=your-client-id
CLIENT_SECRET=your-client-secret
```

### For Standard Entra ID:

```env
# Microsoft Entra ID Configuration (Standard)
TENANT_ID=your-tenant-id
# ENTRA_TENANT_NAME not set - uses standard format
CLIENT_ID=your-client-id
CLIENT_SECRET=your-client-secret
```

## Verification

After setting `ENTRA_TENANT_NAME` and restarting the service, check the logs:

```
[MSAL] Initialized with authority: https://yourtenant.ciamlogin.com/87cf83c8-a5e2-4162-b4c8-e661eb92362a
```

Or test the login endpoint:

```bash
curl -k "https://localhost:3000/auth/login?client_id=test&redirect_uri=http://localhost:3001/auth/callback&provider=microsoft" -I | grep Location
```

Should redirect to: `https://yourtenant.ciamlogin.com/...` (if CIAM) or `https://login.microsoftonline.com/...` (if standard)

## When to Use CIAM

Use CIAM format when:
- ✅ You're using **Microsoft Entra ID for Customers** (CIAM)
- ✅ Your tenant is configured for customer identity scenarios
- ✅ You need customer-facing authentication (B2C-like scenarios)
- ✅ Your app registration is in a CIAM tenant

Use standard format when:
- ✅ You're using **standard Microsoft Entra ID** (Azure AD)
- ✅ Your tenant is for organizational users
- ✅ You're using standard enterprise SSO

## Important Notes

1. **Tenant Name**: The `ENTRA_TENANT_NAME` is the tenant name (e.g., "yourtenant"), not the full domain
2. **Tenant ID**: Still required - the GUID tenant ID
3. **Backward Compatible**: If `ENTRA_TENANT_NAME` is not set, uses standard format
4. **App Registration**: Your app registration must be in the correct tenant type (CIAM vs standard)

## Testing

1. **Add to `.env`**:
   ```env
   ENTRA_TENANT_NAME=yourtenant
   ```

2. **Restart service**:
   ```bash
   npm run build
   npm start
   ```

3. **Check logs** for authority URL:
   ```
   [MSAL] Initialized with authority: https://yourtenant.ciamlogin.com/...
   ```

4. **Test login** - should redirect to CIAM login page

## Troubleshooting

### Error: "Invalid authority"

- Verify `ENTRA_TENANT_NAME` is correct (no special characters, lowercase)
- Ensure tenant ID is correct
- Check that your tenant supports CIAM

### Still using standard format

- Verify `ENTRA_TENANT_NAME` is set in `.env`
- Restart the service after adding it
- Check service logs for the authority URL

### CIAM login not working

- Verify your app registration is in a CIAM tenant
- Check redirect URIs are configured correctly
- Ensure client secret is valid

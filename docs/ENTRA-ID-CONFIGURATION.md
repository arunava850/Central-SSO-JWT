# Microsoft Entra ID Configuration Guide

## Error: AADSTS500208 - Domain Not Valid for Account Type

This error occurs when there's a mismatch between:
- The account type you're trying to sign in with
- The account types supported by your Entra ID app registration

## Quick Fix Steps

### Step 1: Check App Registration Account Type

1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to **Azure Active Directory** → **App registrations**
3. Find your app: **Client ID: `763f00e6-98b8-4305-95b6-c70c74362b5a`**
4. Click on the app name
5. Go to **Authentication** section

### Step 2: Configure Supported Account Types

In the **Authentication** page, under **Supported account types**, you have three options:

#### Option A: Accounts in this organizational directory only (Single tenant)
- ✅ **Use this if**: You only want users from your specific tenant to sign in
- **Setting**: Select "Accounts in this organizational directory only"
- **Best for**: Internal applications, single organization

#### Option B: Accounts in any organizational directory (Multi-tenant)
- ✅ **Use this if**: You want users from any Azure AD tenant to sign in
- **Setting**: Select "Accounts in any organizational directory"
- **Best for**: SaaS applications, multiple organizations

#### Option C: Accounts in any organizational directory and personal Microsoft accounts
- ✅ **Use this if**: You want both organizational and personal Microsoft accounts
- **Setting**: Select "Accounts in any organizational directory and personal Microsoft accounts"
- **Best for**: Public-facing applications

### Step 3: Verify Redirect URIs

While in the **Authentication** page, check **Redirect URIs**:

1. Under **Web** platform, ensure you have:
   ```
   https://localhost:3000/auth/callback
   http://localhost:3001/auth/callback
   ```

2. Click **Save** after adding/verifying URIs

### Step 4: Check API Permissions

1. Go to **API permissions** in your app registration
2. Ensure these permissions are added:
   - ✅ Microsoft Graph → Delegated permissions:
     - `openid`
     - `profile`
     - `email`
     - `User.Read`
     - `GroupMember.Read.All`
     - `Directory.Read.All`
3. Click **Grant admin consent** (if you have admin rights)

### Step 5: Verify Client Secret

1. Go to **Certificates & secrets**
2. Ensure your client secret is:
   - ✅ Not expired
   - ✅ Value matches your `.env` file
   - ✅ If expired, create a new one and update `.env`

## Common Issues and Solutions

### Issue 1: Personal Microsoft Account Trying to Sign In

**Problem**: You're using a personal Microsoft account (@outlook.com, @hotmail.com, @gmail.com) but the app is configured for organizational accounts only.

**Solution**: 
- Change account type to "Accounts in any organizational directory and personal Microsoft accounts"
- OR use an organizational account (@yourcompany.com)

### Issue 2: Wrong Tenant ID

**Problem**: The tenant ID in your `.env` doesn't match the tenant you're trying to sign in to.

**Solution**:
- Verify your tenant ID in Azure Portal → Azure Active Directory → Overview
- Update `.env` with correct `TENANT_ID`

### Issue 3: Domain Not Verified

**Problem**: If using a custom domain, it might not be verified in Entra ID.

**Solution**:
- Go to Azure AD → Custom domain names
- Verify the domain is added and verified

## Recommended Configuration for Development

For local development, use:

1. **Supported account types**: 
   - "Accounts in this organizational directory only" (if testing with org accounts)
   - OR "Accounts in any organizational directory and personal Microsoft accounts" (if testing with personal accounts)

2. **Redirect URIs**:
   ```
   https://localhost:3000/auth/callback
   http://localhost:3001/auth/callback
   ```

3. **Implicit grant and hybrid flows**:
   - ✅ ID tokens (checked)

## Testing After Configuration

1. **Update your `.env`** if you changed tenant ID or client secret
2. **Restart Central Auth Service**:
   ```bash
   # Stop current process
   lsof -ti:3000 | xargs kill -9
   
   # Start again
   npm start
   ```

3. **Test login flow**:
   - Open `http://localhost:3001`
   - Click "Login with Central Auth"
   - Try signing in with an appropriate account type

## Verification Checklist

- [ ] App registration account type matches your use case
- [ ] Redirect URIs are correctly configured
- [ ] API permissions are granted (with admin consent)
- [ ] Client secret is valid and not expired
- [ ] Tenant ID in `.env` matches your Azure AD tenant
- [ ] You're using an account type that matches the app configuration

## Still Having Issues?

If the error persists:

1. **Check the exact error details**:
   - Copy the Request ID and Correlation ID from the error page
   - Check Azure AD sign-in logs for more details

2. **Verify account type**:
   - Try signing in with a different account type
   - Use an organizational account if testing with org-only setting

3. **Check tenant restrictions**:
   - Ensure your account belongs to the tenant specified in `TENANT_ID`
   - Verify you have permission to sign in to applications

4. **Review app registration**:
   - Ensure the app is not disabled
   - Check if there are any conditional access policies blocking sign-in
